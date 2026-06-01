// Parseur canonique de recommandation finale.
// Cherche la section ## Recommendation puis le premier mot-clé en gras.
// Fallback : premier mot-clé en gras n'importe où dans le texte.
// Supporte FR (APPELER/ATTENDRE/ÉVITER) et EN (CALL/WAIT/AVOID).

export type Recommendation = "APPELER" | "ATTENDRE" | "ÉVITER" | "UNKNOWN";

const REC_SECTION_RE = /##\s*Recommendation[^\n]*\n+([\s\S]{0,400})/i;
const REC_KEYWORD_RE = /\*\*(APPELER|ATTENDRE|ÉVITER|EVITER|CALL|WAIT|AVOID)\*\*/i;

const NORMALIZE: Record<string, Recommendation> = {
  APPELER: "APPELER", CALL: "APPELER",
  ATTENDRE: "ATTENDRE", WAIT: "ATTENDRE",
  ÉVITER: "ÉVITER", EVITER: "ÉVITER", AVOID: "ÉVITER",
};

export function extractRecommendation(text: string | null | undefined): Recommendation {
  if (!text) return "UNKNOWN";
  // Chercher dans la section Recommendation en priorité
  const sectionMatch = REC_SECTION_RE.exec(text);
  if (sectionMatch) {
    const kwMatch = REC_KEYWORD_RE.exec(sectionMatch[1]);
    if (kwMatch) return NORMALIZE[kwMatch[1].toUpperCase()] ?? "UNKNOWN";
  }
  // Fallback : premier mot-clé dans tout le texte
  const kwMatch = REC_KEYWORD_RE.exec(text);
  if (kwMatch) return NORMALIZE[kwMatch[1].toUpperCase()] ?? "UNKNOWN";
  return "UNKNOWN";
}
