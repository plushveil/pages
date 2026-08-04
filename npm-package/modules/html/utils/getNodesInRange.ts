/**
 * @typedef {{
 *   source: import('../parser/iterator.js').Node[]
 *   starts: number[]
 *   entries: { node: import('../parser/iterator.js').Node; index: number; start: number; end: number }[]
 * }} NodesInRangeContext
 */

/**
 * Creates a lookup context for fast repeated range lookups over a stable node list.
 *
 * @param {import('../parser/iterator.js').Node[]} nodes - The nodes.
 * @returns {NodesInRangeContext} A reusable lookup context.
 */
export function createNodesInRangeContext(nodes) {
  const entries = nodes.map((node, index) => ({ node, index, start: node.offset.start, end: node.offset.end })).sort((a, b) => a.start - b.start || a.index - b.index)

  return {
    source: nodes,
    starts: entries.map((entry) => entry.start),
    entries,
  }
}

/**
 * Returns an array of nodes that are within the range of the start and end index.
 *
 * @param {number} start - The start index.
 * @param {number} end - The end index.
 * @param {import('../parser/iterator.js').Node[]} nodes - The nodes.
 * @param {NodesInRangeContext} [context] - Optional precomputed lookup context.
 * @returns {import('../parser/iterator.js').Node[]} The nodes in the range.
 */
export default function getNodesInRange(start, end, nodes, context) {
  if (!context || context.source !== nodes) {
    return nodes.filter((node) => node.offset.start >= start && node.offset.end <= end)
  }

  const index = findFirstStartAtOrAfter(context.starts, start)
  const matched = []

  for (let i = index; i < context.entries.length; i += 1) {
    const entry = context.entries[i]
    if (entry.start > end) break
    if (entry.end <= end) matched.push(entry)
  }

  if (matched.length > 1) matched.sort((a, b) => a.index - b.index)
  return matched.map((entry) => entry.node)
}

/**
 * Binary search for the first index where value >= target.
 *
 * @param {number[]} values - Sorted values.
 * @param {number} target - Target value.
 * @returns {number} First matching index or values.length.
 */
function findFirstStartAtOrAfter(values, target) {
  let low = 0
  let high = values.length

  while (low < high) {
    const mid = low + ((high - low) >> 1)
    if (values[mid] < target) low = mid + 1
    else high = mid
  }

  return low
}
