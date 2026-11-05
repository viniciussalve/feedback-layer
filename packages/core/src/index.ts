// Entrada do navegador: registra <feedback-layer> e reexporta o contrato.
import { register } from './element.js'

export * from './note.js'
export * from './capture.js'
export * from './transport.js'
export { buildNote, uuidv4, type ContextOptions, type NoteInput, type ProjectInfo } from './build.js'
export { FeedbackLayerElement, register, TAG, type LayerConfig } from './element.js'

register()
