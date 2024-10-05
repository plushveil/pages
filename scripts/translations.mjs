import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const translationsFolder = path.resolve(__dirname, '..', 'translations')

/**
 * Get a list of available languages.
 * @returns {Promise<string[]>} List of available languages.
 */
export async function getLanguages () {
  return fs.readdirSync(translationsFolder)
    .filter(file => file.endsWith('.json'))
    .map(file => file.slice(0, -5))
}

/**
 * Get a language object.
 * @param {string} language - Language to get.
 * @returns {Promise<Record<string, string>>} Language object.
 */
export async function getLanguage (language) {
  const file = path.resolve(translationsFolder, `${language}.json`)
  if (!fs.existsSync(file)) throw new Error(`Language ${language} not found`)
  return JSON.parse(fs.readFileSync(file))
}
