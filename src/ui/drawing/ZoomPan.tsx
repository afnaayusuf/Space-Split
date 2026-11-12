import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ZoomPanHandle {
  fit(): void;
  zoom(factor: number): void;
}

/** Screen space (px from the canvas edges) taken by an overlay such as the legend in the bottom-left corner. */
export interface Reserve {
  left: number;
  bottom: number;
}

interface Props {
  bounds: ViewBox;
  /** The view refits whenever this changes. */
  fitKey: string;
  defs?: ReactNode;
  children: ReactNode;
  label: string;
  onBackgroundClick?: () => void;
  /** Read when fitting: the drawing is kept clear of this corner overlay. */
  reserve?: () => Reserve | null;
  ref?: Ref<ZoomPanHandle>;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** SVG canvas in millimetres with wheel / pinch zoom and drag to pan. */
export function ZoomPan({ bounds, fitKey, defs, children, label, onBackgroundClick, reserve, ref }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState<ViewBox>(bounds);
  const vbRef = useRef(vb);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const reserveRef = useRef(reserve);
  reserveRef.current = reserve;

  const apply = (v: ViewBox) => {
    vbRef.current = v;
    setVb(v);
  };

  /**
   * View box that shows the whole drawing as large as possible while keeping
   * clear of the overlay: beside it or above it, whichever leaves more room.
   */
  const fitView = (): ViewBox => {
    const b = boundsRef.current;
    const r = svg.current?.getBoundingClientRect();
    if (!r || r.width < 40 || r.height < 40) return b;
    const base = { l: 12, r: 12, t: 30, b: 12 };
    const res = reserveRef.current?.();
    type Option = { s: number; o: typeof base; iw: number; ih: number };
    const measure = (o: typeof base): Option | null => {
      const iw = r.width - o.l - o.r;
      const ih = r.height - o.t - o.b;
      return iw < 60 || ih < 60 ? null : { s: Math.min(iw / b.w, ih / b.h), o, iw, ih };
    };
    const plain = measure(base);
    let best: Option | null = null;
    if (res)
      for (const o of [{ ...base, l: Math.max(base.l, res.left) }, { ...base, b: Math.max(base.b, res.bottom) }]) {
        const m = measure(o);
        if (m && (!best || m.s > best.s)) best = m;
      }
    // dodging the overlay is not worth shrinking the drawing to a sliver
    if (!best || (plain && best.s < plain.s * 0.6)) best = plain;
    if (!best) return b;
    const { s, o, iw, ih } = best;
    return { x: b.x - (o.l + (iw - b.w * s) / 2) / s, y: b.y - (o.t + (ih - b.h * s) / 2) / s, w: r.width / s, h: r.height / s };
  };

  useEffect(() => {
    apply(fitView());
  }, [fitKey]);

  const scale = () => {
    const el = svg.current;
    if (!el) return { s: 1, ox: 0, oy: 0 };
    const r = el.getBoundingClientRect();
    const v = vbRef.current;
    const s = Math.min(r.width / v.w, r.height / v.h) || 1;
    return { s, ox: r.left + (r.width - v.w * s) / 2, oy: r.top + (r.height - v.h * s) / 2 };
  };

  const zoomAt = (cx: number, cy: number, f: number) => {
    const v = vbRef.current;
    const { s, ox, oy } = scale();
    const px = v.x + (cx - ox) / s;
    const py = v.y + (cy - oy) / s;
    const b = boundsRef.current;
    const nw = clamp(v.w * f, b.w / 80, b.w * 3);
    const k = nw / v.w;
    apply({ x: px - (px - v.x) * k, y: py - (py - v.y) * k, w: v.w * k, h: v.h * k });
  };

  const zoomCenter = (f: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (r) zoomAt(r.left + r.width / 2, r.top + r.height / 2, f);
  };

  useImperativeHandle(ref, () => ({ fit: () => apply(fitView()), zoom: zoomCenter }));

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      zoomAt(e.clientX, e.clientY, Math.exp(clamp(e.deltaY * unit, -300, 300) * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ sx: number; sy: number; v: ViewBox; moved: boolean } | null>(null);
  const pinch = useRef<number | null>(null);
  const suppressClick = useRef(false);

  const pair = () => {
    const [a, b] = [...pointers.current.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  return (
    <svg
      ref={svg}
      className="zoompan"
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
        suppressClick.current = false;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 1) drag.current = { sx: e.clientX, sy: e.clientY, v: vbRef.current, moved: false };
        else if (pointers.current.size === 2) {
          drag.current = null;
          pinch.current = pair().d;
        }
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch.current !== null && pointers.current.size >= 2) {
          const p = pair();
          if (p.d > 0) zoomAt(p.mx, p.my, pinch.current / p.d);
          pinch.current = p.d;
          suppressClick.current = true;
          return;
        }
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.sx;
        const dy = e.clientY - d.sy;
        if (!d.moved && Math.hypot(dx, dy) > 4) {
          d.moved = true;
          svg.current?.setPointerCapture(e.pointerId);
        }
        if (d.moved) {
          const { s } = scale();
          apply({ ...d.v, x: d.v.x - dx / s, y: d.v.y - dy / s });
        }
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        if (drag.current?.moved) suppressClick.current = true;
        if (pointers.current.size < 2) pinch.current = null;
        if (pointers.current.size === 0) drag.current = null;
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        drag.current = null;
        pinch.current = null;
      }}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          e.stopPropagation();
          suppressClick.current = false;
        }
      }}
      onClick={(e) => {
        if (e.target === svg.current) onBackgroundClick?.();
      }}
    >
      {defs && <defs>{defs}</defs>}
      {children}
    </svg>
  );
}
