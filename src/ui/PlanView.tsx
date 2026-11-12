import { useEffect, useMemo, useRef, useState } from 'react';
import { ruleName } from '../model/defaults';
import type { GasketLine, PackagePlan } from '../model/types';
import type { ColorBy, TypeColor } from './colors';
import { BoxDetailDrawing, boxBounds } from './drawing/BoxDetailDrawing';
import { FloorDrawing, floorBounds } from './drawing/FloorDrawing';
import { RingGradients } from './drawing/shapes';
import { ZoomPan, type ZoomPanHandle } from './drawing/ZoomPan';
import { count, dims, fmt, kg, lineName, pct } from './format';
import { Legend } from './Legend';
import { BoxCard, BoxDetailPanel, LayerTabs } from './SidePanel';

interface Props {
  plan: PackagePlan;
  colors: Map<string, TypeColor>;
  colorBy: ColorBy;
  onColorBy: (c: ColorBy) => void;
  busy: boolean;
  onEditInputs: () => void;
}

export function PlanView({ plan, colors, colorBy, onColorBy, busy, onEditInputs }: Props) {
  const [unit, setUnit] = useState(0);
  const [tier, setTier] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [openNo, setOpenNo] = useState<number | null>(null);
  const [hoverNo, setHoverNo] = useState<number | null>(null);
  const [activeStack, setActiveStack] = useState<number | null>(null);
  const [showCog, setShowCog] = useState(true);
  const zp = useRef<ZoomPanHandle>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const legendReserve = () => {
    const c = canvasRef.current?.getBoundingClientRect();
    const l = legendRef.current?.getBoundingClientRect();
    if (!c || !l || !l.width) return null;
    return { left: l.right - c.left + 12, bottom: c.bottom - l.top + 12 };
  };

  const types = useMemo(() => new Map<string, GasketLine>(plan.types.map((t) => [t.id, t])), [plan.types]);
  const u = Math.min(unit, Math.max(0, plan.units.length - 1));
  const cargoUnit = plan.units[u];
  const t = Math.min(tier, Math.max(0, (cargoUnit?.tiers ?? 1) - 1));
  const openBox = openNo !== null ? (plan.boxes.find((b) => b.no === openNo) ?? null) : null;

  // keep the view on something that still exists after a re-plan
  useEffect(() => {
    if (openNo !== null && !plan.boxes.some((b) => b.no === openNo)) setOpenNo(null);
    if (selected !== null && !plan.boxes.some((b) => b.no === selected)) setSelected(null);
  }, [plan, openNo, selected]);

  const here = plan.boxes.filter((b) => b.location?.unit === u && b.location.tier === t).sort((a, b) => a.location!.load - b.location!.load);
  const unloaded = plan.boxes.filter((b) => !b.location);
  const present = new Set<string>((openBox ? [openBox] : here).flatMap((b) => b.contents.map((c) => c.typeId)));

  const openBoxAt = (no: number) => {
    const b = plan.boxes.find((x) => x.no === no);
    if (b?.location) {
      setUnit(b.location.unit);
      setTier(b.location.tier);
    }
    setSelected(no);
    setOpenNo(no);
    setActiveStack(null);
  };

  const bounds = openBox ? boxBounds(openBox) : floorBounds(plan);
  const fitKey = openBox ? `box-${openBox.no}-${openBox.ext.l}-${openBox.ext.w}` : `floor-${u}-${plan.cargo.length}-${plan.cargo.width}`;
  const L = plan.cargo.length;
  const W = plan.cargo.width;
  const cogOff = cargoUnit?.cog ? { x: cargoUnit.cog.x - L / 2, y: cargoUnit.cog.y - W / 2 } : null;
  const unitName = plan.units.length > 1 ? `Truck ${u + 1}` : plan.cargo.name;
  const sec = cargoUnit?.securing;

  return (
    <div className="plan">
      <section className="stage" aria-label="Package plan drawing">
        <div className="stage-bar">
          <nav className="crumbs" aria-label="Location">
            <button type="button" onClick={() => setOpenNo(null)} disabled={!openBox}>
              {unitName}
            </button>
            <span aria-hidden="true">›</span>
            <button type="button" onClick={() => setOpenNo(null)} disabled={!openBox}>
              Layer {(openBox?.location?.tier ?? t) + 1}
            </button>
            {openBox && (
              <>
                <span aria-hidden="true">›</span>
                <span className="crumb-current">Box {openBox.label}</span>
              </>
            )}
          </nav>
          <div className="stage-tools">
            {plan.units.length > 1 && !openBox && (
              <div className="seg" role="group" aria-label="Truck">
                {plan.units.map((x) => (
                  <button
                    key={x.index}
                    type="button"
                    className={x.index === u ? 'is-active' : ''}
                    onClick={() => {
                      setUnit(x.index);
                      setTier(0);
                      setSelected(null);
                    }}
                  >
                    Truck {x.index + 1}
                  </button>
                ))}
              </div>
            )}
            <button type="button" className={`tgl${showCog ? ' is-on' : ''}`} aria-pressed={showCog} onClick={() => setShowCog(!showCog)} disabled={!!openBox}>
              CoG
            </button>
            <div className="seg" role="group" aria-label="Colour by">
              <button type="button" className={colorBy === 'item' ? 'is-active' : ''} onClick={() => onColorBy('item')}>
                Line
              </button>
              <button type="button" className={colorBy === 'kind' ? 'is-active' : ''} onClick={() => onColorBy('kind')}>
                Type
              </button>
            </div>
          </div>
        </div>

        <div className="canvas" ref={canvasRef}>
          {plan.boxes.length === 0 ? (
            <div className="empty">
              <h2>No boxes to show</h2>
              <p>
                {plan.totals.requested === 0 ? 'No PRN lines yet.' : 'Nothing could be packed. See the notes.'}
              </p>
              <button type="button" className="btn" onClick={onEditInputs}>
                PRN lines
              </button>
            </div>
          ) : (
            <ZoomPan
              ref={zp}
              bounds={bounds}
              fitKey={fitKey}
              label={openBox ? `Box ${openBox.label} seen from above` : `Layer ${t + 1} of ${unitName} seen from above`}
              onBackgroundClick={() => setSelected(null)}
              reserve={legendReserve}
              defs={<RingGradients prefix="pv" types={plan.types} colors={colors} />}
            >
              {openBox ? (
                <BoxDetailDrawing box={openBox} types={types} colors={colors} gradPrefix="pv" activeStack={activeStack} onStackEnter={setActiveStack} />
              ) : plan.units.length > 0 ? (
                <FloorDrawing
                  plan={plan}
                  unit={u}
                  tier={t}
                  types={types}
                  colors={colors}
                  gradPrefix="pv"
                  selectedNo={selected}
                  hoverNo={hoverNo}
                  showCog={showCog}
                  onSelect={setSelected}
                  onOpen={openBoxAt}
                  onHover={setHoverNo}
                />
              ) : null}
            </ZoomPan>
          )}
          <Legend ref={legendRef} types={plan.types} colors={colors} colorBy={colorBy} present={present} />
          <div className="zoom-ctl" role="group" aria-label="Zoom">
            <button type="button" onClick={() => zp.current?.zoom(0.8)} aria-label="Zoom in">
              +
            </button>
            <button type="button" onClick={() => zp.current?.zoom(1.25)} aria-label="Zoom out">
              −
            </button>
            <button type="button" onClick={() => zp.current?.fit()}>
              Fit
            </button>
          </div>
          {busy && <div className="busy">Updating plan…</div>}
        </div>
      </section>

      <aside className="side">
        {openBox ? (
          <BoxDetailPanel
            box={openBox}
            plan={plan}
            types={types}
            colors={colors}
            activeStack={activeStack}
            onStackHover={setActiveStack}
            onBack={() => setOpenNo(null)}
            backLabel={`Layer ${(openBox.location?.tier ?? t) + 1} floor plan`}
          />
        ) : (
          <>
            {cargoUnit && <LayerTabs count={cargoUnit.tiers} active={t} onChange={(k) => setTier(k)} />}

            <section className="unit-summary">
              <h2>{unitName}</h2>
              <p className="muted">
                {ruleName(plan.settings.rule)} · floor {dims(L, W)} mm{plan.cargo.height > 0 ? ` · ${fmt(plan.cargo.height)} mm high` : ''}
              </p>
              {cargoUnit && (
                <dl className="stats">
                  <div>
                    <dt>Boxes</dt>
                    <dd>{cargoUnit.boxUids.length}</dd>
                  </div>
                  <div>
                    <dt>Gross</dt>
                    <dd>{kg(cargoUnit.weight)} kg</dd>
                  </div>
                  <div>
                    <dt>Floor used</dt>
                    <dd>
                      {fmt(cargoUnit.usedLength)} mm <span className="muted">({pct(cargoUnit.floorUse)})</span>
                    </dd>
                  </div>
                  <div>
                    <dt>Volume</dt>
                    <dd>{fmt(plan.totals.cbm, 2)} m³</dd>
                  </div>
                  {plan.recommendedVehicle && (
                    <div className="wide">
                      <dt>Smallest vehicle that takes it</dt>
                      <dd>{plan.recommendedVehicle}</dd>
                    </div>
                  )}
                  {cogOff && (
                    <div className="wide">
                      <dt>Centre of gravity</dt>
                      <dd>
                        {fmt(Math.abs(cogOff.x))} mm {cogOff.x < 0 ? 'toward the front' : 'toward the door'} · {fmt(Math.abs(cogOff.y))} mm off the centre line
                      </dd>
                    </div>
                  )}
                  {sec && (
                    <div className="wide">
                      <dt>Securing (estimate)</dt>
                      <dd>
                        {sec.overTop} over-top + {sec.xLash} X-lashes · {fmt(sec.webbing)} m webbing · {sec.cornerBoards} corner boards · tarpaulin {fmt(sec.tarpaulin.l, 1)} × {fmt(sec.tarpaulin.w, 1)} m
                      </dd>
                    </div>
                  )}
                </dl>
              )}
            </section>

            <Notes plan={plan} />

            <section className="box-list">
              <h3>
                Layer {t + 1} · {here.length} {here.length === 1 ? 'box' : 'boxes'}
              </h3>
              {here.map((b) => (
                <BoxCard
                  key={b.uid}
                  box={b}
                  plan={plan}
                  colors={colors}
                  selected={selected === b.no}
                  onSelect={() => setSelected(selected === b.no ? null : b.no)}
                  onOpen={() => openBoxAt(b.no)}
                  onHover={(on) => setHoverNo(on ? b.no : null)}
                />
              ))}
            </section>

            {unloaded.length > 0 && (
              <section className="box-list">
                <h3>Not on the floor · {unloaded.length}</h3>
                {unloaded.map((b) => (
                  <BoxCard
                    key={b.uid}
                    box={b}
                    plan={plan}
                    colors={colors}
                    selected={false}
                    onSelect={() => openBoxAt(b.no)}
                    onOpen={() => openBoxAt(b.no)}
                    onHover={() => undefined}
                  />
                ))}
              </section>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

export function Notes({ plan }: { plan: PackagePlan }) {
  const names = new Map(plan.types.map((t) => [t.id, lineName(t)]));
  const all = plan.totals.pieces === plan.totals.requested && plan.unloadedBoxUids.length === 0;
  const clean = all && plan.warnings.length === 0;
  return (
    <section className="notes">
      <p className={`status ${plan.issues.length ? 'is-bad' : clean ? 'is-good' : 'is-warn'}`}>
        {plan.issues.length
          ? `${plan.issues.length} rule ${plan.issues.length === 1 ? 'problem' : 'problems'} found`
          : clean
            ? `All ${count(plan.totals.pieces, 'piece')} packed in ${count(plan.totals.boxes, 'box', 'boxes')} · every rule checked`
            : all
              ? `${count(plan.totals.pieces, 'piece')} packed in ${count(plan.totals.boxes, 'box', 'boxes')} · read the notes`
              : `${fmt(plan.totals.pieces)} of ${fmt(plan.totals.requested)} pieces packed · read the notes`}
      </p>
      {(plan.unplacedGaskets.length > 0 || plan.warnings.length > 0 || plan.issues.length > 0) && (
        <ul className="note-list">
          {plan.unplacedGaskets.map((u) => (
            <li key={u.typeId}>
              <b>
                {names.get(u.typeId)}: {fmt(u.quantity)} pcs not packed.
              </b>{' '}
              {u.reason}
            </li>
          ))}
          {plan.warnings.map((w, i) => (
            <li key={`w${i}`}>{w}</li>
          ))}
          {plan.issues.map((w, i) => (
            <li key={`i${i}`} className="is-bad">
              {w}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
