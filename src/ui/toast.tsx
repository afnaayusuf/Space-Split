import { useSyncExternalStore } from 'react';

/** Short messages in the corner: what just happened, with an Undo where it makes sense. */
export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad';
  action?: { label: string; run: () => void };
}

let list: Toast[] = [];
let next = 1;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function notify(text: string, opts: { tone?: Toast['tone']; action?: Toast['action']; ms?: number } = {}) {
  const t: Toast = { id: next++, text, tone: opts.tone ?? 'info', action: opts.action };
  list = [...list.filter((x) => x.text !== text), t].slice(-4);
  emit();
  setTimeout(() => dismiss(t.id), opts.ms ?? (opts.action ? 7000 : opts.tone === 'bad' ? 8000 : 3500));
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
          {t.action && (
            <button
              type="button"
              className="btn small-btn"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
