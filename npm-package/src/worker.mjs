import * as fs from 'node:fs'
import * as path from 'node:path'
import * as threads from 'node:worker_threads'

import { render } from './pages.mjs'

const config = JSON.parse(threads.workerData.config)
config.baseURI = new URL(config.baseURI)

threads.parentPort.on('message', async ([task, ...args]) => {
  if (task === 'pageToFile') return pageToFile(...args)
  if (task === 'pipe') return pipe(...args)
})

/**
 * Renders a page to a file.
 * @param {import('./pages.mjs').Page} page - The page.
 * @param {string} file - The file.
 * @returns {Promise} A promise that resolves when the page has been rendered.
 */
async function pageToFile (page, file) {
  page = JSON.parse(page)
  page.url = new URL(page.url)
  page.fileUrl = new URL(page.fileUrl)

  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })

    const content = await render(page, config)
    if (content instanceof fs.ReadStream) {
      const stream = fs.createWriteStream(file)
      content.pipe(stream)
      await new Promise((resolve, reject) => { stream.on('finish', resolve); stream.on('error', reject) })
    } else fs.writeFileSync(file, content)

    threads.parentPort.postMessage(file)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

/**
 * Pipes the rendered content to the main thread.
 * @param {import('./pages.mjs').Page} page - The page.
 */
async function pipe (page) {
  page = JSON.parse(page)
  page.url = new URL(page.url)
  page.fileUrl = new URL(page.fileUrl)

  try {
    const content = await render(page, config)
    if (content instanceof fs.ReadStream) {
      threads.parentPort.postMessage(['stream', page.fileUrl.toString()])
      content.close()
    } else {
      threads.parentPort.postMessage(['content', content])
    }
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}
