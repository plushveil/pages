import _render from './src/render.mjs'
import _pages from './src/pages.mjs'
import _format from './src/format.mjs'
import _diagnose from './src/diagnose.mjs'

/**
 * Retrieves a list of pages from a file.
 * @param {string} file - The file.
 * @param {import('../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../src/api.mjs').API} api - The API.
 * @returns {Promise<import('../../src/pages.mjs').Page[]>} The list of pages.
 */
export async function pages (file, config, api) {
  return _pages(file, config, api)
}

/**
 * Renders a page.
 * @param {string | import('../../src/pages.mjs').Page} pageOrFile - The page or file.
 * @param {import('../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../src/api.mjs').API} api - The API.
 * @returns {Promise<string>} The rendered page.
 */
export async function render (pageOrFile, config, api) {
  const page = typeof pageOrFile === 'object' ? pageOrFile : (await _pages(pageOrFile, config, api))[0]
  return _render(page, config, api)
}

/**
 * Formats a file.
 * @param {string | import('../../src/pages.mjs').Page} pageOrFile - The page or file.
 * @param {import('../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../src/api.mjs').API} api - The API.
 * @returns {Promise<string>} The list of pages.
 */
export async function format (pageOrFile, config, api) {
  const page = typeof pageOrFile === 'object' ? pageOrFile : (await _pages(pageOrFile, config, api))[0]
  return _format(page, config, api)
}

/**
 * Retrieves a list of problems from a file.
 * @param {string | import('../../src/pages.mjs').Page} pageOrFile - The page or file.
 * @param {import('../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../src/api.mjs').API} api - The API.
 * @returns {Promise<{ message: string, position: { line: number, character: number } }[]>} The list of pages.
 */
export async function diagnose (pageOrFile, config, api) {
  const page = typeof pageOrFile === 'object' ? pageOrFile : (await _pages(pageOrFile, config, api))[0]
  return _diagnose(page, config, api)
}
