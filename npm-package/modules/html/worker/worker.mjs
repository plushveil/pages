import * as threads from 'node:worker_threads'
import * as module from 'node:module'

import * as fs from 'node:fs'
import * as url from 'node:url'
import * as path from 'node:path'

import pageFromObj from '../utils/pageFromObj.mjs'

import * as workerApi from './workerApi.mjs'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const loaders = {
  html: {
    file: path.join(__dirname, 'loadHTML.mjs'),
    content: await fs.promises.readFile(path.join(__dirname, 'loadHTML.mjs'), 'utf8')
  }
}

const response = await new Promise(resolve => {
  threads.parentPort.once('message', async (message) => {
    const { page, config, api } = JSON.parse(message)
    if (!page) throw new Error('No page')
    if (!config) throw new Error('No config')
    if (!api) throw new Error('No api')
    resolve({ page, config, api })
  })
})

/**
 * @type {import('../../../src/pages.mjs').Page}
 */
const page = pageFromObj(response.page)

/**
 * @type {import('../../../src/config.mjs').Config}
 */
const config = response.config

/**
 * @type {import('../../../src/api.mjs').API}
 */
const api = response.api

/**
 *
 */
module.registerHooks({
  /**
   * @param {string} specifier The specifier.
   * @param {{ conditions: string[], importAttributes: Record<string, string>, parentURL: string}} context The context.
   * @param {(specifier: string, context: { conditions: string[], importAttributes: Record<string, string>, parentURL: string }) => Promise<any>} nextResolve The next resolve function.
   * @returns {{ format: string, importAttributes: Record<string, string>, url: string, shortCircuit: boolean }} The URL.
   */
  resolve (specifier, context, nextResolve) {
    const resolve = (specifier) => {
      if (specifier.match(/^[a-zA-Z]+:\/\//)) {
        const file = url.fileURLToPath(specifier)
        if (!fs.existsSync(file)) throw new Error(`File from fileUrl not found: ${file}`)
        return specifier
      }
      const dirs = [path.dirname(url.fileURLToPath(context.parentURL)), config.root, process.cwd()].filter(Boolean)
      for (const dir of dirs) {
        const file = path.resolve(dir, ...(specifier.split('/')))
        if (fs.existsSync(file)) return url.pathToFileURL(file).toString()
      }
      throw new Error(`File not found: ${specifier}`)
    }

    for (const ext of Object.keys(loaders)) {
      if (specifier.endsWith('.' + ext)) {
        const fileUrl = resolve(specifier)
        if (!fileUrl) continue
        return {
          format: ext,
          url: fileUrl + `#${Date.now()}${Math.random()}`,
          shortCircuit: true
        }
      }
    }
    return nextResolve(specifier, context)
  },
  /**
   * @param {string} fileUrl The URL.
   * @param {{ conditions: string[], format: string, importAttributes: Record<string, string>}} context The context.
   * @param {(url: string, context: { conditions: string[], format: string, importAttributes: Record<string, string> }) => Promise<any>} nextLoad The next load function.
   * @returns {{ format: string, shortCircuit: boolean, source: string }} The source.
   */
  load (fileUrl, context, nextLoad) {
    for (const [ext, loader] of Object.entries(loaders)) {
      if (context.format === ext) {
        const source = loader.content
          .replace(/'\.{1,2}\/[^']*'/g, (match) => {
            const file = match.slice(1, -1)
            const fileUrl = url.pathToFileURL(path.join(path.dirname(loader.file), file)).toString()
            return `'${fileUrl}'`
          })
        return {
          format: 'module',
          source,
          shortCircuit: true
        }
      }
    }

    return nextLoad(fileUrl, context)
  }
})

/**
 * Handle messages.
 */
threads.parentPort.on('message', async ([messageId, ...message]) => {
  const task = message.shift()
  if (!workerApi[task]) threads.parentPort.postMessage([messageId, 'reject', `No task: ${task}`])
  else {
    try {
      const result = await workerApi[task](page, config, api, ...message)
      threads.parentPort.postMessage([messageId, 'resolve', result])
    } catch (err) {
      const message = err.stack || err.toString() || err.message
      threads.parentPort.postMessage([messageId, 'reject', message])
    }
  }
})
threads.parentPort.postMessage('ready')
