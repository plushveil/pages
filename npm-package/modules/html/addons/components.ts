import * as fs from 'node:fs'
import * as path from 'node:path'

import { pages as getCssPages } from '../../css/css.js'
import { pages as getJsPages } from '../../js/js.js'
import render from '../src/render.js'

const tags = ['enable-components']
const tagsSet = new Set(tags)
const componentCache = {}
const components = {}
const RESOLVE_BATCH_SIZE = 8

function getTagNameFromTagOpenText(text) {
  return text.match(/^<(?<tag>[^> ]+)/)?.groups?.tag || ''
}

function getTagNameFromTagCloseText(text) {
  return text.match(/^<\/(?<tag>[^> ]+)/)?.groups?.tag || ''
}

function ensureRunIndexes(run, nodes) {
  if (run.indexesBuiltFor === nodes) return

  run.indexesBuiltFor = nodes
  run.nodeIndexByNode = new WeakMap()
  run.closeIndexByOpenNode = new WeakMap()

  const openStackByTag = new Map()
  for (let i = 0; i < nodes.length; i += 1) {
    const currentNode = nodes[i]
    run.nodeIndexByNode.set(currentNode, i)

    if (currentNode.type === 'tag-open') {
      const openTagName = getTagNameFromTagOpenText(currentNode.text)
      if (!openTagName.includes('-')) continue
      const stack = openStackByTag.get(openTagName) || []
      stack.push(currentNode)
      openStackByTag.set(openTagName, stack)
    }

    if (currentNode.type === 'tag-close') {
      const closeTagName = getTagNameFromTagCloseText(currentNode.text.toLowerCase())
      if (!closeTagName.includes('-')) continue
      const stack = openStackByTag.get(closeTagName)
      if (!stack || stack.length === 0) continue
      const openNode = stack.pop()
      if (!openNode) continue
      run.closeIndexByOpenNode.set(openNode, i)
    }
  }
}

/**
 * Before is executed before the page is interpreted.
 *
 * @param {import('../parser/iterator.js').Node[]} nodes - All nodes.
 * @param {import('../parser/parse.js').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.js').Page} page - The page.
 * @param {import('../../../src/config.js').Config} config - The configuration.
 * @param {import('../../../src/api.js').API} api - The API.
 */
export async function beforeAsync(nodes, htmlDocument, page, config, _api) {
  if (!config.root) return
  if (page?.params?.headers?.['X-Partial'] === 'true') return

  const id = page?.url?.toString() || htmlDocument.getId()
  const componentsPath = path.resolve(config.root, 'components')
  components[id] ||= {
    path: fs.existsSync(componentsPath) ? componentsPath : null,
    nodes: [],
    containers: [],
    nodeByKey: new Map(),
    pendingByKey: new Map(),
    containerSet: new Set(),
    nodeIndexByNode: new WeakMap(),
    closeIndexByOpenNode: new WeakMap(),
    indexesBuiltFor: null,
    parallel: 0,
  }
  components[id].parallel += 1
}

/**
 * ForEach is executed for each node when the page is interpreted.
 *
 * @param {import('../parser/iterator.js').Node} node - The node
 * @param {import('../parser/iterator.js').Node[]} nodes - All nodes.
 * @param {import('../parser/parse.js').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.js').Page} page - The page.
 * @param {import('../../../src/config.js').Config} config - The configuration.
 * @param {import('../../../src/api.js').API} api - The API.
 */
