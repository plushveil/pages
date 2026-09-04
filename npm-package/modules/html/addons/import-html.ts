import * as fs from 'node:fs'
import * as module from 'node:module'
import * as path from 'node:path'
import * as url from 'node:url'

const importHtmlFilename = url.fileURLToPath(import.meta.url)
const importHtmlDirname = path.dirname(importHtmlFilename)

const extensions = ['.html', '.htms', '.page', '.svg']

// Local `.ts`/`.js` project files (never node_modules) get the same per-render hash as
// `.html`-like files below, but are loaded normally rather than wrapped in `render()`. A file
// such as `text.ts` that reads `page:page` at its top level otherwise resolves to one stable
// `file://` URL, so Node caches it after the first render and every later render -- even for a
// different page -- reuses that first render's module instance forever.
const freshScriptExtensions = ['.ts', '.js']

global.importAttributes ||= {}

/**
 * Whether the resolved path lives outside any `node_modules` folder.
 *
 * @param {string} resolved - The resolved, absolute file path.
 * @returns {boolean} Whether the path is project-local.
 */
function isProjectLocal(resolved) {
  return !resolved.split(path.sep).includes('node_modules')
}

module.registerHooks({
  /**
   * @param {string} specifier - The specifier to resolve
   * @param {{ conditions: string[]; importAttributes: {}; parentURL: string }} context - The context object
   * @param {Function<string, {}>} nextResolve - The subsequent resolve hook in the chain, or the Node.js default resolve hook after the last user-supplied resolve hook
   * @returns {{ format: string; url: string; importAttributes: {}; shortCircuit: boolean }} - The result object
   * @see https://nodejs.org/api/module.html#resolvespecifier-context-nextresolve
   */
  resolve(specifier, context, nextResolve) {
    const isHtmlLike = extensions.some((ext) => specifier.endsWith(ext))
    const isFreshScript = !isHtmlLike && freshScriptExtensions.some((ext) => specifier.endsWith(ext))
    if (isHtmlLike || isFreshScript) {
      const parentPath = url.fileURLToPath(context.parentURL)
      const resolved = path.resolve(path.dirname(parentPath), ...specifier.split('/'))
      if (fs.existsSync(resolved) && (isHtmlLike || isProjectLocal(resolved))) {
        const fileUrl = url.pathToFileURL(resolved)
        const hash = new URL(context.parentURL).hash || `#${Date.now()}${Math.random()}`
        fileUrl.hash = hash
        // No explicit `format` here: asserting `module` ourselves defeats Node's own
        // extension-based TypeScript detection for a *nested* resolution (it only takes effect
        // for a top-level `import()`), so a hash-scoped `.ts` file would load as plain JS and
        // fail on any TypeScript-only syntax. Leaving `format` unset lets Node inspect the
        // (hash-free) file extension itself and strip it correctly.
        if (!isHtmlLike) return { url: fileUrl.href, importAttributes: { ...context.importAttributes }, shortCircuit: true }
        return {
          format: 'module',
          url: fileUrl.href,
          importAttributes: {
            ...context.importAttributes,
            specifier,
            parentURL: import.meta.url,
          },
          shortCircuit: true,
        }
      }
    }
    return nextResolve(specifier, context)
  },
  /**
   * @param {string} moduleUrl - The URL returned by the resolve chain
   * @param {{ conditions: string[]; format: string; importAttributes: {} }} context - The context object
   * @param {Function<string, {}>} nextLoad - The subsequent load hook in the chain, or the Node.js default load hook after the last user-supplied load hook
   * @returns {{ format: string; shortCircuit: boolean; source: string }} - The result object
   * @see https://nodejs.org/api/module.html#loadurl-context-nextload
   */
  load(moduleUrl, context, nextLoad) {
    if (context.importAttributes?.parentURL === import.meta.url) {
      const keys = new URL(moduleUrl).hash.split('|').filter(Boolean)
      const key = keys[keys.length - 1]
      global.importAttributes[key] ||= []
      global.importAttributes[key].push(context.importAttributes)
      return {
        format: 'module',
        shortCircuit: true,
        source: `
          import * as url from 'node:url'
          import * as path from 'node:path'
          import page from 'page:page'
          import config from 'page:config'
          import api from 'page:api'
          import render from '${path.resolve(importHtmlDirname, '..', 'src', 'render.js')}'
          const subpage = {
            ...page,
            importAttributes: '${key}',
            params: {
              ...page.params,
              headers: {
                ...page.params.headers,
                'X-Partial': 'true'
              },
              __filename: url.fileURLToPath(import.meta.url),
              __dirname: path.dirname(url.fileURLToPath(import.meta.url)),
            }
          }
          const renderPromise = render(subpage, config, api)
          renderPromise.then(() => {
            global.importAttributes['${key}'].pop()
            if (global.importAttributes['${key}'].length === 0) delete global.importAttributes['${key}']
          })
          export default await renderPromise
        `,
      }
    }

    return nextLoad(moduleUrl, context)
  },
})
