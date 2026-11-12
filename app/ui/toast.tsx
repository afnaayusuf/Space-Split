import { useSyncExternalStore } from 'react';

/** Short messages at the bottom: what just happened. */
export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad';
}

let list: Toast[] = [];
let next = 1;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function notify(text: string, opts: { tone?: Toast['tone']; ms?: number } = {}) {
  const t: Toast = { id: next++, text, tone: opts.tone ?? 'info' };
  list = [...list.filter((x) => x.text !== text), t].slice(-3);
  emit();
  setTimeout(() => dismiss(t.id), opts.ms ?? (opts.tone === 'bad' ? 8000 : 4000));
}

export function dismiss(id: number) {
  const before = list.length;
  list = list.filter((x) => x.id !== id);
  if (list.length !== before) emit();
}

export function Toasts() {
  const items = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    () => list,
  );
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast is-${t.tone}`}>
          <span>{t.text}</span>
          <button type="button" className="toast-x" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
