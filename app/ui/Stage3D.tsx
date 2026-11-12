import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Object3D } from 'three';
import type { Crate, Load, Settings, Vehicle } from '../model/types';
import { Stage, type ViewName } from '../three/stage';

function useStage(onPick?: (id: string | null) => void) {
  const host = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [failed, setFailed] = useState(false);
  const pick = useRef(onPick);
  pick.current = onPick;
  useEffect(() => {
    let s: Stage | null = null;
    try {
      s = new Stage(host.current!, (id) => pick.current?.(id));
      setStage(s);
    } catch {
      setFailed(true);
    }
    return () => s?.dispose();
  }, []);
  return { host, stage, failed };
}

const NoWebGL = () => <div className="stage-fallback">This browser cannot draw 3D (WebGL is off). The plan, crate list and report still work.</div>;

interface LoadProps {
  load: Load | null;
  vehicle: Vehicle;
  crates: Map<string, Crate>;
  settings: Settings;
  colorOf: (line: string) => string;
  step: number | null;
  xray: boolean;
  cog: boolean;
  view: ViewName;
  selected: string | null;
  dark: boolean;
  /** An uploaded tractor model, or null for the built-in one. */
  truck: Object3D | null;
  onPick: (crate: string | null) => void;
  children?: ReactNode;
}

/** The vehicle with its load: orbit with the mouse, click a crate to pick it. */
export function LoadStage(p: LoadProps) {
  const { host, stage, failed } = useStage(p.onPick);
  const firstView = useRef(true);
  const lastVehicle = useRef<string>('');

  useEffect(() => {
    if (!stage) return;
    stage.setTheme(p.dark);
    stage.showLoad(p.load, p.vehicle, p.crates, p.settings, p.colorOf, p.truck);
    if (firstView.current || lastVehicle.current !== p.vehicle.id) stage.setView(p.view, firstView.current);
    firstView.current = false;
    lastVehicle.current = p.vehicle.id;
  }, [stage, p.load, p.vehicle, p.crates, p.settings, p.colorOf, p.dark, p.truck]);
  useEffect(() => stage?.setStep(p.step ?? Infinity, true), [stage, p.step]);
  useEffect(() => stage?.setXray(p.xray), [stage, p.xray, p.load]);
  useEffect(() => stage?.setCog(p.cog), [stage, p.cog, p.load]);
  useEffect(() => stage?.select(p.selected), [stage, p.selected, p.load]);
  useEffect(() => {
    if (!firstView.current) stage?.setView(p.view);
  }, [stage, p.view]);

  return (
    <div className="stage" ref={host}>
      {failed && <NoWebGL />}
      {p.children}
    </div>
  );
}

interface CrateProps {
  crate: Crate;
  settings: Settings;
  colorOf: (line: string) => string;
  dark: boolean;
  view: ViewName;
  /** 0 = packed, 1 = pulled fully apart. */
  explode: number;
  children?: ReactNode;
}

/** One open crate with its cardboard squares and gaskets; pull it apart or step through the packing. */
export function CrateStage(p: CrateProps) {
  const { host, stage, failed } = useStage();
  const shown = useRef('');
  useEffect(() => {
    if (!stage) return;
    stage.setTheme(p.dark);
    stage.setExplode(p.explode);
    stage.showCrate(p.crate, p.settings, p.colorOf);
    if (shown.current !== p.crate.id) stage.setView(p.view, !shown.current);
    shown.current = p.crate.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, p.crate, p.settings, p.colorOf, p.dark]);
  useEffect(() => stage?.setExplode(p.explode, p.crate), [stage, p.explode, p.crate]);
  useEffect(() => {
    if (shown.current) stage?.setView(p.view);
  }, [stage, p.view]);
  return (
    <div className="stage" ref={host}>
      {failed && <NoWebGL />}
      {p.children}
    </div>
  );
}
