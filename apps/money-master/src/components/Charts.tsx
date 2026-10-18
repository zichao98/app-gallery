import { useRef, useState, type ReactNode } from "react";
import { compact, money } from "../format";

/** Round numbers for a y-axis that covers [min, max] (always includes 0). */
function ticks(min: number, max: number, count = 4): number[] {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  const span = hi - lo || 1;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.001; v += step) out.push(Math.round(v / step) * step);
  if (out[out.length - 1] < hi) out.push(out[out.length - 1] + step);
  return out;
}

function Tip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const flip = x > width * 0.6;
  return (
    <div className="chart-tip" style={{ left: flip ? undefined : x + 12, right: flip ? width - x + 12 : undefined, top: Math.max(0, y - 10) }}>
      {children}
    </div>
  );
}

const W = 520;
const PAD = { l: 64, r: 16, t: 14, b: 28 };

export function LineChart({ points, label }: { points: { label: string; value: number }[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const H = 220;
  if (points.length === 0) return null;
  const values = points.map(p => p.value);
  const ys = ticks(Math.min(...values), Math.max(...values));
  const y0 = ys[0];
  const y1 = ys[ys.length - 1];
  const x = (i: number) => (points.length === 1 ? (PAD.l + W - PAD.r) / 2 : PAD.l + (i * (W - PAD.l - PAD.r)) / (points.length - 1));
  const y = (v: number) => PAD.t + ((y1 - v) / (y1 - y0 || 1)) * (H - PAD.t - PAD.b);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join("");
  const every = Math.ceil(points.length / 6);

  const onMove = (e: React.PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    points.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    });
    setHover(best);
  };

  const hb = box.current?.getBoundingClientRect();
  const scale = hb ? hb.width / W : 1;

  return (
    <div className="chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {ys.map(t => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className={t === 0 ? "axis-zero" : "grid"} />
            <text x={PAD.l - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">
              {compact(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % every === 0 || i === points.length - 1 ? (
            <text key={i} x={x(i)} y={H - 8} className="tick" textAnchor="middle">
              {p.label}
            </text>
          ) : null,
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} className="crosshair" />}
        <path d={d} className="line s1" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={hover === i ? 6 : 4} className="dot s1" />
        ))}
        <text x={x(points.length - 1)} y={y(values[values.length - 1]) - 12} className="direct-label" textAnchor="end">
          {compact(values[values.length - 1])}
        </text>
      </svg>
      {hover !== null && (
        <Tip x={x(hover) * scale} y={y(points[hover].value) * scale} width={hb?.width ?? W}>
          <div className="tip-title">{points[hover].label}</div>
          <div className="tip-row">
            <span className="swatch s1" />
            {label}
            <b>{money(points[hover].value)}</b>
          </div>
        </Tip>
      )}
    </div>
  );
}

export interface BarSeries {
  name: string;
  cls: string;
  values: (number | null)[];
}

export function GroupedBars({ labels, series, label }: { labels: string[]; series: BarSeries[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const H = 220;
  const all = series.flatMap(s => s.values.filter((v): v is number => v !== null));
  const ys = ticks(Math.min(0, ...all), Math.max(0, ...all));
  const y0 = ys[0];
  const y1 = ys[ys.length - 1];
  const y = (v: number) => PAD.t + ((y1 - v) / (y1 - y0 || 1)) * (H - PAD.t - PAD.b);
  const band = (W - PAD.l - PAD.r) / labels.length;
  const gap = 2;
  const barW = Math.min(18, (band * 0.7 - gap * (series.length - 1)) / series.length);
  const groupW = barW * series.length + gap * (series.length - 1);

  const hb = box.current?.getBoundingClientRect();
  const scale = hb ? hb.width / W : 1;

  return (
    <div className="chart" ref={box}>
      <div className="legend">
        {series.map(s => (
          <span key={s.name}>
            <span className={`swatch ${s.cls}`} />
            {s.name}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerLeave={() => setHover(null)}>
        {ys.map(t => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className={t === 0 ? "axis-zero" : "grid"} />
            <text x={PAD.l - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">
              {compact(t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) => {
          const gx = PAD.l + band * i + (band - groupW) / 2;
          return (
            <g key={l} onPointerEnter={() => setHover(i)}>
              <rect x={PAD.l + band * i} y={PAD.t} width={band} height={H - PAD.t - PAD.b} className={`hit ${hover === i ? "on" : ""}`} />
              {series.map((s, si) => {
                const v = s.values[i];
                if (v === null || v === 0) return null;
                const top = y(Math.max(0, v));
                const h = Math.max(1, Math.abs(y(v) - y(0)));
                const r = Math.min(4, barW / 2, h);
                const bx = gx + si * (barW + gap);
                // rounded on the data end, square on the baseline
                const path =
                  v >= 0
                    ? `M${bx},${top + h}V${top + r}Q${bx},${top} ${bx + r},${top}H${bx + barW - r}Q${bx + barW},${top} ${bx + barW},${top + r}V${top + h}Z`
                    : `M${bx},${top}V${top + h - r}Q${bx},${top + h} ${bx + r},${top + h}H${bx + barW - r}Q${bx + barW},${top + h} ${bx + barW},${top + h - r}V${top}Z`;
                return <path key={s.name} d={path} className={`bar ${s.cls}`} />;
              })}
              <text x={PAD.l + band * i + band / 2} y={H - 8} className="tick" textAnchor="middle">
                {l}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <Tip x={(PAD.l + band * hover + band / 2) * scale} y={PAD.t * scale} width={hb?.width ?? W}>
          <div className="tip-title">{labels[hover]}</div>
          {series.map(s => (
            <div className="tip-row" key={s.name}>
              <span className={`swatch ${s.cls}`} />
              {s.name}
              <b>{s.values[hover] === null ? "—" : money(s.values[hover]!)}</b>
            </div>
          ))}
        </Tip>
      )}
    </div>
  );
}

export interface StackPart {
  name: string;
  cls: string;
  value: number;
}

/** One horizontal 100% bar; segments are separated by a 2px surface gap. */
export function StackBar({ parts, label }: { parts: StackPart[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0);
  if (total <= 0) return <div className="stack empty">尚無資料</div>;
  return (
    <div className="stack" role="img" aria-label={label} onPointerLeave={() => setHover(null)}>
      {parts.map((p, i) =>
        p.value > 0 ? (
          <div
            key={p.name}
            className={`seg ${p.cls} ${hover === i ? "on" : ""}`}
            style={{ flexGrow: p.value }}
            onPointerEnter={() => setHover(i)}
            title={`${p.name} ${((p.value / total) * 100).toFixed(1)}%`}
          />
        ) : null,
      )}
    </div>
  );
}
