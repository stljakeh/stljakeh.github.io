# stljakeh.github.io

Obsidian vault + GitHub Pages static site for St. Louis sports.

## Structure

- `index.html` — redirects to `Sports/dashboard.html`
- `Sports/dashboard.html` — live dashboard for Cardinals (MLB), Blues (NHL), CITY SC (MLS), BattleHawks (UFL). Fetches standings/schedule from ESPN API. Auto-refreshes every 60s.
- `Sports/34-0.html` — "34-0" MLS season simulator. Standalone SPA. Fetches rosters from ESPN API, generates shareable image via Canvas API.
- `Sports/dashboard.md.md` — scratch file (just `/in`); ignore.
- `.obsidian/` — vault plugins: `lean-terminal`, `obsidian-local-rest-api`.

## No build tooling

Pure static HTML/CSS/JS (ES2017+). No `package.json`, no bundler, no linter, no CI. Open directly in a browser or deploy to any static host.

## Deployment

- GitHub Pages: `stljakeh.github.io`
- Publish: commit to `main` and push. Manual only — no CI/CD.

## External dependency

- **ESPN API** (`site.api.espn.com/apis/site/v2/sports/...`) — used by both pages. No local cache or fallback. If unreachable, pages show inline errors.

## Obsidian notes

- `lean-terminal` embeds a terminal pane in the vault.
- `obsidian-local-rest-api` exposes a local REST API on ports 27123/27124 with TLS. API key in `.obsidian/plugins/obsidian-local-rest-api/data.json`.
- **Do not commit `data.json`** — contains TLS private key. There is no `.gitignore`.
