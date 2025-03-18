import debounce from '../../utils/debounce.mjs'
import getDataComponent from '../DataComponent.js'
import markdown from './toc-sidebar.htms'

const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;

window.customElements.define('toc-sidebar', class extends getDataComponent(markdown, ['data-toc']) {
  #content = []
  #template
  #article

  constructor () {
    super()

    this.onscroll = debounce(this.onscroll.bind(this), 10)
  }

  async connectedCallback () {
    super.connectedCallback()

    if (!this.#template) {
      const template = this.querySelector('template')
      this.#template = template.innerHTML
      this.removeChild(template)
    }
    if (!this.#template) throw new Error('toc-sidebar must have a template child element')

    const main = this.closest('main')
    const article = await new Promise(resolve => {
      function resolveArticle () {
        const article = main.querySelector('article')
        if (article) {
          resolve(article)
          return true
        }
        return false
      }
      if (!resolveArticle()) {
        this.observer = new MutationObserver(() => { if (resolveArticle()) this.observer.disconnect() })
        this.observer.observe(main, { childList: true, subtree: true })
      }
    })
    this.#article = new WeakRef(article)

    window.addEventListener('scroll', this.onscroll, { passive: true })

    this.onresize()
    if (!this.onresize.isDebounced) {
      this.onresize = debounce(this.onresize.bind(this), 100)
      this.onresize.isDebounced = true
    }
    window.addEventListener('resize', this.onresize, { passive: true })
  }

  /**
   *
   */
  onresize () {
    const article = this.#article.deref()
    if (!article) return
    this.#content = [...article.querySelectorAll('h1, h2, h3, h4, h5, h6')].map(heading => {
      const rect = heading.getBoundingClientRect()
      return {
        id: heading.id,
        element: new WeakRef(heading),
        text: heading.textContent,
        level: parseInt(heading.tagName[1]),
        top: rect.top + window.scrollY - rect.height,
      }
    }).sort((a, b) => a.top - b.top)
    this.dataset.toc = Date.now()
  }

  /**
   *
   */
  onscroll () {
    const offset = 0
    const active = [...this.#content].reverse().find(({ top }) => top < (window.scrollY + offset))
    const inactive = this.#content.filter(heading => heading !== active)
    inactive.forEach(heading => {
      heading.anchor.classList.add('border-transparent')
      heading.anchor.classList.remove('border-black/30')
    })
    active?.anchor?.classList.remove('border-transparent')
    active?.anchor?.classList.add('border-black/30')
  }

  /**
   * Called when attributes are changed, added, removed, or replaced.
   * @param {string} name - The name of the attribute that changed.
   * @param {any} oldValue - The old value of the attribute.
   * @param {any} newValue - The new value of the attribute.
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements#responding_to_attribute_changes
   */
  async attributeChangedCallback (name, oldValue, newValue) {
    super.attributeChangedCallback(name, oldValue, newValue)

    if (name === 'data-toc') {
      while (this.firstChild) this.removeChild(this.firstChild)
      const func = (new AsyncFunction(`return \`${this.#template}\`;`)).bind(this)
      this.innerHTML = await func()
      const levelToWeight = { 1: 'font-bold', 2: 'font-medium', 3: 'font-light', 4: 'font-extralight', 5: 'font-thin', 6: 'font-thin' }
      const nav = this.querySelector('nav')

      this.#content.forEach((heading) => {
        const a = document.createElement('a')
        if (heading.id) a.href = `#${heading.id}`
        else a.onclick = () => {
          const element = heading.element.deref() || [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].find(h => h.textContent === heading.text)
          element.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
        a.textContent = heading.text
        a.classList.add('block', 'ml-1', 'pl-2', 'pt-1', 'border-l', 'border-transparent', levelToWeight[heading.level])
        heading.anchor = a
        nav.appendChild(a)
      })

      setTimeout(() => {
        if (nav.getBoundingClientRect().height > window.innerHeight) nav.classList.remove('xl:sticky')
        else nav.classList.add('xl:sticky')
      }, 0)
    }
  }

  /**
   *
   */
  disconnectedCallback () {
    this.observer?.disconnect()
    window.removeEventListener('scroll', this.onscroll)
    window.removeEventListener('resize', this.onresize)
  }
})
