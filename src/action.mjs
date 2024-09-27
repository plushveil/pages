#!/usr/bin/env node

import * as cmd from 'node:child_process'
import * as path from 'node:path'
import * as url from 'node:url'
import * as fs from 'node:fs'

import resolve from '../utils/resolve.mjs'

/** @type {import('@actions/core')} */ let core

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const __main = path.join(__dirname, 'pages.mjs')

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
    console.log(`$ npm ci --prefix modules/${module}`)
    cmd.execSync('npm ci', { cwd: path.join(__dirname, '..', 'modules', module), stdio: 'inherit' })
  }
  core = await import('@actions/core')
}

/**
 * Main action steps.
 */
async function main () {
  const folder = resolve(core.getInput('folder'), [process.cwd()])
  const config = core.getInput('config')
  cmd.execSync(`npm run pages -- build "${folder}" --config "${config}"`, { stdio: 'inherit' })
}
