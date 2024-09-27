import * as fs from 'fs'

import core from '@actions/core'
import { build } from './pages.mjs'

try {
  await main()
} catch (err) {
  console.error(err)
  core.setFailed(err.stack || err.message)
  process.exit(1)
}

/**
 * Main action steps.
 */
async function main () {
  const folder = core.getInput('folder')
  const config = core.getInput('config')

  console.log(`Building ${folder}${config ? ` with ${config}` : ''}`)
  const output = await build(folder, config)
  fs.writeFileSync(process.env.GITHUB_OUTPUT, `folder=${output}\n`)
}
