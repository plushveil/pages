import * as fs from 'node:fs'
import * as url from 'node:url'
import * as threads from 'node:worker_threads'
import * as path from 'node:path'
import * as crypto from 'node:crypto'

import { parse as parseHTML } from 'node-html-parser'

import splitTemplateLiterals from './splitTemplateLiterals.mjs'
import getScriptTagsForElement from './getScriptTagsForElement.mjs'

import * as js from '../../js/js-api.mjs'

import getConfig from '../../../src/config.mjs'

/**
 * Renders a page.
 * @param {import('../html-pages.mjs').Page} [page]
 * @param {RenderOptions} [options={}] - The options.
 * @returns {Promise<string>} The rendered page.
 */
export default async function render (page, options = {}) {
  const id = Date.now()
  const placeholders = []
  const rawContent = (await fs.promises.readFile(page.file, { encoding: 'utf-8' })).replace(/`[^`]*`/g, (match) => {
    placeholders.push(match)
    return `"%%${id}_${placeholders.length - 1}%%"`
  })

  const root = parseHTML(rawContent)

  // Retrieve the configuration.
  const config = await getConfig(threads.workerData.initializeData)

  const contentSecurityPolicy = root.querySelector('meta[http-equiv="Content-Security-Policy"]')
  const csp = contentSecurityPolicy ? parseContentSecurityPolicy(contentSecurityPolicy.getAttribute('content')) : {}

  // Render all elements and text nodes.
  await forEach(root, root.childNodes.filter(n => !isScriptTag(n)), (node, parent) => {
    if (node.nodeType === 1) return renderElement(node)
    if (node.nodeType === 3) return renderText(node, parent)
  })

  // Add the content security policy.
  if (config.html?.js?.integrity) {
    const contentSecurityPolicy = root.querySelector('meta[http-equiv="Content-Security-Policy"]')
    if (contentSecurityPolicy) {
      const updatedCSP = contentSecurityPolicy ? parseContentSecurityPolicy(contentSecurityPolicy.getAttribute('content')) : {}
      contentSecurityPolicy.setAttribute('content', stringifyContentSecurityPolicy(csp, updatedCSP))
    }
  }

  // Retrieve the rendered content, after cleaning up the script tags.
  root.childNodes.forEach((node) => { if (isScriptTag(node)) node.remove() })
  let content = root.toString()

  // Minify the content.
  if (config.html?.minify) {
    const minify = (await import('html-minifier-terser')).minify
    const minifyOptions = { ...(config.html?.minify || {}) }
    if (typeof config.html?.css?.minify !== 'undefined') minifyOptions.minifyCSS = !!config.html?.css?.minify
    if (typeof config.html?.js?.minify !== 'undefined') minifyOptions.minifyJS = !!config.html?.js?.minify
    if (config.html?.js?.integrity) minifyOptions.minifyJS = false
    content = await minify(content, minifyOptions)
  }

  // Return the content.
  return content

  /**
   * Evaluates a template literal.
   * @param {string[]} literals - The literals.
   * @param {HTMLElement[]} scriptTags - The script tags.
   * @returns {Promise<string>} The evaluated template literal.
   */
  async function evaluate (literals, scriptTags) {
    const parts = []
    for (const literal of literals) {
      if (!(literal.startsWith('${') && literal.endsWith('}'))) {
        parts.push(literal)
        continue
      }

      if (scriptTags.length === 0) {
        const fileUrl = new URL(url.pathToFileURL(page.file))
        fileUrl.searchParams.set('format', 'html-script')
        fileUrl.searchParams.set('index', -1)
        const context = { ...(await import(fileUrl.toString())) }
        const result = await context.default(literal.slice(2, -1), context)
        parts.push(result)
      }

      for (const scriptTag of scriptTags) {
        const index = root.childNodes.indexOf(scriptTag)
        const fileUrl = new URL(url.pathToFileURL(page.file))
        fileUrl.searchParams.set('format', 'html-script')
        fileUrl.searchParams.set('index', index)
        const context = { ...(await import(fileUrl.toString())) }
        try {
          const result = await context.default(literal.slice(2, -1), context, options)
          parts.push(result)
        } catch (err) {
          const isReferenceError = err instanceof ReferenceError
          if (!isReferenceError) throw err
          else if (scriptTag === scriptTags[scriptTags.length - 1]) throw err
          continue
        }
      }
    }

    return parts.join('')
  }

  /**
   * Renders an element. It is only necessary to render the attributes. InnerText will be rendered by the text nodes.
   * @param {HTMLElement} node
   */
  async function renderElement (node) {
    const isCanonical = (node.tagName.toUpperCase() === 'LINK' && node.getAttribute('rel') === 'canonical')
    if (isCanonical) node.setAttribute('href', page.path)

    const always = async () => {
      if (isCanonical) return
      if (node.tagName.toUpperCase() === 'SCRIPT') await renderScript(node)
      await resolveReferences(node)
    }

    if (!(node.rawAttrs.includes('${'))) {
      node.rawAttrs = node.rawAttrs.replace(new RegExp(`"%%${id}_(.*?)%%"`, 'g'), (_, index) => placeholders[index])
      await always()
      return
    }

    const literals = splitTemplateLiterals(node.rawAttrs)
    if (!(literals.find(l => l.startsWith('${') && l.endsWith('}')))) { await always(); return }

    const scriptTags = getScriptTagsForElement(root, node)

    const attrs = []
    for (let literal of literals) {
      literal = literal.replace(new RegExp(`"%%${id}_(.*?)%%"`, 'g'), (_, index) => placeholders[index])
      if (!(literal.startsWith('${') && literal.endsWith('}'))) { attrs.push(literal); continue }
      const value = await evaluate([literal], scriptTags)
      attrs.push(value.replaceAll(/"/g, '&quot;'))
    }

    node.rawAttrs = attrs.join('')
    await always()
  }

  /**
   * Renders a script tag.
   * @param {HTMLElement} node - The node.
   */
  async function renderScript (node, state = {}) {
    if (node.getAttribute('src')) return
    if (!(node.childNodes.find(node => node.nodeType === 3))) return

    if (!state.isRendered) {
      const script = { file: page.file, params: { 'Content-Type': 'application/js', code: node.rawText } }
      const code = await js.render(script, config)
      const textNode = node.childNodes.find(n => n.nodeType === 3)
      textNode.rawText = code
    }

    // Add content security policy.
    if (config.html?.js?.integrity) {
      function addContentSecurityPolicy () {
        csp['script-src'] = csp['script-src'] || []

        const algorithm = node.getAttribute('integrity') || 'sha384'
        if (algorithm.includes('-')) { csp['script-src'].push(algorithm.startsWith('\'') ? algorithm : `'${algorithm}'`); return }

        const code = node.childNodes.find(n => n.nodeType === 3).rawText
        const hash = crypto.createHash(algorithm).update(code).digest('base64')
        const digest = `${algorithm}-${hash}`
        node.setAttribute('integrity', digest)
        csp['script-src'].push(`'${digest}'`)
      }
      addContentSecurityPolicy()
    }
  }

  /**
   * Renders a text node.
   * @param {import('node-html-parser').TextNode} node
   * @param {import('node-html-parser').HTMLElement} parent
   */
  async function renderText (node, parent) {
    if (!(node.rawText && node.rawText.includes('${'))) {
      node.rawText = node.rawText.replace(new RegExp(`"%%${id}_(.*?)%%"`, 'g'), (_, index) => placeholders[index])
      return
    }

    const literals = splitTemplateLiterals(node.rawText).map(literal => {
      return literal.replace(new RegExp(`"%%${id}_(.*?)%%"`, 'g'), (_, index) => placeholders[index])
    })

    if (!(literals.find(l => l.startsWith('${') && l.endsWith('}')))) return

    const scriptTags = getScriptTagsForElement(root, node)
    const text = await evaluate(literals, scriptTags)
    if (text.includes('<')) {
      const html = parseHTML(text)
      parent.exchangeChild(node, html)
      for (const script of html.querySelectorAll('script')) await renderScript(script, { isRendered: true })
    } else {
      node.rawText = text
    }
  }

  /**
   * Resolve references to other pages.
   * @param {HTMLElement} node - The node.
   */
  async function resolveReferences (node) {
    if (config.html?.references?.resolve !== true) return
    const lang = node.getAttribute('lang')
    for (const attributeName of Object.keys(node.attributes)) {
      const value = node.getAttribute(attributeName)
      if (!(value && typeof value === 'string' && value.startsWith('.'))) continue
      try {
        const fileUrl = url.pathToFileURL(path.resolve(path.dirname(page.file), ...value.split('/')))
        const getPages = (await import(fileUrl.toString())).getPages
        if (typeof getPages !== 'function') continue

        const referencePages = await getPages()
        const pages = (lang && referencePages.some(p => p.params?.lang === lang)) ? referencePages.filter(p => p.params.lang === lang) : referencePages
        if (pages.length === 0) continue
        if (pages.length === 1) node.setAttribute(attributeName, pages[0].path)
        else node.setAttribute(attributeName, findMatchingParams(page, pages))
      } catch (err) {
        console.error(err)
      }
    }
  }
}

/**
 * Checks if a node is a script tag with a target attribute.
 * @param {HTMLElement} node - The node.
 * @returns {boolean} Whether the node is a script tag.
 */
function isScriptTag (node) {
  if (node.nodeType !== 1) return false
  if (node.tagName?.toUpperCase() !== 'SCRIPT') return false
  if (typeof node.getAttribute('target') === 'undefined') return false
  return true
}

/**
 * Executes a callback for each node in the tree.
 * @param {HTMLElement} parent - The parent node.
 * @param {HTMLElement} nodes - The root node.
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

/**
 * Find the page where most params match.
 * @param {import('../html-pages.mjs').Page} page - The page.
 * @param {import('../html-pages.mjs').Page[]} pages - The pages.
 * @returns {import('../html-pages.mjs').Page} The page with the most matching params.
 */
function findMatchingParams (page, pages) {
  const params = page.params || {}
  const matches = pages.map((p) => {
    const pParams = p.params || {}
    return Object.keys(pParams).filter((key) => pParams[key] === params[key]).length
  })
  const max = Math.max(...matches)
  return pages[matches.indexOf(max)].path
}

/**
 * Parses a content security policy string.
 * @param {string} csp - The content security policy string.
 * @returns {object<string, string[]>} The content security policy object.
 */
function parseContentSecurityPolicy (csp = '') {
  const cspObject = {}
  const directives = csp.split(';').map(directive => directive.trim()).filter(Boolean)

  directives.forEach(directive => {
    const [name, ...values] = directive.split(/\s+/)
    cspObject[name] = values
  })

  return cspObject
}

/**
 * Stringifies a content security policy object.
 * @param {...{[name: string]: string[]}} cspObjects - The content security policy objects.
 * @returns {string} The content security policy string.
 */
function stringifyContentSecurityPolicy (...cspObjects) {
  const cspObject = {
    'default-src': [],
  }

  for (const obj of cspObjects) {
    for (const [name, values] of Object.entries(obj)) {
      cspObject[name] = cspObject[name] || []
      for (const value of values) {
        if (cspObject[name].includes(value)) continue
        cspObject[name].push(value)
      }
    }
  }

  // if unsafe-eval is allowed, remove all integrity hashes
  if (cspObject['script-src']?.find(value => value === "'unsafe-eval'")) {
    cspObject['script-src'] = cspObject['script-src'].filter(value => !value.startsWith('sha'))
  }

  for (const directive of Object.keys(cspObject)) {
    cspObject[directive] = cspObject[directive].filter((value, index, array) => value && array.indexOf(value) === index)
    cspObject[directive] = cspObject[directive].sort((a, b) => {
      if (a === "'self'") return -1
      if (b === "'self'") return 1
      if (a.startsWith("'unsafe")) return -1
      if (b.startsWith("'unsafe")) return 1
      return a.localeCompare(b)
    })
  }

  return Object.entries(cspObject).map(([name, values]) => `${name} ${values.join(' ')}`).join('; ')
}
