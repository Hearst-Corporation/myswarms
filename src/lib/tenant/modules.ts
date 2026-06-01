/**
 * Catalogue des modules de navigation — données pures, client-safe (aucun import
 * serveur). Partagé entre le helper serveur (config.ts) et la nav cliente
 * (AppBottomBar / TenantConfigProvider).
 *
 * Ajouter un module ici = il devient activable par tenant dans tenant_config.modules.
 */
export const MODULES = [
  { id: "accueil", label: "Accueil", href: "/" },
  { id: "swarms", label: "Swarms", href: "/swarms" },
  { id: "automobile", label: "Automobile", href: "/automobile" },
] as const;

export type ModuleId = (typeof MODULES)[number]["id"];

export const ALL_MODULE_IDS = MODULES.map((m) => m.id) as ModuleId[];
