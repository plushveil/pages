import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'

import { rolldown } from 'rolldown'

import { render as renderPage } from '../../../src/pages.js'
import createContextTransformPlugin from './createContextTransformPlugin.js'

const VIRTUAL_ENTRY_ID = '\0pages-virtual-entry'

/**
 * Renders a page.
 *
 * @param {import('../../../src/pages.js').Page} page - The page.
 * @param {import('../../../src/config.js').Config} config - The configuration.
 * @param {import('../../../src/pages.js')} api - The API.
 * @returns {Promise<string>} The rendered page.
 */
export default async function render(page, config, api) {
  try {
    const file = page.fileUrl && url.fileURLToPath(page.fileUrl)
    if (file && !fs.existsSync(file)) return ''
    if (!file && !page.content) return ''

    const pageUrlString = page.url?.toString() || ''
    const isHtmlOrInline = !page.fileUrl || ['.html', '.htms', '.page'].some((ext) => page.fileUrl.toString().endsWith(ext))
    const isMapRequest = !isHtmlOrInline && pageUrlString.endsWith('.map.js')
    const mapUrl = !isHtmlOrInline && !isMapRequest ? `${pageUrlString.replace(/\.js$/, '.map.js')}` : ''

    // Config
    const minify = Boolean(config?.js?.minify)

    // Use pre-resolved context from serve.js or pages.js (functions can't be serialized through worker)
    const ctx = page.params?.['__resolvedCtx']

    const script = typeof page.content === 'string' ? page.content : `import('${path.resolve(file)}');\n`
    const resolveDir = file ? path.dirname(file) : process.cwd()

    const virtualEntryPlugin = createVirtualEntryPlugin(script, resolveDir, ctx)
    const pagesLoaderPlugin = createPagesLoaderPlugin(page, config, api)
    const contextLoaderPlugin = createContextLoaderPlugin(ctx)
    const contextTransformPlugin = createContextTransformPlugin(ctx)

    const bundle = await rolldown({
      input: 'virtual-entry',
      plugins: [contextLoaderPlugin, contextTransformPlugin, virtualEntryPlugin, pagesLoaderPlugin],
      treeshake: {
        moduleSideEffects: typeof page.content === 'string' ? false : [path.resolve(file)],
      },
      onwarn(warning, warn) {
        if (warning.code === 'MISSING_NAME_OPTION_FOR_IIFE_EXPORT') return
        warn(warning)
      },
    })

    try {
      const { output } = await bundle.generate({
        format: 'iife',
        sourcemap: isMapRequest,
        minify,
      })
      if (isMapRequest) {
        if (!output[0].map) return '{}'
        return output[0].map.toString()
      }

      if (isHtmlOrInline) {
        return output[0].code
      }

      return `${output[0].code}\n//# sourceMappingURL=${mapUrl}\n`
    } finally {
      await bundle.close()
    }
  } catch (err) {
    console.log(page)
    throw err
  }
}

/**
 * Creates a virtual entry plugin for Rolldown.
 *
 * @param {string} code - The virtual entry script content.
 * @param {string} resolveDir - The directory to resolve imports from.
 * @param {any} ctx - The context object for constant inlining.
 * @returns {import('rolldown').Plugin}
 */
function createVirtualEntryPlugin(code, resolveDir, _ctx) {
  return {
    name: 'virtual-entry',
    resolveId(source, importer) {
      if (source === 'virtual-entry') return VIRTUAL_ENTRY_ID
      if (importer === VIRTUAL_ENTRY_ID && !path.isAbsolute(source) && !source.startsWith('\0') && !source.startsWith('page:')) {
        return path.resolve(resolveDir, source)
      }
      return null
    },
    load(id) {
      if (id === VIRTUAL_ENTRY_ID) {
        return { code, moduleSideEffects: true }
      }
      return null
    },
  }
}

/**
 * @param ctx
 */
function createContextLoaderPlugin(ctx) {
  return {
    name: 'context-loader',
    resolveId(source) {
      if (source === 'page:ctx') return 'page:ctx'
      return null
    },
    load(id) {
      if (id === 'page:ctx') {
        return {
          code: [`const ctx = Object.freeze(${JSON.stringify(ctx)});`, 'export default ctx;'].join('\n'),
        }
      }
      return null
    },
  }
}

/**
 * Creates the pages loader plugin for Rolldown.
 *
 * @param {import('../../../src/pages.js').Page} page - The page.
 * @param {import('../../../src/config.js').Config} config - The configuration.
 * @param {import('../../../src/pages.js')} api - The API.
 * @returns {import('rolldown').Plugin}
 */
function createPagesLoaderPlugin(page, config, _api) {
  return {
    name: 'pages-loader',
    async load(id) {
      if (!/\.(?:htms|page|html|css)$/.test(id)) return null
      const subpage = {
        ...page,
        params: {
          ...page.params,
          __filename: id,
          __dirname: path.dirname(id),
        },
      }
      const content = await renderPage(subpage, config, 'utf-8', id.endsWith('.css') ? 'css' : 'html')
      return { code: `export default ${JSON.stringify(content)}` }
    },
  }
}
