import * as url from 'url'
import * as path from 'path'
import * as fs from 'fs'

import getConfig from '../../src/config.mjs'
import getApi from '../../src/api.mjs'

import { diagnose } from './html.mjs'

const filepath = path.resolve('test.html')
const [page, config, api] = await getPageConfigApi(filepath)

console.log(await diagnose(page, config, api))

/**
 * @param {string} filepath - The path to the file to diagnose
 * @returns {Promise<[import('@plushveil/pages/src/page.mjs').Page, import('@plushveil/pages/src/config.mjs').Config, import('@plushveil/pages/src/api.mjs').Api]>} - The page, config, and api
 */
async function getPageConfigApi (filepath) {
  const api = await getApi()
  const config = await getConfig()
  if (!config.root) config.root = path.dirname(filepath)
  const page = {
    url: new URL(path.relative(config.root, filepath), config.baseURI),
    params: {
      headers: {
        'Content-Type': 'text/html',
        'X-Partial': 'true',
      },
    },
    fileUrl: url.pathToFileURL(filepath),
    content: fs.readFileSync(filepath, 'utf8'),
  }

  return [page, config, api]
}
