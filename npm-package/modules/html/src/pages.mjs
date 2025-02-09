import * as url from 'node:url'
import * as path from 'node:path'

import getContexts from '../utils/getContexts.mjs'
import splitByMultipleDelimiters from '../utils/splitByMultipleDelimiters.mjs'

import parse from '../parser/parse.mjs'
import Worker from '../worker/main.mjs'

/**
 * @typedef {object} UrlPart - A part of a URL.
 * @property {"dynamic"|"static"} type - The type of the part.
 * @property {string} name - The name of the part.
 * @property {string|string[]} [value] - The value of the part.
 */

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
  if (options.eval !== false) options.eval = true

  const fileUrl = url.pathToFileURL(file)
  const htmlDocument = parse(fileUrl.toString())
  const canonicals = htmlDocument.select('link[rel="canonical"]')

  const abort = () => {
    return [{
      url: new URL(path.relative(config.root, file), config.baseURI),
      params: {
        headers: {
          'Content-Type': 'text/html',
          'X-Partial': 'true',
        },
      },
      fileUrl,
    }]
  }

  if (canonicals.length === 0) {
    return abort()
  }

  const pages = []
  const templateLiterals = htmlDocument.getTemplateLiterals()

  for (const canonical of canonicals) {
    const href = canonical.attributes.href?.replace(/^['"]+|['"]+$/g, '')?.replace(/^\/+/g, '')
    if (!href) continue

    const canonicalTemplateLiterals = templateLiterals.filter(t => t.start.offset >= canonical.start && t.end.offset <= canonical.end)
    if (canonicalTemplateLiterals.length === 0) {
      pages.push({
        url: new URL(href, config.baseURI),
        params: {
          headers: {
            'Content-Type': 'text/html',
          },
        },
        fileUrl,
      })
      continue
    }

    /**
     * @type {UrlPart[]}
     */
    const urlParts = splitByMultipleDelimiters(href, canonicalTemplateLiterals.map(t => t.text)).map(text => {
      const templateLiteral = canonicalTemplateLiterals.find(t => t.text === text)
      if (templateLiteral) {
        return {
          type: 'dynamic',
          name: templateLiteral.text.replace(/^\${\s*/, '').replace(/\s*}$/, ''),
          value: null,
        }
      } else {
        return {
          type: 'static',
          name: text,
          value: text,
        }
      }
    })

    const context = getContexts(htmlDocument, canonical)
    const product = { fileUrl, canonical, context, config, api, eval: options.eval, allUrlParts: urlParts, urlParts: [] }
    const products = await getProducts(product, [], [...urlParts])
    for (const product of products) {
      const params = product.allUrlParts.reduce((params, part, i) => {
        if (part.type === 'dynamic') params[part.name] = product.urlParts[i]
        return params
      }, {})

      const pathname = product.urlParts.join('')
      pathname.split(/[/.#?]/g).forEach((part, i) => { params[`urlPart${i + 1}`] = part })
      pages.push({
        url: new URL(pathname, config.baseURI),
        params: {
          headers: {
            'Content-Type': 'text/html',
          },
          ...params
        },
        fileUrl,
      })
    }
  }

  if (pages.length === 0) return abort()
  return pages
}

/**
 * @typedef {object} Product
 * @property {UrlPart[]} allUrlParts - All URL parts.
 * @property {string[]} urlParts - The URL parts.
 * @property {boolean} eval - Whether to evaluate the JavaScript code.
 * @property {import('../../../src/api.mjs').API} api - The API.
 * @property {import('../../../src/config.mjs').Config} config - The configuration.
 * @property {Record<number, string>} context - The context.
 * @property {import('../parser/parse.mjs').Node} canonical - The canonical node.
 * @property {URL} fileUrl - The file URL.
 */

/**
 * Get all possible products from a list of URL parts.
 * @param {Product} product - The product.
 * @param {Product[]} products - The products.
 * @param {UrlPart[]} possibilities - The possibilities.
 * @returns {Promise<Product[]>} The products.
 */
async function getProducts (product, products, possibilities) {
  const current = possibilities.shift()
  if (!current) {
    products.push(product)
    return products
  }

  if (current.type === 'static') {
    product.urlParts.push(current.value)
    return await getProducts(product, products, possibilities)
  }

  if (current.type === 'dynamic') {
    const values = await resolveUrlPart(product, current)
    for (let i = 0; i < values.length; i++) {
      const value = values[i]

      if (i === values.length - 1) {
        product.urlParts.push(value)
        await getProducts(product, products, possibilities)
      } else {
        const newProduct = { ...product, urlParts: [...product.urlParts, value] }
        await getProducts(newProduct, products, [...possibilities])
      }
    }
  }

  return products
}

/**
 * Resolve a URL part.
 * @param {Product} product - The product.
 * @param {UrlPart} urlPart - The URL part.
 * @returns {Promise<string[]>} The values.
 */
async function resolveUrlPart (product, urlPart) {
  if (product.eval === false) return ['string']

  const params = product.allUrlParts.reduce((params, part, i) => {
    if (part.type === 'dynamic') params[part.name] = product.urlParts[i]
    return params
  }, {})
  const pathname = product.urlParts.join('') +
    product.allUrlParts.slice(product.urlParts.length).map(p => p.type === 'dynamic' ? '${' + p.name + '}' : p.value).join('')
  pathname.split(/[/.#?]/g).forEach((part, i) => { params[`urlPart${i + 1}`] = part })

  const page = {
    url: new URL(path.relative(product.config.root, url.fileURLToPath(product.fileUrl)), product.config.baseURI),
    params: {
      headers: {
        'Content-Type': 'text/html',
        'X-Partial': 'true',
      },
      ...params
    },
    fileUrl: product.fileUrl,
  }

  const worker = new Worker(page, product.config, product.api)
  await worker.start()
  const reponse = await worker.get(urlPart.name, product.context)
  const values = (Array.isArray(reponse) ? reponse : [reponse]).map(value => `${value}`)
  worker.stop()
  return values
}
