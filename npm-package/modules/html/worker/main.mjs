import * as url from 'node:url'
import * as path from 'node:path'
import * as threads from 'node:worker_threads'

import * as workerApi from './workerApi.mjs'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const __worker = path.join(__dirname, 'worker.mjs')

export default class Worker {
  /**
   * @type {number}
   */
  #messageId = 1

  /**
   * @type {threads.Worker}
   */
  worker

  /**
   * Start the worker.
   * @param {import('../../../src/pages.mjs').Page} page - The page.
   * @param {import('../../../src/config.mjs').Config} config - The configuration.
   * @param {import('../../../src/api.mjs').API} api - The API.
   */
  constructor (page, config, api) {
    this.page = page
    this.config = config
    this.api = api
  }

  /**
   * Start the worker
   * @returns {Promise<void>} A promise that resolves when the worker has started.
   */
  async start () {
    if (!threads.isMainThread) return
    this.worker = new threads.Worker(__worker)
    const message = JSON.stringify({ page: this.page, config: this.config, api: this.api })
    this.worker.postMessage(message)
    await new Promise(resolve => { this.worker.once('message', (message) => message === 'ready' && resolve()) })
  }

  /**
   * Stop the worker.
   */
  stop () {
    this.worker?.terminate()
  }

  /**
   * Send a message to the worker.
   * @param {string} task The task.
   * @param {any[]} args The arguments.
   * @returns {Promise<any>} The result.
   */
  #send (task, args) {
    const id = this.#messageId++

    if (!this.worker) {
      const page = { ...this.page, params: { ...(this.page.params || {}) } }
      page.params.headers = { ...(page.params.headers || {}) }
      page.params.headers['X-Partial'] = 'true'
      return workerApi[task](page, this.config, this.api, ...args)
    }

    return new Promise((resolve, reject) => {
      const callback = ([messageId, responseType, response]) => {
        if (messageId !== id) return
        this.worker.off('message', callback)
        if (responseType === 'resolve') resolve(response)
        else reject(new Error(response))
      }

      this.worker.on('message', callback)
      this.worker.postMessage([id, task, ...args])
    })
  }

  /**
   * Get a JS value from the worker.
   * @param {string} code - The code.
   * @param {string[]} [contextCode] - The context code.
   * @returns {Promise<any>} The JS value.
   */
  get (code, contextCode) {
    return this.#send('get', [code, contextCode])
  }
}
