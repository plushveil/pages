import * as path from 'node:path'
import * as url from 'node:url'
import * as fs from 'node:fs'

import parse from '../parser/parse.mjs'

import splitByMultipleDelimiters from '../utils/splitByMultipleDelimiters.mjs'
import getContexts from '../utils/getContexts.mjs'

import Worker from '../worker/main.mjs'

import { rawTextNodes } from '../config.mjs'

import { render as renderAnything } from '../../../src/pages.mjs'

// todo:
// - [x] insert canonical link (at head end or position where it was removed, if it was removed)
// - [ ] add integrity to script and style tags
// - [ ] add content-security-policy to html tag
// - [x] resolve file paths in html to pages urls
// - [x] <link rel="file" href="header.html">
// - [x] ${import('header.html')}
// - [x] value from import default export function result (in worker)
// - [ ] loadHTML change error location to the correct line
// - [x] nested worker needs no new thread

/**
 * @typedef {object} Node
 * @property {string} text - The text node
 * @property {{ line: number, character: number, offset: number }} start - The start position
 * @property {{ line: number, character: number, offset: number }} end - The end position
 * @property {boolean} [isTemplateLiteral] - Whether the node is a template literal
 */

/**
 * Renders a page.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 * @returns {Promise<string>} The rendered page.
 */
