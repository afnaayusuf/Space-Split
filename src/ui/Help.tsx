import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Dialog } from './Dialog';

export type HelpTopic =
  | 'start'
  | 'saving'
  | 'jobs'
  | 'lines'
  | 'plan'
  | 'paper'
  | 'boxes'
  | 'rules'
  | 'vehicles'
  | 'weights'
  | 'data'
  | 'keys'
  | 'about';

// ------------------------------------------------------------------ open / close

let current: HelpTopic | null = null;
const subs = new Set<() => void>();
export function openHelp(topic: HelpTopic = 'start') {
  current = topic;
  subs.forEach((f) => f());
}
function closeHelp() {
  current = null;
  subs.forEach((f) => f());
}
const useHelp = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    () => current,
  );

/** The small "?" beside a panel title: opens Help at that panel's topic. */
export function HelpLink({ topic, label }: { topic: HelpTopic; label: string }) {
  return (
    <button type="button" className="help-btn" aria-label={`Help: ${label}`} title="Help" onClick={() => openHelp(topic)}>
      ?
    </button>
  );
}

// ------------------------------------------------------------------ content

interface Topic {
  id: HelpTopic;
  title: string;
  keywords: string;
  body: (about: AboutInfo) => ReactNode;
}

export interface AboutInfo {
  version: string;
  built: string;
  storage: string;
}

const K = ({ children }: { children: ReactNode }) => <kbd>{children}</kbd>;

