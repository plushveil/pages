import EventEmitter from 'node:events'
import * as path from 'node:path'
import * as url from 'node:url'

import * as utils from '../../../src/utils.js'
import executeAddons from '../addons/addons.js'
import getNodesInRange, { createNodesInRangeContext } from '../utils/getNodesInRange.js'
import getUrl from '../utils/getUrl.js'

global.eventEmitter ||= new EventEmitter()
const { eventEmitter } = global
eventEmitter.setMaxListeners(0)

/**
 * Retrieves a list of pages from a file.
 *
 * @param {string} file - The file.
 * @param {import('../../../src/config.js').Config} config - The configuration.
 * @param {import('../../../src/api.js').API} api - The API.
 * @param {object} options - Additional options.
 * @param {boolean} options.eval - Whether to evaluate the JavaScript code. Defaults to true.
 * @returns {Promise<import('../../../src/pages.js').Page[]>} The list of pages.
 */
export default async function pages(file, config, api, _options = {}) {
  file = utils.resolve(file, [process.cwd(), path.dirname(url.fileURLToPath(config.fileUrl))], { exists: true, file: true })
  const fileUrl = url.pathToFileURL(file).toString()
  const canonicals = []
  let nodesInRangeContext = null

  /**
   * @param {import('../parser/iterator.js').Node} node - The node
   * @param {import('../parser/iterator.js').Node[]} nodes - All nodes.
   * @param {import('vscode-html-languageservice').HTMLDocument} htmlDocument - The HTML document.
   * @param {import('../../../src/pages.js').Page} page - The page.
   * @param {import('../../../src/config.js').Config} config - The configuration.
   * @param {import('../../../src/api.js').API} api - The API.
   */
  function forEachNode(node, nodes, htmlDocument, _page, _config, _api) {
    if (!node.text.match(/rel=['"]canonical['"]/i)) return
    const linkHtmlNode = htmlDocument.findNodeAt(node.offset.start + 1)
    if (linkHtmlNode.tag !== 'link' || linkHtmlNode.attributes.rel.slice(1, -1) !== 'canonical') return
    if (canonicals.find(({ start }) => start === linkHtmlNode.start)) return
    const textDocument = htmlDocument.getTextDocument()
    if (textDocument.uri !== fileUrl) return
    const text = textDocument.getText({ start: textDocument.positionAt(linkHtmlNode.start), end: textDocument.positionAt(linkHtmlNode.startTagEnd) })
    const match = text.match(/href\s*=\s*['"]/)
    if (!match) return
    const start = linkHtmlNode.start + match.index + match[0].length
    const end = start + linkHtmlNode.attributes.href.length - 2
    nodesInRangeContext ||= createNodesInRangeContext(nodes)
    const hrefNodes = getNodesInRange(start, end, nodes, nodesInRangeContext)
    if (hrefNodes[0]?.offset.start !== start) {
      const nodeStart = hrefNodes[0]?.offset.start || end
      const range = { start: textDocument.positionAt(start), end: textDocument.positionAt(nodeStart) }
      hrefNodes.unshift({ type: 'tag-open', text: textDocument.getText(range), range, offset: { start, end: nodeStart } })
    }
    if (hrefNodes[hrefNodes.length - 1]?.offset.end !== end) {
      const nodeEnd = hrefNodes[hrefNodes.length - 1]?.offset.end || start
      const range = { start: textDocument.positionAt(nodeEnd), end: textDocument.positionAt(end) }
      hrefNodes.push({ type: 'tag-open', text: textDocument.getText(range), range, offset: { start: nodeEnd, end } })
    }
    canonicals.push({ text, href: hrefNodes, start: linkHtmlNode.start })
  }

  /**
   * @type {import('../../../src/pages.js').Page}
   */
  const preflightPage = {
    fileUrl: url.pathToFileURL(file),
    url: getUrl(path.relative(path.dirname(config.fileUrl.toString()), file), config),
    params: {
      headers: {
        'X-Partial': 'true',
        'X-Is-Preflight': 'true',
      },
      __filename: file,
      __dirname: path.dirname(file),
    },
    root: false,
    getSiblings: () => [],
  }

  eventEmitter.on('node', forEachNode)
  await executeAddons(preflightPage, config, api)
  eventEmitter.off('node', forEachNode)

  const results = []
  for (const canonical of canonicals) {
    const combinations = getCombinations(canonical.href)
    for (const combination of combinations) {
      let href = combination.map((part) => (typeof part.value === 'string' ? part.value : part.text)).join('')
      while (href.startsWith('/')) href = href.slice(1)

      const page = {
        fileUrl: url.pathToFileURL(file),
        url: getUrl(href, config),
        params: {
          headers: {
            'Content-Type': 'text/html',
          },
          __filename: file,
          __dirname: path.dirname(file),
          ...combination.reduce((params, param, i) => {
            if (param.type === 'template') params[param.text.slice(2, -1)] = param.value || param.textUpdate
            params[`urlPart${i}`] = param.value || (typeof param.textUpdate === 'string' ? param.textUpdate : param.text)
            return params
          }, {}),
        },
        root: true,
      }

      for (const part of combination) {
        if (part.type === 'template') {
          page.params[part.text.slice(2, -1)] = part.value
        }
      }

      results.push(page)
    }
  }

  if (results.length === 0) {
    results.push({
      url: getUrl(path.relative(path.dirname(config.fileUrl.toString()), file), config),
      fileUrl: url.pathToFileURL(file),
      params: {
        headers: {
          'X-Partial': 'true',
        },
        __filename: file,
        __dirname: path.dirname(file),
      },
      root: false,
      getSiblings: () => [],
    })
  }

  results.forEach((entry) => {
    entry.getSiblings = () => results.filter((p) => p !== entry)
  })

  return results
}

/**
 * @typedef {object} HrefPart - A part of a URL.
 * @property {'tag-open' | 'template'} type - The type of the part.
 * @property {string} text - The text of the part.
 * @property {string} textUpdate - The template expression evaluation in string form.
 * @property {string | string[] | any} raw - The raw template expression evaluation.
 * @property {{ start: import('vscode-html-languageservice').Position; end: import('vscode-html-languageservice').Position }} range - The range of the part.
 * @property {{ start: number; end: number }} offset - The offset of the part.
 */

/**
 * Returns all combinations of static and dynamic entries.
 *
 * @param {HrefPart[]} input - The input.
 * @returns {HrefPart[][]} The combinations.
 */
function getCombinations(input) {
  /**
   * @type {HrefPart[][]}
   */
  let combinations = [[]]

  for (const entry of input) {
    if (entry.type === 'template' && Array.isArray(entry.raw)) {
      /**
       * @type {HrefPart[][]}
       */
      const nextCombinations = []
      for (const combination of combinations) {
        for (const value of entry.raw) {
          nextCombinations.push([...combination, { ...entry, value: `${value}` }])
        }
      }
      combinations = nextCombinations
      continue
    }

    const preparedEntry = prepareHrefPart(entry)
    for (const combination of combinations) {
      combination.push(preparedEntry)
    }
  }

  return combinations
}

/**
 * Prepares an href part with the same value normalization semantics used when rendering canonical combinations.
 *
 * @param {HrefPart} part - The href part.
 * @returns {HrefPart} The prepared href part.
 */
function prepareHrefPart(part) {
  if (part.type === 'tag-open') {
    return typeof part.value === 'string' && part.value === part.text ? part : { ...part, value: part.text }
  }

  if (typeof part.value === 'string') return part
  return { ...part, value: typeof part.raw === 'string' ? part.raw : part.text }
}
