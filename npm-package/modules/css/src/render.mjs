import * as url from 'node:url'
import * as path from 'node:path'

import postcss from 'postcss'
import atImport from 'postcss-import'
import tailwind from '@tailwindcss/postcss'
import nested from 'postcss-nested'
import cssnano from 'cssnano'

import getPages from './pages.mjs'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const __module = path.resolve(__dirname, '..')
const __tailwind = path.resolve(__module, 'tailwind.css')

/**
 * Renders a page.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/pages.mjs')} api - The API.
 * @returns {Promise<string>} The rendered page.
 */
export default async function render (page, config, api) {
  const file = url.fileURLToPath(page.fileUrl)
  const content = typeof page.content === 'string' ? page.content : `@import "${file}";`
  const plugins = [
    atImport({
      resolve: (id, basedir) => {
        if (id === 'tailwindcss' && basedir !== __module) return __tailwind
        return id
      }
    }),
    nested,
    tailwind(),
    config.css.minify && cssnano()
  ].filter(Boolean)
  const { css, map } = await postcss(plugins).process(content, { from: file, map: { annotation: false } })

  if (['.html', '.htms', '.page'].find(ext => page.fileUrl.toString().endsWith(ext))) {
    return css.toString()
  } else {
    const pages = await getPages(file, config, api)
    const mapPage = pages.find(page => page.params.headers['Content-Type'] === 'application/json')
    if (page.url.toString() === mapPage.url.toString()) return map.toString().replace(/"%3Cinput%20css[^"]*/, `"%3C${path.basename(file)}`)
    return css.toString() + `\n/*# sourceMappingURL=${mapPage.url.toString()} */`
  }
}
