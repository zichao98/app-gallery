# App Gallery

A curated gallery of my Cloudflare Workers apps.

**Live:** https://app-gallery.zichaoleng55.workers.dev/

| App | Description |
| --- | --- |
| [Deep Dive From Scratch](https://deepdivefromscratch.zichaoleng55.workers.dev/) | Interactive technical explainers |
| [易序｜六爻排卦](https://yixu-iching.zichaoleng55.workers.dev/) | I Ching hexagram tool |
| [收藏白板](https://saved-board.zichaoleng55.workers.dev/) | Whiteboard for saved links |
| [甯家投資策劃室](https://lengs-funding.zichaoleng55.workers.dev/#owners) | Family investment planning |
| [FX Stop Monitor](https://stock-monitoring-integration.zichaoleng55.workers.dev/) | MYR/TWD & MYR/USD rate monitor |

## Add an app

Edit the `APPS` array (and optionally `ART`) in `public/index.html`.

## Deploy

```bash
npx wrangler deploy
```

Pushes to `main` auto-deploy via Cloudflare Workers Builds.
