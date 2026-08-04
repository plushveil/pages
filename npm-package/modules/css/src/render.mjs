import * as path from 'node:path'
import * as url from 'node:url'

import tailwind from '@tailwindcss/postcss'
import cssnano from 'cssnano'
import postcss from 'postcss'
import atImport from 'postcss-import'
import nested from 'postcss-nested'

import getPages from './pages.mjs'

const renderFilename = url.fileURLToPath(import.meta.url)
const renderDirname = path.dirname(renderFilename)
const moduleDir = path.resolve(renderDirname, '..')
const tailwindEntry = path.resolve(moduleDir, 'tailwind.css')

/**
 * Renders a page.
 *
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/pages.mjs')} api - The API.
 * @returns {Promise<string>} The rendered page.
 */
export default async function render(page, config, api) {
  const file = page.params?.['__filename'] ? page.params['__filename'] : url.fileURLToPath(page.fileUrl)
  const content = typeof page.content === 'string' ? page.content : `@import "${file}";`
  const plugins = [
    atImport({
      resolve: (id, basedir) => {
        if (id === 'tailwindcss' && basedir !== moduleDir) return tailwindEntry
        return id
      },
    }),
    nested,
    tailwind({ base: config.root }),
    config.css.minify && cssnano(),
  ].filter(Boolean)
  const { css, map } = await postcss(plugins).process(content, { from: file, map: { annotation: false } })

  if (['.html', '.htms', '.page', '.js'].find((ext) => page.fileUrl.toString().endsWith(ext))) {
    return css.toString()
  } else {
    const pages = await getPages(file, config, api)
    const mapPage = pages.find((entry) => entry.params.headers['Content-Type'] === 'application/json')
    if (page.url.toString() === mapPage.url.toString()) return map.toString().replace(/"%3Cinput%20css[^"]*/, `"%3C${path.basename(file)}`)
    return `${css.toString()}\n/*# sourceMappingURL=${mapPage.url.toString()} */`
  }
}
