import * as fs from 'node:fs'
import * as module from 'node:module'
import * as path from 'node:path'
import * as url from 'node:url'

import ts from '@typescript/typescript6'

import getExports from '../utils/getExports.js'
import getNodesInRange, { createNodesInRangeContext } from '../utils/getNodesInRange.js'

const templateLiteralsFilename = url.fileURLToPath(import.meta.url)
const templateLiteralsDirname = path.dirname(templateLiteralsFilename)

const execSource = await fs.promises.readFile(path.resolve(templateLiteralsDirname, '..', 'utils', 'exec.js'), 'utf8')

module.registerHooks({
  /**
   * @param {string} specifier - The specifier to resolve
   * @param {{ conditions: string[]; importAttributes: {}; parentURL: string }} context - The context object
   * @param {Function<string, {}>} nextResolve - The subsequent resolve hook in the chain, or the Node.js default resolve hook after the last user-supplied resolve hook
   * @returns {{ format: string; url: string; importAttributes: {}; shortCircuit: boolean }} - The result object
   * @see https://nodejs.org/api/module.html#resolvespecifier-context-nextresolve
   */
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === import.meta.url) {
      return {
        format: 'module',
        url: specifier,
        importAttributes: {
          ...context.importAttributes,
          specifier,
          parentURL: import.meta.url,
        },
        shortCircuit: true,
      }
    }
    return nextResolve(specifier, context)
  },
  /**
   * @param {string} moduleUrl - The URL returned by the resolve chain
   * @param {{ conditions: string[]; format: string; importAttributes: {} }} context - The context object
   * @param {Function<string, {}>} nextLoad - The subsequent load hook in the chain, or the Node.js default load hook after the last user-supplied load hook
   * @returns {{ format: string; shortCircuit: boolean; source: string }} - The result object
   * @see https://nodejs.org/api/module.html#loadurl-context-nextload
   */
  load(moduleUrl, context, nextLoad) {
    if (context.importAttributes?.parentURL === import.meta.url) {
      return {
        format: 'module',
        shortCircuit: true,
        source: execSource,
      }
    }
    return nextLoad(moduleUrl, context)
  },
})

/**
 * @typedef {object} nodeDetails
 * @property {number} id - The id.
 * @property {import('vscode-html-languageservice').HTMLNode} htmlNode - The HTML node.
 * @property {import('../parser/iterator.js').Node} [node] - The iterator node.
 * @property {string[]} exports - The exports.
 * @property {string} code - The code.
 */

/**
 * @type {{ [key: string]: { [key: string]: nodeDetails[] } }}
 */
const idNodeScriptsMap = {}

/**
 * @type {{ [key: string]: number }}
 */
const idPreflightStopPositionMap = {}

/**
 * @type {{ [key: string]: Map<number, import('../parser/iterator.js').Node> }}
 */
const idIteratorNodeByOffsetStartMap = {}

/**
 * BeforeAsync is executed before the page is interpreted.
 *
 * @param {import('../parser/iterator.js').Node[]} iterator - The iterator
 * @param {import('../parser/parse.js').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.js').Page} _page - The page.
 * @param {import('../../../src/config.js').Config} _config - The configuration.
 * @param {import('../../../src/api.js').API} _api - The API.
 */
export function beforeAsync(iterator, htmlDocument, _page, _config, _api) {
  const textDocument = htmlDocument.getTextDocument()
  const id = htmlDocument.getId()
  const nodesInRangeContext = createNodesInRangeContext(iterator)
  const scripts = htmlDocument.select('script[target]')
  const [head] = htmlDocument.select('link[rel="canonical"]')
  idPreflightStopPositionMap[id] = head?.end || 0

  idIteratorNodeByOffsetStartMap[id] = new Map(iterator.map((entry) => [entry.offset.start, entry]))

  idNodeScriptsMap[id] = {}
  for (const [i, script] of scripts.entries()) {
    const text = textDocument.getText({ start: textDocument.positionAt(script.startTagEnd), end: textDocument.positionAt(script.endTagStart) })
    const scriptDetails = { id: i, htmlNode: script, exports: getExports(text) }
    const targetSelector = script.attributes.target.replace(/^["']|['"]$/g, '')
    const targets = htmlDocument.select(targetSelector)
    for (const target of targets) {
      traverse(target, (node) => {
        idNodeScriptsMap[id][node] ||= []
        idNodeScriptsMap[id][node].push(scriptDetails)
      })
    }

    // remove the targeted scripts from the output
    for (const node of getNodesInRange(script.start, script.end, iterator, nodesInRangeContext)) {
      node.textUpdate = ''
    }
  }

  /**
   * Traverses the node and its children.
   *
   * @param {import('vscode-html-languageservice').HTMLNode} node - The node
   * @param {Function} callback - The callback
   */
  function traverse(node, callback) {
    callback(node)
    for (const child of node.children) traverse(child, callback)
  }
}

