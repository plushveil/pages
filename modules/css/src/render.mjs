import * as fs from 'node:fs'
import * as url from 'node:url'
import * as path from 'node:path'

import postcss from 'postcss'
import tailwind from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import nested from 'postcss-nested'
import atImport from 'postcss-import'
import cssnano from 'cssnano'

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

  const content = await fs.promises.readFile(file, { encoding: 'utf8' })
  const isTailwindResource = content.includes('tailwind') || content.includes('--tw-')
  const twConfig = (isTailwindResource) ? await getTailwindConfig(page, config) : null
  const plugins = [nested, autoprefixer, (twConfig) ? tailwind(twConfig) : null, cssnano()].filter(Boolean)
  const { css, map } = await postcss(plugins).use(atImport({ plugins })).process(content, { from: page.file, map: { annotation: false } })

  const pages = await getPages(file, config, api)
  const mapPage = pages.find(page => page.params.headers['Content-Type'] === 'application/json')

  if (page.url.toString() === mapPage.url.toString()) return map.toString()
  return css.toString() + `\n/*# sourceMappingURL=${mapPage.url.toString()} */`
}

/**
 * Retrieves the tailwind configuration.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @returns {Promise<import('tailwindcss').Configuration>} The tailwind configuration.
 */
async function getTailwindConfig (page, config) {
  if (config?.css?.tailwind) {
    const file = path.isAbsolute(config.css.tailwind)
      ? config.css.tailwind
      : path.resolve(path.dirname(url.fileURLToPath(config.fileUrl)), ...config.css.tailwind.split('/'))
    if (fs.existsSync(file)) return file
  }

  const folders = [
    path.dirname(url.fileURLToPath(page.fileUrl)),
    path.dirname(url.fileURLToPath(config.fileUrl)),
    process.cwd(),
  ].filter((item, index, array) => array.indexOf(item) === index).filter(Boolean)

  const filenames = ['tailwind.config.mjs', 'tailwind.config.js', 'tailwind.config.cjs']

  for (const folder of folders) {
    for (const filename of filenames) {
      const file = path.resolve(folder, filename)
      if (fs.existsSync(file)) return file
    }
  }

  return {
    content: [
      `${config.root}/**/*.{html,js,css}`,
      '!node_modules/**/*',
    ],
    theme: { extend: {}, },
    plugins: [],
  }
}
