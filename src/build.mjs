import * as path from 'node:path'
import * as fs from 'node:fs'
import * as url from 'node:url'
import * as os from 'node:os'

import getConfig from './config.mjs'

import resolve from '../utils/resolve.mjs'
import readDir from '../utils/readDir.mjs'

/**
 * @typedef {object} BuildConfig
 * @property {string} output - The output folder.
 * @property {string[]} ignore - The ignore patterns.
 */

/**
 * Builds a folder.
 * @param {object} options - The options.
 * @param {string} options.folder - The folder to build.
 * @param {string} [options.config] - The configuration file.
 * @returns {Promise<void>} A promise that resolves when the folder is built.
 */
export default async function build (options) {
  updateProgress(0, 1)
  const start = Date.now()
  const config = await getConfig({ arguments: ['build', options.folder, options.config] })
  const folder = resolve(options.folder, [process.cwd(), path.dirname(config.file)])
  if (!folder) throw new Error(`Folder not found: "${options.folder}".`)

  // build.output
  const output = resolve(config.build?.output || './dist', [path.dirname(config.file), process.cwd(), path.dirname(config.file)], { exists: false })
  if (fs.existsSync(output)) await fs.promises.rm(output, { recursive: true })
  await fs.promises.mkdir(output, { recursive: true })

  // build.ignore
  const ignore = (config.build?.ignore || []).map((pattern) => new RegExp(pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '.*')
    .replace(/([^.])\*/g, '$1[^/]*')
  ))

  // retrieve **all** pages first
  const pages = (await Promise.all((await readDir(folder)).map(async (file) => {
    const relative = path.relative(folder, file)
    if (ignore.some((pattern) => pattern.test(`./${relative}`))) return []
    try {
      const pages = []
      const { default: render, getPages } = (await import(url.pathToFileURL(file).href))
      for (const page of await getPages()) {
        if (!page.path) continue /* skip partials */
        pages.push({
          render: async (output) => {
            const content = await render(page)
            if (!fs.existsSync(path.dirname(output))) await fs.promises.mkdir(path.dirname(output), { recursive: true })
            await fs.promises.writeFile(output, content)
          },
          output: path.join(output, ...page.path.split('/'), page.path.endsWith('/') ? 'index.html' : '')
        })
      }
      return pages
    } catch (err) {
      return [{
        output: path.join(output, relative),
        render: async (output) => {
          if (!fs.existsSync(path.dirname(output))) await fs.promises.mkdir(path.dirname(output), { recursive: true })
          await fs.promises.link(file, output)
        }
      }]
    }
  }))).flat()

  // perform build
  const chunkSize = config.build?.parallel || os.cpus().length
  const totalSize = pages.length
  let resolved = 0
  let chunk = []

  while (pages.length) {
    const { render, output } = pages.shift()
    const item = new Promise((resolve) => {
      render(output).then(() => {
        item.resolved = true
        resolved++
        resolve()
        updateProgress(resolved, totalSize)
      })
    })

    chunk.push(item)
    chunk = chunk.filter((item) => !(item.resolved))
    if (chunk.length < chunkSize && pages.length) continue

    await Promise.race(chunk)
  }
  await Promise.all(chunk)
  // process.stdout.clearLine?.()
  // process.stdout.cursorTo?.(0)
  console.log(`Built ${totalSize} pages in ${Math.ceil((Date.now() - start) / 1000)} seconds.`)

  // execute post-build script
  await config.build?.after?.(output, await readDir(output))
  return folder
}

/**
 * Updates the progress bar in the console.
 * @param {number} resolved
 * @param {number} totalSize
 */
function updateProgress (resolved, totalSize) {
  const barWidth = process.stdout.columns - 20
  const progress = resolved / totalSize
  const filledBarLength = Math.round(barWidth * progress)
  const emptyBarLength = barWidth - filledBarLength

  const filledBar = '█'.repeat(filledBarLength)
  const emptyBar = '░'.repeat(emptyBarLength)

  const percentage = (progress * 100).toFixed(2)

  process.stdout.clearLine?.()
  process.stdout.cursorTo?.(0)
  process.stdout.write(`Progress: [${filledBar}${emptyBar}] ${percentage}%${process.stdout.clearLine ? '' : '\n'}`)
}
