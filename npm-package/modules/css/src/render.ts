import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'

import tailwind from '@tailwindcss/postcss'
import cssnano from 'cssnano'
import postcss from 'postcss'
import atImport from 'postcss-import'
import nested from 'postcss-nested'

import getPages from './pages.js'

const renderFilename = url.fileURLToPath(import.meta.url)
const renderDirname = path.dirname(renderFilename)
const moduleDir = path.resolve(renderDirname, '..')
const packageRoot = path.resolve(moduleDir, '..', '..', '..')
const tailwindEntryCandidates = [path.resolve(moduleDir, 'tailwind.css'), path.resolve(packageRoot, 'modules/css/tailwind.css')]
const tailwindEntry = tailwindEntryCandidates.find((entry) => fs.existsSync(entry))
const tailwindEntryDir = tailwindEntry ? path.dirname(tailwindEntry) : null
const normalizedModuleDir = normalizeDirectory(moduleDir)
const normalizedTailwindEntryDir = tailwindEntryDir ? normalizeDirectory(tailwindEntryDir) : null

/**
 * Normalizes a directory path and resolves symlinks when possible.
 *
 * @param {string} dir - The directory path.
 * @returns {string} The normalized directory path.
 */
function normalizeDirectory(dir) {
  const resolved = path.resolve(dir)
  try {
    return fs.realpathSync(resolved)
  } catch {
    return resolved
  }
}

/**
 * Renders a page.
 *
 * @param {import('../../../src/pages.js').Page} page - The page.
 * @param {import('../../../src/config.js').Config} config - The configuration.
 * @param {import('../../../src/pages.js')} api - The API.
 * @returns {Promise<string>} The rendered page.
 */
export default async function render(page, config, api) {
  const file = page.params?.['__filename'] ? page.params['__filename'] : url.fileURLToPath(page.fileUrl)
  const content = typeof page.content === 'string' ? page.content : `@import "${file}";`
  const plugins = [
    atImport({
      resolve: (id, basedir) => {
        if (id !== 'tailwindcss' || !tailwindEntry) return id
        const normalizedBaseDir = normalizeDirectory(basedir)
        if (normalizedBaseDir === normalizedModuleDir || normalizedBaseDir === normalizedTailwindEntryDir) return id
        return tailwindEntry
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
