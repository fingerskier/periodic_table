# Periodic Cylinder

The periodic table wrapped around a rotating cylinder, with the relations between elements drawn
as a framework inside it. The table is the 32-column long form with the f-block inline, so no
period is split, and where the ends of the rows meet, a seam joins group 18 back to group 1.
Hover an element, a column number or a period label to read about it; switch on relation
layers (periodic structure, chemical analogies, sequences, history, property similarity) to see
hubs, spokes and arcs between the elements they connect, each with its sources.

**Live:** [fingerskier.github.io/periodic_table](https://fingerskier.github.io/periodic_table/)

## Features

- **The whole table on one surface.** Thirty-two columns run round the cylinder: groups 1–2, the
  fourteen f-block columns, then groups 3–18 (under the alternative group-3 convention, group 3
  comes before the f-block). Periods 6 and 7 fill every column.
- **A seam that means something.** Column 32 (group 18) meets column 1 (group 1). Helium sits
  beside hydrogen, and the element after each noble gas, an alkali metal, opens the next row just
  across the seam, so from period 2 on atomic number winds round the cylinder as a helix, one turn
  per period. Isoelectronic series such as O²⁻ F⁻ Ne Na⁺ Mg²⁺ stay together across the seam
  instead of being split between the two edges of a flat table.
- **Hover to inspect.** An element opens a data sheet (configuration, electronegativity,
  ionization energy, radii, melting and boiling points, density, oxidation states, discovery,
  abundance; predicted or estimated values marked ≈), charts of a chosen property down its column
  and across its period, and its links in the relation layers switched on. A column number
  describes its group or f-block column and a period label its period, each with the same kind of
  chart. A hub or arc of the framework describes its relation. Click to pin; <kbd>Esc</kbd>
  releases.
- **Turn, tilt, zoom.** Drag sideways anywhere on the stage, beside the cylinder too, to spin it
  with inertia; drag up or down to tilt; scroll or pinch to zoom. The cylinder turns slowly by
  itself until you move it and pauses while something is hovered or pinned; the Auto-rotate
  button in the top bar starts it again.
- **Colour by** category, block, phase or one of twelve numeric properties (a single-hue ramp,
  log-scaled for density and crustal abundance). Pointing at a legend entry, or focusing it,
  highlights its elements.
- **Group-3 convention:** switch between Sc–Y–Lu–Lr (the default) and Sc–Y–La–Ac; the tiles glide
  to their new columns and every layer is rebuilt (see [Design notes](#design-notes)).
- **Wall opacity:** fade the tiles to look through them at the framework. This, the colour mode,
  the group-3 convention and auto-rotation are under Display at the foot of the left panel.
- **Search:** type a name, symbol or atomic number (<kbd>/</kbd> jumps to the box) and press
  <kbd>Enter</kbd> to turn the cylinder to the best match and pin it; <kbd>↑</kbd> <kbd>↓</kbd>
  pick another match first.
- **Shareable links:** the URL hash keeps the pinned element, column or period, the layers that
  are on, the colour mode and the convention, e.g. `#el=Fe&layers=isoelectronic&color=en&g3=La`.
- **Accessible:** tiles, column numbers and period labels are real buttons with visible focus and
  spoken names, the inspector announces each pin and release in one line, and without WebGL the
  tiles still work (only the far wall and the framework need it). If your system asks for reduced
  motion, the cylinder does not turn by itself, tiles jump to a new convention instead of gliding,
  and the dashes on directed arcs stand still.

## Relations

Each layer is drawn inside the cylinder: a set is a hub with spokes to its members, pairs and paths
are arcs that bow toward the axis (directed ones carry flowing dashes), and a chain joins hubs in
order. Layers are switched on and off in the Relations panel on the left (on narrow screens, a
drawer behind the Relations button). Each row there opens to the layer's description, its
sources, a caveat where it has limits worth knowing, and switches for its individual items; the
inspector shows the same description, sources and caveat for a hub or arc.
**Literature** layers report findings from published work and cite them in the app, with links
where available; **computed** layers are derived in the browser from the layout and the dataset.

| Section | Layer | What it shows | Basis |
| --- | --- | --- | --- |
| Structure | Periods | One hub per period; the full rings, periods 6 and 7, have their hubs on the axis and read as stacked wheels. On by default. | Computed |
| | Groups | One hub per IUPAC group, 1–18; the f-block columns belong to no group. | Computed |
| | Blocks | The s, p, d and f blocks by position, so membership follows the group-3 convention. | Computed |
| | Categories | The nine metallicity classes, coloured as in the category legend. | Computed |
| Chemistry | Diagonal relationship | Li–Mg, Be–Al and B–Si: light elements that resemble the element one period down and one group right. | Literature |
| | Group n and n+10 | Main-group elements paired with the d-block metal ten groups away, through matching compounds in a shared oxidation state. | Literature |
| | Knight's move | Lower-right metals that resemble the element one period down and two groups right. | Literature |
| | Lanthanide-contraction twins | Zr–Hf, Nb–Ta and Mo–W: 4d and 5d metals made almost the same size by the lanthanide contraction. | Literature |
| | Isoelectronic ions | Each noble gas with the common ions that share its electron count; every set straddles the seam. | Literature |
| Sequences | Atomic-number path | Z → Z + 1 from H to Og, a helix round the cylinder. | Computed |
| | Madelung filling order | Subshells in n + ℓ order as a chain of hubs, plus the ground states that break the rule. | Computed |
| | Natural decay series | The thorium, neptunium, uranium and actinium series as α and β⁻ steps from ²³²Th, ²³⁷Np, ²³⁸U and ²³⁵U down to stable lead, or to thallium in the neptunium series, which survives in nature only as traces. | Literature |
| | Pettifor chemical scale | Pettifor's (1984) one-dimensional ordering of the elements, as a path. | Computed |
| History | Döbereiner's triads | Analogous triads whose middle member has about the mean atomic weight of the outer two, re-tested with modern weights. | Literature |
| | Mendeleev's predictions | Eka-boron, eka-aluminium and eka-silicon (1871), drawn from each analogue to the element found later. | Literature |
| Data | Property neighbours | Nearest, second- and third-nearest neighbours in a space of five standardized properties (electronegativity, first ionization energy, covalent radius, log density, log melting point), for every element with all five measured. | Computed |

## Controls

| Action | Pointer | Keyboard |
| --- | --- | --- |
| Inspect | Hover a tile, column number, period label, hub or arc | <kbd>Tab</kbd> to a tile, column number or period label |
| Pin, release | Click; click again to release | <kbd>Enter</kbd> or <kbd>Space</kbd>; <kbd>Esc</kbd> releases |
| Spin | Drag sideways, on or beside the cylinder | <kbd>←</kbd> <kbd>→</kbd>, one column per press |
| Tilt | Drag up or down | <kbd>↑</kbd> <kbd>↓</kbd> |
| Zoom | Scroll or pinch | <kbd>+</kbd> <kbd>-</kbd> |
| Reset the view | Reset view button in the top bar | <kbd>0</kbd> |
| Find an element | Search box: type, then <kbd>Enter</kbd> | <kbd>/</kbd> focuses the search box |

While a tile has focus the arrow keys move between elements instead (<kbd>←</kbd> <kbd>→</kbd>
wrap across the seam), and focusing a tile or column number turns the cylinder to face it.
The view shortcuts are ignored while a form field has focus, and <kbd>/</kbd> while you type in
one. Without a pointer, relations are reached through the Relations list of an element's
inspector view. The top bar's Help button lists these controls in the app.

## Data and licences

- **Element data** (`src/data/elements.json`) is generated by `scripts/build_data.py` from the
  database bundled with the [mendeleev](https://github.com/lmmentel/mendeleev) Python package
  (version 1.3.0, © 2015 Lukasz Mentel, MIT licence, whose notice is reproduced at the end of
  [docs/DATA.md](docs/DATA.md#mendeleev-licence)). The database's values come from the CRC
  Handbook, the NIST Atomic Spectra Database, CIAAW and the other references DATA.md lists.
  Departures from that database, such as standard atomic weights revised by CIAAW since, are
  listed in the script with their sources, and values that are predictions or estimates rather
  than measurements are flagged. [docs/DATA.md](docs/DATA.md) explains the sources, field
  definitions, category scheme, predicted-value and oxidation-state policies and a cross-check
  against pymatgen.
- **Relation content** cites its references in the app (IUPAC recommendations, primary papers,
  standard texts), listed with each layer.
- **[three.js](https://threejs.org/)** (MIT) is the only runtime dependency.
- The project itself is licensed under the [Apache License 2.0](LICENSE).

## Development

Requires Node.js 22.12 or a later 22.x, 24, or 26 and later: the `engines` range in
`package.json`, copied from Vitest 5, which does not support Node 23 or 25. CI uses Node 22.

```sh
npm ci              # install the locked dependencies
npm run dev         # dev server: http://localhost:5173/periodic_table/
npm test            # unit tests (Vitest); npm run test:watch re-runs them on change
npm run typecheck   # tsc --noEmit
npm run build       # type-check, then build into dist/
npm run preview     # serve dist/: http://localhost:4173/periodic_table/
```

The build targets the `/periodic_table/` path that GitHub Pages serves; set `BASE` to build for
another, e.g. `BASE=/ npm run build`.

`npm run e2e` (`scripts/e2e.mjs`) drives a real browser against `npm run preview` at its default
address, so the preview has to be serving a fresh build before it starts:

```sh
npm run build && npm run preview   # in one terminal; wait for it to print its address
npm run e2e                        # in another; screenshots go to e2e-artifacts/
```

`npm run e2e -- <url> <dir>` tests another address and keeps the screenshots elsewhere. If port
4173 is taken, the preview serves on the next free port and prints that address; pass it as
`<url>`, or the test runs against whatever is serving 4173. The test needs Playwright and a
Chromium it can launch, neither of them a project dependency: `npm install --no-save playwright`
and `npx playwright install chromium` provide both without touching `package.json` or the
lockfile.

### Regenerating the element data

The generated JSON is committed, so neither the build nor CI needs Python. To regenerate it, or
to re-check the decay data hard-coded in `src/relations/decay.ts`, use Python 3.10 to 3.14 (the
versions mendeleev 1.3.0 installs on):

```sh
python3 -m venv .venv
.venv/bin/pip install mendeleev==1.3.0
.venv/bin/python scripts/build_data.py          # rewrite src/data/elements.json
.venv/bin/python scripts/build_data.py --check  # exit 1 if the committed file is stale
.venv/bin/python scripts/verify_decay.py        # check the decay-series steps against mendeleev
```

`build_data.py` is deterministic: re-running it without changes leaves the file byte-identical.
`npm run data` and `npm run verify:decay` run the two scripts with the `python3` on your `PATH`,
which then needs mendeleev 1.3.0 installed: `build_data.py` refuses any other version, and
`verify_decay.py` warns.

## Deployment

[`.github/workflows/pages.yml`](.github/workflows/pages.yml) runs on every pull request and every
push to `main`: install, type-check, test, build. Runs on `main` (pushes, or a manual run from the
Actions tab) then upload `dist/` and deploy it to GitHub Pages. Pull-request runs, including those
from forks, and manual runs on any other branch only check: they never upload or deploy.

One-time setup in the repository: **Settings → Pages → Build and deployment → Source: GitHub
Actions**; until then, runs on `main` fail instead of deploying. From then on every push to `main`
deploys to <https://fingerskier.github.io/periodic_table/>.

Vite's `base` in `vite.config.ts` (`/periodic_table/`) has to match the repository name; if the
repository is renamed or the site moves to a custom domain, change it there.

## Project structure

```text
src/
  main.ts      entry point: store, scene and panels
  types.ts     shared contracts: element data, layout, relations, app state
  state.ts     minimal store and selectors
  model.ts     everything derived for one group-3 convention (memoised)
  url.ts       view state in the URL hash
  layout/      the 32-column layout for both conventions, and cylinder geometry
  data/        generated element dataset, symbols, column and period content
  relations/   relation layers, one module per family; index.ts sets their order
  scene/       three.js stage: CSS3D tiles and column ring over a WebGL wall and
               framework, orbit controls, picking
  ui/          panels around the stage, palette, formatting, sparklines, DOM helpers
tests/         unit tests (Vitest, Node environment)
scripts/       build_data.py (dataset), verify_decay.py (decay-series check),
               e2e.mjs (browser smoke test)
docs/          DATA.md: where the data comes from
```

## Design notes

- **Group 3.** Which elements sit below Sc and Y is a convention, so it is a toggle. The default,
  Sc–Y–Lu–Lr, follows IUPAC's 2021 provisional report and leaves La–Yb and Ac–No in the f-block;
  the alternative, Sc–Y–La–Ac, puts Ce–Lu and Th–Lr there. Blocks are derived from position and
  follow the toggle. Categories do not: lanthanides are La–Lu and actinides Ac–Lr (IUPAC Red Book
  2005) either way, fifteen of each for fourteen f-block columns, so one of each sits in group 3.
- **Nine categories.** Tiles are coloured by metallicity class: alkali metal, alkaline earth
  metal, lanthanide, actinide, transition metal, post-transition metal, metalloid, reactive
  nonmetal and noble gas. Halogens are a group (group 17, named in its column view), not a class,
  so fluorine to iodine count as reactive nonmetals. Classes the evidence does not settle,
  astatine's and those from meitnerium on, are flagged as predicted; docs/DATA.md gives the
  reasoning.
- **Colour.** Category hues come from a validated categorical set and were assigned to classes by
  a search that maximises the colour difference (ΔE in OKLab) between classes that actually touch
  on the cylinder, in both conventions and across the seam, checked under normal vision and
  simulated protan and deutan colour-vision deficiency (the worst-pair ΔE figures are noted in
  `src/ui/palette.ts`). Classes that never touch can be closer, so colour is never the only cue:
  each tile carries its symbol, the legend names each class, and hovering a legend entry
  highlights its members.
- **Rendering.** Tiles and the column-number ring are DOM elements placed in 3D with three.js's
  CSS3DRenderer, so their text stays crisp and they are ordinary buttons for focus, hover and
  screen readers. The far wall and the relation framework are WebGL underneath, drawn with the
  same camera.

## Licence

[Apache License 2.0](LICENSE)
