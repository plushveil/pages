/**
 * @template Node, ElementNode extends Node
 * @implements {import('css-select').Adapter<Node, ElementNode>}
 */
export default class CSSSelectAdapter {
  /**
   * The HTML text document
   *
   * @type {import('vscode-languageserver-textdocument').TextDocument}
   */
  #textDocument

  /**
   * Creates a new CSSSelectAdapter instance
   *
   * @param {import('vscode-languageserver-textdocument').TextDocument} textDocument - The text document
   * @param {import('vscode-html-languageservice').HTMLDocument} htmlDocument - The HTML document
   */
  constructor(textDocument, _htmlDocument) {
    this.#textDocument = textDocument
  }

  /**
   * Is the node a tag?
   *
   * @param {import('vscode-html-languageservice').Node} node
   * @returns {node is import('vscode-html-languageservice').Node}
   */
  isTag(node) {
    return typeof node.tag === 'string' && node.tag.length > 0
  }

  /**
   * Does at least one of passed element nodes pass the test predicate?
   *
   * @param {import('css-select').Predicate<import('vscode-html-languageservice').Node>} test
   * @param {import('vscode-html-languageservice').Node[]} elems
   * @returns {boolean}
   */
  existsOne(test, elems) {
    return elems.some(test)
  }

  /**
   * Get the attribute value.
   *
   * @param {import('vscode-html-languageservice').Node} elem
   * @param {string} name
   * @returns {string | undefined}
   */
  getAttributeValue(elem, name) {
    return elem.attributes?.[name]?.replace(/^['"]|['"]$/g, '')
  }

  /**
   * Get the node's children
   *
   * @param {import('vscode-html-languageservice').Node} node
   * @returns {import('vscode-html-languageservice').Node[]}
   */
  getChildren(node) {
    return node.children || []
  }

  /**
   * Get the name of the tag
   *
   * @param {import('vscode-html-languageservice').Node} elem
   * @returns {string}
   */
  getName(elem) {
    return elem.tag
  }

  /**
   * Get the parent of the node
   *
   * @param {import('vscode-html-languageservice').Node} elem
   * @returns {import('vscode-html-languageservice').Node | null}
   */
  getParent(elem) {
    return elem.parent || null
  }

  /**
   * Get the siblings of the node. Note that unlike jQuery's `siblings` method,
   * this is expected to include the current node as well
   *
   * @param {import('vscode-html-languageservice').Node} node
   * @returns {import('vscode-html-languageservice').Node[]}
   */
  getSiblings(node) {
    return node.parent?.children || []
  }

  /**
   * Get the text content of the node, and its children if it has any.
   *
   * @param {import('vscode-html-languageservice').Node} node
   * @returns {string}
   */
  getText(node) {
    return this.#textDocument.getText({
      start: this.#textDocument.positionAt(node.startTagEnd),
      end: this.#textDocument.positionAt(node.endTagStart),
    })
  }

  /**
   * Does the element have the named attribute?
   *
   * @param {import('vscode-html-languageservice').Node} elem
   * @param {string} name
   * @returns {boolean}
   */
  hasAttrib(elem, name) {
    return Boolean(elem.attributes && name in elem.attributes)
  }

  /**
   * Takes an array of nodes, and removes any duplicates, as well as any
   * nodes whose ancestors are also in the array.
   *
   * @param {import('vscode-html-languageservice').Node[]} nodes
   * @returns {import('vscode-html-languageservice').Node[]}
   */
  removeSubsets(nodes) {
    /**
     * @param {import('vscode-html-languageservice').Node} node
     * @param {import('vscode-html-languageservice').Node} other
     * @returns {boolean}
     */
    function contains(node, other) {
      return node.start <= other.start && node.end >= other.end
    }

    return nodes.filter((node, i) => !nodes.some((other, j) => i !== j && contains(node, other)))
  }

  /**
   * Finds all of the element nodes in the array that match the test predicate,
   * as well as any of their children that match it.
   *
   * @param {function(import('vscode-html-languageservice').Node): boolean} test
   * @param {import('vscode-html-languageservice').Node[]} nodes
   * @returns {import('vscode-html-languageservice').Node[]}
   */
  findAll(test, nodes) {
    const matches = []
    if (!nodes || nodes.length === 0) return matches
    for (const node of nodes) {
      if (test(node)) matches.push(node)
      matches.push(...this.findAll(test, node.children))
    }
    return matches
  }

  /**
   * Finds the first node in the array that matches the test predicate, or one
   * of its children.
   *
   * @param {function(import('vscode-html-languageservice').Node): boolean} test
   * @param {import('vscode-html-languageservice').Node[]} elems
   * @returns {import('vscode-html-languageservice').Node | null}
   */
  findOne(test, elems) {
    for (const node of elems) {
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
   *
   * @param {import('vscode-html-languageservice').Node} a
   * @param {import('vscode-html-languageservice').Node} b
   * @returns {boolean}
   */
  equals(a, b) {
    return a === b
  }

  /**
   * Is the element in hovered state?
   *
   * @param {import('vscode-html-languageservice').Node} elem
   * @returns {boolean}
   */
  isHovered(_elem) {
    return false
  }

  /**
   * Is the element in visited state?
   *
   * @param {import('vscode-html-languageservice').Node} node - The element node
   * @returns {boolean} Whether the element is visited
   */
  /**
   * @param {import('vscode-html-languageservice').Node} elem
   * @returns {boolean}
   */
  isVisited(_elem) {
    return false
  }

  /**
   * Is the element in active state?
   *
   * @param {import('vscode-html-languageservice').Node} elem
   * @returns {boolean}
   */
  isActive(_elem) {
    return false
  }
}
