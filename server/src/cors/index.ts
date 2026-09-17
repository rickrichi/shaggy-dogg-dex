// server/src/cors/index.ts

// Re-export the vetted origin matcher
export { vetOrigin } from './origins.js'

// Re-export the preflight (OPTIONS) handler
export { preflight } from './preflight.js'

// Re-export the actual (non-OPTIONS) CORS middleware
export { corsActual } from './actual.js'
