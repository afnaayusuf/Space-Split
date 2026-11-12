import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Modal window built on the native <dialog>: focus stays inside, Esc closes.
 * Mount it only while it should be open.
 */
export function Dialog({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) {
      try {
        d.showModal();
      } catch {
        d.setAttribute('open', ''); // very old engines: still shows, just not modal
      }
    }
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog${wide ? ' is-wide' : ''}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="dialog-body">{children}</div>
      <footer className="dialog-foot">{footer}</footer>
    </dialog>
  );
}
