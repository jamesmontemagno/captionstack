import { describe, expect, it } from 'vitest'
import { allRoutes, matchRoute, pageMeta, routePath } from './routes'

describe('matchRoute', () => {
  it('maps the root and unknown paths to home', () => {
    expect(matchRoute('/')).toEqual({ kind: 'home' })
    expect(matchRoute('')).toEqual({ kind: 'home' })
    expect(matchRoute('/index.html')).toEqual({ kind: 'home' })
    expect(matchRoute('/nope/')).toEqual({ kind: 'home' })
    expect(matchRoute('/formats/mp4/')).toEqual({ kind: 'home' })
    expect(matchRoute('/convert/srt-to-srt/')).toEqual({ kind: 'home' })
    expect(matchRoute('/convert/srt-to-mp4/')).toEqual({ kind: 'home' })
  })

  it('matches format and conversion pages with or without trailing slashes', () => {
    expect(matchRoute('/formats/vtt/')).toEqual({ kind: 'format', format: 'vtt' })
    expect(matchRoute('/formats/vtt')).toEqual({ kind: 'format', format: 'vtt' })
    expect(matchRoute('/formats/vtt/index.html')).toEqual({ kind: 'format', format: 'vtt' })
    expect(matchRoute('/convert/srt-to-vtt/')).toEqual({ kind: 'convert', from: 'srt', to: 'vtt' })
  })

  it('round-trips every generated route', () => {
    for (const route of allRoutes()) {
      expect(matchRoute(routePath(route))).toEqual(route)
    }
  })
})

describe('allRoutes / pageMeta', () => {
  it('produces one home, one page per format, and every ordered format pair', () => {
    const routes = allRoutes()
    expect(routes.filter((route) => route.kind === 'home')).toHaveLength(1)
    expect(routes.filter((route) => route.kind === 'format')).toHaveLength(8)
    expect(routes.filter((route) => route.kind === 'convert')).toHaveLength(8 * 7)
  })

  it('gives every page a unique path, title, and description', () => {
    const metas = allRoutes().map(pageMeta)
    expect(new Set(metas.map((meta) => meta.path)).size).toBe(metas.length)
    expect(new Set(metas.map((meta) => meta.title)).size).toBe(metas.length)
    expect(new Set(metas.map((meta) => meta.description)).size).toBe(metas.length)
    for (const meta of metas) {
      expect(meta.title.length).toBeLessThanOrEqual(90)
      expect(meta.description.length).toBeGreaterThan(60)
      expect(meta.description.length).toBeLessThanOrEqual(200)
    }
  })
})
