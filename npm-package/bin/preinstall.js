#!/usr/bin/env node

import * as cmd from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'

const preinstallFilename = url.fileURLToPath(import.meta.url)
const preinstallDirname = path.dirname(preinstallFilename)

const modulesDir = path.resolve(preinstallDirname, '..', 'modules')

const isUpdate = process.argv.find((a) => a === '--update-all-modules')

try {
  await main()
} catch (err) {
  console.error(err)
  process.exit(1)
}

/**
 * Install all dependencies for all modules.
 */
async function main() {
  if (!fs.existsSync(modulesDir)) return

  const install = fs.readdirSync(modulesDir, { withFileTypes: true }).map((dirent) => (dirent.isDirectory() ? installModule(path.resolve(modulesDir, dirent.name)) : null))

  await Promise.all(install)
}

/**
 * @param {string} folder - The folder whose dependencies to install.
 */
async function installModule(folder) {
  const packageJsonFile = path.resolve(folder, 'package-lock.json')
  if (!fs.existsSync(packageJsonFile)) return
  if (!isUpdate) {
    if (fs.existsSync(packageJsonFile)) cmd.execSync('npm ci || npm install', { cwd: folder, env: { ...process.env, NODE_ENV: 'production' } })
    else cmd.execSync('npm install', { cwd: folder })
  } else {
    if (fs.existsSync(packageJsonFile)) fs.unlinkSync(packageJsonFile)
    cmd.execSync('ncu -u && npm install', { cwd: folder })
  }
}
