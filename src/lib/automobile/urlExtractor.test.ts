import { describe, expect, it } from "vitest";
import { isAllowedAutomobileUrl } from "@/lib/automobile/urlExtractor";

describe("isAllowedAutomobileUrl", () => {
  it("accepts supported automobile marketplaces", () => {
    expect(isAllowedAutomobileUrl("https://www.autoscout24.fr/offres/bmw-330d")).toBe(true);
    expect(isAllowedAutomobileUrl("https://suchen.mobile.de/fahrzeuge/details.html?id=1")).toBe(true);
    expect(isAllowedAutomobileUrl("https://www.leboncoin.fr/ad/voitures/123")).toBe(true);
    expect(isAllowedAutomobileUrl("https://www.la-centrale.fr/auto-occasion-annonce.html")).toBe(true);
  });

  it("rejects unsupported or unsafe URLs", () => {
    expect(isAllowedAutomobileUrl("https://example.com/bmw-330d")).toBe(false);
    expect(isAllowedAutomobileUrl("ftp://www.autoscout24.fr/offres/bmw-330d")).toBe(false);
    expect(isAllowedAutomobileUrl("not-a-url")).toBe(false);
  });
});
