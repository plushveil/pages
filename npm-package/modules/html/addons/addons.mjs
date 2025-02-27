import * as path from 'node:path'
import * as url from 'node:url'

import parse from '../parser/parse.mjs'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const activeAddons = [
  'event-emitter',
  'canonical-url',
  'minify-inline',
  'references-to-url',
  'template-literals',
  'import-page',
  'import-html',
  'minify'
]

/**
 * Execute all addons for the given config.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 * @returns {Promise<Array<import('../parser/iterator.mjs').Node>>} The iterator.
 */
export default async function executeAddons (page, config, api) {
  const htmlDocument = parse(page.content || page.params?.__filename ? url.pathToFileURL(page.params.__filename).toString() : page.fileUrl.toString())
  const iterator = htmlDocument.iterator()
  const addons = await Promise.all(activeAddons.map(addonName => import(url.pathToFileURL(path.join(__dirname, addonName + '.mjs')).href)))

  // uniquely identify the execution across all addons and stages
  const id = `${Date.now()}-${Math.random()}`
  htmlDocument.getId = () => id

  await Promise.all(addons.map(addon => addon.beforeAsync?.(iterator, htmlDocument, page, config, api)))
  for (const addon of addons) await addon.before?.(iterator, htmlDocument, page, config, api)

  await Promise.all(iterator.map(node => Promise.all(addons.map(addon => addon.forEachAsync?.(node, iterator, htmlDocument, page, config, api)))))
  for (const node of iterator) for (const addon of addons) await addon.forEach?.(node, iterator, htmlDocument, page, config, api)

  await Promise.all(addons.map(addon => addon.afterAsync?.(iterator, htmlDocument, page, config, api)))
  for (const addon of addons) await addon.after?.(iterator, htmlDocument, page, config, api)

  return iterator
}
