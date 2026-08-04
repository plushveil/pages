import * as pages from './pages.js'
import * as utils from './utils.js'

/**
 * @typedef {object} API
 * @property {import('./pages.js').pages} pages - Retrieves a list of pages from a file.
 * @property {import('./pages.js').render} render - Renders a page.
 * @property {import('./pages.js').diagnose} diagnose - Diagnoses a page.
 * @property {import('./pages.js').format} format - Formats a page.
 * @property {import('./utils.js')} utils - The utilities.
 */

/**
 * Retrieve the API.
 *
 * @returns {Promise<API>} The API.
 */
export default function getApi() {
  return {
    pages: pages.pages,
    render: pages.render,
    diagnose: pages.diagnose,
    format: pages.format,
    utils,
  }
}
