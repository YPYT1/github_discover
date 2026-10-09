# GitHub Discover

**Less searching. More discovering.** An open-source discovery space that learns your stack.

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Русский](README.ru.md)

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1-F38020?logo=cloudflare&logoColor=white)

![GitHub Discover homepage](public/首页.png)

## Built for curiosity

- **Relevant discovery** — language, Topics, Stars and browsing signals, with room for smaller projects.
- **Keep moving forward** — seen-project exclusion, stable masonry and a detail drawer that preserves your place.
- **Useful filters** — multi-select languages/categories and advanced filters with presets, cancel and apply.
- **A softer interface** — rounded cards, tier-colored Star/Fork metrics, one-click light/dark themes and five languages.
- **Your space** — GitHub OAuth or PAT sign-in, saved repositories, history and preferences.

## Run locally

Node.js 22+ supported LTS and pnpm 11+:

```sh
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm dev
```

PowerShell: use `Copy-Item` instead of `cp`. Open **http://localhost:3000**; run only one dev server.

For GitHub account sign-in, create an [OAuth App](https://github.com/settings/developers) with callback `http://localhost:3000/api/auth/callback`. Set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and `TOKEN_ENCRYPTION_KEY` in `.dev.vars`; `APP_URL` must match the browser origin. Generate the encryption key:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

PAT sign-in works without OAuth configuration. **PATs stay in browser storage**, temporarily passing through the server for verification/API forwarding; OAuth tokens are encrypted server-side.

## Try and deploy

```sh
pnpm demo:dev       # interactive demo on port 4173
pnpm demo:build     # standalone static output: demo/dist
```

The demo shares production UI, uses labeled sample data, and performs no real authentication or writes.

- **Live application**: https://github-discover.ypyt147.workers.dev
- **Interactive demo**: https://github-discover-demo.ypyt147.workers.dev

The live application uses Workers + D1 and real GitHub data; PAT sign-in is available. OAuth account sign-in still requires OAuth App configuration. Public API quotas apply without a server-side GitHub token.

[Demo deployment](demo/README.md) · [Production Workers + D1 guide](doc/Cloudflare部署.md) · [Technical notes](doc/技术说明.md) (Chinese)

Checks: `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm cf:build`. GitHub quotas and bounded sampling apply; trends need historical snapshots. Multi-select uses OR within a group and AND across groups. Independent project, not affiliated with GitHub.
