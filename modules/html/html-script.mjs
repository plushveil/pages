/* global __dirname, __module */

/**
 * Evaluate a string of code in a new async function, in the context of a HTML page.
 * @param {string} code - The code to evaluate.
 * @param {object} context - The variables to expose to the code.
 * @returns {Promise<any>} The result of the evaluation.
 */
export default async function (code, context = {}) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  const body = `return ${code}`
  context = { ...context }
  delete context.default
  const fn = new AsyncFunction(...Object.keys(context), body)

  const threads = (await import('worker_threads'))
  const emitSources = threads.workerData?.emitSources
  if (emitSources) {
    const path = (await import('node:path'))
    const extractSources = (await import(path.resolve(__module, 'src', 'extractSources.mjs'))).default
    const sources = await extractSources(code)
    for (const source of sources) {
      if (!source || typeof source !== 'string' || !(source.startsWith('.'))) continue
      threads.parentPort.postMessage([null, 'source', path.resolve(__dirname, ...source.split('/'))])
    }
  }

  return await fn(...Object.values(context))
}
