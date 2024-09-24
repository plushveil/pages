import * as url from 'node:url'

import Worker from './thread/Worker.mjs'
import * as methods from './thread/methods.mjs'

/**
 * Renders the file in a new thread.
 * @param {string} fileUrl - The file URL.
 * @param {object} workerData - The worker data.
 * @param {import('./html-pages.mjs').Page} [page]
 * @returns {Promise<string>} The rendered file.
 */
export default async function (fileUrl, workerData, page) {
  const worker = new Worker({ ...workerData, page, parentURL: fileUrl })
  const result = await worker.exec('render', fileUrl)
  await worker.terminate()
  return result
}

/**
 * Renders the file.
 * @param {string} fileUrl - The file URL.
 * @param {object} workerData - The worker data.
 * @param {import('./html-pages.mjs').Page} [page] - The page.
 * @param {import('./config/config.mjs').Config} [config] - The configuration object.
 */
export function render (fileUrl, workerData, page, config) {
  if (!page) page = fileUrl
  if (typeof page === 'object') {
    if (!page.file) page.file = url.fileURLToPath(fileUrl)
    if (!page.path) page.path = null
  }
  return methods.render(page)
}

/**
 * Retrieves a list of all the files that are used to render the page.
 * @param {string} fileUrl - The file URL.
 * @param {object} workerData - The worker data.
 * @param {import('./html-pages.mjs').Page} page - The page.
 * @returns {string[]} The list of files.
 */
export async function getPages (fileUrl, workerData) {
  const worker = new Worker({ ...workerData, parentURL: fileUrl })
  const result = await worker.exec('getPages', fileUrl)
  await worker.terminate()
  return result
}
