import * as threads from 'node:worker_threads'

import Worker from './Worker.mjs'

import renderPage from '../src/render.mjs'

/**
 * Terminates the process.
 * @param {number} exitCode - The exit code.
 */
export async function terminate (exitCode) {
  setTimeout(() => process.exit(exitCode), 10)
  return exitCode
}

/**
 * Get all pages of a file.
 * @param {string} fileUrl - The file URL.
 * @returns {Promise<import('../html-pages.mjs').Page[]>} The pages.
 */
export async function getPages (fileUrl) {
  fileUrl = new URL(fileUrl)
  fileUrl.searchParams.set('format', 'html-pages')
  const exports = (await import(fileUrl.toString()))
  return exports.default
}

/**
 * Get the sources of a file.
 * @param {string} fileUrl - The file URL.
 * @returns {Promise<string[]>} The sources.
 */
export async function getSources (fileUrl) {
  const sources = new Set()
  const pages = await getPages(fileUrl)
  for (const page of pages) {
    const workerData = { ...threads.workerData, page, emitSources: true }
    const worker = new Worker(workerData)
    worker.worker.on('message', sourceMessageListener)
    await worker.exec('render', page)
    worker.worker.off('message', sourceMessageListener)
    worker.terminate()
  }
  return [...sources]

  function sourceMessageListener (message) {
    if (!Array.isArray(message)) return
    const messageType = message[1]
    const data = message[2]
    if (messageType === 'source') sources.add(data)
  }
}

/**
 * Renders a page.
 * @param {import('../html-pages.mjs').Page|string} [pageOrFileUrl] - The page or file URL.
 */
export async function render (pageOrFileUrl) {
  if (!pageOrFileUrl) throw new Error('Either page or file URL must be provided as the first argument.')
  const page = await (async () => {
    if (typeof pageOrFileUrl === 'object') return pageOrFileUrl

    const pages = await getPages(pageOrFileUrl)
    if (threads.workerData?.page?.path) {
      const page = pages.find(page => page.path === threads.workerData.page.path)
      if (page) return page
    }
    return pages[0]
  })()

  // check if the passed page params are different from the workerData page params
  let newThread = false
  if (page.params) {
    const workerParams = threads.workerData.page.params
    const pageParams = page.params

    for (const key in pageParams) {
      if (pageParams[key] !== workerParams[key]) {
        newThread = true
        break
      }
    }

    // pass workerData on to the new thread. Page params will override workerData params.
    if (newThread) Object.keys(workerParams).forEach(key => { if (typeof pageParams[key] === 'undefined') page.params[key] = workerParams[key] })
  }

  // render in a new thread
  if (newThread || !(threads.workerData?.page)) {
    const workerData = { ...threads.workerData, page }
    const worker = new Worker(workerData)
    const result = await worker.exec('render', page)
    worker.terminate()
    return result
  }

  return await renderPage(page)
}
