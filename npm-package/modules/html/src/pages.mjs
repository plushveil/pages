import * as path from 'node:path'
import * as url from 'node:url'
import * as fs from 'node:fs'

import { expensiveParse } from './render.mjs'
import splitTemplateLiterals from './splitTemplateLiterals.mjs'

/**
 * @typedef {import('node-html-parser').HTMLElement} HTMLElement
 */

/**
 * Retrieves a list of pages from a file.
 * @param {string} file - The file.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/pages.mjs').API} api - The API.
 * @returns {Promise<import('../../../src/pages.mjs').Page[]>} The list of pages.
 */
export default async function pages (file, config, api) {
  const content = await fs.promises.readFile(file, { encoding: 'utf-8' })
  const canonRegex = /<link[^>]+canonical[^>]*>/gi
  const hasCanonical = canonRegex.test(content)

  const abort = () => {
    return [{
      url: new URL(path.relative(config.root, file), config.baseURI),
      params: {
        headers: {
          'Content-Type': 'text/html',
          'X-Partial': 'true',
        },
      },
      fileUrl: url.pathToFileURL(file),
    }]
  }

  if (!hasCanonical) return abort()

  const root = await expensiveParse(content)
  const canonicals = [...root.querySelectorAll('link[rel="canonical"]')]
  if (canonicals.length === 0) return abort()

  const pages = []
  for (const canonical of canonicals) {
    let href = canonical.getAttribute('href')
    if (!href) continue
    if (!(href.includes('${'))) {
      while (href.startsWith('/')) href = href.slice(1)
      pages.push({
        url: new URL(href, config.baseURI),
        params: {
          headers: {
            'Content-Type': 'text/html',
          },
        },
        fileUrl: url.pathToFileURL(file),
      })
    } else {
      const scripts = await getTargetAttributeMatches(root, canonical, root.querySelectorAll('script[target]'))
      const context = {}
      for (const script of scripts) {
        const ctx = await getContext(script, root, file)
        for (const key in ctx) if (typeof ctx[key] !== 'undefined') context[key] = ctx[key]
      }
      const urlParts = await Promise.all(splitTemplateLiterals(href).map(part => getUrlPart(file, part, context)))
      const urlCombinations = getCombinations(urlParts)
      for (const combination of urlCombinations) {
        let pathname = combination.reduce((path, part) => path + part.value, '')
        while (pathname.startsWith('/')) pathname = pathname.slice(1)
        const params = combination.reduce((params, part) => {
          if (part.type !== 'dynamic') return params
          params[part.name] = part.value
          return params
        }, {})
        pages.push({
          url: new URL(pathname, config.baseURI),
          params: {
            headers: {
              'Content-Type': 'text/html',
            },
            ...params,
          },
          fileUrl: url.pathToFileURL(file),
        })
      }
    }
  }

  if (pages.length === 0) return abort()
  return pages
}

/**
 * Retrieves the elements whose target attribute targets any parent of the given node.
 * @param {HTMLElement} root - The root element.
 * @param {HTMLElement} node - The node.
 * @param {HTMLElement[]} nodeList - The list of nodes.
 * @returns {Promise<HTMLElement[]>} The list of elements.
 */
async function getTargetAttributeMatches (root, node, nodeList) {
  const matches = []
  for (const candidate of nodeList) {
    for (const target of root.querySelectorAll(candidate.getAttribute('target'))) {
      let currentNode = node
      while (currentNode.parentNode) {
        if (currentNode === target) { matches.push(candidate); break }
        currentNode = currentNode.parentNode
      }
    }
  }
  return matches
}

/**
 * @typedef {object} UrlPart - A part of a URL.
 * @property {"dynamic"|"static"} type - The type of the part.
 * @property {string} name - The name of the part.
 * @property {string|string[]} [value] - The value of the part.
 */

/**
 * Transforms a part of a URL pathname to an UrlPart object.
 * @param {string} file - The file.
 * @param {string} part - The part.
 * @param {object} context - The context.
 * @returns {Promise<UrlPart>} The UrlPart object.
 */
async function getUrlPart (file, part, context) {
  if (!part.startsWith('${') || !part.endsWith('}')) return { type: 'static', name: part, value: part, }

  const code = part.slice(2, -1)
  const fileUrl = url.pathToFileURL(file)
  fileUrl.searchParams.set('format', 'pages-module-html-evaluate-template-literals')
  const renderer = (await import(fileUrl.toString())).evaluate
  const value = await renderer(code, context)
  return { type: 'dynamic', name: code, value, }
}

/**
 * Retrieves the context of a script.
 * @param {HTMLElement} script - The script.
 * @param {HTMLElement} root - The root element.
 * @param {string} file - The file.
 * @returns {Promise<object>} The context.
 */
async function getContext (script, root, file) {
  if (script._context) return script._context
  const fileUrl = url.pathToFileURL(file)
  fileUrl.searchParams.set('format', 'pages-module-html-evaluate')
  fileUrl.searchParams.set('code', script.rawText)
  script._context = await import(fileUrl.toString())
  return script._context
}

/**
 * Returns all combinations of static and dynamic entries.
 * @param {UrlPart[]} input - The input.
 * @returns {UrlPart[][]} The combinations.
 */
function getCombinations (input) {
  // Identify dynamic entries and collect their value arrays
  const dynamicEntries = input
    .map((entry, index) => ({
      index,
      entry,
    }))
    .filter(({ entry }) => entry.type === 'dynamic' && Array.isArray(entry.value))

  if (dynamicEntries.length === 0) return [input] // if no dynamic, return input as is

  // Get Cartesian product of all dynamic entry values
  const dynamicValues = dynamicEntries.map(({ entry }) => entry.value)
  const product = cartesianProduct(dynamicValues)

  // Generate output by replacing dynamic values while preserving order
  return product.map(values => {
    return input.map((entry, i) => {
      const dynamicIndex = dynamicEntries.findIndex(({ index }) => index === i)
      if (dynamicIndex !== -1) {
        return { ...entry, value: values[dynamicIndex] }
      }
      return { ...entry } // static entry or non-dynamic with array value
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
