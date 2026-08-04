/**
 * Returns an array of nodes that are within the range of the start and end index
 *
 * @param {number} start - The start index
 * @param {number} end - The end index
 * @param {import('../parser/iterator.js').Node[]} nodes - The nodes
 * @returns {import('../parser/iterator.js').Node[]} - The nodes in the range
 */
export default function getNodesInRange(start, end, nodes) {
  return nodes.filter((node) => node.offset.start >= start && node.offset.end <= end)
}
