/**
 * Tests — couche HF (client + capabilities).
 *
 * Mocke fetch (aucun appel réseau réel) pour valider :
 *  - normalisation des embeddings (formats hétérogènes)
 *  - routing TEI prioritaire vs Inference API
 *  - parsing rerank / sentiment / NER
 *  - cosineSimilarity
 *  - pas de fuite de clé (header masqué dans les erreurs)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// server-only lève hors d'un Server Component — neutralisé en test.
vi.mock("server-only", () => ({}));

import { normalizeEmbeddings, cosineSimilarity } from "../embeddings";

describe("normalizeEmbeddings", () => {
  it("garde un number[][] tel quel", () => {
    const out = normalizeEmbeddings([[1, 2], [3, 4]], 2);
    expect(out).toEqual([[1, 2], [3, 4]]);
  });
  it("enveloppe un number[] (un seul input)", () => {
    const out = normalizeEmbeddings([1, 2, 3] as number[], 1);
    expect(out).toEqual([[1, 2, 3]]);
  });
  it("mean-pool un number[][][] (token×dim)", () => {
    const out = normalizeEmbeddings([[[2, 4], [4, 8]]], 1);
    expect(out).toEqual([[3, 6]]);
  });
});

describe("cosineSimilarity", () => {
  it("vaut 1 pour vecteurs identiques", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });
  it("vaut 0 pour vecteurs orthogonaux", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });
  it("gère le vecteur nul", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("embedTexts — routing TEI", () => {
  const ORIG = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    process.env.TEI_EMBED_URL = "https://embed.test";
    process.env.TEI_API_KEY = "k";
  });
  afterEach(() => {
    process.env = { ...ORIG };
    vi.restoreAllMocks();
  });

  it("utilise TEI quand configuré et renvoie number[][]", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify([[0.1, 0.2], [0.3, 0.4]]),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { embedTexts } = await import("../embeddings");
    const out = await embedTexts(["a", "b"]);
    expect(out).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    // a bien tapé l'URL TEI, pas l'Inference API HF.
    expect(fetchMock.mock.calls[0][0]).toContain("embed.test/embed");
  });

  it("retourne [] pour entrée vide sans appel réseau", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { embedTexts } = await import("../embeddings");
    expect(await embedTexts([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("rerank — routing TEI", () => {
  const ORIG = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    process.env.TEI_RERANK_URL = "https://rerank.test";
    process.env.TEI_EMBED_URL = "https://embed.test";
    process.env.TEI_API_KEY = "k";
  });
  afterEach(() => {
    process.env = { ...ORIG };
    vi.restoreAllMocks();
  });

  it("trie par score décroissant et mappe les documents", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify([{ index: 1, score: 0.9 }, { index: 0, score: 0.2 }]),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { rerank } = await import("../rerank");
    const out = await rerank("q", ["doc0", "doc1"]);
    expect(out[0]).toMatchObject({ index: 1, document: "doc1", score: 0.9 });
    expect(out[1]).toMatchObject({ index: 0, document: "doc0" });
  });

  it("topK tronque la sortie", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify([{ index: 0, score: 0.9 }, { index: 1, score: 0.5 }, { index: 2, score: 0.1 }]),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { rerank } = await import("../rerank");
    const out = await rerank("q", ["a", "b", "c"], { topK: 2 });
    expect(out).toHaveLength(2);
  });
});

describe("sentiment — parsing & normalisation labels", () => {
  const ORIG = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    delete process.env.TEI_EMBED_URL;
    delete process.env.TEI_API_KEY;
    process.env.HUGGINGFACE_API_KEY = "hf_test";
  });
  afterEach(() => {
    process.env = { ...ORIG };
    vi.restoreAllMocks();
  });

  it("normalise un label bullish/positive et garde les scores bruts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify([[{ label: "Bullish", score: 0.8 }, { label: "Neutral", score: 0.15 }, { label: "Bearish", score: 0.05 }]]),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { analyzeSentiment } = await import("../sentiment");
    const r = await analyzeSentiment("Bitcoin to the moon", { source: "crypto" });
    expect(r.label).toBe("positive");
    expect(r.score).toBeCloseTo(0.8, 6);
    expect(r.raw).toHaveLength(3);
  });
});

describe("client HF — pas de fuite de clé", () => {
  const ORIG = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    delete process.env.TEI_EMBED_URL;
    delete process.env.TEI_API_KEY;
    process.env.HUGGINGFACE_API_KEY = "hf_supersecret_value";
    process.env.HF_MAX_RETRIES = "0";
  });
  afterEach(() => {
    process.env = { ...ORIG };
    vi.restoreAllMocks();
  });

  it("l'erreur HfError n'expose pas la clé", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "upstream boom",
    });
    vi.stubGlobal("fetch", fetchMock);
    const { hfCall, HfError } = await import("../client");
    await expect(hfCall("some/model", { inputs: "x" })).rejects.toThrowError(HfError);
    try {
      await hfCall("some/model", { inputs: "x" });
    } catch (e) {
      const s = JSON.stringify({ msg: (e as Error).message, ...(e as object) });
      expect(s).not.toContain("hf_supersecret_value");
    }
  });
});
