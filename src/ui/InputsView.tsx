import type { JobInfo } from '../model/types';

/** The PRN / PO header that the printed forms carry. */
export function JobFields({ job, onChange }: { job: JobInfo; onChange: (j: JobInfo) => void }) {
  const f = (k: keyof JobInfo, label: string, type = 'text', placeholder = '') => (
    <label className="lcd-field">
      <span>{label}</span>
      <input type={type} value={job[k]} placeholder={placeholder} onChange={(e) => onChange({ ...job, [k]: e.target.value })} />
    </label>
  );
  return (
    <div className="job-fields">
      {f('prn', 'PRN no', 'text', 'GGPL/SE/SO/…')}
      {f('po', 'PO no')}
      {f('poDate', 'PO date', 'date')}
      {f('customer', 'Customer')}
      {f('dispatch', 'Dispatch', 'text', 'Surface / Air / Sea')}
      {f('date', 'Packing date', 'date')}
    </div>
  );
}
