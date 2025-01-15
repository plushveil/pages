import * as pages from './pages.mjs'
import * as utils from './utils.mjs'

/**
 * @typedef {object} API
 * @property {import('./pages.mjs').pages} pages - Retrieves a list of pages from a file.
 * @property {import('./pages.mjs').render} render - Renders a page.
 * @property {import('./pages.mjs').diagnose} diagnose - Diagnoses a page.
 * @property {import('./pages.mjs').format} format - Formats a page.
 * @property {import('./utils.mjs')} utils - The utilities.
 */

/**
 * Retrieve the API.
 * @returns {Promise<API>} The API.
 */
export default function getApi () {
  return {
    pages: pages.pages,
    render: pages.render,
    diagnose: pages.diagnose,
    format: pages.format,
    utils
  }
}
