import * as url from 'node:url'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as cmd from 'node:child_process'

import getConfig from '../../src/config.mjs'

/** @type {import('./src/extractSources.mjs').default} */ let extractSources
/** @type {import('node-html-parser').parse} */ let parseHTML

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * @typedef {object} HTMLConfig
 * @property {object} references - The references configuration.
 * @property {boolean} references.resolve - Whether to resolve references.
 * @property {object} js - The JavaScript configuration.
 * @property {boolean} js.minify - Whether to minify the JavaScript.
 * @property {string} js.integrity - Whether to add integrity attributes.
 * @property {object} css - The CSS configuration.
 * @property {boolean} css.minify - Whether to minify the CSS.
 * @property {string} css.integrity - Whether to add integrity attributes.
 * @property {import('./node_modules/html-minifier-terser/cli.js').mainOptions} minify - The HTML minify options.
 */

/**
 * The worker data.
 * @type {object}
 * @property {import('../../src/module.mjs').InitializeData} InitializeData - The initialize data.
 */
const workerData = {}

/**
 * Initializes the module.
 * @param {import('../../src/module.mjs').InitializeData} data - The import options.
 */
export async function initialize (data) {
  workerData.initializeData = data
  const config = await getConfig(data)
  workerData.baseURI = config.baseURI

  if (!fs.existsSync(path.resolve(__dirname, 'node_modules'))) {
    cmd.execSync('npm install', { cwd: __dirname, stdio: 'ignore' })
  }
  parseHTML = (await import('node-html-parser')).parse
  extractSources = (await import('./src/extractSources.mjs')).default

  // inline scripts depend on the js module
  if (!fs.existsSync(path.resolve(__dirname, '..', 'js', 'node_modules'))) {
    cmd.execSync('npm install', { cwd: path.resolve(__dirname, '..', 'js'), stdio: 'ignore' })
  }
}

/**
 * Resolves the specifier.
 * @param {string} specifier - The string passed to the import statement.
 * @param {import('../../src/module.mjs').ResolveContext} context - Context information.
 * @param {function} nextResolve - The subsequent resolve hook in the chain
 * @returns {import('../../src/module.mjs').ResolveSpecifierResult}
 */
export async function resolve (specifier, context, nextResolve) {
  if (!specifier) return

  const specifierUrl = specifier.includes('://') ? new URL(specifier) : new URL(specifier, 'file://')
  if (specifierUrl.pathname.endsWith('.html')) {
    if (typeof context.format === 'undefined' || context.format === 'html') {
      return {
        format: 'html',
        url: specifierUrl.toString(),
        shortCircuit: true,
      }
    } else if (context.format === 'html-pages') {
      return {
        format: 'html-pages',
        url: specifierUrl.toString(),
        shortCircuit: true,
      }
    } else if (context.format === 'html-script') {
      return {
        format: 'html-script',
        url: specifierUrl.toString(),
        shortCircuit: true,
      }
    }
  }
}

/**
 * Loads the content.
 * @param {string} fileUrl - The URL returned by the resolve chain.
 * @param {import('../../src/module.mjs').LoadContext} context - Context information.
 * @param {function} nextLoad - The subsequent load hook in the chain
 * @returns {import('../../src/module.mjs').LoadUrlResult}
 */
export async function load (fileUrl, context, nextLoad) {
  if (context.format === 'html') {
    return {
      source: [
        `import * as html from '${url.pathToFileURL(path.resolve(__dirname, 'html-api.mjs')).href}'`,
        `const fileUrl = '${fileUrl}'`,
        `const workerData = ${JSON.stringify(workerData)}`,
        'export default async function (...args) { return html.default(fileUrl, workerData, ...args) }',
        'export async function render (...args) { return html.render(fileUrl, workerData, ...args) }',
        'export async function getPages () { return html.getPages(fileUrl, workerData) }',
      ].join('\n'),
      format: 'module',
      shortCircuit: true,
    }
  } else if (context.format === 'html-pages') {
    return {
      source: [
        `import pages from '${url.pathToFileURL(path.resolve(__dirname, 'html-pages.mjs')).href}'`,
        `export default await pages('${fileUrl}', new URL('${workerData.baseURI.toString()}'))`,
      ].join('\n'),
      format: 'module',
      shortCircuit: true,
    }
  } else if (context.format === 'html-script') {
    fileUrl = new URL(fileUrl)
    const filepath = url.fileURLToPath(fileUrl)
    const index = parseInt(fileUrl.searchParams.get('index'))
    const source = (await fs.promises.readFile(path.resolve(__dirname, 'html-script.mjs'), { encoding: 'utf8' }))
      .replaceAll('__module', `'${__dirname}'`)
      .replaceAll('__dirname', `'${path.dirname(filepath)}'`)

    if (index === -1) {
      return {
        source,
        format: 'module',
        shortCircuit: true,
      }
    }

    const root = parseHTML(await fs.promises.readFile(filepath, { encoding: 'utf8' }))
    const scriptTag = root.childNodes[index]
    if (scriptTag?.tagName?.toUpperCase?.() !== 'SCRIPT') return

    const emitSources = []
    if (workerData.initializeData.emitSources) {
      for (const source of await extractSources(scriptTag.textContent)) {
        if (!source || typeof source !== 'string' || !(source.startsWith('.'))) continue
        const sourcepath = path.resolve(path.dirname(filepath), ...source.split('/'))
        emitSources.push(`(await import('worker_threads')).parentPort.postMessage([null, 'source', '${sourcepath}'])`)
      }
    }

    return {
      source: [
        scriptTag.textContent,
        source,
        emitSources,
      ].join('\n'),
      format: 'module',
      shortCircuit: true,
    }
  }
}
