// Utilidades comunes: formato numérico (es-CL), estadística básica y fechas.
// Todas las fechas se manejan como milisegundos "UTC ingenuo": la hora local
// registrada en el CMMS se guarda tal cual, sin husos ni cambios de horario.

export const HOUR = 3600000;
export const DAY = 86400000;

const nf = (d) => new Intl.NumberFormat('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d });
const cacheNF = {};
export function num(x, d = 0) {
  if (x == null || !isFinite(x)) return '—';
  const f = cacheNF[d] || (cacheNF[d] = nf(d));
  return f.format(x);
}
export function pct(x, d = 1) {
  if (x == null || !isFinite(x)) return '—';
  return num(x * 100, d) + '%';
}
// Montos en pesos chilenos: millones (MM$) o miles (M$) según magnitud.
export function clp(x, unit = 'auto') {
  if (x == null || !isFinite(x)) return '—';
  const a = Math.abs(x);
  if (unit === 'MM' || (unit === 'auto' && a >= 1e6)) return 'MM$ ' + num(x / 1e6, a >= 1e8 ? 0 : 1);
  if (unit === 'M' || (unit === 'auto' && a >= 1e3)) return 'M$ ' + num(x / 1e3, 0);
  return '$ ' + num(x, 0);
}
export function compact(x) {
  if (x == null || !isFinite(x)) return '—';
  const a = Math.abs(x);
  if (a >= 1e9) return num(x / 1e9, 1) + ' mil M';
  if (a >= 1e6) return num(x / 1e6, a >= 1e7 ? 0 : 1) + ' M';
  if (a >= 1e3) return num(x / 1e3, a >= 1e4 ? 0 : 1) + ' K';
  return num(x, a < 10 && a % 1 ? 1 : 0);
}
export function hours(x, d = 1) {
  if (x == null || !isFinite(x)) return '—';
  return num(x, d) + ' h';
}

export const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function monthKey(ms) {
  const d = new Date(ms);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}
export function monthLabel(key) {
  const [y, m] = key.split('-');
  return MONTHS[+m - 1] + ' ' + y.slice(2);
}
export function monthStart(key) {
  const [y, m] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, 1);
}
export function monthEnd(key) {
  const [y, m] = key.split('-').map(Number);
  return Date.UTC(y, m, 1);
}
export function monthRange(fromMs, toMs) {
  const out = [];
  if (fromMs == null || toMs == null || toMs < fromMs) return out;
  let d = new Date(fromMs);
  let y = d.getUTCFullYear(), m = d.getUTCMonth();
  const end = monthKey(toMs - 1);
  for (let i = 0; i < 600; i++) {
    const k = y + '-' + String(m + 1).padStart(2, '0');
    out.push(k);
    if (k === end) break;
    m++; if (m > 11) { m = 0; y++; }
  }
  return out;
}
export function fmtDate(ms, withTime = false) {
  if (ms == null) return '—';
  const d = new Date(ms);
  const s = String(d.getUTCDate()).padStart(2, '0') + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + d.getUTCFullYear();
  if (!withTime) return s;
  return s + ' ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}
export function fmtDateLong(ms) {
  if (ms == null) return '—';
  const d = new Date(ms);
  return d.getUTCDate() + ' de ' + ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][d.getUTCMonth()] + ' de ' + d.getUTCFullYear();
}
export function isoDay(ms) {
  if (ms == null) return '';
  const d = new Date(ms);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}
export function parseIsoDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
}
export function startOfDay(ms) { return Math.floor(ms / DAY) * DAY; }

// ---------- estadística ----------
export function sum(a, f) { let s = 0; for (const x of a) { const v = f ? f(x) : x; if (v != null && isFinite(v)) s += v; } return s; }
export function mean(a, f) {
  let s = 0, n = 0;
  for (const x of a) { const v = f ? f(x) : x; if (v != null && isFinite(v)) { s += v; n++; } }
  return n ? s / n : null;
}
export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
export function median(a) {
  const s = a.filter((v) => v != null && isFinite(v)).sort((x, y) => x - y);
  return quantile(s, 0.5);
}
export function groupBy(a, keyf) {
  const m = new Map();
  for (const x of a) {
    const k = keyf(x);
    let g = m.get(k);
    if (!g) m.set(k, (g = []));
    g.push(x);
  }
  return m;
}
export function countBy(a, keyf) {
  const m = new Map();
  for (const x of a) { const k = keyf(x); m.set(k, (m.get(k) || 0) + 1); }
  return m;
}
export function linreg(x, y) {
  const n = x.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; sxy += x[i] * y[i]; syy += y[i] * y[i]; }
  const den = n * sxx - sx * sx;
  if (!den) return null;
  const b = (n * sxy - sx * sy) / den;
  const a = (sy - b * sx) / n;
  const r = (n * sxy - sx * sy) / Math.sqrt(den * (n * syy - sy * sy));
  return { a, b, r2: r * r };
}
// Función gamma (aproximación de Lanczos), usada para la media de Weibull.
export function gamma(z) {
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

// ---------- texto ----------
export function normKey(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function plural(n, one, many) { return n === 1 ? one : many; }
export function uid() { return Math.random().toString(36).slice(2, 10); }
export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
export function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
export function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
