{
  "version": 3,
  "sources": ["website/scripts/utils/breadcrumb.js", "website/scripts/core.js"],
  "sourcesContent": ["/**\n * Current last breadcrumb heading.\n * @type {window.HTMLElement}\n */\nlet current = null\n\n/**\n * Observes the visibility of h1-h6 elements and updates the breadcrumb navigation.\n */\nexport default function main () {\n  renderBreadcrumbLanguageSelection()\n  window.addEventListener('scroll', onscroll)\n  onscroll()\n}\n\n/**\n * When the page is scrolled.\n */\nfunction onscroll () {\n  const readHeadings = []\n  for (const heading of document.querySelectorAll('h1, h2, h3, h4, h5, h6')) {\n    const rect = heading.getBoundingClientRect()\n    if (rect.top < window.innerHeight * 0.3) readHeadings.push(heading)\n    else break\n  }\n\n  if (current === readHeadings[readHeadings.length - 1]) return\n  current = readHeadings[readHeadings.length - 1]\n  renderBreadcrumb(getAllPreviousHeaders(current))\n}\n\n/**\n * Renders the breadcrumb.\n * @param {window.HTMLElement[]} elements - Elements to render.\n */\nfunction renderBreadcrumb (elements) {\n  const context = document.querySelector('header')\n  const breadcrumb = context.querySelector('nav[aria-label=\"breadcrumb\"]')\n  const list = breadcrumb.querySelector('ol')\n\n  // remove all children except the language selection\n  for (let i = list.children.length - 1; i >= 1; i--) list.children[i].remove()\n\n  /**\n   * Find parent a tag.\n   * @param {window.HTMLElement} element - Element to find parent a tag.\n   * @returns {window.HTMLElement} Parent a tag\n   */\n  function findParentA (element) {\n    if (element.tagName === 'A') return element\n    return element.parentElement ? findParentA(element.parentElement) : null\n  }\n\n  // add new children\n  const template = context.querySelector('template')\n  elements.forEach((element, index) => {\n    const clone = template.content.cloneNode(true)\n    const a = clone.querySelector('a')\n    const existingAnchor = element.querySelector('a') || findParentA(element)\n\n    a.textContent = element.textContent\n\n    if (existingAnchor && existingAnchor.href) {\n      a.href = existingAnchor.href\n      if (existingAnchor.getAttribute('target')) a.setAttribute('target', existingAnchor.getAttribute('target'))\n      if (existingAnchor.getAttribute('rel')) a.setAttribute('rel', existingAnchor.getAttribute('rel'))\n      if (existingAnchor.getAttribute('title')) a.setAttribute('title', existingAnchor.getAttribute('title'))\n    } else {\n      a.href = `#${element.id}`\n    }\n\n    list.appendChild(clone)\n  })\n}\n\n/**\n * Renders the breadcrumb language selection.\n */\nfunction renderBreadcrumbLanguageSelection () {\n  const context = document.querySelector('header')\n  const breadcrumb = context.querySelector('nav[aria-label=\"breadcrumb\"]')\n  breadcrumb.querySelector('select').addEventListener('change', (event) => {\n    const alternate = document.querySelector(`link[rel=\"alternate\"][hreflang=\"${event.target.value}\"]`)?.getAttribute('href')\n    if (alternate && alternate !== window.location.href) window.location.href = alternate\n  })\n}\n\n/**\n * Gets all previous headers of an element.\n * @param {window.HTMLElement} element - Element to get all previous headers.\n * @returns {window.HTMLElement[]} All previous headers.\n */\nfunction getAllPreviousHeaders (element) {\n  const allHeadings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]\n  const headings = allHeadings.slice(0, allHeadings.indexOf(element) + 1)\n\n  let currentTree = []\n  let lastLevel = 0\n  headings.forEach(heading => {\n    const level = parseInt(heading.tagName[1])\n    if (level > lastLevel) {\n      currentTree.push(heading)\n    } else if (level < lastLevel) {\n      currentTree = [...currentTree]\n      while (currentTree.length > 0) {\n        const previousLevel = parseInt(currentTree[currentTree.length - 1].tagName[1])\n        if (previousLevel >= level) currentTree.pop()\n        else break\n      }\n      currentTree.push(heading)\n    } else {\n      currentTree.pop()\n      currentTree.push(heading)\n    }\n    lastLevel = level\n  })\n\n  return currentTree\n}\n", "import breadcrumb from './utils/breadcrumb.js'\n\nmain()\n\n/**\n * When the script is loaded.\n */\nasync function main () {\n  if (isHeadReady()) onHeadReady()\n  else {\n    const observer = new window.MutationObserver((mutationsList, observer) => {\n      for (const mutation of mutationsList) {\n        if (mutation.type === 'childList' && mutation.target.tagName === 'HEAD') {\n          if (isHeadReady()) {\n            observer.disconnect()\n            onHeadReady()\n            break\n          }\n        }\n      }\n    })\n    observer.observe(document.documentElement, { childList: true, subtree: true })\n  }\n\n  window.addEventListener('load', onLoad)\n}\n\n/**\n * Checks if the <head> tag is ready.\n * Head tag is ready when the head is available and the last child is not the current script.\n * @returns {boolean} True if the <head> tag is ready.\n */\nfunction isHeadReady () {\n  if (!document.head) return false\n\n  const maybeCurrentScriptSrc = document.head.lastChild?.getAttribute('src')\n  if (!maybeCurrentScriptSrc) return true\n\n  const maybeCurrentScriptUrl = new URL(maybeCurrentScriptSrc, window.location.origin)\n  const currentScriptUrl = new URL(document.currentScript?.src || '', window.location.origin)\n  if (maybeCurrentScriptUrl.pathname === currentScriptUrl.pathname) return false\n\n  return true\n}\n\n/**\n * When the <head> tag is ready.\n */\nasync function onHeadReady () {\n  redirectToTranslatedUrl()\n\n  /**\n   * Redirects to any alternate URL that matches the html lang attribute.\n   * If the user just replaced the language in the URL, the page will redirect.\n   * I.e.: /en/willkommen.html -> /en/welcome.html\n   */\n  function redirectToTranslatedUrl () {\n    const lang = document.documentElement.lang\n    if (!lang) return\n\n    const alternate = document.querySelector(`link[rel=\"alternate\"][hreflang=\"${lang}\"]`)\n    const alternateHref = alternate?.href\n    const alternateUrl = alternateHref ? new URL(alternateHref) : null\n\n    if (alternateUrl && window.location.pathname !== alternateUrl.pathname) {\n      for (const [key, value] of new URLSearchParams(window.location.search)) alternateUrl.searchParams.set(key, value)\n      alternateUrl.hash = window.location.hash\n      window.location.replace(alternateUrl.toString())\n    } else if (alternateUrl) {\n      const canonical = document.querySelector('link[rel=\"canonical\"]')\n      if (canonical) {\n        const canonicalUrl = new URL(canonical.href)\n        if (canonicalUrl.pathname === alternateUrl.pathname) alternate.remove()\n      } else {\n        console.warn('The <link rel=\"canonical\"> tag is missing.')\n      }\n    }\n  }\n}\n\n/**\n * When the page is loaded.\n */\nasync function onLoad () {\n  // mobile burger menu\n  const burgermenu = document.getElementById('main-menu')\n  if (burgermenu) {\n    const button = burgermenu.querySelector('button[aria-controls=\"main-menu\"]')\n    const elements = burgermenu.querySelectorAll('*[aria-hidden=\"true\"]')\n    button.addEventListener('click', () => {\n      const expanded = button.getAttribute('aria-expanded') === 'true'\n      button.setAttribute('aria-expanded', !expanded)\n      elements.forEach((element) => {\n        element.setAttribute('aria-hidden', expanded)\n      })\n    })\n  }\n\n  // give every heading an id\n  document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {\n    if (heading.id) return\n    let id = heading.textContent.toLowerCase()\n      .replace(/[\u00E4\u00F6\u00FC\u00DF]/g, c => ({ \u00E4: 'ae', \u00F6: 'oe', \u00FC: 'ue', \u00DF: 'ss' }[c]))\n      .replace(/[^a-z0-9]+/g, '-')\n    while (document.getElementById(id)) {\n      if (id.match(/--\\d+$/)) id = id.replace(/--\\d+$/, (num) => `--${parseInt(num.slice(2)) + 1}`)\n      else id += '--1'\n    }\n    heading.id = id\n  })\n\n  // add a listener to scroll to the element with the id in the hash\n  window.addEventListener('hashchange', onHashChange)\n  if (window.location.hash) onHashChange()\n\n  // render the breadcrumb\n  breadcrumb()\n\n  /**\n   * When the hash changes jump to the element with the id.\n   */\n  function onHashChange () {\n    const element = document.getElementById(window.location.hash.slice(1))\n    if (!element) return\n    if (element) element.scrollIntoView()\n    if (document.querySelector('header')) {\n      const header = document.querySelector('header')\n      const position = window.getComputedStyle(header).position\n      if (position === 'fixed' || position === 'sticky') {\n        const offset = parseInt(window.getComputedStyle(header).height)\n        window.scrollBy(0, -offset)\n      }\n    }\n  }\n}\n"],
  "mappings": "MAIA,IAAIA,EAAU,KAKC,SAARC,GAAyB,CAC9BC,EAAkC,EAClC,OAAO,iBAAiB,SAAUC,CAAQ,EAC1CA,EAAS,CACX,CAKA,SAASA,GAAY,CACnB,IAAMC,EAAe,CAAC,EACtB,QAAWC,KAAW,SAAS,iBAAiB,wBAAwB,EAEtE,GADaA,EAAQ,sBAAsB,EAClC,IAAM,OAAO,YAAc,GAAKD,EAAa,KAAKC,CAAO,MAC7D,OAGHL,IAAYI,EAAaA,EAAa,OAAS,CAAC,IACpDJ,EAAUI,EAAaA,EAAa,OAAS,CAAC,EAC9CE,EAAiBC,EAAsBP,CAAO,CAAC,EACjD,CAMA,SAASM,EAAkBE,EAAU,CACnC,IAAMC,EAAU,SAAS,cAAc,QAAQ,EAEzCC,EADaD,EAAQ,cAAc,8BAA8B,EAC/C,cAAc,IAAI,EAG1C,QAASE,EAAID,EAAK,SAAS,OAAS,EAAGC,GAAK,EAAGA,IAAKD,EAAK,SAASC,CAAC,EAAE,OAAO,EAO5E,SAASC,EAAaC,EAAS,CAC7B,OAAIA,EAAQ,UAAY,IAAYA,EAC7BA,EAAQ,cAAgBD,EAAYC,EAAQ,aAAa,EAAI,IACtE,CAGA,IAAMC,EAAWL,EAAQ,cAAc,UAAU,EACjDD,EAAS,QAAQ,CAACK,EAASE,IAAU,CACnC,IAAMC,EAAQF,EAAS,QAAQ,UAAU,EAAI,EACvCG,EAAID,EAAM,cAAc,GAAG,EAC3BE,EAAiBL,EAAQ,cAAc,GAAG,GAAKD,EAAYC,CAAO,EAExEI,EAAE,YAAcJ,EAAQ,YAEpBK,GAAkBA,EAAe,MACnCD,EAAE,KAAOC,EAAe,KACpBA,EAAe,aAAa,QAAQ,GAAGD,EAAE,aAAa,SAAUC,EAAe,aAAa,QAAQ,CAAC,EACrGA,EAAe,aAAa,KAAK,GAAGD,EAAE,aAAa,MAAOC,EAAe,aAAa,KAAK,CAAC,EAC5FA,EAAe,aAAa,OAAO,GAAGD,EAAE,aAAa,QAASC,EAAe,aAAa,OAAO,CAAC,GAEtGD,EAAE,KAAO,IAAIJ,EAAQ,EAAE,GAGzBH,EAAK,YAAYM,CAAK,CACxB,CAAC,CACH,CAKA,SAASd,GAAqC,CAC5B,SAAS,cAAc,QAAQ,EACpB,cAAc,8BAA8B,EAC5D,cAAc,QAAQ,EAAE,iBAAiB,SAAWiB,GAAU,CACvE,IAAMC,EAAY,SAAS,cAAc,mCAAmCD,EAAM,OAAO,KAAK,IAAI,GAAG,aAAa,MAAM,EACpHC,GAAaA,IAAc,OAAO,SAAS,OAAM,OAAO,SAAS,KAAOA,EAC9E,CAAC,CACH,CAOA,SAASb,EAAuBM,EAAS,CACvC,IAAMQ,EAAc,CAAC,GAAG,SAAS,iBAAiB,wBAAwB,CAAC,EACrEC,EAAWD,EAAY,MAAM,EAAGA,EAAY,QAAQR,CAAO,EAAI,CAAC,EAElEU,EAAc,CAAC,EACfC,EAAY,EAChB,OAAAF,EAAS,QAAQjB,GAAW,CAC1B,IAAMoB,EAAQ,SAASpB,EAAQ,QAAQ,CAAC,CAAC,EACzC,GAAIoB,EAAQD,EACVD,EAAY,KAAKlB,CAAO,UACfoB,EAAQD,EAAW,CAE5B,IADAD,EAAc,CAAC,GAAGA,CAAW,EACtBA,EAAY,OAAS,GACJ,SAASA,EAAYA,EAAY,OAAS,CAAC,EAAE,QAAQ,CAAC,CAAC,GACxDE,GAAOF,EAAY,IAAI,EAG9CA,EAAY,KAAKlB,CAAO,CAC1B,MACEkB,EAAY,IAAI,EAChBA,EAAY,KAAKlB,CAAO,EAE1BmB,EAAYC,CACd,CAAC,EAEMF,CACT,CCpHAG,EAAK,EAKL,eAAeA,GAAQ,CACjBC,EAAY,EAAGC,EAAY,EAEZ,IAAI,OAAO,iBAAiB,CAACC,EAAeC,IAAa,CACxE,QAAWC,KAAYF,EACrB,GAAIE,EAAS,OAAS,aAAeA,EAAS,OAAO,UAAY,QAC3DJ,EAAY,EAAG,CACjBG,EAAS,WAAW,EACpBF,EAAY,EACZ,KACF,CAGN,CAAC,EACQ,QAAQ,SAAS,gBAAiB,CAAE,UAAW,GAAM,QAAS,EAAK,CAAC,EAG/E,OAAO,iBAAiB,OAAQI,CAAM,CACxC,CAOA,SAASL,GAAe,CACtB,GAAI,CAAC,SAAS,KAAM,MAAO,GAE3B,IAAMM,EAAwB,SAAS,KAAK,WAAW,aAAa,KAAK,EACzE,GAAI,CAACA,EAAuB,MAAO,GAEnC,IAAMC,EAAwB,IAAI,IAAID,EAAuB,OAAO,SAAS,MAAM,EAC7EE,EAAmB,IAAI,IAAI,SAAS,eAAe,KAAO,GAAI,OAAO,SAAS,MAAM,EAC1F,OAAID,EAAsB,WAAaC,EAAiB,QAG1D,CAKA,eAAeP,GAAe,CAC5BQ,EAAwB,EAOxB,SAASA,GAA2B,CAClC,IAAMC,EAAO,SAAS,gBAAgB,KACtC,GAAI,CAACA,EAAM,OAEX,IAAMC,EAAY,SAAS,cAAc,mCAAmCD,CAAI,IAAI,EAC9EE,EAAgBD,GAAW,KAC3BE,EAAeD,EAAgB,IAAI,IAAIA,CAAa,EAAI,KAE9D,GAAIC,GAAgB,OAAO,SAAS,WAAaA,EAAa,SAAU,CACtE,OAAW,CAACC,EAAKC,CAAK,IAAK,IAAI,gBAAgB,OAAO,SAAS,MAAM,EAAGF,EAAa,aAAa,IAAIC,EAAKC,CAAK,EAChHF,EAAa,KAAO,OAAO,SAAS,KACpC,OAAO,SAAS,QAAQA,EAAa,SAAS,CAAC,CACjD,SAAWA,EAAc,CACvB,IAAMG,EAAY,SAAS,cAAc,uBAAuB,EAC5DA,EACmB,IAAI,IAAIA,EAAU,IAAI,EAC1B,WAAaH,EAAa,UAAUF,EAAU,OAAO,EAEtE,QAAQ,KAAK,4CAA4C,CAE7D,CACF,CACF,CAKA,eAAeN,GAAU,CAEvB,IAAMY,EAAa,SAAS,eAAe,WAAW,EACtD,GAAIA,EAAY,CACd,IAAMC,EAASD,EAAW,cAAc,mCAAmC,EACrEE,EAAWF,EAAW,iBAAiB,uBAAuB,EACpEC,EAAO,iBAAiB,QAAS,IAAM,CACrC,IAAME,EAAWF,EAAO,aAAa,eAAe,IAAM,OAC1DA,EAAO,aAAa,gBAAiB,CAACE,CAAQ,EAC9CD,EAAS,QAASE,GAAY,CAC5BA,EAAQ,aAAa,cAAeD,CAAQ,CAC9C,CAAC,CACH,CAAC,CACH,CAGA,SAAS,iBAAiB,wBAAwB,EAAE,QAAQE,GAAW,CACrE,GAAIA,EAAQ,GAAI,OAChB,IAAIC,EAAKD,EAAQ,YAAY,YAAY,EACtC,QAAQ,UAAWE,IAAM,CAAE,OAAG,KAAM,OAAG,KAAM,OAAG,KAAM,OAAG,IAAK,GAAEA,CAAC,CAAE,EACnE,QAAQ,cAAe,GAAG,EAC7B,KAAO,SAAS,eAAeD,CAAE,GAC3BA,EAAG,MAAM,QAAQ,EAAGA,EAAKA,EAAG,QAAQ,SAAWE,GAAQ,KAAK,SAASA,EAAI,MAAM,CAAC,CAAC,EAAI,CAAC,EAAE,EACvFF,GAAM,MAEbD,EAAQ,GAAKC,CACf,CAAC,EAGD,OAAO,iBAAiB,aAAcG,CAAY,EAC9C,OAAO,SAAS,MAAMA,EAAa,EAGvC3B,EAAW,EAKX,SAAS2B,GAAgB,CACvB,IAAML,EAAU,SAAS,eAAe,OAAO,SAAS,KAAK,MAAM,CAAC,CAAC,EACrE,GAAKA,IACDA,GAASA,EAAQ,eAAe,EAChC,SAAS,cAAc,QAAQ,GAAG,CACpC,IAAMM,EAAS,SAAS,cAAc,QAAQ,EACxCC,EAAW,OAAO,iBAAiBD,CAAM,EAAE,SACjD,GAAIC,IAAa,SAAWA,IAAa,SAAU,CACjD,IAAMC,EAAS,SAAS,OAAO,iBAAiBF,CAAM,EAAE,MAAM,EAC9D,OAAO,SAAS,EAAG,CAACE,CAAM,CAC5B,CACF,CACF,CACF",
  "names": ["current", "main", "renderBreadcrumbLanguageSelection", "onscroll", "readHeadings", "heading", "renderBreadcrumb", "getAllPreviousHeaders", "elements", "context", "list", "i", "findParentA", "element", "template", "index", "clone", "a", "existingAnchor", "event", "alternate", "allHeadings", "headings", "currentTree", "lastLevel", "level", "main", "isHeadReady", "onHeadReady", "mutationsList", "observer", "mutation", "onLoad", "maybeCurrentScriptSrc", "maybeCurrentScriptUrl", "currentScriptUrl", "redirectToTranslatedUrl", "lang", "alternate", "alternateHref", "alternateUrl", "key", "value", "canonical", "burgermenu", "button", "elements", "expanded", "element", "heading", "id", "c", "num", "onHashChange", "header", "position", "offset"]
}
