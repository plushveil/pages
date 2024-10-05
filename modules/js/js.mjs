import _render from './src/render.mjs'
import _pages from './src/pages.mjs'

/**
 * Retrieves a list of pages from a file.
 * @param {string} file - The file.
 * @param {import('../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../src/pages.mjs')} api - The API.
 * @returns {Promise<import('../../src/pages.mjs').Page[]>} The list of pages.
 */
export async function pages (file, config, api) {
  return _pages(file, config, api)
}

/**
 * Renders a page.
 * @param {import('../../src/pages.mjs').Page} page - The page.
 * @param {import('../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../src/pages.mjs')} api - The API.
 * @returns {Promise<string>} The rendered page.
 */
export async function render (page, config, api) {
  return _render(page, config, api)
}
