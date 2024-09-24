import * as path from 'node:path'
import * as fs from 'node:fs'
import * as url from 'node:url'

import * as esbuild from 'esbuild'
import browserslist from 'browserslist'
import { resolveToEsbuildTarget } from 'esbuild-plugin-browserslist'

import getURI from '../html/src/getURI.mjs'

/**
 *
 */
export default function (pageOrfileUrl, config) {
  const page = (typeof pageOrfileUrl === 'object')
    ? pageOrfileUrl
    : getPages(pageOrfileUrl, config).find(page => page.params['Content-Type'] === 'application/js')
  return render(page, config)
}

/**
 *
 */
export async function render (page, config) {
  const target = getTarget(config)
  const build = await esbuild.build({
    stdin: {
      contents: page.params?.code || `export * from './${path.basename(page.file)}'\n`,
      resolveDir: path.dirname(page.file),
    },
    write: false,
    bundle: true,
    target,
    minify: !!(config?.js?.minify),
    format: 'iife',
    sourcemap: 'inline',
  })

  if (page.params['Content-Type'] === 'application/json') {
    const base64 = build.outputFiles[0].text.slice(build.outputFiles[0].text.lastIndexOf('//# sourceMappingURL=') + 50)
    const sourcemap = Buffer.from(base64, 'base64').toString('utf8')
    return sourcemap
  }

  const sourcemapPage = getPages(url.pathToFileURL(page.file), config).find(page => page.params['Content-Type'] === 'application/json')
  const sourcemapUrl = getURI(new URL(config.baseURI), sourcemapPage.path).href
  const sourcemap = page.params?.code ? '' : `\n//# sourceMappingURL=${sourcemapUrl}`

  const js = build.outputFiles[0].text.slice(0, build.outputFiles[0].text.lastIndexOf('//# sourceMappingURL=') - 1)
  return js + sourcemap
}

/**
 *
 */
export function getPages (fileUrl, config) {
  const filepath = url.fileURLToPath(fileUrl)
  const baseURI = new URL(config.baseURI)
  const basename = path.basename(filepath)
  const sourcemapBasename = `${path.basename(filepath, path.extname(filepath))}.map${path.extname(filepath)}`

  const page = { file: filepath, path: getURI(baseURI, basename).pathname, params: { 'Content-Type': 'application/js' } }
  const sourcemap = { file: filepath, path: getURI(baseURI, sourcemapBasename).pathname, params: { 'Content-Type': 'application/json' } }
  return [page, sourcemap]
}

/**
 *
 */
function getTarget (config) {
  const target = config?.js?.target || './.browserslistrc'
  const browserslistFile = path.isAbsolute(target) ? target : path.resolve(path.dirname(config.file), ...target.split('/'))
  const browserslistrc = (fs.existsSync(browserslistFile) ? fs.readFileSync(browserslistFile, { encoding: 'utf8' }).split('\n') : [])
    .filter(line => line.trim() && !line.startsWith('#'))

  const browsers = browserslist(browserslistrc, { path: path.dirname(browserslistFile) })
  return resolveToEsbuildTarget(browsers, { printUnknownTargets: false })
}
