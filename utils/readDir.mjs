import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Reads a directory recursively.
 * @param {string} folder - The folder to read.
 * @returns {Promise<string[]>} The list of absolute paths of all files in the folder.
 */
export default async function readDir (folder) {
  const files = await fs.promises.readdir(folder)
  const list = []
  for (const file of files) {
    const fullPath = path.join(folder, file)
    const stat = await fs.promises.stat(fullPath)
    if (stat.isDirectory()) {
      list.push(...await readDir(fullPath))
    } else if (stat.isFile()) {
      list.push(fullPath)
    }
  }
  return list
}
