// Shared cup-creation model: the same maths as cupshape.py used to render the PowerPoint animation in Blender.
// progress p in [0, 1] -> lathe profile with a constant number of points (the mesh genuinely deforms),
// bake amount, latte level, pour stream and bite.  Units: final cup height = 2.30.
const SEG_N = { bottom: 10, outer: 44, rim: 12, inner: 40, floor: 10 };
const ORDER = ['bottom', 'outer', 'rim', 'inner', 'floor'];
export const TOP = 2.30;
const rad = d => d * Math.PI / 180;
const arc = (cx, cy, r, a0, a1, n = 8) => Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos(rad(a0 + (a1 - a0) * i / n)), cy + r * Math.sin(rad(a0 + (a1 - a0) * i / n))]);
function cup(top, wall, baseIn, rimR = null, r0 = 0.60, k = 0.11) {
  const ro = z => r0 + k * z; rimR = rimR === null ? wall / 2 : rimR;
  const bottom = [[0, 0], [r0 - 0.14, 0], ...arc(r0 - 0.14, 0.14, 0.14, -90, 0).slice(1)];
  const outer = Array.from({ length: 21 }, (_, i) => { const z = 0.14 + (top - 0.14) * i / 20; return [ro(z), z]; });
  const c = ro(top) - wall / 2;
  const rim = Array.from({ length: 13 }, (_, i) => [c + (wall / 2) * Math.cos(rad(180 * i / 12)), top + rimR * Math.sin(rad(180 * i / 12))]);
  const inner = Array.from({ length: 21 }, (_, i) => { const z = top - (top - baseIn) * i / 20; return [ro(z) - wall, z]; });
  const ri = ro(baseIn) - wall;
  const floor = [...Array.from({ length: 7 }, (_, i) => [ri * Math.cos(rad(90 * i / 6)) * 0.97, baseIn - 0.06 * Math.sin(rad(90 * i / 6))]), [0, baseIn - 0.06]];
  return { bottom, outer, rim, inner, floor };
}
function lump() {
  const R = 0.80, H = 1.18, pts = [];
  for (let a = 0; a <= 180; a += 3) pts.push([R * Math.sin(rad(a)) * (1 + 0.06 * Math.sin(rad(2 * a))), H / 2 - H / 2 * Math.cos(rad(a))]);
  pts[0] = [0, 0];
  const q = pts.filter(p => p[0] > 0.42 || p[1] > 0.2), n = q.length;
  return { bottom: [[0, 0], [0.40, 0], ...q.slice(0, 3)], outer: q.slice(2, Math.floor(n * 0.45)), rim: q.slice(Math.floor(n * 0.45) - 1, Math.floor(n * 0.6)),
    inner: q.slice(Math.floor(n * 0.6) - 1, Math.floor(n * 0.92)), floor: [...q.slice(Math.floor(n * 0.92) - 1), [0, H]] };
}
const base = () => ({ bottom: [[0, 0], [0.50, 0], ...arc(0.50, 0.14, 0.14, -90, 0).slice(1)], outer: [[0.64, 0.14], [0.67, 0.30], [0.70, 0.46]],
  rim: arc(0.62, 0.46, 0.08, 0, 180, 6), inner: [[0.54, 0.46], [0.52, 0.40], [0.50, 0.36]], floor: [[0.50, 0.36], [0.30, 0.34], [0, 0.34]] });
function resample(poly, n) {
  const d = [0]; for (let i = 1; i < poly.length; i++) d.push(d[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  const L = d[d.length - 1] || 1, out = []; let j = 0;
  for (let i = 0; i < n; i++) {
    const t = L * i / (n - 1);
    while (j < d.length - 2 && d[j + 1] < t) j++;
    const seg = (d[j + 1] - d[j]) || 1, f = (t - d[j]) / seg;
    out.push([poly[j][0] + (poly[j + 1][0] - poly[j][0]) * f, poly[j][1] + (poly[j + 1][1] - poly[j][1]) * f]);
  }
  return out;
}
function flat(key) { let pts = []; for (const s of ORDER) pts = pts.concat(resample(key[s], SEG_N[s])); pts[0] = [0, pts[0][1]]; pts[pts.length - 1] = [0, pts[pts.length - 1][1]]; return pts; }
const KEYS = [flat(lump()), flat(base()), flat(cup(2.18, 0.20, 0.40, 0.04)), flat(cup(TOP, 0.10, 0.26))];
export const NP = KEYS[0].length;
export const V = [];
for (const s of ORDER) { const n = SEG_N[s]; for (let i = 0; i < n; i++) { const f = i / (n - 1);
  V.push({ bottom: 0.02 * f, outer: 0.02 + 0.96 * f, rim: 0.98 + 0.02 * f, inner: 1.0 - 0.90 * f, floor: 0.10 - 0.08 * f }[s]); } }
export const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
export function state(p) {
  const k01 = smooth(0.10, 0.25, p), k12 = smooth(0.26, 0.49, p), k23 = smooth(0.50, 0.60, p);
  let A, B, f;
  if (k23 > 0) { A = KEYS[2]; B = KEYS[3]; f = k23; } else if (k12 > 0) { A = KEYS[1]; B = KEYS[2]; f = k12; } else { A = KEYS[0]; B = KEYS[1]; f = k01; }
  const squash = Math.sin(Math.PI * smooth(0.08, 0.20, p)) * 0.04;
  const profile = A.map((a, i) => [(a[0] + (B[i][0] - a[0]) * f) * (1 + squash), (a[1] + (B[i][1] - a[1]) * f) * (1 - squash)]);
  const pour = smooth(0.77, 0.90, p);
  return { profile, bake: smooth(0.60, 0.74, p), pour, level: 0.26 + (TOP - 0.30 - 0.26) * pour, stream: p > 0.76 && p < 0.90, bite: smooth(0.93, 0.965, p) };
}
export const innerRadius = z => 0.60 + 0.11 * z - 0.10;
