const nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const n0 = (v: number) => nf.format(Math.round(v));
export const n1 = (v: number) => nf1.format(v);
export const n2 = (v: number) => nf2.format(v);
export const kg = (v: number) => (Math.abs(v) < 10 ? `${nf1.format(v)} kg` : `${nf.format(Math.round(v))} kg`);
export const t1 = (v: number) => `${nf1.format(v / 1000)} t`;
export const m1 = (mm: number) => `${(mm / 1000).toFixed(1)} m`;
export const mm = (v: number) => `${nf.format(Math.round(v))} mm`;
export const dims = (a: number, b: number, c?: number) => [a, b, c].filter((x) => x !== undefined).map((x) => nf.format(Math.round(x!))).join(' × ');
export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const plural = (n: number, one: string, many = `${one}s`) => `${nf.format(n)} ${n === 1 ? one : many}`;

/** Line colours for the stacks: distinct, calm hues. */
const HUES = ['#2b8bff', '#2bc79b', '#ff9f43', '#8b6cff', '#ff6b81', '#16b4d9', '#f5c400', '#5f7d95', '#9bd34a', '#e86fd1', '#3d5afe', '#00a37a'];
export const lineColor = (index: number) => HUES[index % HUES.length];
