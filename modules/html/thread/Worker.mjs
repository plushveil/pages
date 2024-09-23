import * as path from 'node:path'
import * as url from 'node:url'
import * as threads from 'node:worker_threads'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const workerEntryFile = path.resolve(__dirname, 'entry.mjs')

/**
 * Represents a worker.
 */
export default class Worker {
  /**
   * The message ID.
   * @type {number}
   */
  messageId = 0

  /**
   * The worker.
   * @type {threads.Worker}
   */
  worker

  /**
   * The file URL.
   * @type {string}
   */
  file

  /**
   * The exit listener.
   * @type {function}
   */
  #exitListener = (exitCode) => {
    if (exitCode !== 0) {
      console.log(`Worker exited with code ${exitCode}`)
      process.exit(exitCode)
    }
  }

  /**
   * Initializes the worker.
   * @param {string} fileUrl - The file URL.
   * @param {import('../../../src/module.mjs').InitializeData} workerData - The worker data.
   */
  constructor (workerData) {
    this.file = workerData.parentURL
    this.worker = new threads.Worker(workerEntryFile, { workerData })
    this.worker.addListener('exit', this.#exitListener)
  }

  /**
   * Terminates the worker.
   * @returns {Promise<number>}
   */
  terminate () {
    this.worker.removeListener('exit', this.#exitListener)
    return this.exec('terminate', 0)
  }

  /**
   * Sends a message to the worker.
   * @param {object} message - The message.
   */
  exec (method, ...params) {
    const messageId = this.messageId++
    return new Promise((resolve, reject) => {
      const listener = ([id, responseType, ...response]) => {
        if (messageId === id) {
          this.worker.removeListener('message', listener)
          if (responseType === 'reject') {
            if (response[0]?.stack) return reject(new Error(response[0]?.stack))
            else return reject(new Error(JSON.stringify(response, null, 2) + `\n    while building ${this.file}`))
          } else {
            return resolve(...response)
          }
        }
      }
      this.worker.addListener('message', (...args) => listener(...args))
      this.worker.postMessage([messageId, method, ...params])
    })
  }
}
