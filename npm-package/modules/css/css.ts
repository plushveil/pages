import _pages from './src/pages.js'
import _render from './src/render.js'

/**
 * Retrieves a list of pages from a file.
 *
 * @param {string} file - The file.
 * @param {import('../../src/config.js').Config} config - The configuration.
 * @param {import('../../src/pages.js')} api - The API.
 * @returns {Promise<import('../../src/pages.js').Page[]>} The list of pages.
 */
export async function pages(file, config, api) {
  return _pages(file, config, api)
}

/**
 * Renders a page.
 *
 * @param {import('../../src/pages.js').Page} page - The page.
 * @param {import('../../src/config.js').Config} config - The configuration.
 * @param {import('../../src/pages.js')} api - The API.
 * @returns {Promise<string>} The rendered page.
 */
export async function render(page, config, api) {
  return _render(page, config, api)
}
