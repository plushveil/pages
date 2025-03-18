import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'

import translations from '../translations.mjs'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * @typedef {Object} Article
 * @property {string} pathname - The pathname of the article.
 * @property {string} lang - The language of the article.
 * @property {string} title - The title of the article.
 * @property {string} file - The file path of the article.
 * @property {string} [href] - The URL of the article.
 */

const articles = (await recursiveReadDir(__dirname)).map(file => {
  if (!file.endsWith('.html')) return
  const pathname = file.replace(__dirname, '').replaceAll(path.sep, '/').replace(/\.html$/, '').replace(/^\/+/g, '')
  const lang = pathname.split('/')[0] || 'en'
  const text = translations[lang]?.[pathname.split('/').pop()]
  const title = text?.title || (() => {
    const content = fs.readFileSync(file, 'utf8')
    return content.match(/<h\d>(.*?)<\/h\d>/)?.[1]
  })()
  return { pathname, lang, title, text, file: path.relative(path.resolve(__dirname, '..'), file) }
}).filter(Boolean)

/**
 * @type {Article[]}
 */
export default articles

const articleTranslations = {
  en: {
    examples: articles.find(article => article.pathname === 'en/examples'),
    essentials: articles.find(article => article.pathname === 'en/essentials'),
    gettingstarted: articles.find(article => article.pathname === 'en/getting-started'),
    impressum: articles.find(article => article.pathname === 'en/impressum'),
    policy: articles.find(article => article.pathname === 'en/privacy-policy'),
    terms: articles.find(article => article.pathname === 'en/terms-of-service'),
  }
}

/**
 * Get all articles in a specific language with their url.
 * @param {string} lang - The language to get the articles for.
 * @param {URL} baseURI - The base URI to resolve the article paths.
 * @param {URL} currentURL - The current URL to resolve the article paths.
 * @returns {Record<string, { pathname: string, title: string, href: string }>}
 */
export function getArticleTranslations (lang, baseURI, currentURL) {
  const translations = articleTranslations[lang] || {}
  return Object.fromEntries(Object.entries(translations).map(([key, article]) => {
    article.href = new URL(article.pathname, baseURI).href
    if (currentURL === article.href) article.active = true
    return [key, article]
  }))
}

/**
 * Get alternate translations of an article.
 * @param {Article} article - The article to get the translations for.
 * @param {URL} baseURI - The base URI to resolve the article paths.
 * @returns {Article[]}
 */
export function getTranslationsOfArticle (article, baseURI) {
  if (!article) return []

  const keys = []
  for (const lang in articleTranslations) {
    const translations = articleTranslations[lang]
    for (const key in translations) {
      if (translations[key] === article) keys.push(key)
    }
  }
  if (keys.length === 0) return []

  const alternates = []
  for (const lang in articleTranslations) {
    for (const key in articleTranslations[lang]) {
      if (!(keys.includes(key))) continue
      const altarticle = articleTranslations[lang][key]
      if (altarticle === article) continue
      altarticle.href = new URL(altarticle.pathname, baseURI).href
      alternates.push(altarticle)
    }
  }

  return alternates.filter((article, index, self) => self.findIndex(a => a === article) === index)
}

/**
 * Read all files in a directory recursively.
 * @param {string} dir - The directory to read.
 * @returns {Promise<string[]>}
 */
async function recursiveReadDir (dir) {
  const files = await fs.promises.readdir(dir)
  const result = await Promise.all(files.map(async file => {
    const filePath = path.join(dir, file)
    const stats = await fs.promises.stat(filePath)
    if (stats.isDirectory()) return recursiveReadDir(filePath)
    else if (stats.isFile()) return filePath
  }))
  return result.flat()
}
