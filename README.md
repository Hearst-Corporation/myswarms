# MySwarms

Swarm Platform built with Next.js 16, React 19, TypeScript and Tailwind 4.

## UI / Design System

L'interface repose sur le **design system MySwarms** (dark premium, accent cyan) — voir
[`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) pour les tokens, primitives et conventions.

- **Tokens** : `src/app/globals.css` (Tailwind v4 `@theme`, CSS-first). Utilities standard
  (`bg-surface`, `text-content`, `text-accent`, `ring-line`, `rounded-[var(--radius-md)]`…).
- **Primitives** : `src/components/ui/` — `Button`, `Card`, `Field`, `Table`, `Badge`, `StatCard`,
  `PageHeader`, `Modal`, `Alert`, `EmptyState`… importées via `@/components/ui`.
- **Shell** : `src/components/cockpit/AppShell.tsx` (sidebar + topbar).
- **Blocs** : la banque Tailwind Plus (`~/.claude/tailwind-blocks/`) sert de source de composants
  à copier/adapter aux tokens du projet.

### Règles UI (contribution)

> **Interdit de coder de l'UI sans utiliser les composants.** Toute nouvelle page / écran / section
> se construit à partir des **primitives du design system** (`@/components/ui`) et des **blocs
> Tailwind Plus** — jamais de markup ad-hoc qui réinvente un composant existant.

- Styler avec les utilities mappées sur les tokens ; **pas de couleur hex en dur**.
- Ne pas mélanger logique métier et présentation : la logique vit dans `src/lib/**` et les handlers.
- C'est une règle de **discipline** documentée, pas un lint bloquant — le DS reste éditable
  librement dans le repo (esprit libre, cf. `DESIGN-SYSTEM.md`).

## Automobile

The Automobile environment lives inside Swarm Platform at `/automobile`.

- `/automobile` shows the private run dashboard for the authenticated owner.
- `/automobile/nouvelle` launches the global `Automobile — Recherche véhicule` template.
- The optional URL extractor pre-fills the vehicle form from supported listing pages, then keeps human validation before consuming LLM tokens.
- Runs, reports and dashboards are private by `owner_id`; the template remains global.

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3333](http://localhost:3333) with your browser to see the result.

## Useful Commands

- `npm run dev` — Next.js frontend on port `3333` plus the local CrewAI engine.
- `npm run dev:front` — Next.js frontend only.
- `npm run dev:back` — local CrewAI FastAPI engine.
- `npm run build` — production build.
- `npm run lint` — ESLint.
- `npm run test` — Vitest tests.

