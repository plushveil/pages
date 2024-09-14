import nodeTypes from 'node-html-parser/dist/nodes/type.js'

/**
 * Returns all script tags that are targeting the given element.
 * @param {HTMLElement} root - The root element.
 * @param {HTMLElement} element - The target element.
 * @returns {HTMLElement[]} A list of script tags.
 */
export default function getScriptTagsForElement (root, element) {
  const scriptTags = root.childNodes.filter((node) => {
    if (node.nodeType !== nodeTypes.default.ELEMENT_NODE) return false
    if (node.tagName?.toUpperCase() !== 'SCRIPT') return false
    if (!node.hasAttribute('target')) return false
    return true
  })

  const scripts = []
  for (const script of scriptTags) {
    const targets = root.querySelectorAll(script.getAttribute('target'))
    for (const target of targets) {
      if (contains(target, element)) {
        scripts.push(script)
        break
      }
    }
  }

  return scripts
}

/**
 * Checks if a node contains an element.
 * @param {HTMLElement} node - The node.
 * @param {HTMLElement} element - The element.
 * @returns {boolean} `true` if the node contains the element, otherwise `false`.
 */
function contains (node, element) {
  if (node === element) return true
  for (const child of node.childNodes) {
    if (contains(child, element)) return true
  }
  return false
}
