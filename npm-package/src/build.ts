import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as url from 'node:url'
import * as threads from 'node:worker_threads'

import discoverContexts from '../modules/html/src/discover-contexts.js'
import getConfig from './config.js'
import { pages as getPages } from './pages.js'
import * as utils from './utils.js'

const buildFilename = url.fileURLToPath(import.meta.url)
const buildDirname = path.dirname(buildFilename)
const workerEntrypoint = path.resolve(buildDirname, 'worker.js')

/**
 * Builds a folder.
 *
 * @param {string} folder - The folder to build.
 * @param {string} [config] - A specifier that points to the configuration file.
 * @param {string} [output] - The output folder.
 * @returns {Promise<string>} The output folder.
 */
export default async function build(folder, config, output) {
  const root = utils.resolve(folder, undefined, { exists: true, folder: true })

  // If no config specified, look for config in the folder being built
  if (!config) {
    const configInFolder = path.join(root, 'pages.config.js')
    if (fs.existsSync(configInFolder)) {
      config = configInFolder
    }
  }

  config = await getConfig(config)
  config.root = root
  output = getOutput(output)

  console.log(`Building ${path.relative(process.cwd(), config.root)} to ${output}`)

  // Discover contexts from HTML files before generating pages
  const allFiles = utils.getFilesInFolder(config.root)
  const htmlFiles = allFiles.filter((file) => /\.(?:page|htms|html)$/.test(file))
  const contextsMap = discoverContexts(htmlFiles, config)

  // Store discovered contexts in config for JS module to use
  // Convert Map to plain object for JSON serialization
  config.js ||= {}
  config.js['__discoveredContexts'] = Object.fromEntries(Array.from(contextsMap.entries()).map(([key, set]) => [key, Array.from(set)]))

  const pages = (
    await Promise.all(
      allFiles.map((file) => {
        if (config.build?.ignore?.some((pattern) => file.match(new RegExp(pattern)))) return []
        return getPages(file, config)
      }),
    )
  )
    .flat()
    .filter((page) => page && page.params?.headers?.['X-Partial'] !== 'true')

  // Store all pages in config for HTML reference resolution
  config['__allPages'] = pages
  const parallel = Math.min(os.cpus().length, pages.length)
  const workerPool = createBuildWorkerPool(config, parallel)
  const totalPages = pages.length

  let done = 0
  try {
    await Promise.all(
      pages.map(async (page) => {
        await renderWithWorker(workerPool, output, config, page)
        done += 1
        updateProgress(done, totalPages)
      }),
    )
  } catch (err) {
    console.log('')
    console.error(err)
    process.exit(1)
  } finally {
    await workerPool.close()
  }

  console.log('')
  if (typeof config.build?.after === 'function') await config.build.after(output, config)
  console.log(`Finished building ${done} pages`)
  return output
}

/**
 * Creates a worker pool for build rendering.
 *
 * @param {import('./config.js').Config} config - The configuration.
 * @param {number} size - The pool size.
 * @returns {{ acquire: () => Promise<threads.Worker>; release: (worker: threads.Worker) => void; close: () => Promise<void> }} The pool.
 */
function createBuildWorkerPool(config, size) {
  /**
   * @type {threads.Worker[]}
   */
  const workers = []
  const queuedResolvers = []
  const serializableConfig = getSerializableConfig(config)
  const workerUrl = url.pathToFileURL(workerEntrypoint)

  for (let i = 0; i < size; i += 1) {
    workers.push(new threads.Worker(workerUrl, { workerData: { config: JSON.stringify(serializableConfig) } }))
  }

  function release(worker) {
    const resolver = queuedResolvers.shift()
    if (resolver) {
      worker.busy = true
      resolver(worker)
      return
    }
    worker.busy = false
  }

  return {
    async acquire() {
      const freeWorker = workers.find((entry) => !entry.busy)
      if (freeWorker) {
        freeWorker.busy = true
        return freeWorker
      }

      return new Promise((resolve) => {
        queuedResolvers.push(resolve)
      })
    },
    release,
    async close() {
      await Promise.all(
        workers.map(async (worker) => {
          try {
            await worker.terminate()
          } catch {
            // ignore worker termination errors during cleanup
          }
        }),
      )
    },
  }
}

