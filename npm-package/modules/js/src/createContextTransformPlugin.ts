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
    if (!Object.hasOwn(obj, key)) continue
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
  const flatKeys = Object.keys(flat)

  // Precompile reusable matchers once per plugin instance.
  const localCtxDeclarationRegex = /(?:^|[;\n])\s*(?:const|let|var)\s+ctx\s*[=;]/

  const arrayValueMap = new Map()
  const allPathAlternatives = []
  const arrayPathAlternatives = []

  for (const key of flatKeys) {
    const escaped = escapeRegex(key)
    allPathAlternatives.push(escaped)
    if (Array.isArray(flat[key])) {
      arrayPathAlternatives.push(escaped)
      arrayValueMap.set(key, flat[key])
    }
  }

  // Prefer longer paths so `a.b` wins over `a` when both exist.
  allPathAlternatives.sort((a, b) => b.length - a.length)
  arrayPathAlternatives.sort((a, b) => b.length - a.length)

  const directReplaceRegex = allPathAlternatives.length ? new RegExp(`\\bctx\\??\\.(?<path>${allPathAlternatives.join('|')})\\b`, 'g') : null

  const arrayMethodRegex = arrayPathAlternatives.length
    ? new RegExp(
        `ctx\\??\\.(?<path>${arrayPathAlternatives.join('|')})` +
          `\\.(?:includes\\((?<quote>['"\\x60])(?<literal>[^'"\\x60]+)\\k<quote>\\)|some\\([^)]*startsWith\\((?<quote2>['"\\x60])(?<literal2>[^'"\\x60]+)\\k<quote2>\\)\\))`,
        'g',
      )
    : null

  return {
    name: 'inline-ctx-advanced',

    transform(code, id) {
      if (!/\.(?:ts|js|mjs|cjs)$/.test(id)) return

      // Skip if no ctx references exist
      if (!code.includes('page:ctx')) return

      // Skip if ctx is being declared locally (const/let/var ctx)
      // This prevents transforming user's own ctx variables
      if (localCtxDeclarationRegex.test(code)) return

      if (arrayMethodRegex) {
        code = code.replace(arrayMethodRegex, (match, ...rest) => {
          const groups = rest[rest.length - 1]
          const path = groups?.path
          const value = arrayValueMap.get(path)
          if (!value) return match

          if (match.includes('.includes(')) {
            return value.includes(groups.literal) ? 'true' : 'false'
          }

          return 'false'
        })
      }

      if (directReplaceRegex) {
        code = code.replace(directReplaceRegex, (match, ...rest) => {
          const groups = rest[rest.length - 1]
          const path = groups?.path
          if (!path) return match
          return JSON.stringify(flat[path])
        })
      }

      return {
        code,
        map: null,
      }
    },
  }
}
