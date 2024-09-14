import breadcrumb from './breadcrumb.js'

main()

/**
 * When the script is loaded.
 */
async function main () {
  if (isHeadReady()) onHeadReady()
  else {
    const observer = new window.MutationObserver((mutationsList, observer) => {
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.target.tagName === 'HEAD') {
          if (isHeadReady()) {
            observer.disconnect()
            onHeadReady()
            break
          }
        }
      }
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
  }

  window.addEventListener('load', onLoad)
}

/**
 * Checks if the <head> tag is ready.
 * Head tag is ready when the head is available and the last child is not the current script.
 * @returns {boolean} True if the <head> tag is ready.
 */
function isHeadReady () {
  if (!document.head) return false

  const maybeCurrentScriptSrc = document.head.lastChild?.getAttribute('src')
  if (!maybeCurrentScriptSrc) return true

  const maybeCurrentScriptUrl = new URL(maybeCurrentScriptSrc, window.location.origin)
  const currentScriptUrl = new URL(document.currentScript?.src || '', window.location.origin)
  if (maybeCurrentScriptUrl.pathname === currentScriptUrl.pathname) return false

  return true
}

/**
 * When the <head> tag is ready.
 */
async function onHeadReady () {
  redirectToTranslatedUrl()

  /**
   * Redirects to any alternate URL that matches the html lang attribute.
   * If the user just replaced the language in the URL, the page will redirect.
   * I.e.: /en/willkommen.html -> /en/welcome.html
   */
  function redirectToTranslatedUrl () {
    const lang = document.documentElement.lang
    if (!lang) return

    const alternate = document.querySelector(`link[rel="alternate"][hreflang="${lang}"]`)
    const alternateHref = alternate?.href
    const alternateUrl = alternateHref ? new URL(alternateHref) : null

    if (alternateUrl && window.location.pathname !== alternateUrl.pathname) {
      for (const [key, value] of new URLSearchParams(window.location.search)) alternateUrl.searchParams.set(key, value)
      alternateUrl.hash = window.location.hash
      window.location.replace(alternateUrl.toString())
    } else if (alternateUrl) {
      const canonical = document.querySelector('link[rel="canonical"]')
      if (canonical) {
        const canonicalUrl = new URL(canonical.href)
        if (canonicalUrl.pathname === alternateUrl.pathname) alternate.remove()
      } else {
        console.warn('The <link rel="canonical"> tag is missing.')
      }
    }
  }
}

/**
 * When the page is loaded.
 */
async function onLoad () {
  // mobile burger menu
  const burgermenu = document.getElementById('main-menu')
  if (burgermenu) {
    const button = burgermenu.querySelector('button[aria-controls="main-menu"]')
    const elements = burgermenu.querySelectorAll('*[aria-hidden="true"]')
    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') === 'true'
      button.setAttribute('aria-expanded', !expanded)
      elements.forEach((element) => {
        element.setAttribute('aria-hidden', expanded)
      })
    })
  }

  // give every heading an id
  document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
    if (heading.id) return
    let id = heading.textContent.toLowerCase()
      .replace(/[äöüß]/g, c => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[c]))
      .replace(/[^a-z0-9]+/g, '-')
    while (document.getElementById(id)) {
      if (id.match(/--\d+$/)) id = id.replace(/--\d+$/, (num) => `--${parseInt(num.slice(2)) + 1}`)
      else id += '--1'
    }
    heading.id = id
  })

  // add a listener to scroll to the element with the id in the hash
  window.addEventListener('hashchange', onHashChange)
  if (window.location.hash) onHashChange()

  // render the breadcrumb
  breadcrumb()

  /**
   * When the hash changes jump to the element with the id.
   */
  function onHashChange () {
    const element = document.getElementById(window.location.hash.slice(1))
    if (!element) return
    if (element) element.scrollIntoView()
    if (document.querySelector('header')) {
      const header = document.querySelector('header')
      const position = window.getComputedStyle(header).position
      if (position === 'fixed' || position === 'sticky') {
        const offset = parseInt(window.getComputedStyle(header).height)
        window.scrollBy(0, -offset)
      }
    }
  }
}
