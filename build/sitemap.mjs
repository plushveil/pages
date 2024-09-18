import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Generates a sitemap.
 * @param {string} filename - The filename.
 * @param {string} output - The output directory.
 * @param {string[]} files - The files.
 * @param {URL} baseURI - The base URI.
 * @returns {Promise<string>} The sitemap.
 */
export default async function sitemap (filename, output, files, baseURI) {
  const pages = (await Promise.all(files.map(async (file) => {
    if (!(file.endsWith('.html'))) return null
    const content = await fs.promises.readFile(file, { encoding: 'utf-8' })
    const match = content.match(/<meta[^>]+noindex/i)
    if (match) return null
    const url = new URL(baseURI)
    url.pathname = path.relative(output, file).replace(path.sep, '/').replace(/index\.html$/, '').replace(/\.html$/, '')
    return url.toString()
  }))).filter(Boolean)

  const content = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...pages.map((page) => `  <url><loc>${page}</loc></url>`),
    '</urlset>\n'
  ].join('\n')

  await fs.promises.writeFile(path.join(output, ...baseURI.pathname.split('/'), ...filename.split('/')), content, { encoding: 'utf-8' })
}
