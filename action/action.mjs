import core from '@actions/core'

try {
  await main()
} catch (err) {
  console.error(err)
  core.setFailed(err.stack || err.message)
}

/**
 * Main action steps.
 */
async function main () {
  const folder = core.getInput('folder')
  const config = core.getInput('config')

  console.log(`Building ${folder}${config ? ` with ${config}` : ''}`)
}
