/**
 *
 * @param str
 */
function escapeRegex (str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 *
 * @param obj
 * @param prefix
 */
function flatten (obj, prefix = '') {
  const out = {}
  for (const key in obj) {
    const value = obj[key]
    const path = prefix ? `${prefix}.${key}` : key

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
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
 *
 * @param ctx
 */
export default function createContextTransformPlugin (ctx) {
  const flat = flatten(ctx)

  return {
    name: 'inline-ctx-advanced',

    transform (code, id) {
      if (!/\.(ts|js|mjs|cjs)$/.test(id)) return
      if (!code.includes('ctx')) return

      for (const path in flat) {
        const value = flat[path]
        const pathRegex = escapeRegex(path)

        // allow window.ctx, ctx, ctx?, window.ctx?
        const base = `(?:window\\.)?ctx\\??\\.${pathRegex}`

        // --- ARRAY HANDLING ---
        if (Array.isArray(value)) {
          // includes('literal')
          code = code.replace(
            new RegExp(`${base}\\.includes\\((['"\`])([^'"\\\`]+)\\1\\)`, 'g'),
            (_, __, literal) => {
              return value.includes(literal) ? 'true' : 'false'
            }
          )

          // startsWith('literal') (if array of strings)
          code = code.replace(
            new RegExp(`${base}\\.some\\([^)]*startsWith\\((['"\`])([^'"\\\`]+)\\1\\)\\)`, 'g'),
            () => {
              // too complex to safely eval → skip
              return 'false'
            }
          )

          // direct replacement
          code = code.replace(
            new RegExp(`\\b${base}\\b`, 'g'),
            JSON.stringify(value)
          )
        } else {
          code = code.replace(
            new RegExp(`\\b${base}\\b`, 'g'),
            JSON.stringify(value)
          )
        }
      }

      return {
        code,
        map: null
      }
    }
  }
}
