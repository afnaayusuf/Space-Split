import { useMemo, useState } from 'react';
import { newId, ruleName, ruleType } from '../model/defaults';
import type { Job, JobStatus, JobSummary, WorksSetup } from '../model/types';
import { fileOf, readFile, safeName } from '../state/project';
import { pickFile, saveFile } from './files';
import { fmt, kg } from './format';
import { Panel, Seg } from './live';
import { notify } from './toast';

const STATUS: { id: JobStatus; label: string }[] = [
  { id: 'draft', label: 'Draft' },
  { id: 'packed', label: 'Packed' },
  { id: 'dispatched', label: 'Dispatched' },
];

const when = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const stamp = (iso: string) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? when.format(d) : '–';
};

/** Reads one or more jobs from a job file (picked, or dropped on the page) and stores them; the first is opened. */
export async function importJobFile(setup: WorksSetup, jobs: JobSummary[], onPut: (job: Job, open: boolean) => Promise<void>, file?: File) {
  const f = file ?? (await pickFile('.json,application/json'));
  if (!f) return;
  try {
    const b = readFile(JSON.parse(await f.text()), setup);
    if (!b.jobs.length) return notify('That file holds no jobs. A works setup or backup is loaded under Data & backup.', { tone: 'bad' });
    const ids = new Set(jobs.map((j) => j.id));
    const now = new Date().toISOString();
    for (let i = 0; i < b.jobs.length; i++) {
      const j = b.jobs[i];
      await onPut({ ...j, id: ids.has(j.id) ? newId('j') : j.id, updatedAt: now }, i === 0);
    }
    notify(`${b.jobs.length === 1 ? 'Job' : `${b.jobs.length} jobs`} added from ${f.name}.`, { tone: 'good' });
  } catch (e) {
    notify(e instanceof Error ? e.message : 'That file could not be read.', { tone: 'bad' });
  }
}

