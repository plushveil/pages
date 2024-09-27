import * as cmd from 'node:child_process'

import core from '@actions/core'

try {
  await main()
} catch (err) {
  console.error(err)
  core.setFailed(err.message)
  process.exit(1)
}

/**
 * Main action steps.
 */
async function main () {
  console.log('done.')

  // echo current working directory
  console.log(cmd.execSync('pwd').toString())
}