/**
 * Renders a page using a pooled worker.
 *
 * @param {{ acquire: () => Promise<threads.Worker>; release: (worker: threads.Worker) => void }} workerPool - The worker pool.
 * @param {string} output - The output folder.
 * @param {import('./config.js').Config} config - The configuration.
 * @param {import('./pages.js').Page} page - The page.
 * @returns {Promise<void>} A promise that resolves when the page has been rendered.
 */
async function renderWithWorker(workerPool, output, config, page) {
  const worker = await workerPool.acquire()
  const file = getOutputFile(output, config, page)

  await new Promise((resolve, reject) => {
    let settled = false

    const cleanup = () => {
      worker.off('message', onMessage)
      worker.off('error', onError)
      worker.off('exit', onExit)
    }

    const resolveOnce = () => {
      if (settled) return
      settled = true
      cleanup()
      workerPool.release(worker)
      resolve()
    }

    const rejectOnce = (err) => {
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    }

    const onMessage = () => resolveOnce()
    const onError = (err) => rejectOnce(err)
    const onExit = (code) => {
      if (!settled && code !== 0) rejectOnce(new Error(`Worker stopped with exit code ${code}`))
    }

    worker.on('message', onMessage)
    worker.once('error', onError)
    worker.once('exit', onExit)
    worker.postMessage(['pageToFile', JSON.stringify(page), file])
  })
}

/**
 * Returns the output file for the page.
 *
 * @param {string} output - The output folder.
 * @param {import('./config.js').Config} config - The configuration.
 * @param {import('./pages.js').Page} page - The page.
 * @returns {string} The output file.
 */
function getOutputFile(output, config, page) {
  let pathname = page.url.pathname.slice(config.baseURI.pathname.length)
  while (pathname.startsWith('/')) pathname = pathname.slice(1)
  let file = path.resolve(output, pathname)

  if (page.params?.headers?.['Content-Type'] === 'text/html') {
    if (file.endsWith('/')) file += 'index.html'
    else if (!file.split('/').pop().includes('.')) file += '/index.html'
  }

  return file
}

/**
 * Converts config into a worker-safe serializable object.
 *
 * @param {import('./config.js').Config} config - The configuration.
 * @returns {object} The serializable config.
 */
function getSerializableConfig(config) {
  return {
    ...config,
    baseURI: config.baseURI.toString(),
    fileUrl: config.fileUrl ? config.fileUrl.toString() : undefined,
    // Pass all pages for HTML reference resolution (convert URLs to strings)
    __allPages: config['__allPages']?.map((p) => ({
      ...p,
      url: p.url.toString(),
      fileUrl: p.fileUrl ? p.fileUrl.toString() : undefined,
    })),
    // Pass discovered contexts to worker so JS files can be rendered with correct variants
    js: {
      ...config.js,
      __discoveredContexts: config.js?.['__discoveredContexts'],
    },
  }
}

/**
 * Retrieves the output folder.
 *
 * @param {string} output - The output folder.
 * @returns {string} The output folder.
 */
function getOutput(output) {
  if (!output) {
    const folder = path.resolve(os.tmpdir(), 'pages')
    if (fs.existsSync(folder)) fs.rmSync(folder, { recursive: true })
    fs.mkdirSync(folder, { recursive: true })
    return folder
  }

  output = utils.resolve(output, undefined, { exists: false, folder: true })
  if (fs.existsSync(output)) fs.rmSync(output, { recursive: true })
  fs.mkdirSync(output, { recursive: true })
  return output
}

/**
 * Updates the progress bar in the console.
 *
 * @param {number} current - The current size.
 * @param {number} total - The total size.
 */
function updateProgress(current, total) {
  const barWidth = Math.min(process.stdout.columns, 120) - 20
  const progress = current / total
  const filledBarLength = Math.round(barWidth * progress)
  const emptyBarLength = barWidth - filledBarLength

  const filledBar = '█'.repeat(filledBarLength)
  const emptyBar = '░'.repeat(emptyBarLength)

  const percentage = (progress * 100).toFixed(2)

  process.stdout.clearLine?.()
  process.stdout.cursorTo?.(0)
  process.stdout.write(`Progress: [${filledBar}${emptyBar}] ${percentage}%${process.stdout.clearLine ? '' : '\n'}`)
}
