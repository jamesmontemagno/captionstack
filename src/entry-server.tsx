// oxlint-disable react/only-export-components -- build-time entry, never hot-reloaded
import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import App from './App.tsx'

export { prerenderPages as pages, SITE_URL } from './seo/routes'

export function render(pathname = '/'): string {
  return renderToString(
    <StrictMode>
      <App pathname={pathname} />
    </StrictMode>,
  )
}
