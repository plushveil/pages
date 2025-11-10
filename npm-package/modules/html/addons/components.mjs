import * as path from 'node:path'
import * as fs from 'node:fs'

import { pages as getJsPages } from '../../js/js.mjs'
import { pages as getCssPages } from '../../css/css.mjs'
import render from '../src/render.mjs'

const scripts = [
  'script-component',
  'script-components',
]

const styles = [
  'style-component',
  'style-components',
]

const componentCache = {}
const components = {}

/**
 * before is executed before the page is interpreted.
 * @param {import('../parser/iterator.mjs').Node[]} nodes - All nodes.
 * @param {import('../parser/parse.mjs').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 */
export async function beforeAsync (nodes, htmlDocument, page, config, api) {
  if (!config.root) return

  const id = page?.url?.toString() || htmlDocument.getId()
  const componentsPath = path.resolve(config.root, 'components')
  components[id] = components[id] || {
    path: fs.existsSync(componentsPath) ? componentsPath : null,
    nodes: [],
    scriptContainers: [],
    styleContainers: [],
    parallel: 0
  }
  components[id].parallel += 1
}

/**
 * forEach is executed for each node when the page is interpreted.
 * @param {import('../parser/iterator.mjs').Node} node - The node
 * @param {import('../parser/iterator.mjs').Node[]} nodes - All nodes.
 * @param {import('../parser/parse.mjs').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 */
export async function forEach (node, nodes, htmlDocument, page, config, api) {
  const id = page?.url?.toString() || htmlDocument.getId()
  if (!components[id] || components[id].path === null) return

  if (node.type === 'template') {
    const names = (node.textUpdate || node.text).matchAll(/^<(\w+-\w+)>.*?<\/\1>$/g)
    for (const name of names) {
      const component = { name: name[1] }
      await addComponent(component, node, id, page, config, api)
    }
  }

  if (node.type === 'tag-open') {
    const name = (node.textUpdate || node.text).match(/^<(\w+-\w+)/)
    if (name) {
      if (scripts.includes(name[1])) components[id].scriptContainers.push(node)
      else if (styles.includes(name[1])) components[id].styleContainers.push(node)
      else {
        const component = { name: name[1] }
        await addComponent(component, node, id, page, config, api)
      }
    }
  }

  if (node.type === 'tag-close') {
    const test = (tag) => node.text.toLowerCase().startsWith(`</${tag}>`)
    if (styles.find(style => test(style)) || scripts.find(script => test(script))) {
      node.textUpdate = ''
    }
  }
}

/**
 * After the page is interpreted.
 * @param {import('../parser/iterator.mjs').Iterator} iterator - The iterator
 * @param {import('../parser/parse.mjs').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 */
export function after (iterator, htmlDocument, page, config, api) {
  const id = page?.url?.toString() || htmlDocument.getId()
  if (!components[id]) return
  if (page.params.headers?.['X-Partial'] === 'true') return

  const run = components[id]
  run.parallel -= 1
  if (run.parallel === 0) setTimeout(() => { delete components[id] }, 0)

  if (run.path === null || run.nodes.length === 0 || (run.scriptContainers.length === 0 && run.styleContainers.length === 0)) {
    return
  }

  run.nodes = run.nodes.filter((c, index, self) => self.findIndex(t => t.name === c.name) === index)
  const scripts = run.nodes.map(c => c.js && `<script src="${c.js}" async></script>`).filter(Boolean).join('') || ''
  for (const node of run.scriptContainers) { node.textUpdate = scripts }

  const styles = run.nodes.map(c => c.css && `<link rel="stylesheet" href="${c.css}">`).filter(Boolean).join('') || ''
  for (const node of run.styleContainers) node.textUpdate = styles
}

/**
 * Adds a component to the page.
 * @param {object} component - The component.
 * @param {string} component.name - The component name.
 * @param {string} [component.html] - The component HTML.
 * @param {string} [component.js] - The component JavaScript URL.
 * @param {string} [component.css] - The component CSS URL.
 * @param {import('../parser/iterator.mjs').Node} node - The node to update.
 * @param {string} id - The page ID.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 */
async function addComponent (component, node, id, page, config, api) {
  const exists = components[id].nodes.find(c => c.name === component.name)
  if (exists) {
    node.textUpdate = (node.textUpdate || node.text) + (exists.html || '')
    return
  }

  const cached = componentCache[component.name]
  if (cached) {
    node.textUpdate = (node.textUpdate || node.text) + (cached.html || '')
    components[id].nodes.push(cached)
    return
  }

  const htmlFile = path.resolve(components[id].path, component.name, `${component.name}.html`)
  if (fs.existsSync(htmlFile)) {
    component.html = await renderComponent(htmlFile, page, config, api)
    if (node.type === 'template') {
      const regex = new RegExp(`(<${component.name}.*?>)`, 'g')
      node.textUpdate = (node.textUpdate || node.text).replaceAll(regex, `$1${component.html}`)
    } else {
      node.textUpdate = (node.textUpdate || node.text) + component.html
    }
  }

  const jsFile = path.resolve(components[id].path, component.name, `${component.name}.js`)
  if (fs.existsSync(jsFile)) {
    const pages = await getJsPages(jsFile, config, api)
    if (pages.length > 0) {
      const page = pages.find(p => p.params.headers?.['Content-Type']?.includes('application/javascript')) || pages[0]
      component.js = page.url.toString()
    }
  }

  const cssFile = path.resolve(components[id].path, component.name, `${component.name}.css`)
  if (fs.existsSync(cssFile)) {
    const pages = await getCssPages(cssFile, config, api)
    if (pages.length > 0) {
      const page = pages.find(p => p.params.headers?.['Content-Type']?.includes('text/css')) || pages[0]
      component.css = page.url.toString()
    }
  }

  componentCache[component.name] = component
  components[id].nodes.push(component)
}

/**
 * Renders a component file.
 * @param {string} component - The component file.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 * @returns {Promise<string>} - The rendered component.
 */
async function renderComponent (component, page, config, api) {
  const subpage = {
    ...page,
    params: {
      ...page.params,
      __filename: component,
      __dirname: path.dirname(component),
    }
  }
  return render(subpage, config, api)
}
