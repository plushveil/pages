import * as threads from 'node:worker_threads'

/**
 * The current page.
 * @type {import('../html/html-pages.mjs').Page}
 */
const page = threads.workerData?.page || { path: null, params: {} }

/**
 * The URL pathname of the current page.
 * @type {string}
 */
export const url = page.path

/**
 * Retrieve the value of a URL parameter by name.
 * @param {string} name - The name of the URL parameter.
 * @returns {Promise<any>} The value of the URL parameter.
 */
export function getParamByName (name) {
  return page.params[name]
}
