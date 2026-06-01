/**
 * source.ts — Résolution du nom de marketplace depuis une URL d'annonce.
 *
 * Partagé entre le dashboard (`/automobile`) et l'explorateur d'historique
 * (filtre par source). Fonction pure → utilisable côté serveur et client.
 */
export function getSourceName(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
    if (host.includes("autoscout24")) return "AutoScout24";
    if (host.includes("mobile.de")) return "mobile.de";
    if (host.includes("leboncoin")) return "Leboncoin";
    if (host.includes("la-centrale") || host.includes("lacentrale")) return "La Centrale";
    if (host.includes("subito")) return "Subito";
    if (host.includes("milanuncios")) return "Milanuncios";
    if (host.includes("coches")) return "coches.net";
    return host;
  } catch {
    return null;
  }
}
