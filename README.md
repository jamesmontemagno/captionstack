# CaptionStack

<p align="center">
  <a href="https://captionstack.app/">
    <img src="public/social-card.png" alt="CaptionStack — Your captions. Any format." width="100%">
  </a>
</p>

A growing collection of private, browser-based caption tools. CaptionStack currently reads, previews, and converts caption files without uploading them to a server.

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

The workflow tests and builds the app, then publishes the `dist` directory. Vite uses relative asset paths, so the site works at both account and repository Pages URLs.
