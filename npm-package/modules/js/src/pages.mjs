import * as path from 'node:path'
import * as url from 'node:url'

/**
 * Retrieves a list of pages from a file.
 * @param {string} file - The file.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/pages.mjs')} api - The API.
 * @returns {Promise<import('../../../src/pages.mjs').Page[]>} The list of pages.
 */
export default async function pages (file, config, api) {
  const filepath = path.relative(config.root, file).replaceAll(path.sep, '/').replaceAll('../', '').replace(/\.ts$/, '.js')

  const results = []

  // Base version (no context)
  const src = {
    url: new URL(filepath, config.baseURI),
    params: {
      headers: {
        'Content-Type': 'application/javascript',
      },
    },
    fileUrl: url.pathToFileURL(file),
  }

  const map = {
    url: filepath.endsWith('.js') ? new URL(filepath.replace(/\.js$/, '.map.js'), config.baseURI) : new URL(filepath + '.map', config.baseURI),
    params: {
      headers: {
        'Content-Type': 'application/json',
      },
    },
    fileUrl: url.pathToFileURL(file),
  }

  results.push(src, map)

  // Generate context variants if buildContexts is configured
  const buildContexts = config?.js?.buildContexts
  if (Array.isArray(buildContexts) && buildContexts.length > 0) {
    for (const ctxName of buildContexts) {
      // Resolve context to check if it exists
      const resolvedCtx = config?.js?.contextResolve?.(ctxName)
      if (!resolvedCtx) continue

      // Create variant filename: script.js?ctx=1 -> script-ctx1.js
      const variantName = filepath.replace(/\.js$/, `-ctx${ctxName}.js`)

      const ctxSrc = {
        url: new URL(variantName, config.baseURI),
        params: {
          headers: {
            'Content-Type': 'application/javascript',
          },
          ctx: ctxName,  // Pass context to render
          __resolvedCtx: resolvedCtx,
        },
        fileUrl: url.pathToFileURL(file),
      }

      const ctxMap = {
        url: new URL(variantName.replace(/\.js$/, '.map.js'), config.baseURI),
        params: {
          headers: {
            'Content-Type': 'application/json',
          },
          ctx: ctxName,
          __resolvedCtx: resolvedCtx,
        },
        fileUrl: url.pathToFileURL(file),
      }

      results.push(ctxSrc, ctxMap)
    }
  }

  return results
}
