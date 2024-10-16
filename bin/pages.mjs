#!/usr/bin/env node

import * as path from 'node:path'
import * as fs from 'node:fs'
import * as url from 'node:url'

import * as cli from '@plushveil/cli_from_jsdoc'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

try {
  await main(__dirname)
} catch (err) {
  console.log(`> pages ${process.argv.slice(2).join(' ')}`)
  console.error(err)
  process.exit(1)
}

/**
 * Looks for a package.json in the given directory and generates a CLI based on the JSDoc comments in the `main` file.
 * @param {string} cwd - The directory to search for a package.json file.
 * @returns {Promise<any>} - The result of the CLI execution.
 */
export default async function main (cwd = process.cwd()) {
  cwd = path.resolve(cwd)

  if (!fs.existsSync(cwd)) throw new Error(`Directory not found: ${cwd}`)
  if (!fs.statSync(cwd).isDirectory()) throw new Error(`Not a directory: ${cwd}`)
  if (!fs.existsSync(path.join(cwd, 'package.json'))) throw new Error(`No package.json found in ${cwd}`)

  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), { encoding: 'utf-8' }))
  if (!pkg.main) throw new Error(`No "main" file specified in ${path.join(cwd, 'package.json')}`)
  const userProvidedFile = path.resolve(cwd, ...pkg.main.split('/'))

  return await cli.execute(await cli.parse(userProvidedFile), process.argv.slice(2))
}
