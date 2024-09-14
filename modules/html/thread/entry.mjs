import * as path from 'node:path'
import * as url from 'node:url'
import * as thread from 'node:worker_threads'
import * as module from 'node:module'

import * as methods from './methods.mjs'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const moduleFile = path.resolve(__dirname, '..', '..', '..', 'src', 'module.mjs')

if (thread.isMainThread) {
  console.error('This script must be run as a worker.')
  process.exit(1)
}

await main()

/**
 * Initializes the worker.
 * @returns {Promise<void>}
 */
async function main () {
  module.register(url.pathToFileURL(moduleFile), {
    parentURL: import.meta.url,
    data: {
      arguments: thread.workerData.initializeData.arguments,
      emitSources: thread.workerData.emitSources,
      emitReferences: thread.workerData.emitReferences,
    },
    page: thread.workerData.page,
  })
  thread.parentPort.on('message', onMessage)
}

/**
 * Handles a message.
 * @param {Array} message - The message.
 */
async function onMessage ([messageId, method, ...params]) {
  if (!methods[method] || typeof methods[method] !== 'function') {
    thread.parentPort.postMessage([messageId, 'reject', new Error(`Method "${method}" not found.`)])
    return
  }

  try {
    const result = await methods[method](...params)
    thread.parentPort.postMessage([messageId, 'resolve', result])
  } catch (err) {
    thread.parentPort.postMessage([messageId, 'reject', err])
  }
}
