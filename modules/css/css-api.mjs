import * as path from 'node:path'
import * as fs from 'node:fs'
import * as url from 'node:url'

import postcss from 'postcss'
import tailwind from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import nested from 'postcss-nested'
import atImport from 'postcss-import'
import cssnano from 'cssnano'

import getURI from '../html/src/getURI.mjs'

/**
 *
 */
export default function (pageOrfileUrl, config) {
  const page = (typeof pageOrfileUrl === 'object') ? pageOrfileUrl : getPages(pageOrfileUrl, config).find(page => page.params['Content-Type'] === 'text/css')
  return render(page, config)
}

/**
 *
 */
export async function render (page, config) {
  const content = await fs.promises.readFile(page.file, { encoding: 'utf8' })
  const isTailwindResource = content.includes('tailwind') || content.includes('--tw-')
  const twConfig = (isTailwindResource) ? await getTailwindConfig(page, config) : null
  const plugins = [nested, autoprefixer, (twConfig) ? tailwind(twConfig) : null, cssnano()].filter(Boolean)
  const { css, map } = await postcss(plugins).use(atImport({ plugins })).process(content, { from: page.file, map: { annotation: false } })

  if (page.params['Content-Type'] === 'application/json') {
    return map.toString()
  }

  const sourcemapPage = getPages(url.pathToFileURL(page.file), config).find(page => page.params['Content-Type'] === 'application/json')
  const sourcemapUrl = getURI(new URL(config.baseURI), sourcemapPage.path).href

  return css.toString() + `\n/*# sourceMappingURL=${sourcemapUrl} */`
}

/**
 *
 */
export function getPages (fileUrl, config) {
  const filepath = url.fileURLToPath(fileUrl)
  const baseURI = new URL(config.baseURI)
  const basename = path.basename(filepath)
  const sourcemapBasename = `${path.basename(filepath, path.extname(filepath))}.map${path.extname(filepath)}`
  const page = { file: filepath, path: getURI(baseURI, basename).pathname, params: { 'Content-Type': 'text/css' } }
  const sourcemap = { file: filepath, path: getURI(baseURI, sourcemapBasename).pathname, params: { 'Content-Type': 'application/json' } }

  return [page, sourcemap]
}

/**
 *
 */
async function getTailwindConfig (page, config) {
  const folders = [
    config.css?.tailwind?.config,
    path.dirname(page.file),
    path.dirname(config.file),
    process.cwd(),
  ].filter((item, index, array) => array.indexOf(item) === index).filter(Boolean)

  const filenames = ['tailwind.config.mjs', 'tailwind.config.js', 'tailwind.config.cjs']

  for (const folder of folders) {
    for (const filename of filenames) {
      const file = path.resolve(folder, filename)
      if (fs.existsSync(file)) {
        return file
      }
    }
  }

  return {
    content: [
      `${process.cwd()}/**/*.{html,js,css}`,
      '!node_modules/**/*',
    ],
    theme: {
      extend: {
      },
    },
    plugins: [],
  }
}
