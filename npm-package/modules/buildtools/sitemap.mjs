import * as fs from 'node:fs'
import * as path from 'node:path'

import * as utils from '../../src/utils.mjs'

/**
 * Generates a sitemap.
 * @param {string} filename - The filename.
 * @param {string} output - The output directory.
 * @param {import('../../src/config.mjs').Config} config - The configuration.
 * @returns {Promise<string>} The sitemap.
 */
export default async function sitemap (filename, output, config) {
  const files = utils.getFilesInFolder(output)

  const pages = (await Promise.all(files.map(async (file) => {
    if (!(file.endsWith('.html'))) return null
    const content = await fs.promises.readFile(file, { encoding: 'utf-8' })
    const match = content.match(/<meta[^>]+noindex/i)
    if (match) return null
    const url = new URL(path.relative(output, file).replace(path.sep, '/').replace(/index\.html$/, '').replace(/\.html$/, ''), config.baseURI)
    return url.toString()
  }))).filter(Boolean)

  const content = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...pages.map((page) => `  <url><loc>${page}</loc></url>`),
    '</urlset>\n'
  ].join('\n')

  await fs.promises.writeFile(path.resolve(output, ...filename.split('/')), content, { encoding: 'utf-8' })
}
