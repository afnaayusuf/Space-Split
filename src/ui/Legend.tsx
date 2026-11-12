import { useState, type Ref } from 'react';
import { familyName } from '../model/defaults';
import type { GasketLine } from '../model/types';
import { FALLBACK_COLOR, type ColorBy, type TypeColor } from './colors';
import { ringPath } from './drawing/shapes';
import { fmt, lineName, lineSpec } from './format';

interface Entry {
  key: string;
  type: GasketLine; // gradient source
  title: string;
  detail: string;
  qty: number;
  present: boolean;
}

export function RingSwatch({ type, color, size = 26 }: { type: { id: string; od: number; innerD: number }; color: TypeColor; size?: number }) {
  const k = type.od > 0 ? Math.min(0.9, Math.max(0.35, type.innerD / type.od)) : 0.6;
  const id = `sw-${type.id}-${size}`;
  return (
    <svg className="swatch" width={size} height={size} viewBox="-1 -1 2 2" aria-hidden="true">
      <defs>
        <radialGradient id={id} cx="50%" cy="50%" r="50%">
          <stop offset={k} stopColor={color.light} />
          <stop offset={(k + 1) / 2} stopColor={color.base} />
          <stop offset={1} stopColor={color.dark} />
        </radialGradient>
      </defs>
      <path d={ringPath(0, 0, 0.96, 0.96 * k)} fill={`url(#${id})`} fillRule="evenodd" stroke={color.dark} strokeWidth={0.04} />
    </svg>
  );
}

/** Colour key in the corner of the drawing. Lines not in the current view are dimmed. */
export function Legend({
  types,
  colors,
  colorBy,
  present,
  ref,
}: {
  types: GasketLine[];
  colors: Map<string, TypeColor>;
  colorBy: ColorBy;
  present: Set<string>;
  ref?: Ref<HTMLDivElement>;
}) {
  // on phones the drawing needs the room; the key opens with one tap
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 700);
  const entries: Entry[] = [];
  if (colorBy === 'item') {
    for (const t of types)
      entries.push({
        key: t.id,
        type: t,
        title: lineName(t),
        detail: `${lineSpec(t)} · ${fmt(t.od, 1)} × ${fmt(t.innerD, 1)} × ${fmt(t.thickness, 1)}`,
        qty: t.quantity,
        present: present.has(t.id),
      });
  } else {
    const byKind = new Map<string, Entry & { sizes: number }>();
    for (const t of types) {
      const e = byKind.get(t.family);
      if (e) {
        e.qty += t.quantity;
        e.sizes += 1;
        e.present ||= present.has(t.id);
      } else byKind.set(t.family, { key: t.family, type: t, title: familyName(t.family), detail: '', qty: t.quantity, present: present.has(t.id), sizes: 1 });
    }
    for (const e of byKind.values()) entries.push({ ...e, detail: e.sizes === 1 ? '1 line' : `${e.sizes} lines` });
  }

  return (
    <div ref={ref} className={`legend${open ? '' : ' is-closed'}`}>
      <button type="button" className="legend-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{colorBy === 'item' ? 'PRN lines' : 'Gasket types'}</span>
        <span className="legend-toggle" aria-hidden="true">
          {open ? '–' : '+'}
        </span>
      </button>
      {open && (
        <ul>
          {entries.map((e) => (
            <li key={e.key} className={e.present ? '' : 'is-dim'}>
              <RingSwatch type={e.type} color={colors.get(e.type.id) ?? FALLBACK_COLOR} />
              <span className="legend-name">{e.title}</span>
              <span className="legend-qty">{fmt(e.qty)} pcs</span>
              <span className="legend-detail">{e.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
