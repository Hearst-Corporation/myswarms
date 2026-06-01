# MySwarms

Swarm Platform built with Next.js 16, React 19, TypeScript and Tailwind 4.

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

