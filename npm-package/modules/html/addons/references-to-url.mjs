import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'
import * as thread from 'node:worker_threads'

import { pages as getPagesFromWorker } from '../../../src/pages.mjs'

import * as utils from '../../../src/utils.mjs'

const __filename = url.fileURLToPath(import.meta.url)

const cache = {}

const resolveAttributes = ['./', '../', '/']

if (!thread.isMainThread && thread.workerData?.file && thread.workerData?.config && thread.workerData?.specifier === __filename) {
  sendPagesToParent().finally(() => process.exit(0))
}

/**
 * Sends the pages to the parent thread.
 * @returns {Promise<void>} The promise.
 */
async function sendPagesToParent () {
  try {
    const pages = (await getPagesFromWorker(thread.workerData.file, thread.workerData.config))
    thread.parentPort.postMessage(JSON.stringify(pages))
  } catch (err) {
    console.log(err)
    thread.parentPort.postMessage([])
  }
}

/**
 * forEach is executed for each node when the page is interpreted.
 * @param {import('../parser/iterator.mjs').Node} node - The node.
 * @param {import('../parser/iterator.mjs').Node[]} nodes - All nodes.
 * @param {import('../parser/parse.mjs').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 */
export async function forEachAsync (node, nodes, htmlDocument, page, config, api) {
  if (node.type !== 'tag-open') return
  if (!(node.text.match(/[a-zA-Z0-9 ]+=[ ]*["']([^'"]*)["']/gi))) return

  const htmlNode = htmlDocument.findNodeAt(node.offset.start + 1)
  if (!htmlNode || !htmlNode.attributes) return

  const pageFile = page.params.__filename ? page.params.__filename : url.pathToFileURL(page.fileUrl.toString())
  const files = [
    ...await fs.promises.readdir(path.dirname(pageFile)),
    ...await fs.promises.readdir(path.dirname(url.fileURLToPath(config.fileUrl.toString()))),
  ]

  let text = typeof node.textUpdate === 'string' ? node.textUpdate : node.text
  for (const attributeValue of Object.values(htmlNode.attributes)) {
    if (!text.includes(attributeValue)) continue
    const value = attributeValue.slice(1, -1)
    const page = files.includes(value) ? (await getPage(value)) : (resolveAttributes.some(resolveAttribute => value.startsWith(resolveAttribute))) ? (await getPage(value)) : null
    if (!page) continue

    text = text.replace(value, page.url.toString())
  }

  if (text !== node.text) node.textUpdate = text

  /**
   * Returns the page object.
   * @param {string} value - The value.
   * @returns {Promise<import('../../../src/pages.mjs').Page>} The page.
   */
  async function getPage (value) {
    let resolved
    try {
      resolved = utils.resolve(value, [path.dirname(pageFile), path.dirname(url.fileURLToPath(config.fileUrl.toString()))], { exists: true, file: true })
    } catch (err) {
      return null
    }

    // todo - this must happen in a worker because the method pollutes the global scope
    const pages = await getPages(resolved, config.fileUrl.toString())
    if (pages.length === 0) return null
    if (pages.length === 1) return pages[0]

    /**
     * Counts the number of matching properties.
     * @param {*} paramsA - The first parameters.
     * @param {*} paramsB  - The second parameters.
     * @returns {number} The number of matching properties.
     */
    function countMatches (paramsA, paramsB) {
      let match = 0
      if (paramsA === paramsB) return 1
      if (typeof paramsA !== 'object' || typeof paramsB !== 'object') return match
      for (const key in paramsA) {
        if (paramsA[key] === paramsB[key]) match++
        if (typeof paramsA[key] === 'object') match += countMatches(paramsA[key], paramsB[key])
      }
      return match
    }

    const pageMatch = pages.reduce((a, b) => a ? countMatches(a.params, page.params) > countMatches(b.params, page.params) ? a : b : b, null)
    return pageMatch
  }
}

/**
 * Returns the list of pages.
 * If it's not the main thread, an empty array is returned. No need to resolve nested pages, as the rendered result is discarded.
 * @param {string} file - The file.
 * @param {string} config - The configuration file.
 * @returns {Promise<import('../../../src/pages.mjs').Page[]>} The list of pages.
 */
async function getPages (file, config) {
  if (cache[file]) return cache[file]
  if (!thread.isMainThread) return []
  try {
    const response = await new Promise((resolve, reject) => {
      const worker = new thread.Worker(__filename, { workerData: { file, config, specifier: __filename } })
      worker.on('message', resolve)
    })
    const pages = cache[file] = JSON.parse(response)
    return pages
  } catch (err) {
    const pages = cache[file] = []
    return pages
  }
}
