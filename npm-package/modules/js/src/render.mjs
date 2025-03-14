import * as fs from 'node:fs'
import * as url from 'node:url'
import * as path from 'node:path'

import * as esbuild from 'esbuild'
import browserslist from 'browserslist'
import { resolveToEsbuildTarget } from 'esbuild-plugin-browserslist'

import getPages from './pages.mjs'
import { render as renderPage } from '../../../src/pages.mjs'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Renders a page.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/pages.mjs')} api - The API.
 * @returns {Promise<string>} The rendered page.
 */
export default async function render (page, config, api) {
  const file = page.fileUrl && url.fileURLToPath(page.fileUrl)
  if (file && !fs.existsSync(file)) return ''
  if (!file && !page.content) return ''

  const pagesLoaderPlugin = { name: 'pages-loader', setup: getPagesLoaderPluginSetup(page, config, api) }

  const script = typeof page.content === 'string' ? page.content : `export * from '${path.resolve(file)}'\n`
  const target = getTarget(config)
  const build = await esbuild.build({
    stdin: {
      contents: script,
      resolveDir: file ? path.dirname(file) : process.cwd(),
    },
    write: false,
    bundle: true,
    target,
    minify: !!(config?.js?.minify),
    format: 'iife',
    sourcemap: 'inline',
    plugins: [pagesLoaderPlugin],
  })

  if (!page.fileUrl || ['.html', '.htms', '.page'].find(ext => page.fileUrl.toString().endsWith(ext))) {
    const js = build.outputFiles[0].text.slice(0, build.outputFiles[0].text.lastIndexOf('//# sourceMappingURL=') - 1)
    return js
  } else {
    const pages = await getPages(file, config, api)
    const map = pages.find(page => page.params.headers['Content-Type'] === 'application/json')

    if (page.url.toString() === map.url.toString()) {
      const base64 = build.outputFiles[0].text.slice(build.outputFiles[0].text.lastIndexOf('//# sourceMappingURL=') + 50)
      const sourcemap = Buffer.from(base64, 'base64').toString('utf8')
      return sourcemap
    }

    const sourcemap = `\n//# sourceMappingURL=${map.url}\n`
    const js = build.outputFiles[0].text.slice(0, build.outputFiles[0].text.lastIndexOf('//# sourceMappingURL=') - 1)
    return js + sourcemap
  }
}

/**
 * Retrieves the target for esbuild.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @returns {esbuild.Target} The target
 */
function getTarget (config) {
  const folder = config?.fileUrl ? path.dirname(url.fileURLToPath(config.fileUrl.toString())) : path.resolve(__dirname, '..', '..', '..')
  const target = config?.js?.target || '.browserslistrc'
  const browserslistFile = path.isAbsolute(target) ? target : path.resolve(folder, ...target.split('/'))
  const browserslistrcContent = (fs.existsSync(browserslistFile) ? fs.readFileSync(browserslistFile, { encoding: 'utf8' }).split('\n') : ['defaults'])
  const browserslistrc = browserslistrcContent.filter(line => line.trim() && !line.startsWith('#'))

  const browsers = browserslist(browserslistrc, { path: path.dirname(browserslistFile) })
  return resolveToEsbuildTarget(browsers, { printUnknownTargets: false })
}

/**
 * Renders a page.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/pages.mjs')} api - The API.
 * @returns {Promise<string>} The rendered page.
 */
function getPagesLoaderPluginSetup (page, config, api) {
  return async ({ onLoad }) => {
    onLoad({ filter: /\.(htms|page|html|css)$/ }, async (args) => {
      const subpage = {
        ...page,
        params: {
          ...page.params,
          __filename: args.path,
          __dirname: path.dirname(args.path),
        }
      }
      const content = await renderPage(subpage, config, 'utf-8', args.path.endsWith('.css') ? 'css' : 'html')
      return {
        contents: 'export default ' + JSON.stringify(content),
        loader: 'js',
      }
    })
  }
}
