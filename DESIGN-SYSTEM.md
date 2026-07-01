# MySwarms — Design System

> Référence du look du produit. Reconstruit intégralement le 2026-07-01 via `/tailwind-refonte`
> sur les blocs Tailwind Plus. **Dark premium, accent cyan.** Éditable librement dans le repo —
> ce document est une RÉFÉRENCE, pas une prison : aucun verrou, aucune source de vérité centrale,
> aucun lint bloquant. Chaque page se construit avec les primitives ci-dessous + les blocs Tailwind.

## Thème

- **Direction** : dark corporate / fintech premium, surfaces slate profondes, accent cyan.
- **Pourquoi** : MySwarms est un produit d'orchestration multi-agents (swarms & crews). Le dark
  slate met en valeur les données (KPIs, tables, timelines de runs) ; l'accent cyan (`#3FA7E0`,
  ADN historique Hearst Hive conservé) sert d'unique couleur de marque, sur un système neutre.
- **Espace Automobile** : accent remappé en **ambre** (`#f59e0b`) via `[data-product="automobile"]`
  (posé par `DashboardSwitcher`). Les utilities `bg-accent` / `text-accent` deviennent ambre
  automatiquement dans cet espace — ne jamais hardcoder le cyan.

## Tokens

Source de vérité : [`src/app/globals.css`](src/app/globals.css) — Tailwind v4 `@theme` (CSS-first,
pas de `tailwind.config.js`). Consommés via les utilities Tailwind standard.

| Rôle | Token / utility | Valeur |
|---|---|---|
| Fond application | `bg-canvas` | `#060b12` |
| Surface (cartes) | `bg-surface` | `#0c141d` |
| Surface 2 (inputs, entêtes) | `bg-surface-2` | `#111c27` |
| Surface 3 (hover, segments) | `bg-surface-3` | `#17232f` |
| Surface élevée (dropdowns) | `bg-elevated` | `#1b2833` |
| Texte fort (titres) | `text-content-strong` | `#ffffff` |
| Texte courant | `text-content` | `#e6edf3` |
| Texte atténué | `text-content-muted` | `#9aa9b6` |
| Texte discret | `text-content-faint` | `#6b7c8a` |
| Accent (marque) | `bg-accent` / `text-accent` | `#3fa7e0` (cyan) |
| Accent fort (hover) | `bg-accent-strong` / `text-accent-strong` | `#60bae8` |
| Filet | `ring-line` / `border-line` | `rgba(255,255,255,.08)` |
| Filet fort | `ring-line-strong` | `rgba(255,255,255,.14)` |
| Statut OK | `text-ok` | `#22c55e` |
| Statut running | `text-running` | `#3b82f6` |
| Statut warn | `text-warn` | `#f59e0b` |
| Statut danger | `text-danger` | `#ef4444` |

- **Radius** : `rounded-[var(--radius-xs|sm|md|lg|xl)]` → `3 / 6 / 10 / 14 / 20 px`.
- **Typo** : Geist Sans / Geist Mono (`next/font/google`, câblées dans `src/app/layout.tsx`).
  Échelle via les utilities Tailwind (`text-xs` → `text-2xl`).
- **Motion** : `--ease-swift` = `cubic-bezier(.2,.7,.2,1)`, durée ~150 ms.
- **Focus** : ring accent global (`globals.css`, `:focus-visible`).

## Primitives

Barrel unique : `import { … } from "@/components/ui"` — [`src/components/ui/`](src/components/ui/).
Helper de classes : `import { cn } from "@/lib/ui/cn"`.

