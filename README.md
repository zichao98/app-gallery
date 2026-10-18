# App Gallery · App Grove

A curated gallery of my Cloudflare Workers apps, drawn as a forest: every app is a tree whose branches are feature areas and whose branch tips are features — a "tech tree". Hover a tree to reveal its skeleton; click it for the notes panel.

The light follows the visitor's clock (sunrise, daytime, sunset, night) or can be picked from the switch in the top bar. Butterflies and dragonflies come out by day, bats and an owl after dark.

**Live:** https://app-gallery.zichaoleng55.workers.dev/

| App | Description |
| --- | --- |
| [Deep Dive From Scratch](https://deepdivefromscratch.zichaoleng55.workers.dev/) | Interactive technical explainers |
| [易序｜六爻排卦](https://yixu-iching.zichaoleng55.workers.dev/) | I Ching hexagram tool |
| [收藏白板](https://saved-board.zichaoleng55.workers.dev/) | Whiteboard for saved links |
| [甯家投資策劃室](https://lengs-funding.zichaoleng55.workers.dev/#owners) | Family investment planning |
| [錢的主人](https://money-master.zichaoleng55.workers.dev/) | Personal budgeting, net worth, and goal planning |
| [Stock Monitor](https://stock-monitoring-integration.zichaoleng55.workers.dev/) | Taiwan/US stock and MYR forex signals |
| [Flowbench](https://flowbench.zichaoleng55.workers.dev/) | Python workflow canvas |
| [DOT—01](https://dot-synth.zichaoleng55.workers.dev/) | Retro dot-matrix synthesizer |

## Add an app

Add an entry to the `APPS` array in `public/index.html`:

- `sp` picks the tree species from `SPECIES` (oak, ginkgo, cherry, pine, maple, birch, wisteria). Add a species there for a new look.
- `branches` is the tech tree: `[["branch name", ["feature", ...]], ...]`. Each feature grows on a real branch tip.
- `leaf` is the accent colour for the highlighted skeleton and the notes panel.

The forest lays itself out, and each tree is generated from a seed of its `id`, so it always grows the same way.

## Apps in this repo

`apps/money-master/` holds the source of 錢的主人. It deploys on its own with `npm run deploy` from that folder (see its README); the gallery's Workers Build only deploys `public/`.

## Deploy

```bash
npx wrangler deploy
```

Pushes to `main` auto-deploy via Cloudflare Workers Builds.
