#!/usr/bin/env node

import * as path from 'node:path'
import * as fs from 'node:fs'
import * as url from 'node:url'
import * as cmd from 'node:child_process'

const __filename = await fs.promises.realpath(url.fileURLToPath(import.meta.url))
const __dirname = path.dirname(__filename)
const __root = path.resolve(__dirname, '..')

await main()

async function main () {
  const directories = [__root]
  const modulesPath = path.resolve(__root, 'modules')
  for (const moduleName of fs.readdirSync(modulesPath, { withFileTypes: true })) {
    if (!moduleName.isDirectory()) continue
    const modulePath = path.resolve(modulesPath, moduleName.name)
    if (!fs.existsSync(path.join(modulePath, 'package.json'))) continue
    directories.push(modulePath)
  }

  for (const dir of directories) {
    await updateNodeModules(dir)
  }
}

async function updateNodeModules (cwd) {
  if (fs.existsSync(path.join(cwd, 'package-lock.json'))) fs.unlinkSync(path.join(cwd, 'package-lock.json'))
  if (fs.existsSync(path.join(cwd, 'node_modules'))) fs.rmSync(path.join(cwd, 'node_modules'), { recursive: true, force: true })
  cmd.execSync('npx npm-check-updates -u && npm install', { cwd, stdio: 'inherit' })
}
