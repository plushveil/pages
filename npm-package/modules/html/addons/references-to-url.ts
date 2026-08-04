import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'

import { pages as getPagesFromWorker } from '../../../src/pages.js'
import * as utils from '../../../src/utils.js'

const resolveAttributes = ['./', '../', '/']

const cache = {}
const cacheFiles = {}

/**
 * ForEach is executed for each node when the page is interpreted.
 *
 * @param {import('../parser/iterator.js').Node[]} nodes - All nodes.
 * @param {import('../parser/parse.js').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.js').Page} page - The page.
 * @param {import('../../../src/config.js').Config} config - The configuration.
 * @param {import('../../../src/api.js').API} api - The API.
 */
export async function beforeAsync(nodes, htmlDocument, page, config, _api) {
  const id = htmlDocument.getId()
  const pageFile = page.params?.['__filename'] ? page.params['__filename'] : page.fileUrl && url.pathToFileURL(page.fileUrl.toString())
  cacheFiles[id] ||= {}
  if (!pageFile) return
  if (!cacheFiles[id][pageFile]) {
    const dirs = [path.dirname(pageFile), path.dirname(url.fileURLToPath(config.fileUrl.toString()))]
    cacheFiles[id][pageFile] = (
      await Promise.all(
        dirs.map(async (dir) => {
          const files = await fs.promises.readdir(dir)
          return files.filter((file) => fs.statSync(path.resolve(dir, file)).isFile())
        }),
      )
    ).flat()
  }
}

/**
 * ForEach is executed for each node when the page is interpreted.
 *
 * @param {import('../parser/iterator.js').Node[]} nodes - All nodes.
 * @param {import('../parser/parse.js').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.js').Page} page - The page.
 * @param {import('../../../src/config.js').Config} config - The configuration.
 * @param {import('../../../src/api.js').API} api - The API.
 */
export async function afterAsync(nodes, htmlDocument, page, _config, _api) {
  const id = htmlDocument.getId()
  const pageFile = page.params?.['__filename'] ? page.params['__filename'] : page.fileUrl && url.pathToFileURL(page.fileUrl.toString())
  if (!pageFile) return
  delete cacheFiles[id][pageFile]
  if (!Object.values(cacheFiles[id]).find(Boolean)) delete cacheFiles[id]
}

/**
 * ForEach is executed for each node when the page is interpreted.
 *
 * @param {import('../parser/iterator.js').Node} node - The node.
 * @param {import('../parser/iterator.js').Node[]} nodes - All nodes.
 * @param {import('../parser/parse.js').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.js').Page} page - The page.
 * @param {import('../../../src/config.js').Config} config - The configuration.
 * @param {import('../../../src/api.js').API} api - The API.
 */