interface Props {
  jobs: JobSummary[];
  current: Job;
  currentSaved: boolean;
  setup: WorksSetup;
  canWrite: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  /** Opens a check list (Excel, CSV) or a job file. */
  onOpenFile: () => void;
  onPut: (job: Job, open: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onStatus: (id: string, s: JobStatus) => void;
  load: (id: string) => Promise<Job | null>;
}

/** Every PRN on file: find one, open it, copy it, send it as a file, or delete it. */
export function JobsView({ jobs, current, currentSaved, canWrite, onOpen, onNew, onOpenFile, onPut, onDelete, onStatus, load }: Props) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<JobStatus | 'all'>('all');
  const [confirm, setConfirm] = useState<string | null>(null);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return jobs.filter(
      (j) => (status === 'all' || j.status === status) && (!t || `${j.prn} ${j.po} ${j.customer}`.toLowerCase().includes(t)),
    );
  }, [jobs, q, status]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: jobs.length };
    for (const j of jobs) c[j.status] = (c[j.status] ?? 0) + 1;
    return c;
  }, [jobs]);
  const unsaved = !currentSaved && !jobs.some((j) => j.id === current.id);

  const duplicate = async (id: string) => {
    const j = await load(id).catch(() => null);
    if (!j) return notify('That job could not be read.', { tone: 'bad' });
    const now = new Date().toISOString();
    await onPut({ ...j, id: newId('j'), info: { ...j.info, prn: j.info.prn ? `${j.info.prn} (copy)` : '' }, status: 'draft', createdAt: now, updatedAt: now }, true);
    notify('Copied. You are now on the copy.', { tone: 'good' });
  };
  const exportJob = async (id: string) => {
    const j = id === current.id ? current : await load(id).catch(() => null);
    if (!j) return notify('That job could not be read.', { tone: 'bad' });
    const r = await saveFile(`${safeName(j.info.prn, 'job')}.json`, JSON.stringify(fileOf.job(j), null, 2), 'application/json');
    if (r === 'unavailable') notify('Saving files is not available here.', { tone: 'bad' });
  };

  return (
    <div className="page">
      <Panel
        title={`Jobs · ${jobs.length}`}
        help="jobs"
        actions={
          <>
            <button type="button" className="btn primary" onClick={onNew} disabled={!canWrite}>
              New job
            </button>
            <button type="button" className="btn" onClick={onOpenFile} disabled={!canWrite}>
              Open file…
            </button>
          </>
        }
      >
        <div className="list-tools">
          <input className="txt boxed search" type="search" value={q} placeholder="Find by PRN, PO or customer" aria-label="Find a job" onChange={(e) => setQ(e.target.value)} />
          <Seg<JobStatus | 'all'>
            label="Show"
            value={status}
            onChange={setStatus}
            options={[{ id: 'all', label: `All ${counts.all ?? 0}` }, ...STATUS.map((s) => ({ id: s.id, label: `${s.label} ${counts[s.id] ?? 0}` }))]}
          />
        </div>
        <div className="table-wrap">
          <table className="grid-table jobs-table">
            <thead>
              <tr>
                <th>PRN</th>
                <th>Customer</th>
                <th>PO</th>
                <th>Packing</th>
                <th className="n">Lines</th>
                <th className="n">Pieces</th>
                <th className="n">Boxes</th>
                <th className="n">Gross kg</th>
                <th>Status</th>
                <th>Updated</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {unsaved && (
                <tr className="is-current">
                  <td>
                    <b>{current.info.prn || 'New job'}</b> <span className="tag">open · not saved</span>
                  </td>
                  <td colSpan={10} />

                </tr>
              )}
              {shown.map((j) => (
                <tr key={j.id} className={j.id === current.id ? 'is-current' : ''}>
                  <td>
                    <button type="button" className="link-btn" onClick={() => onOpen(j.id)}>
                      {j.prn || '(no PRN)'}
                    </button>
                    {j.id === current.id && <span className="tag good">open</span>}
                  </td>
                  <td className="clip">{j.customer || <span className="dim">–</span>}</td>
                  <td className="clip">{j.po || <span className="dim">–</span>}</td>
                  <td>
                    T{ruleType(j.rule)} {ruleName(j.rule)}
                  </td>
                  <td className="n">{j.lines}</td>
                  <td className="n">{fmt(j.pieces)}</td>
                  <td className="n">{j.boxes ?? '–'}</td>
                  <td className="n">{j.gross !== null ? kg(j.gross) : '–'}</td>
                  <td>
                    <select className={`status-sel is-${j.status}`} value={j.status} aria-label={`Status of ${j.prn || 'job'}`} disabled={!canWrite} onChange={(e) => onStatus(j.id, e.target.value as JobStatus)}>
                      {STATUS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="dim">{stamp(j.updatedAt)}</td>
                  <td className="row-actions">
                    {confirm === j.id ? (
                      <span className="confirm">
                        Delete {j.prn || 'this job'}?
                        <button
                          type="button"
                          className="btn danger small-btn"
                          onClick={() => {
                            setConfirm(null);
                            void onDelete(j.id);
                          }}
                        >
                          Delete
                        </button>
                        <button type="button" className="btn ghost small-btn" onClick={() => setConfirm(null)}>
                          Keep
                        </button>
                      </span>
                    ) : (
                      <>
                        <button type="button" className="btn small-btn" onClick={() => onOpen(j.id)}>
                          Open
                        </button>
                        <button type="button" className="btn ghost small-btn" onClick={() => void duplicate(j.id)} disabled={!canWrite}>
                          Copy
                        </button>
                        <button type="button" className="btn ghost small-btn" onClick={() => void exportJob(j.id)}>
                          File
                        </button>
                        <button type="button" className="icon-btn" aria-label={`Delete ${j.prn || 'job'}`} onClick={() => setConfirm(j.id)} disabled={!canWrite}>
                          ×
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {jobs.length === 0 && !unsaved && <p className="empty-row">No jobs yet.</p>}
        {jobs.length > 0 && shown.length === 0 && <p className="empty-row">No job matches.</p>}
      </Panel>
    </div>
  );
}
