import * as fs from 'node:fs'
import * as url from 'node:url'
import * as module from 'node:module'

import { parse } from 'node-html-parser'

import split from './splitTemplateLiterals.mjs'
import renderEnd from './renderEnd.mjs'

import * as path from 'node:path'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// eval-hook.mjs
module.register(url.pathToFileURL(path.resolve(__dirname, 'eval-hook.mjs')).toString(), {})

/**
 * Render a page
 * @param {import('../../../src/pages.mjs').Page} page - The page to render
 * @param {import('../../../src/config.mjs').Config} config - The configuration
 * @param {import('../../../src/pages.mjs').API} api - The API
 * @returns {Promise<string>} The rendered page
 */
export default async function render (page, config, api) {
  const content = page.content ?? await fs.promises.readFile(url.fileURLToPath(page.fileUrl), { encoding: 'utf8' })

  // mark page as root if it isn't already
  // this marker will be used to perform minification and other operations only once on the root page
  if (typeof page.root !== 'boolean') page.root = true

  // parse the content
  const root = await expensiveParse(content)

  // update the canonical URL. It may contain template literals but these are not evaluated because they are evaluated by the pages method
  // the render method (here) will use the raw text from the page object
  if (page.url) {
    const canonicals = root.querySelectorAll('link[rel="canonical"]')
    for (let i = 0; i < canonicals.length; i++) {
      const canonical = canonicals[i]
      if (i === 0) canonical.setAttribute('href', page.url.toString())
      else canonical.remove()
    }
  }

  // get script fields with a target attribute (contexts)
  // these contexts will be used to evaluate template literals on the page
  await Promise.all([...(root.querySelectorAll('script[target]'))].map(async (node) => {
    const nodes = root.querySelectorAll(node.getAttribute('target'))
    if (nodes.length === 0 || !(nodes.find(n => n.outerHTML.includes('${')))) return node.remove()
    const specifier = page.content ? `data:application/javascript;base64,${Buffer.from(node.rawText).toString('base64')}` : page.fileUrl

    const contextUrl = new URL(specifier)
    if (!page.content) contextUrl.searchParams.set('code', node.rawText)
    contextUrl.searchParams.set('format', 'pages-module-html-evaluate')
    contextUrl.searchParams.set('env', JSON.stringify({
      params: page.params || {},
      __filename: page.fileUrl ? url.fileURLToPath(page.fileUrl) : path.resolve(process.cwd(), 'index.html'),
      __dirname: page.fileUrl ? path.dirname(url.fileURLToPath(page.fileUrl)) : process.cwd(),
    }))

    const params = await import(contextUrl.toString())
    for (const node of nodes) node._context = Object.assign(node._context || {}, params)
    node.remove()
  }))

  // evaluate template literals in the tree
  await forEach(root, root.childNodes, async (node, parent) => {
    if (node.nodeType === 1) await renderElement(node, parent)
    if (node.nodeType === 3) await renderText(node, parent)
  })

  return page.root ? renderEnd(root, page, config, api) : root.toString()

  /**
   * Render a HTML element node.
   * @param {import('node-html-parser').HTMLElement} node - The node.
   * @param {import('node-html-parser').HTMLElement} parent - The parent node.
   * @returns {Promise} A promise that resolves when the node has been processed.
   */
  async function renderElement (node, parent) {
    if (node.rawAttrs.includes('${') && node.rawAttrs.includes('}')) node.rawAttrs = await evaluateTemplateLiterals(node, node.rawAttrs)

    if (config?.html?.resolve) {
      for (const [name, values] of Object.entries(node.attrs)) {
        for (const value of values.split(/\s+/)) {
          if (!value || value.includes('://') || !value.includes('.')) continue
          const filepath = path.resolve(path.dirname(url.fileURLToPath(page.fileUrl)), value)
          if (fs.existsSync(filepath) && fs.statSync(filepath).isFile()) {
            const pages = await api.pages(filepath, config)
            const reference = api.utils.getPageMatch(pages, { params: { ...(page.params || {}), lang: getLang(node, pages) || page.params?.lang } })
            if (reference) node.setAttribute(name, reference.url.toString())
          }
        }
      }
    }
  }

  /**
   * Render a HTML text node.
   * @param {import('node-html-parser').TextNode} node - The node.
   * @param {import('node-html-parser').HTMLElement} parent - The parent node.
   * @returns {Promise} A promise that resolves when the node has been processed.
   */
  async function renderText (node, parent) {
    if (node.rawText.includes('${') && node.rawText.includes('}') && parent.tagName !== 'SCRIPT') node.rawText = await evaluateTemplateLiterals(node, node.rawText)
  }

  /**
   * Replaces template literals in the tree with their evaluated values.
   * @param {import('node-html-parser').HTMLElement|import('node-html-parser').TextNode} node - The node.
   * @param {string} code - The code.
   * @returns {Promise<string>} The evaluated code.
   */
  async function evaluateTemplateLiterals (node, code) {
    // set the default context
    const context = { params: page.params, ...(page.params || {}) }
    if (page.fileUrl) {
      if (!context.__filename) context.__filename = url.fileURLToPath(page.fileUrl)
      if (!context.__dirname) context.__dirname = path.dirname(context.__filename)
    }
    context.include = (file) => {
      const fileUrl = path.isAbsolute(file) ? url.pathToFileURL(file) : new URL(file, page.fileUrl)
      return render({ ...page, fileUrl, content: undefined, root: false }, config, api)
    }

    // get the context from targeted scripts
    let currentNode = node
    while (currentNode.parentNode) {
      const ctx = currentNode._context
      if (ctx) for (const key in ctx) if (!(key in context)) context[key] = ctx[key]
      currentNode = currentNode.parentNode
    }

    // evaluate the code
    const specifier = page.content ? 'data:application/js;base64,' : page.fileUrl
    const fileUrl = new URL(specifier)
    fileUrl.searchParams.set('format', 'pages-module-html-evaluate-template-literals')
    const renderer = (await import(fileUrl.toString())).default

    return await renderer(code, context)
  }
}