const TOPICS: Topic[] = [
  {
    id: 'start',
    title: 'Getting started',
    keywords: 'new job first start prn check list',
    body: () => (
      <>
        <p>WaveForce packs a PRN's gaskets to the works' packing rules, places the boxes on the vehicle and prints the paperwork.</p>
        <h4>Quickest: drop the check list</h4>
        <p>
          Drag the packing check list file (Excel .xlsx or CSV) onto the WaveForce window, or use <b>File → Open file…</b>. It opens as a new job and the{' '}
          <b>Package plan</b> is drawn straight away. Check the lines, then save.
        </p>
        <h4>Step by step</h4>
        <ol>
          <li>
            <b>File → New job</b>, then fill in the PRN number, PO and customer on <b>PRN lines</b>. The printed forms carry them.
          </li>
          <li>
            Copy the rows of the packing check list in Excel and use <b>Paste check list…</b>, or type a line in <b>Quick entry</b>.
          </li>
          <li>Pick the packing type and the vehicle in the bar under the menus.</li>
          <li>
            Open <b>Package plan</b> to see the boxes and the deck, and <b>Paperwork</b> for the forms.
          </li>
          <li>
            <b>File → Save</b> (<K>Ctrl</K> + <K>S</K>).
          </li>
        </ol>
        <p>
          Once, before the first real job: paste the works' weight charts into <b>Weight master</b>, put the box shop's corrugated sizes under <b>Box sizes</b>, and
          correct the truck sizes under <b>Vehicles</b>.
        </p>
      </>
    ),
  },
  {
    id: 'saving',
    title: 'Saving, undo and recovery',
    keywords: 'save autosave save as revert undo redo recover unsaved changes',
    body: () => (
      <>
        <h4>Save</h4>
        <p>
          Changes to the open job — and to the works setup — are kept until you save. The title bar says <b>Unsaved changes</b> until then. <b>File → Save</b> or{' '}
          <K>Ctrl</K> + <K>S</K> saves everything that changed.
        </p>
        <h4>AutoSave</h4>
        <p>With AutoSave on (switch in the title bar), WaveForce saves a moment after each change. It is remembered on this computer.</p>
        <h4>Save as</h4>
        <p>
          <b>File → Save as…</b> saves what is on screen as a new job under a new PRN. The job you started from stays as it was last saved.
        </p>
        <h4>Revert</h4>
        <p>
          <b>File → Revert to saved</b> throws away the changes since the last save.
        </p>
        <h4>Undo and redo</h4>
        <p>
          <b>Edit → Undo</b> (<K>Ctrl</K> + <K>Z</K>) and <b>Redo</b> (<K>Ctrl</K> + <K>Y</K>) step through your changes to the open job and the works setup. While the
          cursor is in a text box, <K>Ctrl</K> + <K>Z</K> undoes typing in that box instead.
        </p>
        <h4>Leaving a job</h4>
        <p>Opening another job, starting a new one or closing the page with unsaved changes asks first whether to save them.</p>
        <h4>Recovery</h4>
        <p>
          Unsaved work is also kept in this browser. If the page closes before you save, the next start offers to <b>Restore</b> it.
        </p>
      </>
    ),
  },
  {
    id: 'jobs',
    title: 'Jobs',
    keywords: 'all jobs open copy duplicate file import export delete status draft packed dispatched search',
    body: () => (
      <>
        <p>
          <b>All jobs</b> lists every PRN on file, newest first. Find one by PRN, PO or customer, or show only Draft, Packed or Dispatched jobs.
        </p>
        <ul>
          <li>
            <b>Open</b> makes it the job you are working on.
          </li>
          <li>
            <b>Copy</b> starts a new job from an old one (handy for a repeat order).
          </li>
          <li>
            <b>File</b> saves the job as a file to send or keep; <b>Open file…</b> (or dropping the file on the window) brings one back.
          </li>
          <li>
            <b>Status</b> marks how far the job has got. It is saved straight away.
          </li>
          <li>Delete asks before it removes a job. It cannot be undone; a backup can bring it back.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'lines',
    title: 'PRN lines',
    keywords: 'quick entry paste check list description box no weight estimated amber standard size line editor',
    body: () => (
      <>
        <h4>Quick entry</h4>
        <p>Type a line the way the works writes it, with the quantity at the end, and press Enter:</p>
        <pre>{`SPW 6" 150# 316L/Graphite x 200
RTJ R24 SI OCT x 12
SC (RF) 8"X150# CNAF 269.9X219.1X3MM x 40
KAM 10"X300# SS316/GR 362X282.4X4MM x 6`}</pre>
        <p>Size (inches or DN), pressure class, ring number, OD × ID × thickness, material and quantity are read in any order.</p>
        <h4>Paste check list</h4>
        <p>
          Copy the rows of the packing check list in Excel and paste them. Columns are matched by the header row if you include it, otherwise in the works' order: SL,
          PO SL, TYPE, Cust Item Code, Description Of Goods, Total Qty, Actual Qty, UOM, Box No. One description per line also works.
        </p>
        <h4>Open a check list file</h4>
        <p>
          Drop the check list file on the window, or <b>File → Open file…</b>. Excel workbooks (.xlsx) and CSV files are read; an old .xls file has to be saved as .xlsx
          first, and a PDF cannot be read. The table is found by its header row (it must have a <b>Description</b> column). A <b>PRN No</b>, <b>PO No</b>,{' '}
          <b>PO Date</b> and <b>Customer</b> written above the table are filled in too. With several sheets, the one with the most gasket lines is used. The job opens
          unsaved, so look over the lines before saving it.
        </p>
        <h4>Sizes and weights</h4>
        <p>
          Spiral wound and ring joint sizes fill in from ASME B16.20. Soft cut, Kammprofile, double jacketed and insulation kits need their OD, ID and thickness typed in,
          or filed in the weight master.
        </p>
        <p>
          A weight in <span className="amber">amber</span> is estimated from the outline. It is replaced by the chart weight when the weight master has the size, or when
          you type one. In the line editor you can save a typed weight to the master for every later PRN.
        </p>
        <h4>Box No</h4>
        <p>
          Used only by the <b>Boxes as given</b> packing type. <code>3</code> puts the line in box 3; <code>2,3,4 (50/50/10)</code> splits it 50, 50 and 10 across boxes
          2, 3 and 4.
        </p>
        <h4>Packed as</h4>
        <p>How the planner packs the line under the chosen packing type: bundles of so many, on corrugated squares, in cartons, or as sets.</p>
      </>
    ),
  },
  {
    id: 'plan',
    title: 'Package plan',
    keywords: 'drawing deck layer box distances arrow centre of gravity cog load order zoom pan legend',
    body: () => (
      <>
        <p>
          The deck seen from above: front wall on the left, door on the right. Click a box to select it, double-click (or <b>Open</b>) to see inside it. Drag to pan,
          scroll to zoom, <b>Fit</b> to see it all.
        </p>
        <h4>Box numbers and layers</h4>
        <p>
          Boxes are numbered in loading order: BOX NO 1 goes on first, at the front wall. <b>Layer</b> tabs switch between the bottom layer and the boxes stacked on
          it. Boxes stand only on boxes of the same footprint.
        </p>
        <h4>Distances</h4>
        <p>
          ← → ↑ ↓ are the clear distances, as drawn, from a box to the nearest box or truck wall (← toward the front wall, → toward the door), or from a pile to the
          nearest pile or box wall. A nested pile shows its clearance all round inside the ring around it.
        </p>
        <h4>The arrow</h4>
        <p>The black arrow in a corner marks the box's reference corner, so the packer and the loader turn the box the same way. A box turned 90° shows its arrow top right.</p>
        <h4>Centre of gravity</h4>
        <p>
          <b>CoG</b> marks the load's centre of gravity on the deck. Keep it near the middle.
        </p>
        <h4>Colours</h4>
        <p>
          Each PRN line has its own colour (<b>Line</b>), or each gasket type (<b>Type</b>). The legend in the corner names them.
        </p>
      </>
    ),
  },
  {
    id: 'paper',
    title: 'Paperwork',
    keywords: 'packing check list annexure box contents loading plan box sheets print excel copy',
    body: () => (
      <>
        <ul>
          <li>
            <b>Packing check list</b> — one row per PRN line with its box number, in the works' format, with Production, Packing and Quality tick columns.
          </li>
          <li>
            <b>Annexure</b> — the packing instructions for this job, the recommended truck, and every box's outer size in inches with quantity and weight.
          </li>
          <li>
            <b>Box contents</b> — what is in each box.
          </li>
          <li>
            <b>Loading plan</b> — the deck by layer, the loading sequence with distances, and the lashing and tarpaulin estimate.
          </li>
          <li>
            <b>Box sheets</b> — one page per box for the packing bench: the drawing, the steps and every pile's distances.
          </li>
        </ul>
        <p>
          <b>Print</b> prints all sheets of the chosen kind. <b>Excel workbook</b> downloads the packing list workbook. <b>Copy sheet</b> copies the table on screen for
          pasting into Excel.
        </p>
      </>
    ),
  },
  {
    id: 'boxes',
    title: 'Box sizes',
    keywords: 'ladder stock box made to measure boards skids deepest weight cap corrugated squares cartons rtj tare',
    body: () => (
      <>
        <h4>Stock box ladder</h4>
        <p>
          The square box sizes the works builds, outside measurements in inches. The depth is cut to suit the contents in whole inches, up to the deepest box. Untick a
          size to keep the planner off it; <b>Stock</b> limits how many of a size can be used (empty = any).
        </p>
        <h4>Box sizing</h4>
        <ul>
          <li>
            <b>Ladder only</b> — stock sizes only.
          </li>
          <li>
            <b>Ladder, then to measure</b> — a stock size when one takes the largest piece, otherwise built to measure.
          </li>
          <li>
            <b>Made to measure</b> — every box built to its contents.
          </li>
        </ul>
        <p>
          <b>Deepest box</b>: beyond it a second box is started. <b>Box weight cap</b>: gross weight, contents and box. <b>Empty box weight</b> is per m² of outside
          surface; a works box in 12 mm ply runs about 9.5 kg/m².
        </p>
        <h4>Corrugated squares and cartons</h4>
        <p>
          A ring takes the smallest square in the stock list that leaves the margin all round. An RTJ carton is the ring OD plus the allowance square (R49, 281 mm OD,
          takes a 283 mm carton) and the ring height plus the allowance deep.
        </p>
      </>
    ),
  },
  {
    id: 'rules',
    title: 'Packing rules',
    keywords: 'packing type export domestic knpc consolidated boxes as given bundle counts bands nesting sharing clearance headroom bow',
    body: () => (
      <>
        <h4>Packing types</h4>
        <ul>
          <li>
            <b>Type 5 · Export</b> — export bundle counts; bundles nested into the tightest bore; no two gasket types in a box except the small sizes.
          </li>
          <li>
            <b>Type 6 · Domestic</b> — domestic bundle counts; spiral wound 12″ and up singly on corrugated squares; nothing nested inside rings above 10″; ½–2″ as filler.
          </li>
          <li>
            <b>Type 2 · KNPC</b> — a corrugated square between every ring; one item code per box.
          </li>
          <li>
            <b>Type 3 · Consolidated</b> — the whole PRN in one box, sized to the largest piece; a second box only when one is too deep or too heavy.
          </li>
          <li>
            <b>Type 4 · Boxes as given</b> — obeys the Box No on each check-list line; each box is sized to what it holds.
          </li>
        </ul>
        <p>
          <b>New jobs start on</b> sets the packing type a new job begins with. <b>Suggested box layout</b> packs the open job both ways, export and domestic, so you can
          compare boxes, weight and volume.
        </p>
        <h4>Bundle counts</h4>
        <p>
          A ring is strapped into a bundle of the band's count before anything else; the bundle is what is nested and laid in the box. Sizes are nominal inches; an empty
          <b> To</b> means "and up". <b>On squares</b> lays that band singly on corrugated squares. A size outside every band takes the nearest band's count and is flagged
          in the plan notes. Consolidated and Boxes as given use the sheet chosen below the tables.
        </p>
        <h4>Nesting</h4>
        <p>
          A bundle goes into the tightest bore that takes it, one bundle per bore, same gasket type and class. <b>Bore minus OD</b> is the slack it needs: the works' sheet
          needs 5 mm (the 10″ goes in the 14″ bore with 9.4 mm to spare). Turning on <b>Nest across pressure classes</b> lets Class 150 nest in Class 300.
        </p>
        <h4>Sharing a box</h4>
        <p>
          With <b>Small sizes share one box</b> on, pieces up to the size given share a box whatever their type, as the works' own boxes do. Above it, a piece shares only
          with sizes at least the given share of the largest (a 60″ ring does not share with a 30″ one). Carded rings, Kammprofile and double jacketed on their squares,
          and insulation kits always keep to their own boxes.
        </p>
        <h4>In the box</h4>
        <p>
          Clearances to the box wall for bundles and for squares or cartons, the gap between piles (room for straps and stuffing), the clear space above the tallest pile,
          and the spiral wound bow: a layer is at least this share of the OD tall (about OD ÷ 80). <b>Centre the piles</b> keeps the box level when lifted.
        </p>
      </>
    ),
  },
  {
    id: 'vehicles',
    title: 'Vehicles',
    keywords: 'fleet truck container deck payload height safety margin layers load on top stacking turned',
    body: () => (
      <>
        <p>
          The works' vehicles with their inside load-body sizes. Measure your own and correct the list. The radio button picks this job's vehicle (the bar under the menus
          does the same). The vehicle marked <b>smallest that takes this job</b> carries the whole load in one trip. A height of 0 is an open body.
        </p>
        <h4>Boxes on the deck</h4>
        <ul>
          <li>
            <b>Safety margin</b> — kept between neighbouring boxes and between boxes and the walls, on every side.
          </li>
          <li>
            <b>Most layers</b> and <b>Load allowed on a box</b> (0 = no limit) limit stacking.
          </li>
          <li>
            <b>Stack boxes</b> — only when the deck is full, or to save deck length.
          </li>
          <li>Boxes stand in straight rows across the deck, front wall first, heaviest at the bottom.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'weights',
    title: 'Weight master',
    keywords: 'chart weights paste weight chart item code spec estimate',
    body: () => (
      <>
        <p>The works' chart weights. A PRN line takes the weight filed under its customer item code first, then the one for its type, size and class (ring number for RTJ).</p>
        <h4>Paste a weight chart</h4>
        <p>Copy the chart rows in Excel and paste them. Columns: Type (SPW, SC, KAM, DJ, RTJ, ISK), Size in inches or ring number, Class, kg per piece — then optionally OD, ID, Thickness and Item code.</p>
        <pre>{`SPW   6     150   0.48
SPW   6     300   0.69
RTJ   R24         0.35`}</pre>
        <p>A weight already filed for the same size is replaced. Weights typed on a PRN line always win over the master.</p>
      </>
    ),
  },
  {
    id: 'data',
    title: 'Data, sharing and backup',
    keywords: 'storage shared browser backup restore setup file editors contributors',
    body: ({ storage }) => (
      <>
        <p>
          This copy keeps its data <b>{storage.toLowerCase()}</b>.
        </p>
        <ul>
          <li>
            <b>Shared with your team</b> (in claude.ai) — every person the page is shared with sees the same jobs. Contributors can change jobs and weights; only editors
            change the works setup.
          </li>
          <li>
            <b>In this browser</b> (the website or the file) — another computer or browser starts empty. Move work with backups.
          </li>
        </ul>
        <h4>Backup</h4>
        <p>
          <b>Download backup</b> saves one file with the works setup, the weight master and every job. <b>Restore from a backup…</b> adds the file's jobs and weights; a
          job with the same id is replaced by the file's copy. Keep a backup each week and before changing computers.
        </p>
        <h4>Works setup file</h4>
        <p>Box ladder, corrugated stock, packing rules, bundle counts and vehicles in one file, to set up another site the same way. Load it with Restore from a backup.</p>
      </>
    ),
  },
  {
    id: 'keys',
    title: 'Keyboard shortcuts',
    keywords: 'keys shortcuts keyboard',
    body: () => (
      <table className="keys">
        <tbody>
          {[
            ['Ctrl + S', 'Save'],
            ['Ctrl + Z', 'Undo'],
            ['Ctrl + Y  or  Ctrl + Shift + Z', 'Redo'],
            ['Ctrl + O', 'All jobs'],
            ['Ctrl + P', 'Print the paperwork'],
            ['F1', 'Help'],
            ['Enter', 'Add the Quick entry line'],
            ['Esc', 'Close a menu or window'],
          ].map(([k, v]) => (
            <tr key={k}>
              <td>
                <kbd>{k}</kbd>
              </td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
  },
  {
    id: 'about',
    title: 'About WaveForce',
    keywords: 'version about',
    body: ({ version, built, storage }) => (
      <>
        <p>
          <b>WaveForce</b> — gasket packing and load planning. Version {version}, built {built}.
        </p>
        <p>Data: {storage}.</p>
        <p>Packing rules after the works' own practice as written in the GasketPack 3D documents. Spiral wound and ring joint sizes after ASME B16.20.</p>
      </>
    ),
  },
];

export function HelpDialog({ about }: { about: AboutInfo }) {
  const topic = useHelp();
  // mounted only while open, so the search starts empty each time
  return topic ? <HelpWindow topic={topic} about={about} /> : null;
}

function HelpWindow({ topic, about }: { topic: HelpTopic; about: AboutInfo }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? TOPICS.filter((x) => `${x.title} ${x.keywords}`.toLowerCase().includes(t)) : TOPICS;
  }, [q]);
  const now = TOPICS.find((x) => x.id === topic) ?? TOPICS[0];
  return (
    <Dialog
      title="WaveForce Help"
      onClose={closeHelp}
      wide
      footer={
        <button type="button" className="btn primary" onClick={closeHelp}>
          Close
        </button>
      }
    >
      <div className="help">
        <nav className="help-nav" aria-label="Help topics">
          <input className="txt" type="search" placeholder="Search help" aria-label="Search help" value={q} onChange={(e) => setQ(e.target.value)} />
          {shown.map((x) => (
            <button key={x.id} type="button" className={x.id === now.id ? 'is-active' : ''} aria-current={x.id === now.id ? 'true' : undefined} onClick={() => openHelp(x.id)}>
              {x.title}
            </button>
          ))}
          {shown.length === 0 && <p className="muted small">Nothing matches.</p>}
        </nav>
        <article className="help-body">
          <h3>{now.title}</h3>
          {now.body(about)}
        </article>
      </div>
    </Dialog>
  );
}
