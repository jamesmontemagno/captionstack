import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const toAbsolute = (relativePath) => path.resolve(rootDir, relativePath)

const templatePath = toAbsolute('dist/index.html')
const serverEntryPath = toAbsolute('dist/server/entry-server.js')

const template = fs.readFileSync(templatePath, 'utf-8')
const { render, pages, SITE_URL } = await import(pathToFileURL(serverEntryPath).href)

if (!template.includes('<div id="root"></div>')) {
  throw new Error('Could not find the #root placeholder in dist/index.html to prerender into.')
}

const escapeHtml = (value) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Replaces the content attribute of a <meta> tag matched by name= or property=. */
function setMeta(html, attribute, key, value) {
  const pattern = new RegExp(`(<meta\\s+${attribute}="${key}"\\s+content=")[^"]*(")`)
  if (!pattern.test(html)) throw new Error(`Template is missing <meta ${attribute}="${key}">`)
  return html.replace(pattern, `$1${escapeHtml(value)}$2`)
}

function buildPage(page) {
  const url = `${SITE_URL}${page.pathname}`
  let html = template
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(page.title)}</title>`)
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`)
  html = setMeta(html, 'name', 'description', page.description)
  html = setMeta(html, 'property', 'og:url', url)
  html = setMeta(html, 'property', 'og:title', page.title)
  html = setMeta(html, 'property', 'og:description', page.description)
  html = setMeta(html, 'name', 'twitter:title', page.title)
  html = setMeta(html, 'name', 'twitter:description', page.description)
  html = html.replace('<div id="root"></div>', `<div id="root">${render(page.pathname)}</div>`)
  return html
}

const allPages = pages()
for (const page of allPages) {
  const outputDir = toAbsolute(path.join('dist', page.pathname))
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(path.join(outputDir, 'index.html'), buildPage(page))
}

// GitHub Pages serves 404.html for unknown paths; the home shell keeps the site usable there.
fs.copyFileSync(templatePath, toAbsolute('dist/404.html'))

const today = new Date().toISOString().slice(0, 10)
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages
  .map(
    (page) => `  <url>
    <loc>${SITE_URL}${page.pathname}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.pathname === '/' ? 'weekly' : 'monthly'}</changefreq>
    <priority>${page.priority.toFixed(1)}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>
`
fs.writeFileSync(toAbsolute('dist/sitemap.xml'), sitemap)

fs.rmSync(toAbsolute('dist/server'), { recursive: true, force: true })

console.log(`Prerendered ${allPages.length} pages and wrote sitemap.xml`)
