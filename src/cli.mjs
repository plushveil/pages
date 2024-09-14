#!/usr/bin/env node

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'

import * as acorn from 'acorn'
import * as walk from 'acorn-walk'
import { parse as parseComment } from 'comment-parser'

import * as pages from './pages.mjs'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const bin = fs.existsSync(process.argv[1]) ? `./${path.relative(process.cwd(), process.argv[1])}` : process.argv[1]
const code = extractExportedFunctions(await fs.promises.readFile(path.resolve(__dirname, './pages.mjs'), { encoding: 'utf8' }))
const packageJson = JSON.parse(await fs.promises.readFile(path.resolve(__dirname, '../package.json'), { encoding: 'utf8' }))

const man = `Usage: ${bin} [options] [command] [arguments]

Options:
  -h, --help             output usage information
  -v, --version          output the version number

Commands:
${code.map(func => `  ${func.name.padEnd(23)}${func.description}`).join('\n')}

Arguments:
  -h, --help             See the full argument list of a command
`

try {
  await main()
} catch (err) {
  console.error(err)
  process.exit(1)
}

/**
 * Parse the command line arguments and execute the command.
 */
async function main () {
  const options = getOptions()
  const help = (options.includes('-h') || options.includes('--help')) && 'help'
  const version = (options.includes('-v') || options.includes('--version')) && 'version'
  const cmd = help || version || getCommand() || 'help'

  if (cmd === 'help') printHelp()
  else if (cmd === 'version') printVersion()
  else if (pages[cmd]) {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
      printHelpForFunction(cmd)
      return
    }

    const params = []
    const signature = code.find(func => func.name === cmd)
    try {
      params.push(...getArguments(signature.paramDescriptions))
    } catch (err) {
      console.error(err.message)
      printHelpForFunction(cmd)
      return process.exit(1)
    }
    const result = await pages[cmd](...params)
    if (signature.returns === 'string' && typeof result === 'string') console.log(result)
  } else {
    console.error(`Unknown command: ${cmd}`)
    printHelp()
  }
}

/**
 * Print the manual.
 */
function printHelp () {
  console.log(man)
}

/**
 * Print the help for a specific function.
 * @param {string} cmd - The function name.
 */
function printHelpForFunction (cmd) {
  const params = code.find(func => func.name === cmd).paramDescriptions
  console.log(`Usage: ${bin} ${cmd} ${params.reduce((params, param) => {
    if (param.optional) return params
    if (param.type === 'string') return (params ? `${params} ` : params) + `<${param.name}>`
    return params
  }, '')} [options]`)

  // positionals
  if (params.filter(param => !param.optional).length) {
    console.log('\nPositional arguments:')
    for (const param of params) {
      if (param.optional) break
      console.log(`  ${param.name.padEnd(23)}${param.description.replace(/^[- ]*/g, '').replace(/\n/g, '\n'.padEnd(25))}`)
    }
  }

  if (params.filter(param => param.optional).length) {
    console.log('\nOptions:')
    for (const param of params) {
      if (!param.optional) continue
      if (param.type === 'object') continue
      const name = param.name.includes('.') ? param.name.split('.').pop() : param.name
      console.log(`  --${name.padEnd(21)}${param.description.replace(/^[- ]*/g, '').replace(/\n/g, '\n'.padEnd(25))}`)
    }
  }
}

/**
 * Print the version number.
 */
function printVersion () {
  console.log(packageJson.version)
}

/**
 * Get the options from the command line arguments. Options are placed before the command and start with a dash.
 * @returns {string[]} The options.
 */
function getOptions () {
  const options = []
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i]
    if (arg.startsWith('-')) {
      options.push(arg)
    } else {
      break
    }
  }
  return options
}

/**
 * Get the command from the command line arguments. A command is the first argument that is not an option.
 * @returns {string} The command.
 */
function getCommand () {
  return process.argv.slice(2).find(arg => !arg.startsWith('-'))
}

