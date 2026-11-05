# Feedback Layer

A floating button that lets you point at an element of the UI, write a comment and send a note with context
(selector, text, box, styles, route, viewport, theme, project, version, console errors).

## Install (one line)

```html
<script src="feedback-layer.iife.js"
        data-project="my-app" data-version="1.2.0" data-from="vini" data-to="my-app"
        data-bridge="http://127.0.0.1:7777"></script>
```

Attributes of `<feedback-layer>`: `project`, `project-version`, `project-commit`, `from`, `to`, `bridge`,
`shortcut` (default `Alt+Shift+F`), `no-safe-area`, `start-hidden`, `isolate-tokens`.

API: `el.show()`, `el.hide()`. Events: `feedback-sent`, `feedback-copied`.

## Delivery
1. **Clipboard** (always available): "Copiar nota" copies the Markdown.
2. **Local bridge** (optional): `npx feedback-bridge --port 7777 --inbox ./inbox` writes `<receivedAt>_<id8>.md` and `.json`
   into `inbox/`. The `.md` is byte-identical to the clipboard Markdown. Options: `--origin <url>` (repeatable), `--no-anonymous`.

Bridge endpoints: `GET /health`, `POST /notes` (max 64 KB, 409 on duplicate id, 400 on invalid note).

## Develop
```
npm install && npm run build && npm test && npm run e2e
```
See `AGENTS.md` for rules.
