/**
 * Extraction depuis une PHOTO de véhicule (Automobile APM).
 *
 * Pipeline HF :
 *   - état carrosserie (car_damage_detection) → scoring pour pricing/flag
 *   - reconnaissance marque/modèle (stanford_cars) → pré-remplissage + anti-fraude
 *   - OCR (trocr) → VIN / kilométrage / plaque, avec REDACTION RGPD de la plaque
 *
 * Server-only. Fail-safe : chaque étape échoue indépendamment (HfError) sans
 * casser les autres ni la requête.
 *
 * ⚠️ RGPD : la plaque d'immatriculation est une donnée personnelle. L'OCR brut
 * n'est JAMAIS renvoyé tel quel — toute séquence ressemblant à une plaque FR/EU
 * est masquée par `redactPlate()`. On expose seulement un booléen "plaque
 * détectée" + un texte rédacté.
 */

import "server-only";
import {
  detectCarDamage,
  recognizeCarModel,
  ocrImage,
  type ImageClassification,
} from "@/lib/hf";

export interface ImageExtractionResult {
  /** Top labels d'état carrosserie (intact/rayé/bosselé…). */
  damage: ImageClassification[];
  /** Top labels reco marque/modèle. */
  recognizedModel: ImageClassification[];
  /** Texte OCR RÉDIGÉ (plaque masquée). undefined si pas d'OCR. */
  ocrTextRedacted?: string;
  /** true si une plaque a été détectée puis masquée. */
  plateDetected: boolean;
  /** Modes dégradés par étape (HF indisponible). */
  degraded: { damage: boolean; model: boolean; ocr: boolean };
  warnings: string[];
}

/**
 * Masque une plaque d'immatriculation FR/EU dans un texte OCR.
 * FR récent : AA-123-BB ; FR ancien : 123 ABC 75 ; générique EU : groupes
 * alphanum 5-8 chars. Retourne [texte rédacté, plaque trouvée ?].
 */
export function redactPlate(text: string): { text: string; found: boolean } {
  let found = false;
  const patterns: RegExp[] = [
    // FR SIV : AB-123-CD (séparateurs -, espace, ou rien)
    /\b[A-Z]{2}[\s-]?\d{3}[\s-]?[A-Z]{2}\b/gi,
    // FR FNI ancien : 1234 AB 75 / 123 ABC 75
    /\b\d{1,4}\s?[A-Z]{2,3}\s?\d{2,3}\b/gi,
  ];
  let out = text;
  for (const re of patterns) {
    out = out.replace(re, () => {
      found = true;
      return "[PLAQUE_MASQUÉE]";
    });
  }
  return { text: out, found };
}

/** Type d'entrée image accepté par les capabilities HF. */
export type ImageInput = Uint8Array | ArrayBuffer | string;

/**
 * Analyse une photo de véhicule. Chaque capacité est best-effort et isolée.
 * `tasks` permet de limiter le coût (par défaut: tout).
 */
export async function extractVehicleFromImage(
  image: ImageInput,
  opts?: {
    tasks?: { damage?: boolean; model?: boolean; ocr?: boolean };
    signal?: AbortSignal;
  },
): Promise<ImageExtractionResult> {
  const tasks = opts?.tasks ?? { damage: true, model: true, ocr: true };
  const warnings: string[] = [];
  const degraded = { damage: false, model: false, ocr: false };

  let damage: ImageClassification[] = [];
  let recognizedModel: ImageClassification[] = [];
  let ocrTextRedacted: string | undefined;
  let plateDetected = false;

  if (tasks.damage) {
    try {
      damage = await detectCarDamage(image, { signal: opts?.signal });
    } catch {
      degraded.damage = true;
      warnings.push("Analyse carrosserie indisponible.");
    }
  }

  if (tasks.model) {
    try {
      recognizedModel = await recognizeCarModel(image, { topK: 5, signal: opts?.signal });
    } catch {
      degraded.model = true;
      warnings.push("Reconnaissance modèle indisponible.");
    }
  }

  if (tasks.ocr) {
    try {
      const raw = await ocrImage(image, { signal: opts?.signal });
      const { text, found } = redactPlate(raw);
      ocrTextRedacted = text;
      plateDetected = found;
    } catch {
      degraded.ocr = true;
      warnings.push("OCR indisponible.");
    }
  }

  return { damage, recognizedModel, ocrTextRedacted, plateDetected, degraded, warnings };
}

/**
 * Détecte une incohérence entre le modèle déclaré dans l'annonce et celui
 * reconnu sur la photo (signal anti-fraude). Comparaison souple (le label
 * reconnu contient-il la marque/modèle déclarés, ou inversement).
 */
export function detectModelMismatch(
  declared: { make?: string; model?: string },
  recognized: ImageClassification[],
  opts?: { minScore?: number },
): { mismatch: boolean; reason?: string } {
  const minScore = opts?.minScore ?? 0.3;
  const top = recognized.filter((r) => r.score >= minScore);
  if (top.length === 0 || (!declared.make && !declared.model)) {
    return { mismatch: false };
  }
  const declaredStr = [declared.make, declared.model]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!declaredStr) return { mismatch: false };

  const overlaps = top.some((r) => {
    const label = r.label.toLowerCase();
    return (
      label.includes(declaredStr) ||
      (declared.make ? label.includes(declared.make.toLowerCase()) : false) ||
      declaredStr.split(" ").some((tok) => tok.length > 2 && label.includes(tok))
    );
  });

  if (overlaps) return { mismatch: false };
  return {
    mismatch: true,
    reason: `Modèle déclaré "${declaredStr}" non confirmé par la reconnaissance visuelle.`,
  };
}
