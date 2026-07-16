import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const toAbsolute = (relativePath) => path.resolve(rootDir, relativePath)

const templatePath = toAbsolute('dist/index.html')
const serverEntryPath = toAbsolute('dist/server/entry-server.js')

const template = fs.readFileSync(templatePath, 'utf-8')
const { render } = await import(pathToFileURL(serverEntryPath).href)

const appHtml = render()

if (!template.includes('<div id="root"></div>')) {
  throw new Error('Could not find the #root placeholder in dist/index.html to prerender into.')
}

const html = template.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`)

fs.writeFileSync(templatePath, html)
fs.rmSync(toAbsolute('dist/server'), { recursive: true, force: true })

console.log('Prerendered marketing shell into dist/index.html')
