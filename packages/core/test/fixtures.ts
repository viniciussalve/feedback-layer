import type { FeedbackNote } from '../src/schema.js'

export const ID = '3f2b8c1e-5d4a-4e6f-8a9b-0c1d2e3f4a5b'

export function makeNote(over: Partial<FeedbackNote> = {}): FeedbackNote {
  return {
    schema: 'feedback-note/v1',
    id: ID,
    createdAt: '2026-11-05T17:00:00.000Z',
    project: { name: 'design-system-vue', version: '0.1.0', commit: 'af4474b' },
    from: 'vini',
    to: 'design-system-vue',
    kind: 'bug',
    severity: 'high',
    comment: 'O botão Play está desalinhado.',
    target: {
      mode: 'element',
      selector: '[data-testid=player] > button:nth-of-type(2)',
      text: 'Play',
      box: { x: 12, y: 680, w: 336, h: 56 },
      styles: { color: 'rgb(249, 250, 251)', background: 'rgb(44, 44, 46)', fontSize: '13px' },
      vue: { name: 'PlayerBar', file: 'src/components/PlayerBar.vue' },
    },
    page: {
      url: 'http://localhost:5173/design-system',
      route: '/design-system',
      title: 'Design system',
      viewport: { w: 360, h: 740, dpr: 3 },
      scrollY: 0,
      theme: 'dark',
    },
    consoleErrors: [{ ts: '2026-11-05T17:00:03.000Z', message: 'TypeError: x is undefined' }],
    ...over,
  }
}