| Primitive | API essentielle |
|---|---|
| `Button` | `variant` primary\|secondary\|outline\|ghost\|danger · `size` sm\|md\|lg · props `<button>` |
| `Card` + `CardHeader`/`CardTitle`/`CardBody`/`CardFooter` | conteneur surface + sections |
| `Field` | `{label, htmlFor, hint, error, children}` — wrappe `Input`/`Textarea`/`Select` |
| `Input` / `Textarea` / `Select` / `Label` | contrôles de formulaire |
| `Badge` | `tone` neutral\|accent\|ok\|running\|warn\|danger · `dot` |
| `StatCard` / `KpiGrid` | `StatCard({label, value, hint, icon, trend})` dans une `KpiGrid` |
| `PageHeader` | `{title, subtitle, actions, eyebrow}` — en-tête de page standard |
| `Table` + `THead`/`TBody`/`TR`/`TH`/`TD` | table du DS |
| `Modal` | `{open, onClose, title, children, footer, size}` (Headless UI) |
| `Alert` | `tone` info\|success\|warning\|error |
| `EmptyState` | `{icon, title, description, action}` |
| `Spinner` / `Skeleton` | chargement |
| `AlertDialog` | confirmation destructive (réécrit sur `Modal`) |
| `PageTitle` / `SectionLabel` / `Chevron` / `ErrorLayout` / `CtButton` | primitives héritées, API préservée |

- Icônes : `@heroicons/react/24/outline`. Overlays/dropdowns : `@headlessui/react`.

## Shell

[`src/components/cockpit/AppShell.tsx`](src/components/cockpit/AppShell.tsx) — sidebar fixe
(desktop) + drawer (mobile) + topbar. Remplace l'ancien `@hearst/cockpit-shell` vendoré (débranché
du layout). La logique de navigation (modules par tenant, super-admin, espace Automobile) est
préservée depuis l'ex-bottom-bar. `HiveShell` route entre le shell et les pages « bare » (login).

## Mapping blocs → écrans

Refonte issue de la banque `~/.claude/tailwind-blocks/` (657 blocs). Correspondances principales :

| Écran | Blocs / patterns Tailwind |
|---|---|
| Shell (sidebar + topbar) | `application-ui/application-shells__sidebar`, `navigation__sidebar-navigation` |
| Dashboard, Workspace | `data-display__stats`, `layout__cards`, `lists__tables` |
| Swarms (liste, builder, runs) | `lists__tables`, `lists__stacked-lists`, `forms__*`, `overlays__*` |
| Chief of Staff | `forms__*`, `data-display` (feed/timeline), `lists__stacked-lists` |
| Automobile | `forms__*`, `lists__tables`, `data-display__stats`, `layout__cards` |
| Admin / Platform / Settings | `lists__tables`, `forms__*`, `overlays__*`, `data-display__stats` |
| Login | pattern sign-in centré (application-ui / page-examples) |

## Conventions — ajouter une page ou un composant

1. Partir des **primitives** (`@/components/ui`) et, si besoin, d'un **bloc** de la banque Tailwind
   (le copier dans `components/`, l'adapter aux tokens slate + accent, retirer les placeholders).
2. Styler avec les **utilities Tailwind** mappées sur les tokens (`bg-surface`, `text-content`,
   `ring-line`, `rounded-[var(--radius-md)]`, `text-accent`…). Jamais de couleur hex en dur.
3. En-tête de page : `PageHeader`. Cartes : `Card`. KPIs : `StatCard`/`KpiGrid`. Tables : `Table`.
   Formulaires : `Field` + `Input`/`Select`/`Textarea`. Overlays : `Modal`.
4. a11y de base : `aria-label` sur les boutons-icônes, labels de form liés, le focus ring est global.
5. **La logique métier ne se mélange pas au style** : hooks, fetch, calculs, schémas restent dans
   `src/lib/**` et les handlers ; les composants de présentation consomment des props.

## Esprit libre

Ce DS est **la référence du repo**, pas un carcan. Tous les tokens (`globals.css`), primitives
(`src/components/ui/`) et le shell sont **éditables directement**. Il n'y a **aucun** package DS
vendoré imposé, aucune source de vérité externe, aucun lint « design conformity » bloquant, aucune
règle « ne jamais éditer ». Fais évoluer le système ici, dans le projet.

> Note transition : [`src/design/compat.css`](src/design/compat.css) est un **pont temporaire**
> qui mappe l'ancien vocabulaire `ct-*` (variables + quelques classes) vers les tokens neufs. Aucune
> page ne dépend plus de classes `ct-*` (refonte 2026-07-01) ; ce fichier peut être réduit puis
> supprimé quand plus aucune référence n'existe.
