import * as module from 'node:module'
import * as path from 'node:path'
import * as url from 'node:url'

import getHtmlDocument from '../utils/getHtmlDocument.js'
import { load as commonJsLoad } from './common-js.js'

const addonsFilename = url.fileURLToPath(import.meta.url)
const addonsDirname = path.dirname(addonsFilename)

const activeAddons = ['event-emitter', 'canonical-url', 'minify-inline', 'references-to-url', 'template-literals', 'import-page', 'import-html', 'minify', 'integrity', 'components']

module.registerHooks({
  load: commonJsLoad,
})

/**
 * Execute all addons for the given config.
 *
 * @param {import('../../../src/pages.js').Page} page - The page.
 * @param {import('../../../src/config.js').Config} config - The configuration.
 * @param {import('../../../src/api.js').API} api - The API.
 * @returns {Promise<import('../parser/iterator.js').Node[]>} The iterator.
 */
export default async function executeAddons(page, config, api) {
  const htmlDocument = getHtmlDocument(page)
  const iterator = htmlDocument.iterator()
  const addons = await Promise.all(activeAddons.map((addonName) => import(url.pathToFileURL(path.join(addonsDirname, `${addonName}.js`)).href)))

  // uniquely identify the execution across all addons and stages
  const id = `${Date.now()}-${Math.random()}`
  htmlDocument.getId = () => id

  await Promise.all(addons.map((addon) => addon.beforeAsync?.(iterator, htmlDocument, page, config, api)))
  for (const addon of addons) await addon.before?.(iterator, htmlDocument, page, config, api)

  await Promise.all(iterator.map((node) => Promise.all(addons.map((addon) => addon.forEachAsync?.(node, iterator, htmlDocument, page, config, api)))))
  for (const node of iterator) for (const addon of addons) await addon.forEach?.(node, iterator, htmlDocument, page, config, api)

  await Promise.all(addons.map((addon) => addon.afterAsync?.(iterator, htmlDocument, page, config, api)))
  for (const addon of addons) await addon.after?.(iterator, htmlDocument, page, config, api)

  return iterator
}