/**
 * Parses a string of HTML content.
 * @param {string} content - The content.
 * @returns {Promise<import('node-html-parser').HTMLElement>} The root node.
 */
export async function expensiveParse (content) {
  // replace template literals as they may contain html tags
  // e.g. ${true ? '<div>1</div>' : '<div>2</div>'}
  // that would break the parsing
  const id = Date.now()
  const macros = {}
  const text = split(content).map((part, i) => {
    if (!part.startsWith('${') || !part.endsWith('}')) return part
    const key = `%%MACRO_${id}_${i}%%`
    macros[key] = part
    return key
  }).join('')

  const root = parse(text)

  // restore the template literals in the tree
  await forEach(root, root.childNodes, async (node, parent) => {
    if (node.nodeType === 1 && node.rawAttrs.includes(`%%MACRO_${id}`)) node.rawAttrs = node.rawAttrs.replace(new RegExp(`%%MACRO_${id}_\\d+%%`, 'g'), (match) => macros[match] || match)
    if (node.nodeType === 3 && node.rawText.includes(`%%MACRO_${id}`)) {
      node.rawText = node.rawText.replace(new RegExp(`%%MACRO_${id}_\\d+%%`, 'g'), (match) => macros[match] || match)
    }
  })

  return root
}

/**
 * Retrieves the language of a node.
 * @param {import('node-html-parser').HTMLElement} node - The node.
 * @param {import('../../../src/pages.mjs').Page[]} pages - The pages.
 * @returns {string} The language.
 */
function getLang (node, pages) {
  let lang
  while (node) {
    const nodeLang = node.getAttribute('hreflang') || node.getAttribute('lang')
    const isValidLang = nodeLang && pages.find(page => page.params.lang === nodeLang)
    if (isValidLang) { lang = nodeLang; break }
    node = node.parentNode
  }
  return lang
}

/**
 * Executes a callback for each node in the tree.
 * @param {import('node-html-parser').HTMLElement} parent - The parent node.
 * @param {import('node-html-parser').HTMLElement} nodes - The root node.
 * @param {Function} callback - The callback.
 * @returns {Promise} A promise that resolves when all nodes have been processed.
 */
function forEach (parent, nodes, callback) {
  if (!(Array.isArray(nodes))) nodes = [nodes]
  const promises = []
  for (const node of nodes) {
    promises.push(callback(node, parent))
    for (const child of (node.childNodes || [])) { promises.push(forEach(node, child, callback)) }
  }
  return Promise.all(promises)
}
