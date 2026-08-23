import { FORMAT_IDS, type FormatId } from '../converter/types'
import { FORMAT_INFO } from './formatInfo'

export const SITE_URL = 'https://captionstack.app'

export type Route =
  | { kind: 'home' }
  | { kind: 'format'; format: FormatId }
  | { kind: 'convert'; from: FormatId; to: FormatId }

export interface PageMeta {
  path: string
  title: string
  description: string
  /** Relative priority for the sitemap. */
  priority: number
}

function isFormatId(value: string | undefined): value is FormatId {
  return Boolean(value) && (FORMAT_IDS as readonly string[]).includes(value!)
}

/** Normalizes a pathname ("/convert/srt-to-vtt", "/convert/srt-to-vtt/index.html") to a route. */
export function matchRoute(pathname: string): Route {
  const trimmed = pathname.replace(/index\.html$/, '').replace(/\/+$/, '').replace(/^\/+/, '')
  const segments = trimmed ? trimmed.split('/') : []
  if (segments.length === 0) return { kind: 'home' }
  if (segments.length === 2 && segments[0] === 'formats' && isFormatId(segments[1])) {
    return { kind: 'format', format: segments[1] }
  }
  if (segments.length === 2 && segments[0] === 'convert') {
    const [from, to] = segments[1].split('-to-')
    if (isFormatId(from) && isFormatId(to) && from !== to) return { kind: 'convert', from, to }
  }
  return { kind: 'home' }
}

export function routePath(route: Route): string {
  switch (route.kind) {
    case 'home':
      return '/'
    case 'format':
      return `/formats/${route.format}/`
    case 'convert':
      return `/convert/${route.from}-to-${route.to}/`
  }
}

export function pageMeta(route: Route): PageMeta {
  switch (route.kind) {
    case 'home':
      return {
        path: '/',
        title: 'Free Subtitle Converter — SRT, VTT & More | CaptionStack',
        description: 'Convert SRT, VTT, SBV, LRC, TTML, JSON, CSV, and TXT subtitle files instantly. Free, private, and entirely in your browser.',
        priority: 1,
      }
    case 'format': {
      const info = FORMAT_INFO[route.format]
      return {
        path: routePath(route),
        title: `${info.name} (${info.extension}) Converter — Convert to or from ${route.format.toUpperCase()} | CaptionStack`,
        description: `${info.summary} Convert to or from ${info.extension} for free in your browser.`,
        priority: 0.8,
      }
    }
    case 'convert': {
      const from = FORMAT_INFO[route.from]
      const to = FORMAT_INFO[route.to]
      return {
        path: routePath(route),
        title: `${from.id.toUpperCase()} to ${to.id.toUpperCase()} Converter — Free & Private | CaptionStack`,
        description: `Convert ${from.name} (${from.extension}) subtitles to ${to.name} (${to.extension}) in seconds. No upload, no sign-up: the file never leaves your browser.`,
        priority: 0.7,
      }
    }
  }
}

/** Every page to prerender, with the metadata the build step injects into <head>. */
export function prerenderPages(): Array<PageMeta & { pathname: string }> {
  return allRoutes().map((route) => ({ ...pageMeta(route), pathname: routePath(route) }))
}

/** Every crawlable route, used for prerendering and the sitemap. */
export function allRoutes(): Route[] {
  const routes: Route[] = [{ kind: 'home' }]
  for (const format of FORMAT_IDS) routes.push({ kind: 'format', format })
  for (const from of FORMAT_IDS) {
    for (const to of FORMAT_IDS) {
      if (from !== to) routes.push({ kind: 'convert', from, to })
    }
  }
  return routes
}

/** The conversions most people search for, shown as internal links on the home page. */
export const POPULAR_CONVERSIONS: Array<[FormatId, FormatId]> = [
  ['srt', 'vtt'],
  ['vtt', 'srt'],
  ['sbv', 'srt'],
  ['srt', 'txt'],
  ['ttml', 'srt'],
  ['srt', 'ttml'],
  ['lrc', 'srt'],
  ['srt', 'csv'],
  ['json', 'srt'],
  ['srt', 'json'],
  ['vtt', 'txt'],
  ['csv', 'srt'],
]
