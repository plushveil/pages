import * as fs from 'node:fs'
import * as url from 'node:url'
import * as path from 'node:path'
import * as module from 'node:module'

import getExports from '../utils/getExports.mjs'
import getNodesInRange from '../utils/getNodesInRange.mjs'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const exec = await fs.promises.readFile(path.resolve(__dirname, '..', 'utils', 'exec.mjs'), 'utf8')

module.registerHooks({
  /**
   * @param {string} specifier - The specifier to resolve
   * @param {{ conditions: string[], importAttributes: {}, parentURL: string }} context - The context object
   * @param {Function<string, {}>} nextResolve - The subsequent resolve hook in the chain, or the Node.js default resolve hook after the last user-supplied resolve hook
   * @returns {{ format: string, url: string, importAttributes: {}, shortCircuit: boolean }} - The result object
   * @see https://nodejs.org/api/module.html#resolvespecifier-context-nextresolve
   */
  resolve (specifier, context, nextResolve) {
    if (context.parentURL === import.meta.url) {
      return {
        format: 'module',
        url: specifier,
        importAttributes: {
          specifier,
          parentURL: import.meta.url
        },
        shortCircuit: true
      }
    }
    return nextResolve(specifier, context)
  },
  /**
   * @param {string} url - The URL returned by the resolve chain
   * @param {{ conditions: string[], format: string, importAttributes: {} }} context - The context object
   * @param {Function<string, {}>} nextLoad - The subsequent load hook in the chain, or the Node.js default load hook after the last user-supplied load hook
   * @returns {{ format: string, shortCircuit: boolean, source: string }} - The result object
   * @see https://nodejs.org/api/module.html#loadurl-context-nextload
   */
  load (url, context, nextLoad) {
    if (context.importAttributes?.parentURL === import.meta.url) {
      return {
        format: 'module',
        shortCircuit: true,
        source: exec
      }
    }
    return nextLoad(url, context)
  }
})

/**
 * @typedef {object} nodeDetails
 * @property {number} id - The id.
 * @property {import('vscode-html-languageservice').HTMLNode} htmlNode - The HTML node.
 * @property {import('../parser/iterator.mjs').Node} [node] - The iterator node.
 * @property {string[]} exports - The exports.
 * @property {string} code - The code.
 */

/**
 * @type {{[key: string]: {[key: string]: nodeDetails[]}}}
 */
const idNodeScriptsMap = {}

/**
 * beforeAsync is executed before the page is interpreted.
 * @param {import('../parser/iterator.mjs').Node[]} iterator - The iterator
 * @param {import('../parser/parse.mjs').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 */
export function beforeAsync (iterator, htmlDocument, page, config, api) {
  const textDocument = htmlDocument.getTextDocument()
  const id = htmlDocument.getId()
  const scripts = htmlDocument.select('script[target]')

  idNodeScriptsMap[id] = {}
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i]
    const text = textDocument.getText({ start: textDocument.positionAt(script.startTagEnd), end: textDocument.positionAt(script.endTagStart) })
    const scriptDetails = { id: i, htmlNode: script, exports: getExports(text) }
    const targetSelector = script.attributes.target.replace(/^["']|['"]$/g, '')
    const targets = htmlDocument.select(targetSelector)
    for (const target of targets) {
      traverse(target, (node) => {
        idNodeScriptsMap[id][node] = idNodeScriptsMap[id][node] || []
        idNodeScriptsMap[id][node].push(scriptDetails)
      })
    }

    // remove the targeted scripts from the output
    for (const node of getNodesInRange(script.start, script.end, iterator)) {
      node.textUpdate = ''
    }
  }

  /**
   * Traverses the node and its children.
   * @param {import('vscode-html-languageservice').HTMLNode} node - The node
   * @param {Function} callback - The callback
   */
  function traverse (node, callback) {
    callback(node)
    for (const child of node.children) traverse(child, callback)
  }
}

/**
 * forEach is executed for each node when the page is interpreted.
 * @param {import('../parser/iterator.mjs').Node} node - The node
 * @param {import('../parser/iterator.mjs').Node[]} nodes - All nodes.
 * @param {import('../parser/parse.mjs').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 */
export async function forEachAsync (node, nodes, htmlDocument, page, config, api) {
  if (node.type !== 'template') return
  if (typeof node.textUpdate === 'string') return

  /**
   * @type {import('../utils/exec.mjs').default}
   */
  const ia = page.importAttributes && (page.importAttributes.startsWith('#') ? page.importAttributes.slice(1) : page.importAttributes)
  const hash = '#' + Date.now() + Math.random() + (ia ? `|${ia}` : '')
  const exec = (await import(htmlDocument.getTextDocument().uri + hash)).default
  const scripts = getScriptsForNode(node, nodes, htmlDocument)

  let result = await exec(node.text.slice(2, -1), scripts, page, config, api)
  if (typeof result === 'object' && result && 'default' in result) result = result.default
  if (typeof result === 'function') result = await result()
  node.raw = result
  node.textUpdate = `${node.raw}`
}

/**
 * after is executed when the interpretation is done.
 * @param {import('../parser/iterator.mjs').Node[]} iterator - The iterator
 * @param {import('../parser/parse.mjs').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 */
export function after (iterator, htmlDocument, page, config, api) {
  const id = htmlDocument.getId()
  delete idNodeScriptsMap[id]
}

/**
 * Retrieves the scripts for a node.
 * @param {import('../parser/iterator.mjs').Node} node - The node
 * @param {import('../parser/iterator.mjs').Node[]} nodes - All nodes.
 * @param {import('../parser/parse.mjs').HTMLDocument} htmlDocument - The HTML document.
 * @returns {nodeDetails[]} The scripts.
 */
function getScriptsForNode (node, nodes, htmlDocument) {
  const id = htmlDocument.getId()
  const closestHtmlNode = htmlDocument.findNodeAt(node.offset.start)
  const scripts = idNodeScriptsMap[id][closestHtmlNode] || []
  return scripts.map((scriptDetails) => {
    const node = nodes.find(node => node.offset.start === scriptDetails.htmlNode.startTagEnd)
    return { ...scriptDetails, node }
  }).filter(Boolean)
}
