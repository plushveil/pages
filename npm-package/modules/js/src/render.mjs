import * as fs from 'node:fs'
import * as url from 'node:url'
import * as path from 'node:path'

import { rolldown } from 'rolldown'

import getPages from './pages.mjs'
import { render as renderPage } from '../../../src/pages.mjs'

const VIRTUAL_ENTRY_ID = '\0pages-virtual-entry'

/**
 * Renders a page.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/pages.mjs')} api - The API.
 * @returns {Promise<string>} The rendered page.
 */
export default async function render (page, config, api) {
  try {
    const file = page.fileUrl && url.fileURLToPath(page.fileUrl)
    if (file && !fs.existsSync(file)) return ''
    if (!file && !page.content) return ''

    // Use pre-resolved context from serve.mjs or pages.mjs (functions can't be serialized through worker)
    const ctx = page.params?.__resolvedCtx

    const script = typeof page.content === 'string' ? page.content : `export * from '${path.resolve(file)}'\n`
    const resolveDir = file ? path.dirname(file) : process.cwd()

    const virtualEntryPlugin = createVirtualEntryPlugin(script, resolveDir, ctx)
    const pagesLoaderPlugin = createPagesLoaderPlugin(page, config, api)

    const bundle = await rolldown({
      input: 'virtual-entry',
      plugins: [virtualEntryPlugin, pagesLoaderPlugin],
      treeshake: {
        moduleSideEffects: false,
      },
      onwarn (warning, warn) {
        if (warning.code === 'MISSING_NAME_OPTION_FOR_IIFE_EXPORT') return
        warn(warning)
      },
    })

    if (!page.fileUrl || ['.html', '.htms', '.page'].find(ext => page.fileUrl.toString().endsWith(ext))) {
      const { output } = await bundle.generate({
        format: 'iife',
        sourcemap: false,
        minify: !!(config?.js?.minify),
      })
      await bundle.close()
      return output[0].code
    } else {
      const pages = await getPages(file, config, api)
      const map = pages.find(page => page.params.headers['Content-Type'] === 'application/json')

      if (page.url.toString() === map.url.toString()) {
        const { output } = await bundle.generate({
          format: 'iife',
          sourcemap: true,
          minify: !!(config?.js?.minify),
        })
        await bundle.close()
        if (!output[0].map) return '{}'
        return output[0].map.toString()
      }

      const { output } = await bundle.generate({
        format: 'iife',
        sourcemap: false,
        minify: !!(config?.js?.minify),
      })
      await bundle.close()
      return output[0].code + `\n//# sourceMappingURL=${map.url}\n`
    }
  } catch (err) {
    console.log(page)
    throw err
  }
}

/**
 * Creates a virtual entry plugin for Rolldown.
 * @param {string} code - The virtual entry script content.
 * @param {string} resolveDir - The directory to resolve imports from.
 * @param {any} ctx - The context object for constant inlining.
 * @returns {import('rolldown').Plugin}
 */
function createVirtualEntryPlugin (code, resolveDir, ctx) {
  return {
    name: 'virtual-entry',
    resolveId (source, importer) {
      if (source === 'virtual-entry') return VIRTUAL_ENTRY_ID
      if (importer === VIRTUAL_ENTRY_ID && !path.isAbsolute(source) && !source.startsWith('\0') && !source.startsWith('page:')) {
        return path.resolve(resolveDir, source)
      }
      return null
    },
    load (id) {
      if (id === VIRTUAL_ENTRY_ID) {
        if (ctx) {
          // Replace ctx property accesses with literals for DCE
          for (const [key, value] of Object.entries(ctx)) {
            const regex = new RegExp(`\\b(?:window\\.)?ctx\\.${key}\\b(?=\\s*[!=<>])`, 'g')
            code = code.replace(regex, JSON.stringify(value))
          }

          code = [
            `const ctx = Object.freeze(${JSON.stringify(ctx)});`,
            'if (typeof window !== "undefined") window.ctx = ctx;',
            code
          ].join('\n')
        }
        return { code, moduleSideEffects: false }
      }
      return null
    },
  }
}

/**
 * Creates the pages loader plugin for Rolldown.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/pages.mjs')} api - The API.
 * @returns {import('rolldown').Plugin}
 */
function createPagesLoaderPlugin (page, config, api) {
  return {
    name: 'pages-loader',
    async load (id) {
      if (!/\.(htms|page|html|css)$/.test(id)) return null

      const subpage = {
        ...page,
        params: {
          ...page.params,
          __filename: id,
          __dirname: path.dirname(id),
        }
      }
      const content = await renderPage(subpage, config, 'utf-8', id.endsWith('.css') ? 'css' : 'html')
      return { code: 'export default ' + JSON.stringify(content) }
    },
  }
}
