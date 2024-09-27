#!/usr/bin/env node

import * as cmd from 'node:child_process'
import * as path from 'node:path'
import * as url from 'node:url'
import * as fs from 'node:fs'

/** @type {import('@actions/core')} */ let core
/** @type {import('./pages.mjs').build} */ let build

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

try {
  await pre()
  await main()
} catch (err) {
  console.error(err)
  core?.setFailed(err.stack || err.message)
  process.exit(1)
}

/**
 * Pre-action steps.
 */
async function pre () {
  cmd.execSync('npm ci', { cwd: __dirname, stdio: 'inherit' })
  for (const module of fs.readdirSync(path.join(__dirname, '..', 'modules'))) {
    cmd.execSync('npm ci', { cwd: path.join(__dirname, '..', 'modules', module), stdio: 'inherit' })
  }
  core = await import('@actions/core')
  build = (await import('./pages.mjs')).build
}

/**
 * Main action steps.
 */
async function main () {
  const folder = core.getInput('folder')
  const config = core.getInput('config')
  const output = await build(folder, config)
  core.setOutput('folder', output)
}
