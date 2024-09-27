import core from '@actions/core'
import { build } from '../src/pages.mjs'

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
  core.setOutput('folder', output)
}
