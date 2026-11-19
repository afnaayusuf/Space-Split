# WaveForce — gasket crating and load planner (3D)

Upload a PRN and WaveForce:

1. **stacks** each line's gaskets (no taller than the tallest-stack setting, split
   evenly). A stack is a gasket on every **cardboard square** as wide as its OD,
   drawn as the square with the ring raised off it;
2. **nests** the smaller stacks inside the bores of the bigger ones, on the same
   cardboard squares — largest first, each into the tightest bore with room, the
   first in the centre and the rest on evenly spaced rings round it — with
   clearance round every stack;
3. packs the squares into **crates made to measure**: each crate is a grid of cells
   the size of its largest square, filled with squares nearly as big, smaller
   squares stacked on bigger ones; the grid is chosen to use the least deck area
   once the crates stand on the vehicle, within the longest-side, height and
   weight limits; the crate is then sized round its contents with the wall
   clearance and lid headroom;
4. **loads** the crates on the vehicle in rows across the deck. A crate only goes on
   top of another as a same-footprint crate (heavier underneath, at most "Most
   crates high") or as one crate across four identical crates in a 2 × 2 block.
   The rows are ordered so the **centre of gravity** lands on the ideal point
   between the kingpin (or front axle) and the rear axles, and each row is
   mirrored if that keeps the load even side to side.

The 3D view shows the vehicle and its load, with views from the side, top and
rear, an X-ray of the crate contents, the centre of gravity against its target,
the load on each axle against its limit, and the loading order played crate by
crate. Picking a crate on the truck turns it see-through and lifts its stacks out
to hang above it, each tagged with its packing order and piece count (tags are
left off crates of more than 40 squares). Each crate also opens on its own with
every layer drawn, and can be pulled apart the same way. The Report prints the
loading list and every crate's contents, and downloads them to Excel.

A tractor model of your own (.glb / .gltf, no Draco) can be dropped on the page
or uploaded under Settings → Truck model: it is recoloured to the theme, scaled
to 2.55 m wide and placed over the kingpin; a trailer in the model (named
"trailer", or found by the gap in the wheels) is cut off. The model is kept in
the browser's IndexedDB. Check its licence allows the use.

Explanations of every setting are in Help (F1).

## The PRN file

Excel (.xlsx) or CSV, first sheet with gasket lines. The header row is found by
name: SL No, Item Code, Description, Total Qty, STD / N-STD, OD, ID, THK, Matl,
Weight per ring, Each ring wtg. Standard lines that carry the nominal size and
class in the OD / ID columns take their dimensions and weight from the spiral
wound chart (the SPW tab of the works' comparative sheet, `app/model/tables.ts`)
and the R-ring table. A plain check list (description and quantity) also works.

## Running it

| Where | How |
| --- | --- |
| The website | https://waveforce.pages.dev — installs as an app and keeps working offline |
| On one PC | Double-click `dist/index.html` |
| claude.ai | The published artifact |

Settings and the last PRN are kept in the browser that opened them.

```bash
npm install
npm run dev            # http://localhost:5173 while developing
npm test               # planner rules, the works' history score (and Book1.xlsx, when it is in the folder)
npm run tune           # re-tune the crate settings to the works' history (about 2 minutes)
npm run scorecard      # scorecard/WaveForce-scorecard.xlsx: the planner's crates against the real boxes, order by order and line by line
npm run build          # dist/: index.html (the whole app), sw.js, manifest, icon
npm run build:artifact # dist-artifact/waveforce.html for claude.ai
npx wrangler pages deploy dist --project-name waveforce --branch main
```

The earlier 2-D version (2.2) is kept at https://v2.waveforce.pages.dev; its
source is the `src/` folder, which is no longer built and can be deleted.

## Project layout

```
app/
  model/   types, starting crate sizes and vehicles, SPW and R-ring tables, weight estimates
  parse/   Excel / CSV reader, PRN reader, description reader
  pack/    stacks and nesting, crate packing, vehicle loading and balance, worker, tests
  three/   3D models (tractor, trailer, crates, stacks) and the stage
  state/   storage and the planning hook
  ui/      screens: load, crates, lines, report, settings, help
public/    offline worker, web manifest and icon
```

The axle positions and limits are starting figures; enter the transporter's
vehicles under Settings.

## Tuned to the works' packing history

The crate settings are tuned to how the works really packed: `app/pack/history.json`
holds 25 orders (PRN 261000001–030) read off their signed packing check lists — every
line with its box number, and every box's outside size in inches and gross weight.

**The score.** For each order the planner packs the lines and its crates are paired
with the real boxes, biggest with biggest. A pair scores the product of its three size
ratios (long side, short side, height: a box 10 % too big every way scores 0.75); a box
with no partner scores 0; the order scores the pairs' total over the larger box count.
100 means the same number of boxes at the same sizes. Weights are shown but not scored:
most line weights are estimates.

**The split.** Order 261000001 is a rubber-sheet roll with no box and is left out. Of
the other 24, every fifth (261000004, 009, 014, 022, 029) is the **test** set, never used
for tuning; the other 19 are the **train** set. `npm run tune` searches the settings on
the train orders only (coordinate descent from the works' written rules, the 3.1
settings and random starts; how big a gain a change must bring is chosen by 5-fold
cross-validation inside the train set), then scores the test orders once.

| Settings | Train (19) | Test (5, held out) |
| --- | --- | --- |
| 3.1 defaults | 26.1 | 22.7 |
| 3.2 defaults (tuned) | 53.1 | 36.6 |

Cross-validation put the expected score on unseen orders at 35.6; the held-out test
orders scored 36.6. `npm test` fails if a change drops either set by more than a point.

A second tune with three more settings (`wallPct`, `card`, `evenSplit`) reached 57.2 on
train but only 29.7 on test, with no real gain in cross-validation: with 19 orders the
extra freedom fits noise. Those three ship switched off; more packing lists in
`history.json` are what will let them earn their keep.

What the history taught (each one a setting, explained in Help):

- boxes are **square**, outside sizes in **whole inches**; a big gasket gets a box of
  its own, its squares **stacked on one another** before the box is widened;
- small orders go in **light boxes** (thin sides, no skids) up to 10 kg of gaskets;
- boxes are low: about 500 mm inside at most, stacks no taller than 1.5 × the
  largest square; small squares share the big box when there is room (**fill**);
- a spiral wound gasket takes about **1 % of its OD** in height (it is not flat);
  a cardboard square to every 5 gaskets;
- the wall clearance is tight: 10 mm plus the 22 mm plank;
- nothing nests in a bore over 1000 mm OD, nor in a gasket **WITH RIB** (pass-partition
  ribs across the bore);
- the 300 kg box limit is the works' written rule; the history did not need a limit.

Large Series B spiral wound (ASME B16.47 B, class 150, 26–36″) are read from the
ASME B16.20 sizes; they are not on the works' chart, so check them and add weights.

**Vehicle type.** The list holds the common Indian bodies (Tata Ace, pickup,
Tata 407, 14 / 17 / 19 / 20 / 22 / 24 ft, 32 ft SXL / MXL, 20 / 40 ft
container, 40 ft trailer) at typical sizes. On **Auto** every type is tried and
the one carrying every crate in the fewest vehicles (then the least deck) wins;
the last, part-full vehicle is swapped for the smallest type that takes it.

**Each crate's balance.** Once filled, a crate's piles are moved about its grid,
heaviest first, to bring its centre of gravity to the middle; the vehicle's
centre of gravity is then worked out from every crate's own.

**EasyCargo files.** The EasyCargo import template (Group, Description, Pieces,
Length, Width, Height, Total weight, Stackable, Tiltable, Rotable) is read
directly. Not stackable: one gasket per cardboard square, nothing on it, and its
crate carries nothing. Not rotatable: its crate keeps its way round.
