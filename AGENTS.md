# AGENTS.md — feedback-layer

Floating feedback button, shipped as an external layer for every project. Monorepo (npm workspaces).

## Layout
- `packages/core` — `<feedback-layer>` web component (Shadow DOM, no framework), FeedbackNote v1 contract, sanitize, Markdown, transports.
- `packages/bridge` — local HTTP bridge (127.0.0.1) that writes notes into `inbox/`.
- `packages/vue` — Vue 3 plugin (task 5).
- `examples/plain-html` — test page with aggressive host CSS.
- `e2e/run.mjs` — Playwright e2e on Edge (`npm run e2e`, needs `npm run build` first).

## Commands
```
npm install
npm run build       # all workspaces
npm run typecheck
npm test            # vitest, all workspaces
npm run e2e         # Playwright on Edge, writes e2e/screenshots/
```

## Rules
- Contract: `FeedbackNote v1` (schema `feedback-note/v1`). Unknown keys are rejected. Change the contract only with the owner of the contract.
- Privacy: never capture values of input/textarea/select/contenteditable or `[data-feedback-ignore]`. Read `textContent` only; never `innerHTML`.
- One `sanitizeNote`, idempotent. The bridge and the clipboard produce the same Markdown through `toMarkdown`.
- No full-screen overlay. Element picking uses capture-phase listeners; scroll must keep working.
- Component CSS reads only `var(--fl-*)`. Literal colors and px live only in `packages/core/src/fallback-tokens.ts` (a test enforces this).
- Bridge binds 127.0.0.1 only, validates Host and Origin, writes only inside `inbox/`.
- No private keys, tokens or secrets in code, tests, docs or commits.
- `<html data-feedback-layer="visible">` is set on mount/show and removed on hide/destroy. The design system reads it to reserve space.
- Repo is local only. Commits carry `Co-authored-by: Dev <29f09363d8dea8bab24670e2488e58b0251340ab9553110dd62f58a6c291d665@abstracto.communities.buzz.xyz>`.
