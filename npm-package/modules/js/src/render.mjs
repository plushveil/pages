import * as fs from 'node:fs'
import * as url from 'node:url'
import * as path from 'node:path'

import * as esbuild from 'esbuild'
import browserslist from 'browserslist'
import { resolveToEsbuildTarget } from 'esbuild-plugin-browserslist'

import getPages from './pages.mjs'

/**
 * Renders a page.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/pages.mjs')} api - The API.
 * @returns {Promise<string>} The rendered page.
 */
export default async function render (page, config, api) {
  const file = url.fileURLToPath(page.fileUrl)
  if (!fs.existsSync(file)) return ''

  const pages = await getPages(file, config, api)
  const map = pages.find(page => page.params.headers['Content-Type'] === 'application/json')

  const target = getTarget(config)
  const build = await esbuild.build({
    stdin: {
      contents: page.content || `export * from './${path.relative(path.dirname(file), file)}'\n`,
      resolveDir: path.dirname(file),
    },
    write: false,
    bundle: true,
    target,
    minify: !!(config?.js?.minify),
    format: 'iife',
    sourcemap: 'inline',
  })

  if (page.url.toString() === map.url.toString()) {
    const base64 = build.outputFiles[0].text.slice(build.outputFiles[0].text.lastIndexOf('//# sourceMappingURL=') + 50)
    const sourcemap = Buffer.from(base64, 'base64').toString('utf8')
    return sourcemap
  }

  const sourcemap = `\n//# sourceMappingURL=${map.url}\n`
  const js = build.outputFiles[0].text.slice(0, build.outputFiles[0].text.lastIndexOf('//# sourceMappingURL=') - 1)
  return js + sourcemap
}

/**
 * Retrieves the target for esbuild.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @returns {esbuild.Target} The target
 */
function getTarget (config) {
  const target = config?.js?.target || '.browserslistrc'
  const browserslistFile = path.isAbsolute(target) ? target : path.resolve(path.dirname(url.fileURLToPath(config.fileUrl)), ...target.split('/'))
  const browserslistrcContent = (fs.existsSync(browserslistFile) ? fs.readFileSync(browserslistFile, { encoding: 'utf8' }).split('\n') : ['defaults'])
  const browserslistrc = browserslistrcContent.filter(line => line.trim() && !line.startsWith('#'))

  const browsers = browserslist(browserslistrc, { path: path.dirname(browserslistFile) })
  return resolveToEsbuildTarget(browsers, { printUnknownTargets: false })
}
