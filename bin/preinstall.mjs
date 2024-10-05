#!/usr/bin/env node

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as cmd from 'node:child_process'

const __filename = path.resolve(new URL(import.meta.url).pathname)
const __dirname = path.dirname(__filename)

const __modules = path.resolve(__dirname, '..', 'modules')

try {
  await main()
} catch (err) {
  console.error(err)
  process.exit(1)
}

/**
 * Install all dependencies for all modules.
 */
async function main () {
  if (!fs.existsSync(__modules)) return

  const install = fs.readdirSync(__modules, { withFileTypes: true }).map((dirent) => {
    return dirent.isDirectory() ? installModule(path.resolve(__modules, dirent.name)) : null
  })

  await Promise.all(install)
}

/**
 * @param {string} folder - The folder whose dependencies to install.
 */
async function installModule (folder) {
  if (!fs.existsSync(path.resolve(folder, 'package.json'))) return
  if (fs.existsSync(path.resolve(folder, 'package-lock.json'))) cmd.execSync('npm ci', { cwd: folder })
  else cmd.execSync('npm install', { cwd: folder })
}
