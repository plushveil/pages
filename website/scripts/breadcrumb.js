const renderBreadcrumbDebounced = debounce(renderBreadcrumb, 100)

/**
 * Observes the visibility of h1-h6 elements and updates the breadcrumb navigation.
 */
export default function main () {
  const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6')
  const observer = new window.IntersectionObserver(onVisibilityChange)
  headings.forEach(el => observer.observe(el))

  renderBreadcrumbLanguageSelection()
}

/**
 * Renders the breadcrumb.
 * @param {window.HTMLElement[]} elements - Elements to render.
 */
function renderBreadcrumb (elements) {
  const context = document.querySelector('header')
  const breadcrumb = context.querySelector('nav[aria-label="breadcrumb"]')
  const list = breadcrumb.querySelector('ol')

  // remove all children except the language selection
  for (let i = list.children.length - 1; i >= 1; i--) list.children[i].remove()

  /**
   * Find parent a tag.
   * @param {window.HTMLElement} element - Element to find parent a tag.
   * @returns {window.HTMLElement} Parent a tag
   */
  function findParentA (element) {
    if (element.tagName === 'A') return element
    return element.parentElement ? findParentA(element.parentElement) : null
  }

  // add new children
  const template = context.querySelector('template')
  elements.forEach((element, index) => {
    const clone = template.content.cloneNode(true)
    const a = clone.querySelector('a')
    const existingAnchor = element.querySelector('a') || findParentA(element)

    a.textContent = element.textContent

    if (existingAnchor && existingAnchor.href) {
      a.href = existingAnchor.href
      if (existingAnchor.getAttribute('target')) a.setAttribute('target', existingAnchor.getAttribute('target'))
      if (existingAnchor.getAttribute('rel')) a.setAttribute('rel', existingAnchor.getAttribute('rel'))
      if (existingAnchor.getAttribute('title')) a.setAttribute('title', existingAnchor.getAttribute('title'))
    } else {
      a.href = `#${element.id}`
    }

    list.appendChild(clone)
  })
}

/**
 * Renders the breadcrumb language selection.
 */
function renderBreadcrumbLanguageSelection () {
  const context = document.querySelector('header')
  const breadcrumb = context.querySelector('nav[aria-label="breadcrumb"]')
  breadcrumb.querySelector('select').addEventListener('change', (event) => {
    const langCode = event.target.value
    const newUrl = window.location.href.split('/').map((part, index) => index === 3 ? langCode : part).join('/')
    if (newUrl !== window.location.href) window.location.href = newUrl
  })
}

/**
 * Gets all previous headers of an element.
 * @param {window.HTMLElement} element - Element to get all previous headers.
 * @returns {window.HTMLElement[]} All previous headers.
 */
function getAllPreviousHeaders (element) {
  const allHeadings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]
  const headings = allHeadings.slice(0, allHeadings.indexOf(element) + 1)

  let currentTree = []
  let lastLevel = 0
  headings.forEach(heading => {
    const level = parseInt(heading.tagName[1])
    if (level > lastLevel) {
      currentTree.push(heading)
    } else if (level < lastLevel) {
      currentTree = [...currentTree]
      while (currentTree.length > 0) {
        const previousLevel = parseInt(currentTree[currentTree.length - 1].tagName[1])
        if (previousLevel >= level) currentTree.pop()
        else break
      }
      currentTree.push(heading)
    } else {
      currentTree.pop()
      currentTree.push(heading)
    }
    lastLevel = level
  })

  return currentTree
}

/**
 * Is called when the visibility of an h1-h6 element changes.
 * @param {window.IntersectionObserverEntry[]} entries - Entries.
 */
function onVisibilityChange (entries) {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      renderBreadcrumbDebounced(getAllPreviousHeaders(entry.target))
    }
  })
}

/**
 * Debounces a function.
 * @param {Function} fn - Function to debounce.
 * @param {number} delay - Delay in milliseconds.
 * @returns {Function} Debounced function.
 */
function debounce (fn, delay) {
  let timeout
  return function (...args) {
    clearTimeout(timeout)
    timeout = setTimeout(() => fn(...args), delay)
  }
}
