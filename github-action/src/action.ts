import core from '@actions/core'

type BuildFn = (folder?: string, config?: string, output?: string) => Promise<string>

try {
  await main()
} catch (err: unknown) {
  console.error(err)
  if (err instanceof Error) {
    core.setFailed(err.stack || err.message)
  } else {
    core.setFailed(String(err))
  }
  process.exit(1)
}

/**
 * Main action steps.
 */
async function main() {
  const folder = core.getInput('folder') || undefined
  const config = core.getInput('config') || undefined
  const { build } = (await import('../../npm-package/dist/src/pages.js')) as { build: BuildFn }

  const output = await build(folder, config)
  core.setOutput('folder', output)
}
