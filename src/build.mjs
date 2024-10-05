import * as os from 'node:os'
import * as threads from 'node:worker_threads'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as url from 'node:url'

import getConfig from './config.mjs'
import * as utils from './utils.mjs'
import { pages as getPages } from './pages.mjs'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const __worker = path.resolve(__dirname, 'worker.mjs')

/**
 * Builds a folder.
 * @param {string} folder - The folder to build.
 * @param {string} [config] - A specifier that points to the configuration file.
 * @param {string} [output] - The output folder.
 * @returns {Promise<string>} The output folder.
 */
export default async function build (folder, config, output) {
  config = await getConfig(config)
  config.root = utils.resolve(folder, undefined, { exists: true, folder: true })
  output = getOutput(output)

  console.log(`Building ${path.relative(process.cwd(), config.root)} to ${output}`)
  const pages = (await Promise.all(utils.getFilesInFolder(config.root).map(file => getPages(file, config)))).flat()
    .filter(page => page && (page.params?.headers?.['X-Partial'] !== 'true'))
  const parallel = Math.min(os.cpus().length, pages.length)

  let done = 0
  let inProgress = []
  while (pages.length || inProgress.length) {
    const page = pages.shift()
    if (page) {
      const promise = render(output, config, page).finally(() => { promise.done = true }).catch((err) => {
        console.error(err)
        process.exit(1)
      })
      inProgress.push(promise)
    }

    inProgress = inProgress.filter(promise => !(promise.done))
    if (inProgress.length < parallel && pages.length) continue
    if (!inProgress.length) break
    await Promise.race(inProgress)
    done += 1
    updateProgress(done, pages.length + done)
  }

  console.log(`\nFinished building ${done} pages`)
  return output
}

/**
 * Renders a page.
 * @param {string} output - The output folder.
 * @param {import('./config.mjs').Config} config - The configuration.
 * @param {import('./pages.mjs').Page} page - The page.
 * @returns {Promise} A promise that resolves when the page has been rendered.
 */
function render (output, config, page) {
  let file = path.resolve(output, page.url.pathname.slice(1))
  if (file.endsWith('/')) file += 'index.html'
  if (!file.includes('.')) file += '.html'

  return new Promise((resolve, reject) => {
    let done = false
    const cb = (fn) => (...args) => (done) ? null : (() => { done = true; return fn(...args) })()
    const worker = new threads.Worker(url.pathToFileURL(__worker), { workerData: { config: JSON.stringify(config) } })
    worker.on('message', cb(message => { resolve(message); worker.terminate() }))
    worker.on('error', cb(err => worker.terminate() || reject(err)))
    worker.on('exit', cb(code => reject(new Error(`Worker stopped with exit code ${code}`))))
    worker.postMessage(['pageToFile', JSON.stringify(page), file])
  })
}

/**
 * Retrieves the output folder.
 * @param {string} output - The output folder.
 * @returns {string} The output folder.
 */
function getOutput (output) {
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
 * @param {number} current - The current size.
 * @param {number} total - The total size.
 */
function updateProgress (current, total) {
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
