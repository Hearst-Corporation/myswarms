/**
 * Tests — extraction Automobile (texte NER + image Vision/OCR).
 *
 * HF (ner/vision) mocké. Couvre : parsing par règles, intégration NER,
 * redaction plaque RGPD, fail-safe HF down, détection de fraude modèle.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// server-only lève hors d'un Server Component — neutralisé en test.
vi.mock("server-only", () => ({}));

const { mockExtractEntities, mockGroupEntities, mockDamage, mockModel, mockOcr } = vi.hoisted(() => ({
  mockExtractEntities: vi.fn(),
  mockGroupEntities: vi.fn(),
  mockDamage: vi.fn(),
  mockModel: vi.fn(),
  mockOcr: vi.fn(),
}));

vi.mock("@/lib/hf", () => ({
  extractEntities: mockExtractEntities,
  groupEntities: mockGroupEntities,
  detectCarDamage: mockDamage,
  recognizeCarModel: mockModel,
  ocrImage: mockOcr,
}));

import { extractVehicleFromText } from "../textExtractor";
import {
  extractVehicleFromImage,
  redactPlate,
  detectModelMismatch,
} from "../imageExtractor";

beforeEach(() => {
  vi.clearAllMocks();
  mockExtractEntities.mockResolvedValue([]);
  mockGroupEntities.mockReturnValue({});
});

// ── Extraction texte — règles ────────────────────────────────────────────────

describe("extractVehicleFromText — rules", () => {
  it("extrait prix, km, année, carburant, marque/modèle", async () => {
    mockGroupEntities.mockReturnValue({ LOC: ["Lyon"] });
    const text = "Vends BMW Série 3 diesel, 2019, 85 000 km, 18 500 € à Lyon, très bon état";
    const r = await extractVehicleFromText(text);
    expect(r.fields.make).toBe("BMW");
    expect(r.fields.price_eur).toBe("18500");
    expect(r.fields.mileage_km).toBe("85000");
    expect(r.fields.year).toBe("2019");
    expect(r.fields.fuel).toBeTruthy();
    expect(r.fields.location).toBe("Lyon");
    expect(r.nerDegraded).toBe(false);
  });

  it("garde le plus grand prix plausible (évite la mensualité)", async () => {
    const r = await extractVehicleFromText("Loyer 250 € / mois, prix total 12 900 €");
    expect(r.fields.price_eur).toBe("12900");
  });

  it("continue par règles si NER échoue (fail-safe, degraded)", async () => {
    mockExtractEntities.mockRejectedValue(new Error("HF down"));
    const r = await extractVehicleFromText("Peugeot 208 essence 2020, 30 000 km, 14 000 €");
    expect(r.nerDegraded).toBe(true);
    expect(r.fields.make).toBe("Peugeot");
    expect(r.fields.price_eur).toBe("14000");
    expect(r.warnings.some((w) => /NER/.test(w))).toBe(true);
  });

  it("warning si rien détecté", async () => {
    const r = await extractVehicleFromText("texte sans aucune info véhicule pertinente ici");
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

// ── Redaction plaque RGPD ────────────────────────────────────────────────────

describe("redactPlate", () => {
  it("masque une plaque FR SIV (AA-123-BB)", () => {
    const { text, found } = redactPlate("Immat AB-123-CD visible sur la photo");
    expect(found).toBe(true);
    expect(text).toContain("[PLAQUE_MASQUÉE]");
    expect(text).not.toMatch(/AB-123-CD/);
  });

  it("masque une plaque FR ancienne (123 ABC 75)", () => {
    const { text, found } = redactPlate("plaque 1234 AB 75");
    expect(found).toBe(true);
    expect(text).toContain("[PLAQUE_MASQUÉE]");
  });

  it("ne touche pas un texte sans plaque", () => {
    const { text, found } = redactPlate("VIN WBA1234567 kilométrage 90000");
    expect(found).toBe(false);
    expect(text).not.toContain("[PLAQUE_MASQUÉE]");
  });
});

// ── Extraction image ─────────────────────────────────────────────────────────

describe("extractVehicleFromImage", () => {
  const IMG = "aGVsbG8="; // base64 quelconque

  it("renvoie damage + model + OCR avec plaque masquée", async () => {
    mockDamage.mockResolvedValue([{ label: "dent", score: 0.8 }]);
    mockModel.mockResolvedValue([{ label: "BMW 3 Series 2019", score: 0.7 }]);
    mockOcr.mockResolvedValue("Plaque AB-123-CD VIN WBA999");
    const r = await extractVehicleFromImage(IMG);
    expect(r.damage[0].label).toBe("dent");
    expect(r.recognizedModel[0].label).toContain("BMW");
    expect(r.plateDetected).toBe(true);
    expect(r.ocrTextRedacted).toContain("[PLAQUE_MASQUÉE]");
    expect(r.ocrTextRedacted).not.toMatch(/AB-123-CD/);
  });

  it("fail-safe par capacité (damage KO → autres OK)", async () => {
    mockDamage.mockRejectedValue(new Error("HF down"));
    mockModel.mockResolvedValue([{ label: "Audi A4", score: 0.6 }]);
    mockOcr.mockResolvedValue("VIN only");
    const r = await extractVehicleFromImage(IMG);
    expect(r.degraded.damage).toBe(true);
    expect(r.degraded.model).toBe(false);
    expect(r.recognizedModel[0].label).toBe("Audi A4");
  });

  it("ne jamais leak la plaque brute même si OCR retourne plusieurs plaques", async () => {
    mockOcr.mockResolvedValue("AB-123-CD et aussi CD-456-EF");
    const r = await extractVehicleFromImage(IMG, { tasks: { ocr: true } });
    expect(r.ocrTextRedacted).not.toMatch(/AB-123-CD|CD-456-EF/);
  });
});

// ── Anti-fraude ──────────────────────────────────────────────────────────────

describe("detectModelMismatch", () => {
  it("pas de mismatch quand le modèle reconnu confirme le déclaré", () => {
    const res = detectModelMismatch(
      { make: "BMW", model: "Série 3" },
      [{ label: "BMW 3 Series", score: 0.8 }],
    );
    expect(res.mismatch).toBe(false);
  });

  it("flag mismatch quand reconnu ne confirme pas le déclaré", () => {
    const res = detectModelMismatch(
      { make: "Ferrari", model: "488" },
      [{ label: "Dacia Sandero", score: 0.9 }],
    );
    expect(res.mismatch).toBe(true);
    expect(res.reason).toBeTruthy();
  });

  it("pas de mismatch si reconnaissance trop faible", () => {
    const res = detectModelMismatch(
      { make: "Ferrari" },
      [{ label: "Dacia", score: 0.1 }],
    );
    expect(res.mismatch).toBe(false);
  });
});
