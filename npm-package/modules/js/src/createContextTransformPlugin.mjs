/**
 * @param str
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * @param obj
 * @param prefix
 */
function flatten(obj, prefix = '') {
  const out = {}
  for (const key in obj) {
    const value = obj[key]
    const path = prefix ? `${prefix}.${key}` : key

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[path] = value
    } else if (Array.isArray(value)) {
      out[path] = value
    } else if (value && typeof value === 'object') {
      Object.assign(out, flatten(value, path))
    }
  }
  return out
}

/**
 * @param ctx
 */
export default function createContextTransformPlugin(ctx) {
  const flat = flatten(ctx)

  return {
    name: 'inline-ctx-advanced',

    transform(code, id) {
      if (!/\.(ts|js|mjs|cjs)$/.test(id)) return

      // Skip if no ctx references exist
      if (!code.includes('page:ctx')) return

      // Skip if ctx is being declared locally (const/let/var ctx)
      // This prevents transforming user's own ctx variables
      if (/(?:^|[;\n])\s*(?:const|let|var)\s+ctx\s*[=;]/.test(code)) return

      for (const path in flat) {
        const value = flat[path]
        const pathRegex = escapeRegex(path)

        // allow ctx, ctx? (but not window.ctx to avoid namespace pollution)
        const base = `ctx\\??\\.${pathRegex}`

        // --- ARRAY HANDLING ---
        if (Array.isArray(value)) {
          // includes('literal')
          code = code.replace(new RegExp(`${base}\\.includes\\((['"\`])([^'"\\\`]+)\\1\\)`, 'g'), (_, __, literal) => (value.includes(literal) ? 'true' : 'false'))

          // startsWith('literal') (if array of strings)
          code = code.replace(
            new RegExp(`${base}\\.some\\([^)]*startsWith\\((['"\`])([^'"\\\`]+)\\1\\)\\)`, 'g'),
            () =>
              // too complex to safely eval → skip
              'false',
          )

          // direct replacement
          code = code.replace(new RegExp(`\\b${base}\\b`, 'g'), JSON.stringify(value))
        } else {
          code = code.replace(new RegExp(`\\b${base}\\b`, 'g'), JSON.stringify(value))
        }
      }

      return {
        code,
        map: null,
      }
    },
  }
}
