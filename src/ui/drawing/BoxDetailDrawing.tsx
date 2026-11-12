import type { GasketLine, PackedBox } from '../../model/types';
import type { TypeColor } from '../colors';
import { BoxGraphic } from './BoxGraphic';
import { AxisArrow } from './shapes';
import type { ViewBox } from './ZoomPan';

export function boxBounds(box: PackedBox): ViewBox {
  const m = Math.min(box.ext.l, box.ext.w);
  return { x: -m * 0.22, y: -m * 0.2, w: box.ext.l + m * 0.3, h: box.ext.w + m * 0.28 };
}

interface Props {
  box: PackedBox;
  types: Map<string, GasketLine>;
  colors: Map<string, TypeColor>;
  gradPrefix: string;
  activeStack?: number | null;
  onStackEnter?: (no: number | null) => void;
}

/** One box as the packer sees it: arrow corner at the top left, X along the top edge, Y down the left edge. */
export function BoxDetailDrawing({ box, types, colors, gradPrefix, activeStack, onStackEnter }: Props) {
  const m = Math.min(box.ext.l, box.ext.w);
  const off = m * 0.09;
  const fs = m * 0.035;
  const w = box.wall;
  return (
    <g className="box-detail">
      <BoxGraphic
        box={box}
        types={types}
        colors={colors}
        gradPrefix={gradPrefix}
        detail
        activeStack={activeStack}
        onStackEnter={onStackEnter}
      />
      <g className="axes">
        <AxisArrow x1={w + off * 0.6} y1={-off} x2={w + off * 3.4} y2={-off} head={off * 0.4} />
        <AxisArrow x1={-off} y1={w + off * 0.6} x2={-off} y2={w + off * 3.4} head={off * 0.4} />
        <text x={w + off * 3.8} y={-off} fontSize={fs} className="axis-label">
          X
        </text>
        <text x={-off} y={w + off * 3.9} fontSize={fs} className="axis-label">
          Y
        </text>
      </g>
    </g>
  );
}
