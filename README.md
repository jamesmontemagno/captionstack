# CaptionStack

<p align="center">
  <a href="https://captionstack.app/">
    <img src="public/social-card.png" alt="CaptionStack — Your captions. Any format." width="100%">
  </a>
</p>

A growing collection of private, browser-based caption tools. CaptionStack currently reads, previews, edits, and converts caption files without uploading them to a server.

**Live site:** [captionstack.app](https://captionstack.app/)

## Supported formats

| Format | Import | Export |
| --- | :---: | :---: |
| SubRip (`.srt`) | Yes | Yes |
| WebVTT (`.vtt`) | Yes | Yes |
| YouTube SBV (`.sbv`) | Yes | Yes |
| LRC (`.lrc`) | Yes | Yes |
| TTML (`.ttml`, `.xml`) | Yes | Yes |
| JSON (`.json`) | Yes | Yes |
| CSV (`.csv`) | Yes | Yes |
| Plain text (`.txt`) | Yes | Yes |

Plain-text imports receive three-second cue timings. Plain-text exports intentionally omit timing.

## Batch conversion

Drop or pick several files at once to convert them together. Each file's format is detected independently, per-file errors (unsupported type, over 10 MB, malformed content) are shown inline without affecting the others, and the successful conversions download as a single ZIP archive (`captionstack-<count>-files-<format>.zip`). The archive is built in the browser with a dependency-free ZIP writer (`src/converter/zip.ts`).

## Editing cues

After importing a file, open **Edit cues** to fix timings and text before exporting:

- Edit each cue's start time, end time, and text inline.
- Add, delete, split, merge, and reorder cues.
- Invalid time ranges block export until fixed; overlapping cues are flagged as warnings but can still be exported.
- The preview and downloaded file always reflect your edits, and everything stays in your browser.

## Quality checks

Every imported or edited cue list is analyzed before export. The report above the editor summarizes errors, warnings, and passed checks, and each finding links to its cue:

| Check | Severity | One-click fix |
| --- | --- | --- |
| Valid time ranges | Error (blocks export) | — |
| No overlapping cues | Warning | Trim the previous cue's end to this cue's start |
| No empty cues | Warning | Remove the cue |
| Clean whitespace | Warning | Trim edges, collapse spaces, drop blank lines |
| Minimum duration (≥ 700 ms) | Warning | Extend to 1 s when the next cue leaves room |
| Line length (≤ 42 chars) | Warning | — |
| Line count (≤ 2 lines) | Warning | — |
| Reading speed (≤ 20 chars/s) | Warning | Extend the end when the next cue leaves room |

Fixes are only offered when the result is unambiguous, and **Undo** reverts any fix or structural edit.

## Performance

Parsing, quality analysis, and serialization run in a Web Worker (`src/converter/worker.ts`), so dropping a 10 MB file or editing a long cue list never freezes the page. The editor renders 50 cues per page, and the quality report lists findings in batches of 100. Browsers without module-worker support (and the test/prerender environments) fall back to the same code on the main thread.

## Local development

```bash
npm install
npm run dev
```

Use `npm test`, `npm run lint`, and `npm run build` to validate changes.

## Deploy to GitHub Pages

1. Push the project to a GitHub repository with `main` as its default branch.
2. Open **Settings → Pages** in the repository.
3. Set **Source** to **GitHub Actions**.
4. Push to `main` or run **Deploy CaptionStack to GitHub Pages** from the Actions tab.

The workflow tests and builds the app, then publishes the `dist` directory. Assets use root-relative paths (`base: '/'`) because the site is served from the `captionstack.app` custom domain; to deploy under a repository sub-path, set `base` in `vite.config.ts` and `SITE_URL` in `src/seo/routes.ts` accordingly.

## Landing pages and SEO

The build prerenders a static page for every route so search engines can crawl more than the homepage:

- `/` — the converter and links to popular conversions and every format.
- `/formats/<id>/` — one page per format (`/formats/srt/`, `/formats/vtt/`, …) with an explainer, a sample, what converts, and links to every conversion involving it.
- `/convert/<from>-to-<to>/` — one page per ordered format pair (56 pages, e.g. `/convert/srt-to-vtt/`) that preselects the target format and includes how-to steps, format notes, and FAQs.

`prerender.mjs` renders each route with `src/entry-server.tsx`, writes a unique `<title>`, meta description, canonical URL, and Open Graph/Twitter tags, emits `dist/404.html`, and generates `dist/sitemap.xml` from the same route list (`src/seo/routes.ts`). Page copy lives in `src/seo/formatInfo.ts` and `src/LandingContent.tsx`.

## License

CaptionStack is available under the [MIT License](LICENSE).