export async function forEach(node, nodes, htmlDocument, page, config, api) {
  if (page?.params?.headers?.['X-Partial'] === 'true') return
  const id = page?.url?.toString() || htmlDocument.getId()
  if (!components[id] || components[id].path === null) return

  const run = components[id]
  ensureRunIndexes(run, nodes)

  if (node.type === 'template') {
    const names = (node.textUpdate || node.text).matchAll(/<(?<name>[a-zA-Z0-9]+-[^> ]+)(?<attributes>[^>]*)>.*?<\/\k<name>>/g)
    const templateComponents = []
    for (const match of names) {
      const attributeString = match.groups?.attributes || ''
      const attributes = getAttributesFromString(attributeString)
      const component = { name: match.groups?.name || '', attributeString, attributes }
      templateComponents.push(component)
    }

    for (let i = 0; i < templateComponents.length; i += RESOLVE_BATCH_SIZE) {
      const batch = templateComponents.slice(i, i + RESOLVE_BATCH_SIZE)
      const resolvedBatch = await Promise.all(batch.map((component) => resolveComponentData(component, id, page, config, api)))

      for (const [j, component] of batch.entries()) {
        await addComponent(component, node, id, page, config, api, [], resolvedBatch[j])
      }
    }
  }

  if (node.type === 'tag-open') {
    const nameMatch = (node.textUpdate || node.text).match(/^<(?<tag>[^> ]+)/)
    if (nameMatch) {
      const tagName = nameMatch.groups?.tag || ''
      if (tagsSet.has(tagName)) {
        if (!run.containerSet.has(node)) {
          run.containerSet.add(node)
          run.containers.push(node)
        }
      } else if (tagName.includes('-')) {
        const attributeString = (node.textUpdate || node.text).match(/^<[^> ]+(?<attributes>(?:\s+[^=> ]+(?:=(?:"[^"]*"|'[^']*'|[^"'\s>]+))?)*)\s*>/)?.groups?.attributes || ''
        const attributes = getAttributesFromString(attributeString)
        const component = { name: tagName, attributeString, attributes }
        const nodeIndex = run.nodeIndexByNode.get(node) ?? -1
        const endIndex = run.closeIndexByOpenNode.get(node) ?? -1

        const componentNodes = endIndex !== -1 ? nodes.slice(nodeIndex + 1, endIndex) : []

        let lastIndexOfTagOpenNode = -1
        for (const [i, currentNode] of componentNodes.entries()) {
          const text = currentNode.textUpdate || currentNode.text
          if (text.includes('<')) break
          if (currentNode.type === 'tag-open') lastIndexOfTagOpenNode = i
          if (text.includes('>')) break
        }

        const targetNode = lastIndexOfTagOpenNode !== -1 ? componentNodes[lastIndexOfTagOpenNode] : node
        await addComponent(component, targetNode, id, page, config, api, componentNodes)
      }
    }
  }

  if (node.type === 'tag-close' && tagsSet.has(getTagNameFromTagCloseText(node.text.toLowerCase()))) {
    node.textUpdate = ''
  }
}

/**
 * After the page is interpreted.
 *
 * @param {import('../parser/iterator.js').Iterator} iterator - The iterator
 * @param {import('../parser/parse.js').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.js').Page} page - The page.
 * @param {import('../../../src/config.js').Config} config - The configuration.
 * @param {import('../../../src/api.js').API} api - The API.
 */
export function after(iterator, htmlDocument, page, _config, _api) {
  const id = page?.url?.toString() || htmlDocument.getId()
  if (!components[id]) return
  if (page?.params?.headers?.['X-Partial'] === 'true') return

  const run = components[id]
  run.parallel -= 1
  if (run.parallel === 0)
    setTimeout(() => {
      delete components[id]
    }, 0)

  if (run.path === null || run.nodes.length === 0 || (run.containers.length === 0 && run.containers.length === 0)) {
    for (const node of run.containers) node.textUpdate = ''
    return
  }

  const uniqueComponentsByName = []
  const seenComponentNames = new Set()
  for (const component of run.nodes) {
    if (seenComponentNames.has(component.name)) continue
    seenComponentNames.add(component.name)
    uniqueComponentsByName.push(component)
  }

  const uniqueContainers = []
  const seenContainers = new Set()
  for (const container of run.containers) {
    if (seenContainers.has(container)) continue
    seenContainers.add(container)
    uniqueContainers.push(container)
  }

  run.nodes = uniqueComponentsByName
  for (const component of run.nodes) {
    const js = component.js && `<script src="${component.js}" async></script>`
    const css = component.css && `<link rel="stylesheet" href="${component.css}">`
    for (const node of uniqueContainers) {
      if (js && (!node.textUpdate || !node.textUpdate.includes(js))) node.textUpdate = (node.textUpdate || '') + js
      if (css && (!node.textUpdate || !node.textUpdate.includes(css))) node.textUpdate = (node.textUpdate || '') + css
    }
  }
}

/**
 * Adds a component to the page.
 *
 * @param {object} component - The component.
 * @param {string} component.name - The component name.
 * @param {string} [component.html] - The component HTML.
 * @param {string} [component.js] - The component JavaScript URL.
 * @param {string} [component.css] - The component CSS URL.
 * @param {import('../parser/iterator.js').Node} node - The node to update.
 * @param {string} id - The page ID.
 * @param {import('../../../src/pages.js').Page} page - The page.
 * @param config
 * @param api
 * @param {import('../parser/iterator.js').Node} contentNodes - The node to update.
 */
async function addComponent(component, node, id, page, config, api, contentNodes = [], resolvedComponent = null) {
  const run = components[id]
  const key = `${component.name}#${component.attributeString}`

  const exists = run.nodeByKey.get(key)
  if (exists) {
    node.textUpdate = (node.textUpdate || node.text) + (exists.html || '')
    return
  }

  const cached = componentCache[key]
  if (cached) {
    node.textUpdate = (node.textUpdate || node.text) + (cached.html || '')
    node.attributeString = cached.attributeString
    run.nodeByKey.set(key, cached)
    run.nodes.push(cached)
    return
  }

  const resolved = resolvedComponent || (await resolveComponentData(component, id, page, config, api))

  const existsAfterResolve = run.nodeByKey.get(key)
  if (existsAfterResolve) {
    node.textUpdate = (node.textUpdate || node.text) + (existsAfterResolve.html || '')
    return
  }

  const cachedAfterResolve = componentCache[key]
  if (cachedAfterResolve) {
    node.textUpdate = (node.textUpdate || node.text) + (cachedAfterResolve.html || '')
    node.attributeString = cachedAfterResolve.attributeString
    run.nodeByKey.set(key, cachedAfterResolve)
    run.nodes.push(cachedAfterResolve)
    return
  }

  if (resolved.htmlFileExists) {
    component.html = resolved.html
    if (node.type === 'template') {
      const tag = `<${component.name}${component.attributeString}>`
      node.textUpdate = (node.textUpdate || node.text).replaceAll(tag, `${tag}${component.html}`)
    } else {
      if (component.html.includes('<slot>') && component.html.includes('</slot>')) {
        const start = component.html.slice(0, component.html.indexOf('<slot>'))
        const end = component.html.slice(component.html.indexOf('</slot>') + 7)
        node.textUpdate = (node.textUpdate || node.text) + start
        const last = contentNodes[contentNodes.length - 1]
        if (last) last.textUpdate = (last.textUpdate || last.text) + end
        else node.textUpdate = (node.textUpdate || node.text) + end
      } else {
        node.textUpdate = (node.textUpdate || node.text) + component.html
      }
    }

    if (resolved.classString) {
      const classMatch = (node.textUpdate || node.text).match(/class=["'](?<classValue>.*?)["']/)
      if (classMatch) {
        const existingClasses = classMatch.groups?.classValue || ''
        const newClasses = `${existingClasses} ${resolved.classString}`.trim()
        node.textUpdate = (node.textUpdate || node.text).replace(classMatch[0], `class="${newClasses}"`)
      } else {
        node.textUpdate = (node.textUpdate || node.text).replace(/<[^> ]+/, (match) => `${match} class="${resolved.classString}"`)
      }
    }
  }

  component.html = resolved.html
  component.js = resolved.js
  component.css = resolved.css
  componentCache[key] = component
  run.nodeByKey.set(key, component)
  run.nodes.push(component)
}

/**
 * Resolves component assets without mutating shared output structures.
 *
 * @param {object} component - The component.
 * @param {string} id - The page ID.
 * @param {import('../../../src/pages.js').Page} page - The page.
 * @param config
 * @param api
 * @returns {Promise<object>} - Resolved component data.
 */
async function resolveComponentData(component, id, page, config, api) {
  const run = components[id]
  const key = `${component.name}#${component.attributeString}`
  const existingPending = run.pendingByKey.get(key)
  if (existingPending) return existingPending

  const resolvePromise = (async () => {
    const resolved = {
      html: component.html,
      js: component.js,
      css: component.css,
      classString: '',
      htmlFileExists: false,
    }

    const htmlFile = path.resolve(run.path, component.name, `${component.name}.html`)
    if (fs.existsSync(htmlFile)) {
      const rendered = await renderComponent(htmlFile, page, config, api, component.attributes)
      resolved.html = rendered.content
      resolved.classString = rendered.classString
      resolved.htmlFileExists = true
    }

    const jsExt = ['.ts', '.js']
    const jsPageCandidates = await Promise.all(
      jsExt.map(async (ext) => {
        const jsFile = path.resolve(run.path, component.name, `${component.name}${ext}`)
        if (!fs.existsSync(jsFile)) return null
        const pages = await getJsPages(jsFile, config, api)
        if (pages.length === 0) return null
        const jsPage = pages.find((p) => p.params.headers?.['Content-Type']?.includes('application/javascript')) || pages[0]
        return { ext, url: jsPage.url.toString() }
      }),
    )

    for (const ext of jsExt) {
      const candidate = jsPageCandidates.find((result) => result?.ext === ext)
      if (!candidate) continue
      resolved.js = candidate.url
      break
    }

    const cssFile = path.resolve(run.path, component.name, `${component.name}.css`)
    if (fs.existsSync(cssFile)) {
      const pages = await getCssPages(cssFile, config, api)
      if (pages.length > 0) {
        const cssPage = pages.find((p) => p.params.headers?.['Content-Type']?.includes('text/css')) || pages[0]
        resolved.css = cssPage.url.toString()
      }
    }

    return resolved
  })().finally(() => {
    run.pendingByKey.delete(key)
  })

  run.pendingByKey.set(key, resolvePromise)
  return resolvePromise
}

/**
 * Parses an attribute string into an object.
 *
 * @param {string} attributeString - The attribute string.
 * @returns {object} - The parsed attributes.
 */
function getAttributesFromString(attributeString) {
  const attributes = {}
  const regex = /(?<attrName>[^\s=]+)(?:=(?:"(?<doubleQuoted>[^"]*)"|'(?<singleQuoted>[^']*)'|(?<bare>[^"'\s>]+)))?/g
  let match = null
  while ((match = regex.exec(attributeString)) !== null) {
    const attrName = match.groups?.attrName
    const attrValue = match.groups?.doubleQuoted || match.groups?.singleQuoted || match.groups?.bare || true
    if (!attrName) continue
    attributes[attrName] = attrValue
  }
  return attributes
}

/**
 * Renders a component file.
 *
 * @param {string} component - The component file.
 * @param {import('../../../src/pages.js').Page} page - The page.
 * @param {import('../../../src/config.js').Config} config - The configuration.
 * @param {import('../../../src/api.js').API} api - The API.
 * @param {object} attributes - The component attributes.
 * @returns {Promise<string>} - The rendered component.
 */
async function renderComponent(component, page, config, api, attributes) {
  const name = path.basename(component, path.extname(component))

  let content = await fs.promises.readFile(component, 'utf-8')
  const match = content.match(new RegExp(`<${name} (?<attributes>[^>]*)>`))
  let classString = ''
  if (match) {
    classString = match.groups?.attributes?.match(/class=["'](?<classValue>[^'"]*)['"]/)?.groups?.classValue || ''
    content = content.replace(new RegExp(`<${name}[^>]*>`), '')
    content = content.replace(new RegExp(`</${name}>`), '')
  } else {
    content = undefined
  }

  const subpage = {
    ...page,
    content,
    params: {
      ...page.params,
      __filename: component,
      __dirname: path.dirname(component),
      __attributes: attributes,
    },
  }

  return {
    content: await render(subpage, config, api),
    classString,
  }
}