export async function forEachAsync(node, nodes, htmlDocument, page, config, _api) {
  if (node.type !== 'tag-open') return
  if (!node.text.match(/[a-zA-Z0-9 ]+=[ ]*["'][^'"]*["']/gi)) return

  const htmlNode = htmlDocument.findNodeAt(node.offset.start + 1)
  if (!htmlNode || !htmlNode.attributes) return

  const id = htmlDocument.getId()
  const pageFile = page.params?.['__filename'] ? page.params['__filename'] : page.fileUrl && url.pathToFileURL(page.fileUrl.toString())
  if (!pageFile) return
  const files = cacheFiles[id][pageFile]

  const before = typeof node.textUpdate === 'string' ? node.textUpdate : node.text
  let text = before
  for (const attributeValue of Object.values(htmlNode.attributes)) {
    if (!text.includes(attributeValue)) continue
    const value = attributeValue.slice(1, -1)

    // Split path and query parameters
    const [pathname, queryString] = value.includes('?') ? value.split('?', 2) : [value, null]
    const queryParams = queryString ? new URLSearchParams(queryString) : null
    const ctxParam = queryParams?.get('ctx')

    // Resolve the base path (without query params)
    let basePage = null
    if (files.includes(pathname)) {
      basePage = await getPage(pathname)
    } else if (resolveAttributes.some((resolveAttribute) => pathname.startsWith(resolveAttribute))) {
      basePage = await getPage(pathname)
    }

    if (!basePage) continue

    // Handle context-specific resolution
    if (ctxParam) {
      // Try to find context-specific variant from getPages result
      // First, get all pages for this file
      let resolved = null
      if (basePage.fileUrl) {
        resolved = typeof basePage.fileUrl === 'string' ? basePage.fileUrl : basePage.fileUrl.toString()
      }
      let ctxPage = null

      if (resolved) {
        // Parse file:// URL if needed
        const filePath = resolved.startsWith('file://') ? url.fileURLToPath(resolved) : resolved
        const allPagesForFile = await getPages(filePath, config)
        ctxPage = allPagesForFile.find((p) => p.params?.ctx === ctxParam)
      }

      if (ctxPage) {
        // Use context-specific page (e.g., script-ctxdemo.js)
        const ctxUrl = typeof ctxPage.url === 'string' ? ctxPage.url : ctxPage.url.toString()
        text = text.replace(value, ctxUrl)
      } else {
        // Context not found, preserve query param for serve mode
        text = text.replace(value, `${basePage.url.toString()}?${queryString}`)
      }
    } else if (queryString) {
      // No context param, but has other query params - preserve them
      text = text.replace(value, `${basePage.url.toString()}?${queryString}`)
    } else {
      // No query params, use base page
      text = text.replace(value, basePage.url.toString())
    }
  }

  if (text !== before) node.textUpdate = text

  /**
   * Returns the page object.
   *
   * @param {string} value - The value.
   * @returns {Promise<import('../../../src/pages.js').Page>} The page.
   */
  async function getPage(value) {
    let resolved = null
    try {
      resolved = utils.resolve(value, [path.dirname(pageFile), path.dirname(url.fileURLToPath(config.fileUrl.toString()))], { exists: true, file: true })
    } catch {
      // If .js file not found, try .ts extension (common for TypeScript sources)
      if (value.endsWith('.js')) {
        try {
          const tsValue = value.replace(/\.js$/, '.ts')
          resolved = utils.resolve(tsValue, [path.dirname(pageFile), path.dirname(url.fileURLToPath(config.fileUrl.toString()))], { exists: true, file: true })
        } catch {
          return null
        }
      } else {
        return null
      }
    }

    const pages = await getPages(resolved, config)
    if (pages.length === 0) return null
    if (pages.length === 1) return pages[0]

    /**
     * Counts the number of matching properties.
     *
     * @param {any} paramsA - The first parameters.
     * @param {any} paramsB - The second parameters.
     * @returns {number} The number of matching properties.
     */
    function countMatches(paramsA, paramsB) {
      let match = 0
      if (paramsA === paramsB) return 1
      if (typeof paramsA !== 'object' || typeof paramsB !== 'object') return match
      for (const key in paramsA) {
        if (!Object.hasOwn(paramsA, key)) continue
        if (paramsA[key] === paramsB[key]) match++
        if (typeof paramsA[key] === 'object') match += countMatches(paramsA[key], paramsB[key])
      }
      return match
    }

    const pageMatch = pages.reduce((best, candidate) => {
      if (!best) return candidate
      return countMatches(best.params, page.params) >= countMatches(candidate.params, page.params) ? best : candidate
    }, null)
    return pageMatch
  }
}

/**
 * Returns the list of pages.
 *
 * @param {string} file - The file.
 * @param {import('../../../src/config.js').Config} config - The configuration.
 * @returns {Promise<import('../../../src/pages.js').Page[]>} The list of pages.
 */
async function getPages(file, config) {
  if (cache[file]) return cache[file]

  try {
    const pages = (cache[file] = await getPagesFromWorker(file, config))
    return pages
  } catch {
    const pages = (cache[file] = [])
    return pages
  }
}
