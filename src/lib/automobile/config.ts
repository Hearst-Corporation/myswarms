/**
 * Configuration centrale du chantier Automobile (template APM Vehicle Research).
 *
 * `AUTOMOBILE_SWARM_ID` était auparavant hardcodé en dur dans les 4 pages
 * automobile. Centralisé ici et surchargeable via env pour pouvoir pointer un
 * autre swarm (staging, re-seed) sans toucher au code.
 */
export const AUTOMOBILE_SWARM_ID =
  process.env.AUTOMOBILE_SWARM_ID ?? "cccccccc-0001-0001-0001-000000000001";
