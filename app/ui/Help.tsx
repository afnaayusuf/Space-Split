import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from './icons';

const TOPICS: { id: string; title: string; body: ReactNode }[] = [
  {
    id: 'start',
    title: 'Getting started',
    body: (
      <>
        <ol>
          <li>
            <b>Upload the PRN</b> (Excel .xlsx or CSV), or drop the file anywhere on the window.
          </li>
          <li>WaveForce stacks the gaskets, nests the small stacks inside the big ones, packs them into crates and loads the crates on the vehicle.</li>
          <li>
            Check the load in 3D, step through the loading order, open any crate, then print or download the <b>Report</b>.
          </li>
        </ol>
        <p>Set the clearances, the crate limits and your vehicles once, under Settings (the gear). They are kept on this computer.</p>
      </>
    ),
  },
  {
    id: 'prn',
    title: 'The PRN file',
    body: (
      <>
        <p>
          The table is found by its header row. Columns read: <b>SL No</b>, <b>Item Code</b>, <b>Description</b>, <b>Total Qty</b> (or Actual Qty), <b>STD / N-STD</b>, <b>OD</b>, <b>ID</b>, <b>THK</b>,{' '}
          <b>Matl</b>, <b>Weight per ring</b> and <b>Each ring wtg</b> (preferred when both are there).
        </p>
        <p>
          On standard lines, where OD and ID hold the nominal size and the class, the outer-ring OD, inner-ring ID and weight come from the spiral wound chart (the SPW tab of the
          comparative sheet), and ring joints from the R-ring table. Lines with no quantity, or no size anywhere, are listed under <b>Lines</b> as not planned.
        </p>
        <p>
          Sizes from a table show in <span className="is-table">blue</span>; estimated weights in <span className="is-est">amber</span>.
        </p>
        <p>
          <b>EasyCargo's import template</b> is read as it is: Group, Description, Pieces, Length, Width, Height (in the units on the row under the header), weight per piece, and
          the <b>Stackable · Tiltable · Rotable</b> flags. Each gasket is its Length × Width square, Height thick, unless the description names a standard size. Not stackable: one
          gasket per square, nothing on top of it, and its crate carries nothing on the vehicle. Not rotatable: its crate keeps its way round on the deck. Gaskets never tilt.
        </p>
      </>
    ),
  },
  {
    id: 'pack',
    title: 'Stacks, nesting and crates',
    body: (
      <>
        <p>
          Each line becomes stacks of gaskets no taller than <b>Tallest stack</b>, split evenly. The gaskets of a stack lie on <b>cardboard squares</b> as wide as the
          stack's OD — one under every <i>Gaskets to a cardboard</i>.
        </p>
        <p>
          <b>Nesting.</b> Smaller stacks stand inside the bore of bigger ones, on the same cardboard squares: the largest first, each into the tightest bore that still has room. The
          first goes in the centre; the rest on rings round it, evenly spaced. A nested stack's own bore takes smaller stacks again. Each layer is as high as the cardboard plus the
          thickest gasket on it.
        </p>
        <p>
          <b>Clearances.</b> <i>Round a nested stack</i> is kept between a stack and the bore it stands in; <i>Between stacks</i> between stacks and between squares; <i>To the crate wall</i>{' '}
          round the squares; <i>Under the lid</i> above the tallest stack.
        </p>
        <p>
          <b>Crates.</b> Every crate is made to measure. It starts with the largest square left and is a grid of cells that size; squares nearly as big fill the other cells, and
          smaller squares go on top of bigger ones while <i>Tallest inside</i> allows — several side by side on one much bigger square. The grid is chosen so the crates use the least deck area once they stand on the vehicle (two or
          three narrow crates across the deck rather than one wide one), within <i>Longest side</i> and <i>Most per crate</i>. The crate is then sized round what it holds, with the
          wall clearance and the lid headroom, to the nearest 10 mm. The layout name says how it is laid out: <b>1 × 3 · 600</b> is one cell across, three along, for 600 mm squares.
        </p>
        <p>
          <b>The works' way.</b> The starting settings are tuned to the boxes the works really used (the signed packing check lists of past orders). With <i>Square crates</i> a
          crate is a square grid; with <i>Stack same-size squares before widening</i> squares of a size stand on one another up to the height limit before another cell is added,
          so a big gasket gets a box of its own; <i>Room for smaller</i> widens a square crate so the smaller squares fit in it too, and its empty cells take them.{' '}
          <i>Height to side</i> keeps a crate's stacks no taller than that many times its largest square (0: only <i>Tallest inside</i>). <i>Smaller on bigger from</i> lets a
          square ride on a bigger one only if it is at least that share of its side (0: any). <i>Whole inches outside</i> rounds the outside up to whole inches, as on the annexure.{' '}
          <i>Wall room, at least</i> gives big gaskets more room: the clearance to the walls, both sides together, is at least that share of the largest gasket's OD (the
          works' big boxes run about 12 % wider than the gasket). <i>Share a size evenly over its crates</i> splits gaskets of a size that need several crates into equal
          crates — 40 in two of 20, not 30 and 10.
        </p>
        <p>
          A spiral wound gasket does not lie flat: each takes at least <i>Spiral wound bow</i> × its OD of height. A cardboard square goes under every <i>Gaskets to a cardboard</i>{' '}
          gaskets; a <i>Corrugated under KAM / DJ</i> square (3-ply) goes under every kammprofile and double jacketed one. <i>Nest in bores up to</i> stops bigger gaskets taking others in their bore (0: any); a gasket described{' '}
          <b>WITH RIB</b> has pass-partition ribs across its bore and never takes any. A crate with no more than <i>Light box up to</i> kg of gaskets is a light box —{' '}
          <i>Light box sides</i>, no skids — and skids go only under crates of more than <i>Skids from</i> kg.
        </p>
      </>
    ),
  },
  {
    id: 'load',
    title: 'Loading and balance',
    body: (
      <>
        <p>
          Crates stand in rows across the deck, kept <i>To the walls</i> and <i>Between crates</i> apart. A crate goes on top of another only two ways: on a crate with the{' '}
          <b>same footprint</b>, heavier underneath and no more than <i>Most crates high</i>, or <b>one crate across four</b> identical crates in a 2 × 2 block, big enough to bear on
          all four and no heavier than half of them.{' '}
          <i>Stack when it saves a vehicle</i> keeps everything on the floor unless stacking means one vehicle fewer.
        </p>
        <p>
          <b>Centre of gravity.</b> The ideal point lies between the kingpin (or front axle) and the rear axles, in proportion to what each may carry (the green line on the deck).
          The rows are ordered to bring the centre of gravity (the blue pin) onto it; a short load may start back from the front wall, which then needs blocking. Each row is mirrored
          if that keeps the load even side to side. The bars on the right show the load on each bearing point against its limit.
        </p>
        <p>
          <b>Vehicle type.</b> On <b>Auto</b> every type on the list is tried: the one that carries every crate in the fewest vehicles, and of those the least deck, wins; the last,
          part-full vehicle is then swapped for the smallest type that still takes its crates. The Load screen lists how each type would do; click one to use it. The list holds the
          common Indian bodies (Tata Ace to 40 ft trailer) with typical sizes and payloads. Bodies vary by builder, so the axle positions and limits are typical figures: enter your
          transporter's under Settings → Vehicle.
        </p>
        <p>
          <b>Each crate's centre of gravity.</b> After a crate is filled, its piles are moved about its grid, heaviest first, to bring its centre of gravity to the middle; the
          truck's centre of gravity is then worked out from each crate's own, where it stands. Both show as a blue pin.
        </p>
      </>
    ),
  },
  {
    id: 'view',
    title: 'The 3D view',
    body: (
      <>
        <ul>
          <li>
            Drag to turn, right-drag to move, scroll to zoom. Click a crate (or its row on the left) to pick it: the view closes in, the crate turns see-through and its stacks
            lift out and hang above it, each tagged with its packing order. Click it again, or empty space, to put them back.
          </li>
          <li>
            The Crates screen shows one crate open, every layer drawn. The pull-apart button floats the squares apart, each tagged with its packing order and how many gaskets
            it carries (no tags on a crate of more than 40 squares, where they would hide one another); the Packing order list says where each square went.
          </li>
          <li>The round buttons give the 3D, side, top and rear views; the scan button shows inside the crates; the target button shows the centre of gravity.</li>
          <li>
            The bar at the bottom plays the loading order. Click or drag the scale to go to a step; <Icon name="last" size={14} /> shows the whole load again.
          </li>
          <li>Crates are coloured by layout. Inside, the gaskets are coloured by line, on their cardboard squares.</li>
          <li>
            <b>Your own truck.</b> Drop a tractor model (.glb or .gltf, without Draco compression) on the page, or upload it under Settings → Truck model. It is shown in the
            theme's colours and scaled to a 2.55 m width; <i>Turn 90°</i> if it faces the wrong way. Check the model's licence allows this use. Only the tractor is replaced;
            the trailer stays the cut-away load space.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'keys',
    title: 'Keys',
    body: (
      <table className="table compact">
        <tbody>
          <tr>
            <td>
              <kbd>Ctrl</kbd> + <kbd>O</kbd>
            </td>
            <td>Upload a PRN</td>
          </tr>
          <tr>
            <td>
              <kbd>1</kbd> – <kbd>4</kbd>
            </td>
            <td>Load, Crates, Lines, Report</td>
          </tr>
          <tr>
            <td>
              <kbd>F1</kbd>
            </td>
            <td>Help</td>
          </tr>
          <tr>
            <td>
              <kbd>Esc</kbd>
            </td>
            <td>Close a panel</td>
          </tr>
        </tbody>
      </table>
    ),
  },
];

export function HelpDialog({ onClose, version }: { onClose: () => void; version: string }) {
  const [at, setAt] = useState('start');
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const topic = TOPICS.find((t) => t.id === at) ?? TOPICS[0];
  return (
    <div className="sheet-scrim center" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="help" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <nav className="help-nav" aria-label="Help topics">
          <h2 id="help-title">Help</h2>
          {TOPICS.map((t) => (
            <button key={t.id} type="button" className={t.id === at ? 'is-on' : ''} onClick={() => setAt(t.id)}>
              {t.title}
            </button>
          ))}
          <p className="muted small help-version">WaveForce {version}</p>
        </nav>
        <article className="help-body">
          <header>
            <h3>{topic.title}</h3>
            <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
              <Icon name="close" />
            </button>
          </header>
          {topic.body}
        </article>
      </div>
    </div>
  );
}
