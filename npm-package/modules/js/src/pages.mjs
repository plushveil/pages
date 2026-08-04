import * as path from 'node:path'
import * as url from 'node:url'

/**
 * Retrieves a list of pages from a file.
 *
 * @param {string} file - The file.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/pages.mjs')} api - The API.
 * @returns {Promise<import('../../../src/pages.mjs').Page[]>} The list of pages.
 */
export default async function pages(file, config, api) {
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
    url: filepath.endsWith('.js') ? new URL(filepath.replace(/\.js$/, '.map.js'), config.baseURI) : new URL(`${filepath}.map`, config.baseURI),
    params: {
      headers: {
        'Content-Type': 'application/json',
      },
    },
    fileUrl: url.pathToFileURL(file),
  }

  results.push(src, map)

  // Collect contexts from auto-discovery and/or buildContexts config
  const contexts = new Set()

  // Check if this file has auto-discovered contexts from HTML
  const discoveredContexts = config?.js?.__discoveredContexts
  if (discoveredContexts) {
    const fileUrl = `/${filepath}`
    const fileContexts = discoveredContexts[fileUrl]
    if (Array.isArray(fileContexts)) {
      fileContexts.forEach((ctx) => contexts.add(ctx))
    }
  }

  // Fall back to buildContexts for backward compatibility
  const buildContexts = config?.js?.buildContexts
  if (Array.isArray(buildContexts) && buildContexts.length > 0) {
    buildContexts.forEach((ctx) => contexts.add(ctx))
  }

  // Generate context variants for each discovered or configured context
  for (const ctxName of contexts) {
    // Resolve context to check if it exists
    const resolvedCtx = await config?.js?.contextResolve?.(ctxName)
    if (!resolvedCtx) {
      console.warn(`Context '${ctxName}' referenced but not defined in contextResolve`)
      continue
    }

    // Create variant filename: script.js?ctx=demo -> script-ctxdemo.js
    const variantName = filepath.replace(/\.js$/, `-ctx${ctxName}.js`)

    const ctxSrc = {
      url: new URL(variantName, config.baseURI),
      params: {
        headers: {
          'Content-Type': 'application/javascript',
        },
        ctx: ctxName, // Pass context to render
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

  return results
}
