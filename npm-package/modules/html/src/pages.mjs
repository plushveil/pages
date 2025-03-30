import * as path from 'node:path'
import * as url from 'node:url'
import EventEmitter from 'node:events'

import executeAddons from '../addons/addons.mjs'
import getUrl from '../utils/getUrl.mjs'
import getNodesInRange from '../utils/getNodesInRange.mjs'
import * as utils from '../../../src/utils.mjs'

const eventEmitter = global.eventEmitter = global.eventEmitter || new EventEmitter()
eventEmitter.setMaxListeners(0)

/**
 * Retrieves a list of pages from a file.
 * @param {string} file - The file.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 * @param {object} options - Additional options.
 * @param {boolean} options.eval - Whether to evaluate the JavaScript code. Defaults to true.
 * @returns {Promise<import('../../../src/pages.mjs').Page[]>} The list of pages.
 */
export default async function pages (file, config, api, options = {}) {
  file = utils.resolve(file, [process.cwd(), path.dirname(url.fileURLToPath(config.fileUrl))], { exists: true, file: true })
  const fileUrl = url.pathToFileURL(file).toString()
  const canonicals = []

  /**
   * @param {import('../parser/iterator.mjs').Node} node - The node
   * @param {import('../parser/iterator.mjs').Node[]} nodes - All nodes.
   * @param {import('vscode-html-languageservice').HTMLDocument} htmlDocument - The HTML document.
   * @param {import('../../../src/pages.mjs').Page} page - The page.
   * @param {import('../../../src/config.mjs').Config} config - The configuration.
   * @param {import('../../../src/api.mjs').API} api - The API.
   */
  function forEachNode (node, nodes, htmlDocument, page, config, api) {
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
    const hrefNodes = getNodesInRange(start, end, nodes)
    if (hrefNodes[0]?.offset.start !== start) {
      const nodeStart = hrefNodes[0]?.offset.start || end
      const range = { start: textDocument.positionAt(start), end: textDocument.positionAt(nodeStart), }
      hrefNodes.unshift({ type: 'tag-open', text: textDocument.getText(range), range, offset: { start, end: nodeStart } })
    }
    if (hrefNodes[hrefNodes.length - 1]?.offset.end !== end) {
      const nodeEnd = hrefNodes[hrefNodes.length - 1]?.offset.end || start
      const range = { start: textDocument.positionAt(nodeEnd), end: textDocument.positionAt(end), }
      hrefNodes.push({ type: 'tag-open', text: textDocument.getText(range), range, offset: { start: nodeEnd, end } })
    }
    canonicals.push({ text, href: hrefNodes, start: linkHtmlNode.start })
  }

  /**
   * @type {import('../../../src/pages.mjs').Page}
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

  const pages = []
  for (const canonical of canonicals) {
    const combinations = getCombinations(canonical.href)
    for (const combination of combinations) {
      let href = combination.map(part => {
        if (part.type === 'tag-open') part.value = part.text
        else if (typeof part.value !== 'string') part.value = typeof part.raw === 'string' ? part.raw : part.text
        return part.value
      }).join('')
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

      pages.push(page)
    }
  }

  if (pages.length === 0) {
    pages.push({
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

  pages.forEach(page => {
    page.getSiblings = () => pages.filter(p => p !== page)
  })

  return pages
}

/**
 * @typedef {object} HrefPart - A part of a URL.
 * @property {"tag-open"|"template"} type - The type of the part.
 * @property {string} text - The text of the part.
 * @property {string} textUpdate - The template expression evaluation in string form.
 * @property {string|string[]|any} raw - The raw template expression evaluation.
 * @property {{ start: import('vscode-html-languageservice').Position, end: import('vscode-html-languageservice').Position }} range - The range of the part.
 * @property {{ start: number, end: number }} offset - The offset of the part.
 */

/**
 * Returns all combinations of static and dynamic entries.
 * @param {HrefPart[]} input - The input.
 * @returns {HrefPart[][]} The combinations.
 */
function getCombinations (input) {
  const dynamicEntries = input
    .map((entry, index) => ({ index, entry, }))
    .filter(({ entry }) => entry.type === 'template' && Array.isArray(entry.raw))

  if (dynamicEntries.length === 0) return [input]

  const dynamicValues = dynamicEntries.map(({ entry }) => entry.raw)
  const product = cartesianProduct(dynamicValues)

  return product.map(values => {
    return input.map((entry, i) => {
      const dynamicIndex = dynamicEntries.findIndex(({ index }) => index === i)
      if (dynamicIndex !== -1) return { ...entry, value: `${values[dynamicIndex]}` }
      return { ...entry }
    })
  })
}

/**
 * Returns the Cartesian product of the arrays.
 * @param {any[]} arrays - The arrays.
 * @returns {Array<Array>} The Cartesian
 */
function cartesianProduct (arrays) {
  return arrays.reduce((acc, array) => {
    return acc.flatMap(accItem => {
      return array.map(item => [...accItem, item])
    })
  }, [[]])
}