/**
 * Get the arguments from the command line arguments. Arguments are placed after the command.
 * Arguments starting with --no-... set ... to false.
 * A dashed argument followed by a value is split into a key-value pair.
 * Arguments that contain an equal sign are split into a key-value pair.
 * Dashed arguments followed by a dashed argument set the first argument to true.
 *
 * Positional arguments are retrieved by their position.
 *
 * @param {{name: string, type: string, description: string}[]} params - The parameters of the command.
 * @returns {any[]} The arguments.
 */
function getArguments (params) {
  const argv = process.argv.slice(process.argv.indexOf(getCommand()) + 1)

  const obj = {}
  for (const arg of argv) {
    if (arg.includes('=') && !(arg.startsWith('"') && arg.endsWith('"')) && !(arg.indexOf('?') < arg.indexOf('='))) {
      const [key, value] = arg.split('=')
      obj[key.replace(/^-+/, '')] = value
    } else if (arg.startsWith('--no-')) {
      obj[arg.slice(5)] = false
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const value = argv[argv.lastIndexOf(arg) + 1]
      obj[key] = value || true
    } else if (arg.startsWith('-')) {
      obj[arg.slice(1)] = true
    } else {
      obj._ = obj._ || []
      obj._.push(arg)
    }
  }

  const args = []
  for (const param of params) {
    if (param.name.includes('.')) continue
    if (param.type === 'object') {
      const options = params.reduce((options, p) => {
        if (!(p.name.startsWith(`${param.name}.`))) return options
        const name = p.name.slice(param.name.length + 1)
        if (typeof obj[name] !== 'undefined') {
          if (p.type === 'number') options[name] = parseFloat(options[name])
          else options[name] = obj[name]
        }
        return options
      }, {})
      args.push(Object.keys(options).length ? options : undefined)
    } else {
      if (!param.optional) {
        const value = obj[param.name] || obj._?.shift()
        if (typeof value === 'undefined') throw new Error(`Missing required argument "${param.name}".`)
        args.push(value)
      } else {
        args.push(obj[param.name] || undefined)
      }
    }
  }

  return args
}

/**
 * Extract the exported functions from a script.
 * @param {string} code - The script.
 * @returns {Array} Array of exported functions with their parameters and JSDoc descriptions.
 */
function extractExportedFunctions (code) {
  const comments = []

  // Parse the code and collect comments
  const ast = acorn.parse(code, {
    sourceType: 'module',
    ecmaVersion: 'latest',
    onComment: (block, text, start, end) => {
      comments.push({ block, text, start, end })
    },
  })

  const functions = []

  // Helper function to extract parameter names, handling default values
  function getParamName (param) {
    if (param.type === 'AssignmentPattern') {
      return param.left.name
    }
    return param.name
  }

  // Traverse the AST to find exported functions
  walk.simple(ast, {
    ExportNamedDeclaration (node) {
      const { declaration } = node
      if (declaration && declaration.type === 'FunctionDeclaration') {
        const funcNode = declaration
        const name = funcNode.id.name
        const params = funcNode.params.map(getParamName)

        // Find the closest preceding JSDoc comment
        const commentNode = comments
          .filter(comment => comment.end < funcNode.start)
          .reduce((prev, current) => (prev?.end > current?.end ? prev : current), null)

        const jsdoc = commentNode ? parseComment(`/*${commentNode.text}*/`)[0] : null
        const description = jsdoc ? jsdoc.description : ''
        const paramDescriptions = jsdoc
          ? jsdoc.tags.filter(tag => tag.tag === 'param').map(tag => ({
            name: tag.name,
            type: tag.type,
            description: tag.description,
            optional: tag.optional || false,
          }))
          : []
        const returns = jsdoc && jsdoc.tags.find(tag => tag.tag === 'returns') ? jsdoc.tags.find(tag => tag.tag === 'returns').type : ''

        functions.push({
          name,
          params,
          description,
          paramDescriptions,
          returns,
        })
      }
    },
  }, walk.base)

  return functions
}
