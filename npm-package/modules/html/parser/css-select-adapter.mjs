export default class CSSSelectAdapter {
  /**
   * The HTML text document
   * @type {import('vscode-languageserver-textdocument').TextDocument}
   */
  #textDocument

  /**
   * The HTML document
   * @type {import('vscode-html-languageservice').HTMLDocument}
   */
  #htmlDocument

  /**
   * Creates a new CSSSelectAdapter instance
   * @param {import('vscode-languageserver-textdocument').TextDocument} textDocument - The text document
   * @param {import('vscode-html-languageservice').HTMLDocument} htmlDocument - The HTML document
   */
  constructor (textDocument, htmlDocument) {
    this.#textDocument = textDocument
    this.#htmlDocument = htmlDocument
  }

  /**
   * Is the node a tag?
   * @param {import('vscode-html-languageservice').Node} node - The node to check
   * @returns {boolean} Whether the node is a tag
   */
  isTag (node) {
    if (node.start === 0) return false
    return true
  }

  /**
   * Does at least one of passed element nodes pass the test predicate?
   * @param {import('css-select').Predicate<import('vscode-html-languageservice').Node>} test - The test predicate
   * @param {import('vscode-html-languageservice').Node[]} nodes - The element nodes to test
   * @returns {boolean} Whether at least one of the element nodes passes the test
   */
  existsOne (test, nodes) {
    return nodes.some(test)
  }

  /**
   * Get the attribute value.
   * @param {import('vscode-html-languageservice').Node} node - The element node
   * @param {string} name - The attribute name
   * @returns {string|undefined} The attribute value
   */
  getAttributeValue (node, name) {
    return node.attributes[name]?.replace(/^['"]|['"]$/g, '')
  }

  /**
   * Get the node's children
   * @param {import('vscode-html-languageservice').Node} node - The node
   * @returns {import('vscode-html-languageservice').Node[]} The children
   */
  getChildren (node) {
    return node.children || []
  }

  /**
   * Get the name of the tag
   * @param {import('vscode-html-languageservice').Node} node - The element node
   * @returns {string} The tag name
   */
  getName (node) {
    return node.tag
  }

  /**
   * Get the parent of the node
   * @param {import('vscode-html-languageservice').Node} node - The node
   * @returns {import('vscode-html-languageservice').Node|null} The parent node, or null if there is none
   */
  getParent (node) {
    return node.parent || null
  }

  /**
   * Get the siblings of the node. Note that unlike jQuery's `siblings` method,
   * this is expected to include the current node as well
   * @param {import('vscode-html-languageservice').Node} node - The node
   * @returns {import('vscode-html-languageservice').Node[]} The siblings
   */
  getSiblings (node) {
    return node.parent.children
  }

  /**
   * Get the text content of the node, and its children if it has any.
   * @param {import('vscode-html-languageservice').Node} node - The node
   * @returns {string} The text content
   */
  getText (node) {
    return this.#textDocument.getText({
      start: this.#textDocument.positionAt(node.startTagEnd),
      end: this.#textDocument.positionAt(node.endTagStart)
    })
  }

  /**
   * Does the element have the named attribute?
   * @param {import('vscode-html-languageservice').Node} node - The element node
   * @param {string} name - The attribute name
   * @returns {boolean} Whether the element has the attribute
   */
  hasAttrib (node, name) {
    if (!node.attributes) return false
    return name in node.attributes
  }

  /**
   * Takes an array of nodes, and removes any duplicates, as well as any
   * nodes whose ancestors are also in the array.
   * @param {import('vscode-html-languageservice').Node[]} nodes - The nodes to filter
   * @returns {import('vscode-html-languageservice').Node[]} The filtered nodes
   */
  removeSubsets (nodes) {
    /**
     * Does the first node contain the second node?
     * @param {import('vscode-html-languageservice').Node} node - The first node
     * @param {import('vscode-html-languageservice').Node} other - The second node
     * @returns {boolean} Whether the first node contains the second node
     */
    function contains (node, other) { return node.start <= other.start && node.end >= other.end }
    return nodes.filter((node, i) => {
      return !nodes.some((other, j) => i !== j && contains(node, other))
    })
  }

  /**
   * Finds all of the element nodes in the array that match the test predicate,
   * as well as any of their children that match it.
   * @param {import('css-select').Predicate<import('vscode-html-languageservice').Node>} test - The test predicate
   * @param {import('vscode-html-languageservice').Node[]} nodes - The nodes to search
   * @returns {import('vscode-html-languageservice').Node[]} The matching element nodes
   */
  findAll (test, nodes) {
    const matches = []
    if (nodes.length === 0) return matches
    nodes.forEach(node => {
      if (test(node)) matches.push(node)
      matches.push(...this.findAll(test, node.children))
    })
    return matches
  }

  /**
   * Finds the first node in the array that matches the test predicate, or one
   * of its children.
   * @param {import('css-select').Predicate<import('vscode-html-languageservice').Node>} test - The test predicate
   * @param {import('vscode-html-languageservice').Node[]} nodes - The nodes to search
   * @returns {import('vscode-html-languageservice').Node|null} The first matching element node, or null if none match
   */
  findOne (test, nodes) {
    for (const node of nodes) {
      if (test(node)) return node
      const child = this.findOne(test, node.children)
      if (child) return child
    }
    return null
  }

  /**
   * The adapter can also optionally include an equals method, if your DOM
   * structure needs a custom equality test to compare two objects which refer
   * to the same underlying node. If not provided, `css-select` will fall back to
   * `a === b`.
   * @param {import('vscode-html-languageservice').Node} a - The first node
   * @param {import('vscode-html-languageservice').Node} b - The second node
   * @returns {boolean} Whether the nodes are equal
   */
  equals (a, b) {
    return a === b
  }

  /**
   * Is the element in hovered state?
   * @param {import('vscode-html-languageservice').Node} node - The element node
   * @returns {boolean} Whether the element is hovered
   */
  isHovered (node) {
    return false
  }

  /**
   * Is the element in visited state?
   * @param {import('vscode-html-languageservice').Node} node - The element node
   * @returns {boolean} Whether the element is visited
   */
  isVisited (node) {
    return false
  }

  /**
   * Is the element in active state?
   * @param {import('vscode-html-languageservice').Node} node - The element node
   * @returns {boolean} Whether the element is active
   */
  isActive (node) {
    return false
  }
}
