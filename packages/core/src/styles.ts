import { tokensCss } from './fallback-tokens.js'

/**
 * CSS do Shadow DOM. Só lê `--fl-*` (definidos por tokensCss no :host): nada de #hex ou px aqui.
 * Repete o que o DS aplica globalmente e não atravessa o shadow: :focus-visible, reduced-motion,
 * forced-colors. Acento (roxo) SÓ no botão principal do popover; o botão flutuante é o par
 * invertido fg/bg (decisão do Merlin/Aprovador, registrada no AGENTS.md do DS).
 */

const v = (n: string) => `var(--fl-${n})`
const ring = `${v('ring')} solid ${v('focus-ring')}`
const mono = v('font-mono')

export const STYLES = `${tokensCss()}
:host { all: initial; color-scheme: dark; font-family: ${v('font-sans')}; }
:host([data-fl-theme='light']) { color-scheme: light; }
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
button, select, textarea, input, summary { font: inherit; color: inherit; }
button { cursor: pointer; }
:focus-visible { outline: ${ring}; outline-offset: ${v('ring')}; }
svg { width: ${v('icon')}; height: ${v('icon')}; flex: none; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
svg.sm { width: ${v('icon-sm')}; height: ${v('icon-sm')}; }

.root { all: initial; display: block; position: fixed; inset: 0; font-family: ${v('font-sans')}; font-weight: 400; letter-spacing: normal; text-transform: none; text-align: start; direction: ltr; pointer-events: none; z-index: ${v('z')}; font-size: ${v('t-body')}; line-height: 1.4; color: ${v('fg')}; }
.root > * { pointer-events: auto; }
.root > .hl, .root > .chip, .root > .live { pointer-events: none; }
.root.off > :not(.live) { display: none !important; }
.sr { position: absolute; width: ${v('hairline')}; height: ${v('hairline')}; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

/* ---------- dock: botão + barra + dica ---------- */
.dock { position: fixed; display: flex; gap: ${v('gap')}; --fl-edge: max(${v('inner')}, env(safe-area-inset-right, 0rem)); }
.dock[data-corner='br'] { right: max(${v('inner')}, env(safe-area-inset-right, 0rem)); bottom: calc(${v('floating')} - ${v('inner')} - ${v('touch')} + env(safe-area-inset-bottom, 0rem) + var(--fl-lift, 0rem)); flex-direction: column-reverse; align-items: flex-end; }
.dock[data-corner='bl'] { left: max(${v('inner')}, env(safe-area-inset-left, 0rem)); bottom: calc(${v('floating')} - ${v('inner')} - ${v('touch')} + env(safe-area-inset-bottom, 0rem) + var(--fl-lift, 0rem)); flex-direction: column-reverse; align-items: flex-start; }
.dock[data-corner='tr'] { right: max(${v('inner')}, env(safe-area-inset-right, 0rem)); top: max(${v('inner')}, env(safe-area-inset-top, 0rem)); flex-direction: column; align-items: flex-end; }
.dock[data-corner='tl'] { left: max(${v('inner')}, env(safe-area-inset-left, 0rem)); top: max(${v('inner')}, env(safe-area-inset-top, 0rem)); flex-direction: column; align-items: flex-start; }
.dock[data-dragging='true'] { right: auto; bottom: auto; left: calc(var(--fl-x) * ${v('unit')}); top: calc(var(--fl-y) * ${v('unit')}); touch-action: none; }

.fab {
  position: relative; width: ${v('touch')}; height: ${v('touch')}; padding: 0; display: grid; place-items: center;
  background: ${v('fg')}; color: ${v('bg')};
  border: ${v('hairline')} solid ${v('border')}; border-radius: ${v('r-pill')};
  box-shadow: 0 0 0 ${v('ring')} ${v('bg')};
  touch-action: none;
  transition: background-color ${v('motion')} ease-out, transform ${v('motion')} ease-out;
}
.root[data-sheet] .dock { visibility: hidden; }
.foot .status { flex: 1 1 auto; margin-right: auto; }
.seg label { position: relative; }
.banner .btn { margin-top: ${v('gap')}; }
.fab:hover { background: ${v('fg-muted')}; }
.fab:active { transform: scale(0.96); }

.toolbar {
  display: flex; align-items: center; gap: ${v('gap')}; padding: ${v('gap')};
  background: color-mix(in srgb, ${v('bg-raised')} ${v('raised-alpha')}, transparent);
  -webkit-backdrop-filter: blur(${v('blur')}); backdrop-filter: blur(${v('blur')});
  border: ${v('hairline')} solid ${v('border')}; border-radius: ${v('r-card')};
  box-shadow: 0 0 0 ${v('ring')} ${v('bg')};
  max-width: calc(100vw - 2 * ${v('inner')});
}
.tbtn, .iconbtn {
  width: ${v('touch')}; height: ${v('touch')}; padding: 0; display: grid; place-items: center;
  background: transparent; border: 0; border-radius: ${v('r-pill')};
  transition: background-color ${v('motion')} ease-out, color ${v('motion')} ease-out;
}
.tbtn:hover, .iconbtn:hover { background: ${v('surface')}; }
.tbtn[aria-pressed='true'] { background: ${v('surface-2')}; box-shadow: inset 0 0 0 ${v('active-ring')} ${v('fg')}; }

.hint {
  max-width: calc(100vw - 2 * ${v('inner')}); padding: ${v('gap')} ${v('inner-sm')};
  background: ${v('bg-raised')}; color: ${v('fg-muted')};
  border: ${v('hairline')} solid ${v('border')}; border-radius: ${v('r-pill')};
  box-shadow: 0 0 0 ${v('ring')} ${v('bg')}; font-size: ${v('t-caption')}; text-align: center;
}

/* Região viva sempre no DOM (leitores de tela anunciam só o texto trocado): vazia, não ocupa espaço nem aparece. */
.hint:empty { padding: 0; border: 0; box-shadow: none; max-width: 0; overflow: hidden; }

/* ---------- realce do alvo (sem overlay: não bloqueia rolagem) ---------- */
.hl {
  position: fixed; left: calc(var(--fl-hx) * ${v('unit')}); top: calc(var(--fl-hy) * ${v('unit')});
  width: calc(var(--fl-hw) * ${v('unit')}); height: calc(var(--fl-hh) * ${v('unit')});
  outline: ${v('hl-outline')} solid ${v('fg')}; box-shadow: 0 0 0 ${v('hl-halo')} ${v('bg')};
  background: color-mix(in srgb, ${v('mark')} ${v('mark-tint')}, transparent);
  border-radius: ${v('r-control')};
}
.chip {
  position: fixed; left: calc(var(--fl-cx) * ${v('unit')}); top: calc(var(--fl-cy) * ${v('unit')});
  max-width: min(60vw, ${v('chip-w')}); display: flex; align-items: center; gap: ${v('gap')};
  padding: ${v('gap')} ${v('inner-sm')};
  background: ${v('bg-raised')}; color: ${v('fg')}; border: ${v('hairline')} solid ${v('border')};
  border-radius: ${v('r-control')}; font-size: ${v('t-caption')}; font-weight: 600;
}
.chip .sel, .chipro .sel { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ${mono}; font-weight: 400; }
.chip .dim { color: ${v('fg-muted')}; font-weight: 400; white-space: nowrap; }

/* ---------- popover ---------- */
.popover {
  position: fixed; left: calc(var(--fl-px) * ${v('unit')}); top: calc(var(--fl-py) * ${v('unit')});
  width: min(${v('popover-w')}, calc(100vw - 2 * ${v('inner')})); max-height: calc(100dvh - 2 * ${v('inner')});
  display: flex; flex-direction: column; margin: 0; padding: 0;
  background: color-mix(in srgb, ${v('bg-raised')} ${v('raised-alpha')}, transparent);
  -webkit-backdrop-filter: blur(${v('blur')}); backdrop-filter: blur(${v('blur')});
  border: ${v('hairline')} solid ${v('border')}; border-radius: ${v('r-card')};
  box-shadow: 0 0 0 ${v('ring')} ${v('bg')}, ${v('shadow')};
}
.popover.sheet { left: ${v('inner')}; right: ${v('inner')}; width: auto; top: auto; bottom: calc(${v('inner')} + var(--fl-kb, 0) * ${v('unit')}); }
.popover form, .popover .sent { display: flex; flex-direction: column; min-height: 0; margin: 0; }
.head { display: flex; align-items: center; justify-content: space-between; gap: ${v('gap')}; padding: ${v('inner')} ${v('inner')} 0 ${v('inner')}; }
.title { margin: 0; font-size: ${v('t-title')}; font-weight: 600; }
.body { display: grid; gap: ${v('inner-sm')}; padding: ${v('inner')}; overflow: auto; min-height: 0; }
.foot { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: ${v('inner-sm')}; padding: ${v('inner')}; border-top: ${v('hairline')} solid ${v('border')}; }
.field { display: grid; gap: ${v('gap')}; min-width: 0; }
.label, legend { margin: 0; padding: 0; font-size: ${v('t-caption')}; font-weight: 600; color: ${v('fg-muted')}; }
fieldset { margin: 0; padding: 0; border: 0; min-width: 0; display: grid; gap: ${v('gap')}; }

.chipro { display: flex; align-items: center; gap: ${v('gap')}; min-height: ${v('touch')}; padding: 0 0 0 ${v('inner-sm')}; background: ${v('surface')}; border-radius: ${v('r-control')}; font-size: ${v('t-caption')}; }
.chipro .sel { flex: 1; }
.chipro .note { flex: 1; font-family: ${v('font-sans')}; color: ${v('fg-muted')}; }
.chipro .iconbtn { border-radius: ${v('r-control')}; }

textarea, .popover input[type='text'] {
  width: 100%; background: ${v('bg')}; color: ${v('fg')}; border: ${v('hairline')} solid ${v('border')};
  border-radius: ${v('r-control')}; padding: ${v('inner-sm')}; font-size: ${v('t-body-lg')};
}
textarea { min-height: ${v('textarea-min-h')}; max-height: ${v('textarea-max-h')}; resize: vertical; }
textarea::placeholder { color: ${v('fg-subtle')}; opacity: 1; }
textarea[aria-invalid='true'] { border-color: ${v('danger')}; }
@media (pointer: coarse) { textarea { font-size: ${v('t-title')}; } }

.seg { display: flex; gap: ${v('hairline')}; padding: ${v('hairline')}; background: ${v('surface')}; border-radius: ${v('r-control')}; }
.seg label {
  flex: 1; min-width: 0; min-height: ${v('touch')}; display: flex; align-items: center; justify-content: center; gap: ${v('gap')};
  padding: 0 ${v('gap')}; border-radius: ${v('r-control')}; font-size: ${v('t-body')}; cursor: pointer; text-align: center;
  transition: background-color ${v('motion')} ease-out;
}
.seg label:hover { background: ${v('surface-2')}; }
.seg label:has(input:checked) { background: ${v('bg')}; box-shadow: inset 0 0 0 ${v('active-ring')} ${v('fg')}; }
.seg label:has(input:focus-visible) { outline: ${ring}; outline-offset: ${v('ring')}; }
.seg input { position: absolute; opacity: 0; pointer-events: none; }
.seg[aria-disabled='true'] label { opacity: 0.7; cursor: default; }

details { background: ${v('bg')}; border: ${v('hairline')} solid ${v('border')}; border-radius: ${v('r-control')}; }
summary { min-height: ${v('touch')}; display: flex; align-items: center; justify-content: space-between; gap: ${v('gap')}; padding: 0 ${v('inner-sm')}; cursor: pointer; color: ${v('fg-muted')}; font-size: ${v('t-caption')}; list-style: none; }
summary::-webkit-details-marker { display: none; }
summary svg { transition: transform ${v('motion')} ease-out; }
details[open] > summary svg { transform: rotate(180deg); }
.ctx { margin: 0; padding: 0 ${v('inner-sm')} ${v('gap')} ${v('inner-sm')}; list-style: none; display: grid; gap: ${v('gap')}; font-size: ${v('t-caption')}; color: ${v('fg-muted')}; overflow-wrap: anywhere; }
.ctx b { color: ${v('fg')}; font-weight: 600; }
.lock { display: flex; align-items: center; gap: ${v('gap')}; margin: 0; padding: 0 ${v('inner-sm')} ${v('inner-sm')}; font-size: ${v('t-caption')}; color: ${v('fg-muted')}; }
.warn { margin: 0; padding: 0 ${v('inner-sm')} ${v('gap')}; font-size: ${v('t-caption')}; color: ${v('fg-muted')}; }
pre.preview { margin: 0; padding: ${v('inner-sm')}; max-height: ${v('preview-max-h')}; overflow: auto; font-family: ${mono}; font-size: ${v('t-caption')}; color: ${v('fg-muted')}; white-space: pre-wrap; overflow-wrap: anywhere; border-top: ${v('hairline')} solid ${v('border')}; }

.banner { display: flex; gap: ${v('gap')}; align-items: flex-start; padding: ${v('inner-sm')}; background: ${v('surface')}; border: ${v('hairline')} solid ${v('danger')}; border-radius: ${v('r-control')}; font-size: ${v('t-caption')}; color: ${v('fg')}; }
.banner svg { color: ${v('danger')}; }
.banner strong { display: block; }
.err { display: flex; gap: ${v('gap')}; align-items: center; margin: 0; font-size: ${v('t-caption')}; color: ${v('danger')}; }
.status { margin: 0; font-size: ${v('t-caption')}; color: ${v('fg-muted')}; min-height: 1.4em; }
.sent .body { justify-items: start; }
.sent .ok { display: flex; gap: ${v('gap')}; align-items: center; color: ${v('success')}; font-weight: 600; }
.sent .where { margin: 0; color: ${v('fg-muted')}; font-size: ${v('t-caption')}; overflow-wrap: anywhere; }

.btn {
  min-height: ${v('touch')}; padding: 0 ${v('inner')}; display: inline-flex; align-items: center; justify-content: center; gap: ${v('gap')};
  background: ${v('surface')}; color: ${v('fg')}; border: ${v('hairline')} solid ${v('border')}; border-radius: ${v('r-control')};
  font-size: ${v('t-body-lg')}; transition: background-color ${v('motion')} ease-out;
}
.btn:hover:not(:disabled) { background: ${v('surface-2')}; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn.primary { background: ${v('accent')}; color: ${v('accent-fg')}; border-color: transparent; }
.btn.primary:hover:not(:disabled) { background: ${v('accent-hover')}; }
.btn.primary:disabled { opacity: 1; cursor: progress; }
.spin { width: ${v('icon-sm')}; height: ${v('icon-sm')}; border: ${v('ring')} solid currentColor; border-top-color: transparent; border-radius: 50%; animation: fl-spin ${v('spin')} linear infinite; }
@keyframes fl-spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
}
@media (forced-colors: active) {
  .fab, .toolbar, .popover, .hint, .chip { border: ${v('ring')} solid CanvasText; box-shadow: none; }
  .hl { outline: ${v('hl-outline')} solid Highlight; box-shadow: none; background: transparent; }
  .tbtn[aria-pressed='true'], .seg label:has(input:checked) { outline: ${v('ring')} solid Highlight; box-shadow: none; }
  .btn.primary { forced-color-adjust: none; background: Highlight; color: HighlightText; }
}
`
