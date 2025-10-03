import * as path from 'node:path'
import * as fs from 'node:fs'

import { pages as getJsPages } from '../../js/js.mjs'
import { pages as getCssPages } from '../../css/css.mjs'

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

  const id = htmlDocument.getId()
  const componentsPath = path.resolve(config.root, 'components')
  components[id] = components[id] || {
    path: fs.existsSync(componentsPath) ? componentsPath : null,
    nodes: [],
    scriptContainers: [],
    styleContainers: []
  }
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
export async function forEachAsync (node, nodes, htmlDocument, page, config, api) {
  const id = htmlDocument.getId()
  if (!components[id] || components[id].path === null) return

  if (node.type === 'tag-open') {
    const name = node.text.match(/^<(\w+-\w+)/)
    if (name) {
      if (scripts.includes(name[1])) components[id].scriptContainers.push(node)
      else if (styles.includes(name[1])) components[id].styleContainers.push(node)
      else {
        const component = { name: name[1] }
        if (components[id].nodes.find(c => c.name === component.name)) return
        if (componentCache[component.name]) {
          components[id].nodes.push(componentCache[component.name])
          return
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
  const id = htmlDocument.getId()
  if (!components[id]) return
  if (components[id].path === null || components[id].nodes.length === 0 || (components[id].scriptContainers.length === 0 && components[id].styleContainers.length === 0)) {
    delete components[id]
    return
  }

  const scripts = components[id].nodes.map(c => c.js && `<script src="${c.js}" async></script>`).filter(Boolean).join('\n') || ''
  const styles = components[id].nodes.map(c => c.css && `<link rel="stylesheet" href="${c.css}">`).filter(Boolean).join('\n') || ''

  for (const node of components[id].scriptContainers) { node.textUpdate = scripts }
  for (const node of components[id].styleContainers) { node.textUpdate = styles }

  delete components[id]
}
