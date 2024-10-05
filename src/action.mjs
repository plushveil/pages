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
  const folder = core.getInput('folder') || undefined
  const config = core.getInput('config') || undefined

  const output = await build(folder, config)
  core.setOutput('folder', output)
}
