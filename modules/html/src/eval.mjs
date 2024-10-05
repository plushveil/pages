const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

/**
 * Evaluate the given code in the given context.
 * @param {string} code - The code.
 * @param {object} context - The context.
 * @returns {Promise<string>} The result of the evaluation.
 */
export default async function (code, context) {
  const keys = Object.keys(context)
  const values = Object.values(context)
  const fn = new AsyncFunction(...keys, `return \`${code}\``)
  return fn(...values)
}

/**
 * Evaluate the given code in the given context.
 * @param {string} code - The code.
 * @param {object} context - The context.
 * @returns {Promise<string>} The result of the evaluation.
 */
export async function evaluate (code, context) {
  const keys = Object.keys(context)
  const values = Object.values(context)
  const fn = new AsyncFunction(...keys, `return ${code}`)
  return fn(...values)
}
