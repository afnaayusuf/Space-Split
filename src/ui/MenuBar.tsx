import { useEffect, useRef, useState } from 'react';

export type MenuItem =
  | { sep: true }
  | { sep?: false; label: string; shortcut?: string; onSelect: () => void; disabled?: boolean; checked?: boolean };

export interface Menu {
  label: string;
  items: MenuItem[];
}

/** A desktop-style menu bar: click to open, hover to move between menus, arrows and Esc on the keyboard. */
export function MenuBar({ menus }: { menus: Menu[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === null) return;
    const away = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) setOpen(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(null);
        (bar.current?.querySelectorAll<HTMLButtonElement>('.menu-top')[open] ?? null)?.focus();
      }
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  // focus the first item when a menu opens from the keyboard
  const focusItem = (dir: 1 | -1, from?: HTMLElement) => {
    const items = [...(bar.current?.querySelectorAll<HTMLButtonElement>('.menu-pop button:not(:disabled)') ?? [])];
    if (!items.length) return;
    const at = from ? items.indexOf(from as HTMLButtonElement) : -1;
    items[(at + dir + items.length) % items.length].focus();
  };

  return (
    <div className="menubar" role="menubar" ref={bar}>
      {menus.map((m, i) => (
        <div key={m.label} className={`menu${open === i ? ' is-open' : ''}`}>
          <button
            type="button"
            className="menu-top"
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? null : i)}
            onPointerEnter={() => open !== null && open !== i && setOpen(i)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setOpen(i);
                setTimeout(() => focusItem(1));
              } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + menus.length) % menus.length;
                bar.current?.querySelectorAll<HTMLButtonElement>('.menu-top')[n]?.focus();
                if (open !== null) setOpen(n);
              }
            }}
          >
            {m.label}
          </button>
          {open === i && (
            <div className="menu-pop" role="menu" aria-label={m.label}>
              {m.items.map((it, k) =>
                it.sep ? (
                  <hr key={k} />
                ) : (
                  <button
                    key={k}
                    type="button"
                    role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                    aria-checked={it.checked}
                    disabled={it.disabled}
                    onClick={() => {
                      setOpen(null);
                      it.onSelect();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                        e.preventDefault();
                        focusItem(e.key === 'ArrowDown' ? 1 : -1, e.currentTarget);
                      }
                    }}
                  >
                    <span className="menu-check" aria-hidden="true">
                      {it.checked ? '✓' : ''}
                    </span>
                    <span className="menu-label">{it.label}</span>
                    {it.shortcut && <kbd>{it.shortcut}</kbd>}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
