import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'
import * as thread from 'node:worker_threads'

import getConfig from '../../../src/config.mjs'
import { pages as getPagesFromWorker } from '../../../src/pages.mjs'

import * as utils from '../../../src/utils.mjs'

const __filename = url.fileURLToPath(import.meta.url)

const resolveAttributes = ['./', '../', '/']

const cache = {}
const cacheFiles = {}

let workerCount = 0
const isChildWorker = !!((!thread.isMainThread) && thread.workerData?.file && thread.workerData?.config && thread.workerData?.specifier === __filename)
if (isChildWorker) sendPagesToParent().finally(() => process.exit(0))

/**
 * Sends the pages to the parent thread.
 * @returns {Promise<void>} The promise.
 */
async function sendPagesToParent () {
  try {
    const config = { ...(await getConfig(thread.workerData.config)), root: thread.workerData.configRoot }
    const pages = (await getPagesFromWorker(thread.workerData.file, config))
    thread.parentPort.postMessage(JSON.stringify(pages))
    process.nextTick(() => process.exit(0))
  } catch (err) {
    console.log(err)
    thread.parentPort.postMessage([])
  }
}

/**
 * forEach is executed for each node when the page is interpreted.
 * @param {import('../parser/iterator.mjs').Node[]} nodes - All nodes.
 * @param {import('../parser/parse.mjs').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 */
export async function beforeAsync (nodes, htmlDocument, page, config, api) {
  const id = htmlDocument.getId()
  const pageFile = page.params.__filename ? page.params.__filename : url.pathToFileURL(page.fileUrl.toString())
  cacheFiles[id] = cacheFiles[id] || {}
  if (!cacheFiles[id][pageFile]) {
    const dirs = [path.dirname(pageFile), path.dirname(url.fileURLToPath(config.fileUrl.toString()))]
    cacheFiles[id][pageFile] = (await Promise.all(dirs.map(async dir => {
      const files = await fs.promises.readdir(dir)
      return files.filter(file => fs.statSync(path.resolve(dir, file)).isFile())
    }))).flat()
  }
}

/**
 * forEach is executed for each node when the page is interpreted.
 * @param {import('../parser/iterator.mjs').Node[]} nodes - All nodes.
 * @param {import('../parser/parse.mjs').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 */
export async function afterAsync (nodes, htmlDocument, page, config, api) {
  const id = htmlDocument.getId()
  const pageFile = page.params.__filename ? page.params.__filename : url.pathToFileURL(page.fileUrl.toString())
  delete cacheFiles[id][pageFile]
  if (!Object.values(cacheFiles[id]).find(Boolean)) delete cacheFiles[id]
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
  if (isChildWorker) return

  const htmlNode = htmlDocument.findNodeAt(node.offset.start + 1)
  if (!htmlNode || !htmlNode.attributes) return

  const id = htmlDocument.getId()
  const pageFile = page.params.__filename ? page.params.__filename : url.pathToFileURL(page.fileUrl.toString())
  const files = cacheFiles[id][pageFile]

  const before = typeof node.textUpdate === 'string' ? node.textUpdate : node.text
  let text = before
  for (const attributeValue of Object.values(htmlNode.attributes)) {
    if (!text.includes(attributeValue)) continue
    const value = attributeValue.slice(1, -1)
    const page = files.includes(value) ? (await getPage(value)) : (resolveAttributes.some(resolveAttribute => value.startsWith(resolveAttribute))) ? (await getPage(value)) : null
    if (!page) continue

    text = text.replace(value, page.url.toString())
  }

  if (text !== before) node.textUpdate = text

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

    const pages = await getPages(resolved, config)
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

    const pageMatch = pages.reduce((a, b) => a ? countMatches(a.params, page.params) >= countMatches(b.params, page.params) ? a : b : b, null)
    return pageMatch
  }
}

/**
 * Returns the list of pages.
 * If it's not the main thread, an empty array is returned. No need to resolve nested pages, as the rendered result is discarded.
 * @param {string} file - The file.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @returns {Promise<import('../../../src/pages.mjs').Page[]>} The list of pages.
 */
async function getPages (file, config) {
  if (cache[file]) return cache[file]

  try {
    // eslint-disable-next-line no-unmodified-loop-condition
    while (workerCount >= 4) await new Promise(resolve => setTimeout(resolve, 100))
    workerCount++
    const response = await new Promise((resolve, reject) => {
      const worker = new thread.Worker(__filename, {
        workerData: {
          file,
          config: config.fileUrl.toString(),
          configRoot: config.root.toString(),
          specifier: __filename
        }
      })
      worker.on('exit', () => workerCount--)
      worker.on('error', reject)
      worker.on('message', resolve)
    })
    const pages = cache[file] = JSON.parse(response)
    return pages
  } catch (err) {
    const pages = cache[file] = []
    return pages
  }
}