export default async function render (page, config, api) {
  const isPartial = (page.params?.headers?.['X-Partial'] === 'true')
  const sectionFilePath = page.params?.headers?.['X-Partial-File'] || url.fileURLToPath(page.fileUrl.toString())

  const htmlDocument = parse(page.content || page.fileUrl.toString())
  const textDocument = htmlDocument.getTextDocument()

  const contents = htmlDocument.select('link[rel="content"]')
  const allTemplateLiterals = htmlDocument.getTemplateLiterals()
  allTemplateLiterals.forEach((tl) => { tl.start.offset = textDocument.offsetAt(tl.start); tl.end.offset = textDocument.offsetAt(tl.end) })

  const worker = (allTemplateLiterals.length || contents.length) && new Worker(page, config, api)
  if (worker) await worker.start()

  const textNodes = htmlDocument.getTextNodes()
  textNodes.forEach((tn) => {
    tn.start.offset = textDocument.offsetAt(tn.start)
    tn.end.offset = textDocument.offsetAt(tn.end)
  })

  // create a content-security-policy object to collect data
  const contentSecurityPolicy = {}

  // get html nodes
  const htmlNodes = []
  await traverse(htmlDocument.roots, collectHtmlNodes)

  // replace the existing canonical link with the new full url
  // partial is true, when the page contains no canonical link
  if (!isPartial) {
    const canonicals = htmlDocument.select('link[rel="canonical"]')
    const position = (() => {
      if (canonicals.length) return { ...textDocument.positionAt(canonicals[0].start), offset: canonicals[0].start }
      const head = htmlDocument.select('head')
      if (head) return { ...textDocument.positionAt(head.endTagStart), offset: head.endTagStart }
      return null
    })()

    if (position) {
      htmlNodes.push({
        text: `<link rel="canonical" href="${page.url.toString()}">`,
        start: position,
        end: position
      })
    }
  }

  // add template literals to nodes
  const nodes = [...htmlNodes, ...textNodes].map((node) => {
    if (node.replaceTemplateLiterals === false) return node
    const templateLiterals = allTemplateLiterals.filter((tl) => tl.start.offset >= node.start.offset && tl.end.offset <= node.end.offset)
    if (templateLiterals.length === 0) return node

    let offset = node.start.offset
    return splitByMultipleDelimiters(node.text, templateLiterals.map((tl) => tl.text))
      .map((text) => {
        const start = { ...textDocument.positionAt(offset), offset }
        const end = { ...textDocument.positionAt(offset + text.length), offset: offset + text.length }
        offset = offset + text.length
        if (text.startsWith('${') && text.endsWith('}')) return { text, start, end, isTemplateLiteral: true }
        else return { text, start, end }
      })
  }).flat().sort((a, b) => a.start.offset - b.start.offset)

  let content = ''
  await traverse(nodes, forEachNode)
  if (worker) worker.stop()

  // replace the content security policy in the html tag
  if (!isPartial) {
    let isFirst = true
    content = content.replace(
      /<meta[^>]+http-equiv="Content-Security-Policy"[^>]+>/gi,
      () => {
        if (isFirst) {
          isFirst = false
          return `<meta http-equiv="Content-Security-Policy" content="${getContentSecurityPolicy(contentSecurityPolicy)}">`
        } else return ''
      }
    )
  }

  return content

  /**
   * @param {Node} node - The node.
   */
  async function forEachNode (node) {
    if (!node.isTemplateLiteral) {
      content += node.text
      return
    }

    const htmlNode = htmlDocument.findNodeBefore(node.start.offset)
    const contexts = getContexts(htmlDocument, htmlNode)
    const response = await worker.get(node.text.slice(2, -1), contexts)

    if (typeof response === 'string') {
      const nestedHtmlDocument = parse(response)
      await traverse(nestedHtmlDocument.roots, collectHtmlNodes)
    }

    content += response
  }

  /**
   * @param {import('../parser/parse.mjs').Node} node - The node.
   * @returns {boolean} Whether to traverse the children.
   */
  async function collectHtmlNodes (node) {
    if (node.tag.toLowerCase() === 'link' && node.attributes?.rel?.match(/canonical/)) return
    if (node.tag.toLowerCase() === 'script' && node.attributes?.target) return

    if (contents.includes(node)) {
      const start = textDocument.positionAt(node.start)
      const startTagEnd = textDocument.positionAt(node.startTagEnd)
      const text = `\${import('${node.attributes.href.replace(/^['"]+|['"]+$/g, '')}')}`
      htmlNodes.push({ text, start: { ...start, offset: node.start + 1 }, end: { ...startTagEnd, offset: node.startTagEnd }, isTemplateLiteral: true })
      return
    }

    const traverseChildren = !rawTextNodes.includes(node.tag.toLowerCase())
    if (!traverseChildren) {
      const start = textDocument.positionAt(node.startTagEnd)
      const end = textDocument.positionAt(node.endTagStart)
      const text = textDocument.getText({ start, end })
      if (text.trim()) {
        const type = node.tag.toLowerCase() === 'style' ? 'css' : (node.tag.toLowerCase() === 'script' ? 'js' : 'other')
        const contentPage = { ...page, content: text }
        const content = type === 'other'
          ? text
          : (await renderAnything(contentPage, config, 'utf-8', type)).replace(/\/[/*]# sourceMappingURL=.+/, '').trim()
        htmlNodes.push({
          text: content,
          replaceTemplateLiterals: false,
          start: { ...start, offset: node.startTagEnd },
          end: { ...end, offset: node.endTagStart }
        })
      }
    }

    const start = textDocument.positionAt(node.start)
    const startTagEnd = textDocument.positionAt(node.startTagEnd)

    let text = textDocument.getText({ start, end: startTagEnd })
    for (const attributeName of Object.keys(node.attributes || {})) {
      const [start, end] = node.attributes[attributeName].match(/^(['"]{1})|(['"]{1})$/g) || ['', '']
      const values = node.attributes[attributeName].replace(/^['"]{1}|['"]{1}$/g, '')
      if (!values.trim()) continue

      const updatedAttributeValue = `${start}${(await Promise.all(values.split(' ').map(async (value) => {
        if (value.match(/[.]{1,2}\//)) {
          try {
            const file = resolve(value)
            if (!file) return value
            const pages = await api.pages(file, config)
            if (pages.length === 0) throw new Error(`Could not resolve any pages for: "${value}".`)

            const attributes = Object.entries(node.attributes).reduce((acc, [key, value]) => {
              if (key.startsWith('data-')) key = key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
              value = value.replace(/^['"]+|['"]+$/g, '')
              if (key.toLowerCase() === 'hreflang') key = 'lang'
              acc[key] = value
              return acc
            }, {})

            attributes.headers = attributes.headers || {}
            if (node.tag.toLowerCase() === 'script') attributes.headers['Content-Type'] = 'application/javascript'
            if (node.tag.toLowerCase() === 'link' && node.attributes?.rel?.match(/stylesheet/)) attributes.headers['Content-Type'] = 'text/css'

            const page = selectPage(pages, attributes)
            return page.url.toString()
          } catch (err) {
            err.message = err.message + `\n    in ${sectionFilePath}`
            throw err
          }
        }
        return value
      }))).join(' ')}${end}`

      if (updatedAttributeValue !== node.attributes[attributeName]) {
        text = text.replaceAll(node.attributes[attributeName], updatedAttributeValue)
        node.attributes[attributeName] = updatedAttributeValue
      }
    }

    if (node.tag.toLowerCase() === 'meta' && node.attributes?.['http-equiv']?.match(/Content-Security-Policy/i)) {
      const cspString = (node.attributes.content || '').replace(/^['"]+|['"]+$/g, '')
      const csp = parseContentSecurityPolicy(cspString)
      Object.entries(csp).forEach(([directive, values]) => {
        contentSecurityPolicy[directive] = contentSecurityPolicy[directive] || []
        contentSecurityPolicy[directive].push(...values)
      })
    }

    if (node.tag.toLowerCase() === 'script' && node.attributes?.src) {
      contentSecurityPolicy['script-src-elem'] = contentSecurityPolicy['script-src-elem'] || []
      const url = new URL(node.attributes.src.replace(/^['"]+|['"]+$/g, ''))
      if (url.origin !== config.baseURI.origin) contentSecurityPolicy['script-src-elem'].push(url.origin)
      else contentSecurityPolicy['script-src-elem'].push("'self'")
    }

    if (node.tag.toLowerCase() === 'link' && node.attributes?.rel?.match(/stylesheet/)) {
      contentSecurityPolicy['style-src-elem'] = contentSecurityPolicy['style-src-elem'] || []
      const url = new URL(node.attributes.href.replace(/^['"]+|['"]+$/g, ''))
      if (url.origin !== config.baseURI.origin) contentSecurityPolicy['style-src-elem'].push(url.origin)
      else contentSecurityPolicy['style-src-elem'].push("'self'")
    }

    htmlNodes.push({ text, start: { ...start, offset: node.start }, end: { ...startTagEnd, offset: node.startTagEnd } })

    if (!node.endTagStart) return traverseChildren
    const endTagStart = textDocument.positionAt(node.endTagStart)
    const end = textDocument.positionAt(node.end)
    const endText = textDocument.getText({ start: endTagStart, end })
    htmlNodes.push({ text: endText, start: { ...endTagStart, offset: node.endTagStart }, end: { ...end, offset: node.end } })

    return traverseChildren
  }

  /**
   * Resolves a file path.
   * @param {string} filepath - The file path.
   * @returns {string} The absolute file path.
   */
  function resolve (filepath) {
    if (filepath.includes('://')) filepath = url.fileURLToPath(filepath)
    if (path.isAbsolute(filepath) && fs.existsSync(filepath)) return filepath

    const dirs = [
      path.dirname(sectionFilePath),
      config.root,
      process.cwd()
    ].filter(Boolean)
    for (const dir of dirs) {
      const file = path.resolve(dir, ...(filepath.split('/')))
      if (fs.existsSync(file)) return file
    }

    return null
  }

  /**
   * Selects one page from a list of pages.
   * @param {import('../../../src/pages.mjs').Page[]} pages - A list of pages.
   * @param {object} params - The params.
   * @returns {import('../../../src/pages.mjs').Page} The selected page.
   */
  function selectPage (pages, params) {
    if (pages.length === 0) throw new Error('No pages found.')
    if (pages.length === 1) return pages.pop()

    params = { ...page.params, ...params }

    // lang is a primary key, if it exists filter by lang
    if (params.lang) {
      const langPages = pages.filter((page) => page.params.lang === params.lang)
      if (langPages.length > 0) pages = langPages
    }

    const getMatches = (obj, objB) => Object.entries(objB).reduce((acc, [key, value]) => {
      if (typeof value === 'object' && typeof obj[key] === 'object') {
        const matches = getMatches(obj[key], value)
        acc += matches
      } else if (obj[key] === value) acc++
      return acc
    }, 0)

    return pages.reduce((acc, page) => {
      const matches = getMatches(page.params, params)
      if (matches >= acc.matches) return { page, matches }
      return acc
    }, { page: null, matches: 0 }).page
  }
}

/**
 * Recursively iterate over a node tree.
 * @param {import('../parser/parse.mjs').Node} node - The node.
 * @param {Function} callback - The callback.
 * @returns {Promise<void>} The promise.
 */
async function traverse (node, callback) {
  if (Array.isArray(node)) {
    for (const child of node) await traverse(child, callback)
  } else {
    const traverseChildren = await callback(node)
    if (traverseChildren !== false) await traverse(node.children || [], callback)
  }
}

/**
 * Parses a Content Security Policy string.
 * @param {string} cspString - The Content Security Policy string.
 * @returns {{[directive: string]: string[]}} The parsed Content Security Policy.
 */
function parseContentSecurityPolicy (cspString) {
  const result = {}
  const directives = cspString.split(';').map(d => d.trim())

  directives.forEach(directive => {
    if (!directive) return
    const [key, ...values] = directive.split(/\s+/)
    result[key] = values.filter(value => value.trim() !== '')
  })

  return result
}

/**
 * Converts a Content Security Policy object to a string.
 * @param {{[directive: string]: string[]}} csp - The Content Security Policy object.
 * @returns {string} The Content Security Policy string.
 */
function getContentSecurityPolicy (csp) {
  return Object.entries(csp).map(([directive, values]) => {
    return `${directive} ${[...new Set(values)].join(' ')}`.trim()
  }).join('; ')
}