/**
 * ForEach is executed for each node when the page is interpreted.
 *
 * @param {import('../parser/iterator.js').Node} node - The node
 * @param {import('../parser/iterator.js').Node[]} nodes - All nodes.
 * @param {import('../parser/parse.js').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.js').Page} page - The page.
 * @param {import('../../../src/config.js').Config} config - The configuration.
 * @param {import('../../../src/api.js').API} api - The API.
 */
export async function forEachAsync(node, nodes, htmlDocument, page, config, api) {
  if (node.type !== 'template') return
  if (typeof node.textUpdate === 'string') return

  // Skip if the node is after the preflight stop position
  if (page.params?.headers?.['X-Is-Preflight'] === 'true') {
    const stop = idPreflightStopPositionMap[htmlDocument.getId()]
    if (node.offset.start >= stop) return
  }

  const execModuleSpecifier = getExecModuleSpecifier(htmlDocument, page)

  /**
   * @type {import('../utils/exec.js').default}
   */
  const execFn = (await import(execModuleSpecifier)).default
  const scripts = getScriptsForNode(node, nodes, htmlDocument)

  let result = await execFn(node.text.slice(2, -1), scripts, page, config, api)
  if (typeof result === 'object' && result && 'default' in result) result = result.default
  if (typeof result === 'function') result = await result()
  node.raw = result
  node.textUpdate = `${node.raw}`
}

/**
 * Builds a deterministic specifier for the template execution module.
 * Reusing this per render context allows the module cache to be reused.
 *
 * @param {import('../parser/parse.js').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.js').Page} page - The page.
 * @returns {string} The specifier used to import the exec module.
 */
function getExecModuleSpecifier(htmlDocument, page) {
  const ia = page.importAttributes && (page.importAttributes.startsWith('#') ? page.importAttributes.slice(1) : page.importAttributes)
  const id = encodeURIComponent(htmlDocument.getId())
  const iaPart = ia ? `|${encodeURIComponent(ia)}` : ''
  return `${htmlDocument.getTextDocument().uri}#${id}${iaPart}`
}

/**
 * Transpile TypeScript code to JavaScript.
 *
 * @param {string} code - The code.
 * @returns {string} The transpiled code.
 */
function getCode(code) {
  const { outputText } = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
      sourceMap: false,
    },
  })
  return outputText
}

/**
 * After is executed when the interpretation is done.
 *
 * @param {import('../parser/iterator.js').Node[]} _iterator - The iterator
 * @param {import('../parser/parse.js').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.js').Page} _page - The page.
 * @param {import('../../../src/config.js').Config} _config - The configuration.
 * @param {import('../../../src/api.js').API} _api - The API.
 */
export function after(_iterator, htmlDocument, _page, _config, _api) {
  const id = htmlDocument.getId()
  delete idNodeScriptsMap[id]
  delete idIteratorNodeByOffsetStartMap[id]
}

/**
 * Retrieves the scripts for a node.
 *
 * @param {import('../parser/iterator.js').Node} node - The node
 * @param {import('../parser/iterator.js').Node[]} nodes - All nodes.
 * @param {import('../parser/parse.js').HTMLDocument} htmlDocument - The HTML document.
 * @returns {nodeDetails[]} The scripts.
 */
function getScriptsForNode(node, nodes, htmlDocument) {
  const id = htmlDocument.getId()
  const closestHtmlNode = htmlDocument.findNodeAt(node.offset.start)
  const scripts = idNodeScriptsMap[id][closestHtmlNode] || []
  const iterNodeByOffsetStart = idIteratorNodeByOffsetStartMap[id]
  return scripts
    .map((scriptDetails) => {
      const iterNode = iterNodeByOffsetStart.get(scriptDetails.htmlNode.startTagEnd)
      iterNode.code = getCode(iterNode.text)
      return { ...scriptDetails, node: iterNode }
    })
    .filter(Boolean)
}
