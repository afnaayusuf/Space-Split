import { useState } from 'react';
import { defaultSetup } from '../model/defaults';
import type { Job, JobSummary, MasterItem, WorksSetup } from '../model/types';
import { fileOf, readFile, type Backup } from '../state/project';
import type { Store } from '../state/store';
import { Dialog } from './Dialog';
import { pickFile, saveFile } from './files';
import { stamp } from './JobsView';
import { Panel } from './live';
import { notify } from './toast';

/** Everything on file — setup, weight master and every job — as one file. */
export async function downloadBackup(store: Store, setup: WorksSetup, master: MasterItem[], jobs: JobSummary[], current: Job | null) {
  try {
    const full: Job[] = [];
    for (const s of jobs) {
      const j = current && s.id === current.id ? current : await store.loadJob(s.id, setup);
      if (j) full.push(j);
    }
    if (current && !jobs.some((s) => s.id === current.id) && current.lines.length) full.push(current);
    const day = new Date().toISOString().slice(0, 10);
    const r = await saveFile(`waveforce-backup-${day}.json`,JSON.stringify(fileOf.backup({ setup, master, jobs: full })), 'application/json');
    if (r === 'saved') notify(`Backup of ${full.length} ${full.length === 1 ? 'job' : 'jobs'} saved.`, { tone: 'good' });
    else if (r === 'unavailable') notify('Saving files is not available here.', { tone: 'bad' });
  } catch (e) {
    notify(e instanceof Error ? e.message : 'The backup could not be made.', { tone: 'bad' });
  }
}

interface Props {
  store: Store;
  setup: WorksSetup;
  setupStored: boolean;
  master: MasterItem[];
  jobs: JobSummary[];
  job: Job;
  onSetup: (s: WorksSetup) => void;
  onPutJob: (j: Job, open: boolean) => Promise<void>;
  onPutMaster: (items: MasterItem[]) => Promise<boolean>;
}

export function DataView({ store, setup, setupStored, master, jobs, job, onSetup, onPutJob, onPutMaster }: Props) {
  const [restore, setRestore] = useState<{ name: string; b: Backup } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);

  const openBackup = async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      setRestore({ name: f.name, b: readFile(JSON.parse(await f.text()), setup) });
    } catch (e) {
      notify(e instanceof Error ? e.message : 'That file could not be read.', { tone: 'bad' });
    }
  };
  const doRestore = async () => {
    if (!restore) return;
    setBusy(true);
    const { b } = restore;
    try {
      if (b.setup && store.canEditSetup) onSetup(b.setup);
      if (b.master.length) await onPutMaster(b.master);
      // the open job is reopened from the file, so the next autosave does not undo the restore
      for (const j of b.jobs) await onPutJob(j, j.id === job.id);
      notify(`Restored ${b.jobs.length} ${b.jobs.length === 1 ? 'job' : 'jobs'}${b.master.length ? `, ${b.master.length} weights` : ''}${b.setup && store.canEditSetup ? ' and the works setup' : ''}.`, {
        tone: 'good',
      });
      setRestore(null);
    } finally {
      setBusy(false);
    }
  };
  const saveSetupFile = async () => {
    const r = await saveFile('waveforce-works-setup.json',JSON.stringify(fileOf.setup(setup), null, 2), 'application/json');
    if (r === 'unavailable') notify('Saving files is not available here.', { tone: 'bad' });
  };

  const where = store.kind === 'shared' ? 'Shared with your team' : store.kind === 'browser' ? 'This browser' : 'Not saved (storage blocked)';

  return (
    <div className="page">
      <div className="cols">
        <Panel title="Data" help="data">
          <dl className="facts">
            <div>
              <dt>Kept in</dt>
              <dd>{where}</dd>
            </div>
            <div>
              <dt>Jobs</dt>
              <dd>{jobs.length}</dd>
            </div>
            <div>
              <dt>Weights</dt>
              <dd>{master.length}</dd>
            </div>
            <div>
              <dt>Works setup</dt>
              <dd>{setupStored ? `saved ${stamp(setup.updatedAt)}` : 'works defaults'}</dd>
            </div>
            <div>
              <dt>You can</dt>
              <dd>
                {store.canWrite ? 'change jobs and weights' : 'read jobs and weights'}
                {store.canEditSetup ? ', change the works setup' : ', read the works setup'}
              </dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>
                {__APP_VERSION__}, built {__BUILD_DATE__}
              </dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Backup" help="data">
          <div className="btn-row">
            <button type="button" className="btn primary" onClick={() => void downloadBackup(store, setup, master, jobs, job)}>
              Download backup
            </button>
            <button type="button" className="btn" onClick={() => void openBackup()} disabled={!store.canWrite}>
              Restore from a backup…
            </button>
          </div>
        </Panel>
      </div>

      <Panel title="Works setup" help="data">
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => void saveSetupFile()}>
            Download setup file
          </button>
          {confirmReset ? (
            <span className="confirm">
              Put the box ladder, rules and vehicles back to the works defaults?
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  onSetup(defaultSetup());
                  setConfirmReset(false);
                  notify('Works setup reset to the defaults.', { tone: 'good' });
                }}
              >
                Reset
              </button>
              <button type="button" className="btn ghost" onClick={() => setConfirmReset(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button type="button" className="btn ghost" onClick={() => setConfirmReset(true)} disabled={!store.canEditSetup}>
              Reset to the works defaults
            </button>
          )}
        </div>
      </Panel>

      {restore && (
        <Dialog
          title={`Restore from ${restore.name}`}
          onClose={() => setRestore(null)}
          footer={
            <>
              <button type="button" className="btn ghost" onClick={() => setRestore(null)}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={() => void doRestore()} disabled={busy || (!restore.b.jobs.length && !restore.b.master.length && !restore.b.setup)}>
                {busy ? 'Restoring…' : 'Restore'}
              </button>
            </>
          }
        >
          <ul className="restore-list">
            <li>
              {restore.b.jobs.length} {restore.b.jobs.length === 1 ? 'job' : 'jobs'}
              {restore.b.jobs.length > 0 && <span className="muted"> — {restore.b.jobs.slice(0, 5).map((j) => j.info.prn || '(no PRN)').join(', ')}{restore.b.jobs.length > 5 ? ' …' : ''}</span>}
            </li>
            <li>{restore.b.master.length} chart weights</li>
            <li>
              {restore.b.setup
                ? store.canEditSetup
                  ? 'the works setup — it replaces the one in use'
                  : 'a works setup — skipped, only editors can change it'
                : 'no works setup'}
            </li>
          </ul>
        </Dialog>
      )}
    </div>
  );
}
