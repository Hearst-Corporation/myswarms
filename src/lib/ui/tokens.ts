// Design tokens centralisés Cockpit — source de vérité TypeScript.
// Convention : valeurs en `number` (pixels) côté style inline / props CSS-in-JS.
// Base 4 (xs=4 → xxl=32), cohérente avec Tailwind 4 et la SPEC Cockpit.
//
// Usage :
//   import { SPACING, RADIUS, FONT } from "@/lib/ui/tokens";
//   <div style={{ padding: SPACING.md, borderRadius: RADIUS.md, fontSize: FONT.base }} />

export const SPACING = {
  hair: 2,
  xxs: 6,
  xs: 4,
  sm: 8,
  s: 10,
  md: 12,
  lg: 16,
  lx: 20,
  xl: 24,
  xxl: 32,
} as const;

export const RADIUS = {
  hair: 1,
  xs: 3,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  nav: 10,
  full: 9999,
} as const;

export const FONT = {
  micro: 8,
  nano: 9,
  xxs: 11,
  xs: 10,
  sm: 12,
  base: 13,
  md: 14,
  lg: 16,
  xl: 18,
  display: 22,
  xxl: 24,
  iconLg: 32,
  hero: 48,
} as const;

export const LINE_HEIGHT = {
  none: 1,
  snug: 1.25,
  cozy: 1.3,
  relaxed: 1.4,
  tight: 1.5,
  base: 1.6,
} as const;

export const FONT_WEIGHT = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
} as const;

export const LETTER_SPACING = {
  tightNeg: "-0.02em",
  tight: "0.08em",
  mid: "0.12em",
  wide: "0.14em",
} as const;

export const Z_INDEX = {
  base: 0,
  ambient: 0,
  panel: 10,
  rail: 20,
  bottomBar: 30,
  dropdown: 50,
  modal: 100,
  toast: 200,
} as const;

// COLOR — remappé sur les tokens du nouveau DS MySwarms (globals.css @theme).
// Couche de compat pour les styles inline hérités ; à terme, préférer les
// utilities Tailwind (bg-surface, text-content, ring-line, …).
export const COLOR = {
  brandHive: "var(--color-accent)",
  textOnAccent: "#ffffff",
  textStrong: "var(--color-content-strong)",
  textPrimary: "var(--color-content)",
  textBody: "var(--color-content)",
  textMuted: "var(--color-content-muted)",
  textFaint: "var(--color-content-faint)",
  accentStrong: "var(--color-accent-strong)",
  surface0: "var(--color-canvas)",
  surface1: "var(--color-surface)",
  surface3: "var(--color-surface-3)",
  border: "var(--color-line)",
  borderSoft: "var(--color-line)",
  borderStrong: "var(--color-line-strong)",
  borderAccent: "color-mix(in oklab, var(--color-accent) 40%, transparent)",
  overlayModal: "rgba(0,0,0,0.7)",
  overlayDark: "rgba(0,0,0,0.6)",
  overlayDarkStrong: "rgba(0,0,0,0.8)",
  statusCompleted: "var(--color-ok)",
  statusRunning: "var(--color-running)",
  statusPaused: "var(--color-warn)",
  statusFailed: "var(--color-danger)",
} as const;

export const OPACITY = {
  disabled: 0.5,
  skeletonStrong: 0.5,
  skeleton: 0.45,
  skeletonSoft: 0.4,
  skeletonFaint: 0.35,
  pulse: 0.4,
} as const;

export const BLUR = {
  panel: "blur(60px) saturate(110%) brightness(105%)",
  modal: "blur(24px) saturate(150%)",
  modalLight: "blur(4px)",
  tooltip: "blur(12px)",
} as const;

export const SIZE = {
  logo: 40,
  logoLg: 48,
  previewMaxH: 480,
  outputMaxH: 240,
  iconSm: 14,
  iconMd: 16,
  iconLg: 20,
  avatar: 36,
  btnClose: 44,
  spinner: 28,
  modalMaxWidth: 560,
  authCardW: 400,
  timelineRow: 40,
  agentDiffTimeCol: 38,
  // status dots (normalisés à 8 — anciennes valeurs 6/7/9 hors échelle)
  dotSm: 6,
  dot: 8,
  // cards / grilles auto-fit
  cardMinW: 220,
  // node system-map
  nodeMinW: 150,
  nodeMaxW: 220,
  detailLabelCol: 72,
  // dropdown / popovers
  dropdownMaxH: 260,
  labelMaxW: 240,
  textMaxW: 200,
  // decision canvas panels
  panelBasis: 320,
  panelMinW: 280,
  sidebarW: 280,
  // skeletons
  skeletonLine: 12,
  skeletonTitle: 14,
  skeletonBar: 10,
  skeletonCardMinH: 96,
  skeletonBlockMinH: 240,
} as const;


