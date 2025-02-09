import * as fs from 'node:fs'
import * as url from 'node:url'
import * as path from 'node:path'
import * as module from 'node:module'

import { render } from '../../../src/pages.mjs'

import getExports from '../utils/getExports.mjs'

const __filename = url.fileURLToPath(import.meta.url.slice(0, import.meta.url.lastIndexOf('#')))
const __dirname = path.dirname(__filename)

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

const scripts = {}

/**
 * Render a nested HTML page.
 * @param {Record<string, string>} params - The parameters.
 * @param {import('../../../src/pages.mjs').Page} parentPage - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @returns {Promise<string>} The rendered page.
 */
export default async function (params = {}, parentPage, config) {
  const type = path.extname(__filename).slice(1)
  const content = await fs.promises.readFile(__filename, 'utf8')
  const page = { ...parentPage, content }
  page.params = { ...(page.params || {}), ...params }
  page.params.headers = { ...(page.params.headers || {}) }
  page.params.headers['X-Partial'] = 'true'
  page.params.headers['X-Partial-File'] = __filename
  return render(page, config, 'utf-8', type)
}

/**
 * Execute a code in a given context.
 * @param {string} code - The code.
 * @param {string[]} context - The context.
 * @returns {Promise<string|string[]>} The result.
 */
export function get (code, context) {
  const ctx = { __dirname, __filename }

  context = Object.entries(context).map(([index, code]) => {
    scripts[`${__filename}#${index}`] = code
    const exports = getExports(code).filter(exp => !(['default'].includes(exp)))
    if (exports.length === 0) return null
    return { index, code, exports }
  }).filter(Boolean)

  const imported = []
  const imports = context.map(({ index, exports }) => {
    exports = exports.filter(exp => !imported.includes(exp))
    imported.push(...exports)
    return `const { ${exports.join(', ')} } = await import('${__filename}#${index}')`
  }).join('\n')

  const f = new AsyncFunction(...Object.keys(ctx), imports + '\n\nreturn ' + code)
  return f(...Object.values(ctx))
}

/**
 *
 */
module.registerHooks({
  resolve (specifier, context, nextResolve) {
    if (specifier in scripts) {
      const fileUrl = url.pathToFileURL(specifier).toString()
      return { format: 'script', url: fileUrl, shortCircuit: true }
    } else {
      return nextResolve(specifier, context)
    }
  },
  load (fileUrl, context, nextLoad) {
    if (context.format === 'script') {
      const file = url.fileURLToPath(fileUrl)
      const source = scripts[file]
      return { format: 'module', source, shortCircuit: true }
    }

    return nextLoad(fileUrl, context)
  }
})
