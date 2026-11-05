// Entrada "pura" (sem DOM) do core: usada também pelo bridge em Node.
export * from './schema.js'
export * from './redact.js'
export { sanitizeNote } from './sanitize.js'
export { toMarkdown, toJSON, fence, inlineCode, DATA_NOTICE } from './markdown.js'
