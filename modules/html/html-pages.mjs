import * as path from 'node:path'
import * as fs from 'node:fs'

import { parse as parseHTML } from 'node-html-parser'

import splitTemplateLiterals from './src/splitTemplateLiterals.mjs'
import getScriptTagsForElement from './src/getScriptTagsForElement.mjs'
import getURI from './src/getURI.mjs'

/**
 * @typedef {import('../../src/pages.mjs').Page} Page
 */

/**
 * Gets all pages of a file.
 * @param {string} fileUrl - The file URL.
 * @param {URL} baseURI - The base URI.
 * @returns {Promise<Page[]>} The pages.
 */
export default async function getPages (fileUrl, baseURI) {
  const filepath = path.resolve((new URL(fileUrl)).pathname)
  if (!fs.existsSync(filepath)) throw new Error(`File not found: ${filepath}`)
  const content = await fs.promises.readFile(filepath, { encoding: 'utf8' })
  const root = parseHTML(content)
  const canonicals = root.querySelectorAll('link[rel="canonical"]')

  if (canonicals.length === 0) {
    return [{ file: filepath, path: null, params: {} }]
  }

  const pages = []
  for (const canonical of canonicals) {
    const path = canonical.getAttribute('href')
    const literals = splitTemplateLiterals(path)
    if (!(literals.find((literal) => literal.startsWith('${') && literal.endsWith('}')))) {
      pages.push({ file: filepath, path: getURI(baseURI, path).pathname, params: {} })
      continue
    }

    const scriptTags = getScriptTagsForElement(root, canonical)
    if (scriptTags.length === 0) {
      pages.push({ file: filepath, path: getURI(baseURI, path).pathname, params: {} })
      continue
    }

    const parts = []
    for (const literal of literals) {
      if (!(literal.startsWith('${') && literal.endsWith('}'))) {
        parts.push(literal)
        continue
      }

      const name = literal.slice(2, -1)
      for (const scriptTag of scriptTags) {
        const index = root.childNodes.indexOf(scriptTag)
        const url = new URL(fileUrl)
        url.searchParams.set('format', 'html-script')
        url.searchParams.set('index', index)
        const script = await import(url.toString())
        if (script[name]) {
          parts.push(await script[name])
          break
        }
      }
    }

    for (const combination of combinations(parts)) {
      const params = combination.parts.reduce((params, value, i) => {
        const name = literals[i]
        if (!(name.startsWith('${') && name.endsWith('}'))) return params
        params[name.slice(2, -1)] = value
        return params
      }, {})

      pages.push({ file: filepath, path: getURI(baseURI, combination.text).pathname, params })
    }
  }

  return pages.map((page) => {
    if (page.path?.endsWith('.html')) page.path = page.path.slice(0, -5)
    if (page.path?.endsWith('index')) page.path = page.path.slice(0, -5)
    while (page.path?.endsWith('/')) page.path = page.path.slice(0, -1)
    while (page.path?.startsWith('/')) page.path = page.path.slice(1)
    page.path = `/${page.path ? `${page.path}/` : ''}`
    return page
  }).filter((page, i, arr) => !page.path || arr.findIndex((p) => p.path === page.path) === i)
}

/**
 * Retrieves all combinations of the array.
 * @param {string[]|Array<string[]>} arr
 * @returns {Array<{ text: string, parts: string[] }>} The combinations.
 */
function combinations (arr) {
  let result = [{
    text: '',
    parts: [],
  }]

  for (const part of arr) {
    const newResult = []

    if (Array.isArray(part)) {
      for (const item of part) {
        for (const res of result) {
          newResult.push({
            text: `${res.text}${item}`,
            parts: [...res.parts, item],
          })
        }
      }
    } else {
      for (const res of result) {
        newResult.push({
          text: `${res.text}${part}`,
          parts: [...res.parts, part],
        })
      }
    }

    result = newResult
  }

  return result
}
