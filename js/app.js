// WebAppMant: interfaz, estado y orquestación.
import * as U from './util.js?v=1.0.8';
import { FIELDS, parseCSV, readFile, headerRow, autoMap, missingRequired, processDataset, recordsToCSV, templateCSV } from './etl.js?v=1.0.8';
import { analyze, narrative, DEFAULT_SETTINGS, KPI_DEFS, KPI_ORDER, DIMENSIONS, LEVELS, STATUS, targetText, critText, fmtKpi, weibullStrategy, weibullStrategyShort, RULE_SUMMARY, TIPOS } from './kpi.js?v=1.0.8';
import * as C from './charts.js?v=1.0.8';

const { num, pct, clp, hours, esc, fmtDate } = U;

export const SECTIONS = [
  { id: 'resumen', n: 1, name: 'Resumen ejecutivo' },
  { id: 'datos', n: 2, name: 'Calidad de datos' },
  { id: 'confiabilidad', n: 3, name: 'Disponibilidad y confiabilidad' },
  { id: 'fallas', n: 4, name: 'Análisis de fallas' },
  { id: 'gestion', n: 5, name: 'Gestión del trabajo' },
  { id: 'costos', n: 6, name: 'Costos' },
  { id: 'comparar', n: 7, name: 'Comparación de datasets' },
  { id: 'registros', n: 8, name: 'Registros' },
  { id: 'metodologia', n: 9, name: 'Metodología y metas' },
];
const FILTER_DIMS = [
  { k: 'unidad', label: 'Unidad' }, { k: 'crit', label: 'Criticidad' }, { k: 'tipoEq', label: 'Tipo de equipo' },
  { k: 'tipo', label: 'Tipo de mant.' }, { k: 'puesto', label: 'Puesto de trabajo' },
];
const EXTRA_DIMS = { modo: 'Modo de falla', equipo: 'Equipo', area: 'Área', causa: 'Causa' };
const FLAG_NAMES = { 1: 'Fin < inicio', 2: 'Inicio < creación', 4: 'Plan < creación', 8: 'Cerrada sin fin', 16: 'Abierta con fin', 32: 'Detención > lapso', 64: 'Costo ≠ componentes', 128: 'Estado ≠ status', 256: 'Tipo ≠ clase', 512: 'Sin modo de falla', 1024: 'Atípico extremo' };

const CLEAN = new URLSearchParams(location.search).has('limpio');
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ---------------- estado ----------------
const LS_SETTINGS = 'webappmant.settings.v1';
const LS_PDF = 'webappmant.pdf.v1';
function loadSettings() {
  const d = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  try {
    const s = JSON.parse(localStorage.getItem(LS_SETTINGS) || 'null');
    if (s) {
      Object.assign(d, { tarifa: s.tarifa ?? d.tarifa, reincDias: s.reincDias ?? d.reincDias, excluirAtipicos: !!s.excluirAtipicos });
      for (const k in d.weights) if (s.weights && isFinite(s.weights[k])) d.weights[k] = s.weights[k];
      for (const k in d.targets) if (s.targets && s.targets[k]) Object.assign(d.targets[k], s.targets[k]);
    }
  } catch (e) { /* almacenamiento no disponible */ }
  return d;
}
function saveSettings() { try { localStorage.setItem(LS_SETTINGS, JSON.stringify(state.settings)); } catch (e) { /* sin persistencia */ } }
const emptyFilters = () => ({ from: null, to: null, sets: {} });

const state = {
  datasets: [], activeId: null, filters: emptyFilters(), section: 'resumen', settings: loadSettings(),
  charts: [], K: null, N: null, recs: [], table: { q: '', page: 0, onlyFlags: false }, weibullSel: null, paretoMetric: 'n', cmpCache: new Map(),
};
export function getState() { return state; }
const active = () => state.datasets.find((d) => d.id === state.activeId) || null;

// ---------------- IndexedDB (datasets cargados por el usuario) ----------------
const IDB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((ok, fail) => {
      try {
        const rq = indexedDB.open('webappmant', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('datasets', { keyPath: 'id' });
        rq.onsuccess = () => { this.db = rq.result; ok(this.db); };
        rq.onerror = () => fail(rq.error);
      } catch (e) { fail(e); }
    });
  },
  async tx(mode, fn) {
    const db = await this.open();
    return new Promise((ok, fail) => {
      const t = db.transaction('datasets', mode);
      const st = t.objectStore('datasets');
      const r = fn(st);
      t.oncomplete = () => ok(r && r.result);
      t.onerror = () => fail(t.error);
    });
  },
  all() { return this.tx('readonly', (st) => st.getAll()).catch(() => []); },
  put(o) { return this.tx('readwrite', (st) => st.put(o)).catch(() => null); },
  del(id) { return this.tx('readwrite', (st) => st.delete(id)).catch(() => null); },
};

// ---------------- utilidades de interfaz ----------------
let toastT;
function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, err ? 7000 : 3800);
}
function busy(on, text = 'Procesando…') { $('#busy').hidden = !on; $('#busyText').textContent = text; }
// Cede un cuadro para que se pinte el aviso de carga; el temporizador de
// respaldo evita quedar detenido en pestañas en segundo plano (sin rAF).
const nextFrame = () => new Promise((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(() => setTimeout(go, 16));
  setTimeout(go, 80);
});
const isDark = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
const tokens = () => C.themeTokens(isDark() ? 'dark' : 'light');
const stHtml = (s) => `<span class="st st-${s}"><span class="ic" aria-hidden="true">${STATUS[s].icon}</span>${STATUS[s].label}</span>`;
const icInfo = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 7v4M8 4.8v.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
function periodText(from, to) { return fmtDate(from) + ' a ' + fmtDate(to - 1); }

// ---------------- carga de datasets ----------------
async function loadManifest() {
  try {
    const r = await fetch('data/manifest.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const m = await r.json();
    for (const d of m.datasets) state.datasets.push({ id: d.id, name: d.nombre, file: d.archivo, note: d.nota, source: 'bundled', status: 'idle' });
    return true;
  } catch (e) {
    state.manifestError = location.protocol === 'file:' ? 'file' : 'net';
    return false;
  }
}
async function restoreUploads() {
  const saved = await IDB.all();
  for (const o of saved.sort((a, b) => a.addedAt - b.addedAt)) state.datasets.push({ id: o.id, name: o.name, file: o.fileName, source: 'upload', status: 'idle', stored: o });
}
async function ensureLoaded(ds) {
  if (ds.status === 'ready') return ds;
  if (ds.status === 'loading') return ds.promise;
  ds.status = 'loading';
  ds.promise = (async () => {
    try {
      let aoa, map, hi;
      if (ds.source === 'bundled') {
        const r = await fetch('data/' + ds.file);
        if (!r.ok) throw new Error('No se pudo leer ' + ds.file + ' (HTTP ' + r.status + ').');
        aoa = parseCSV(await r.text());
        hi = headerRow(aoa);
        map = autoMap(aoa[hi]);
      } else {
        aoa = ds.stored.aoa; map = ds.stored.map; hi = ds.stored.headerIndex;
      }
      const res = processDataset(aoa, map, { headerIndex: hi, tarifa: state.settings.tarifa });
      Object.assign(ds, res, { status: 'ready' });
      delete ds.stored;
    } catch (e) {
      ds.status = 'error'; ds.error = e.message || String(e);
    }
    return ds;
  })();
  return ds.promise;
}
async function activate(id) {
  const ds = state.datasets.find((d) => d.id === id);
  if (!ds) return;
  if (ds.status !== 'ready') {
    busy(true, 'Procesando ' + ds.name + '…');
    if (!state.activeId) $('#view').innerHTML = `<div class="empty"><span class="spinner"></span><h2>Procesando ${esc(ds.name)}</h2><p>Leyendo, depurando y calculando indicadores…</p></div>`;
    await nextFrame(); await ensureLoaded(ds); busy(false);
  }
  if (ds.status === 'error') { toast(ds.error, true); renderDsList(); return; }
  state.activeId = id;
  state.filters = emptyFilters();
  state.table.page = 0; state.weibullSel = null;
  refresh();
}

// Archivo del usuario: lectura → revisión de columnas → proceso.
async function handleFile(file) {
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['csv', 'txt', 'tsv', 'xlsx', 'xls'].includes(ext)) { toast('Formato no admitido: usa CSV, TXT o Excel (.xlsx).', true); return; }
  busy(true, 'Leyendo ' + file.name + '…');
  await nextFrame();
  let aoa;
  try { ({ aoa } = await readFile(file)); } catch (e) { busy(false); toast(e.message || 'No se pudo leer el archivo.', true); return; }
  busy(false);
  if (!aoa || aoa.length < 2) { toast('El archivo no tiene filas de datos.', true); return; }
  const hi = headerRow(aoa);
  const map = autoMap(aoa[hi]);
  openMapDialog(file.name, aoa, hi, map);
}
function openMapDialog(fileName, aoa, hi, map) {
  const dlg = $('#dlgMap');
  const headers = aoa[hi].map((h) => String(h ?? '').replace(/^'/, ''));
  const sample = aoa.slice(hi + 1, hi + 6);
  $('#mapName').value = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 60);
  $('#dlgMapSub').textContent = `${fileName}: ${num(aoa.length - hi - 1)} filas y ${headers.length} columnas. Revisa la columna que corresponde a cada campo; las que no uses pueden quedar sin asignar.`;
  const opts = (sel) => `<option value="">Sin asignar</option>` + headers.map((h, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${esc(h || 'Columna ' + (i + 1))}</option>`).join('');
  const ex = (i) => (i == null ? '' : esc(sample.map((r) => String(r[i] ?? '').replace(/^'/, '')).find((v) => v.trim() !== '') || ''));
  $('#mapTable').innerHTML = `<thead><tr><th>Campo del modelo</th><th>Columna del archivo</th><th>Ejemplo</th></tr></thead><tbody>` +
    FIELDS.map((f) => `<tr><td>${esc(f.label)} ${f.req ? '<span class="tag tag-req">Requerido</span>' : ''}</td><td><select data-k="${f.k}">${opts(map[f.k])}</select></td><td class="muted" data-ex="${f.k}">${ex(map[f.k])}</td></tr>`).join('') + '</tbody>';
  const note = $('#mapNote');
  const check = () => {
    const m = readMap();
    const miss = missingRequired(m);
    $('#btnMapOk').disabled = miss.length > 0;
    note.className = 'dlg-note' + (miss.length ? ' err' : '');
    note.textContent = miss.length ? 'Falta asignar: ' + miss.map((k) => FIELDS.find((f) => f.k === k).label).join(', ') + '.' : `${Object.keys(m).length} campos asignados. Los indicadores que dependan de campos sin asignar se mostrarán como «sin dato».`;
  };
  const readMap = () => { const m = {}; $$('#mapTable select').forEach((s) => { if (s.value !== '') m[s.dataset.k] = +s.value; }); return m; };
  $('#mapTable').onchange = (e) => { const s = e.target.closest('select'); if (s) { $(`[data-ex="${s.dataset.k}"]`).innerHTML = ex(s.value === '' ? null : +s.value); check(); } };
  check();
  dlg.onclose = async () => {
    if (dlg.returnValue !== 'ok') return;
    const m = readMap();
    const name = $('#mapName').value.trim() || fileName;
    busy(true, 'Procesando ' + name + '…');
    await nextFrame();
    try {
      const res = processDataset(aoa, m, { headerIndex: hi, tarifa: state.settings.tarifa });
      if (!res.records.length) throw new Error('No quedaron registros válidos tras la depuración.');
      const id = 'up-' + U.uid();
      const ds = { id, name, file: fileName, source: 'upload', status: 'ready', ...res };
      state.datasets.push(ds);
      IDB.put({ id, name, fileName, aoa, map: m, headerIndex: hi, addedAt: Date.now() });
      busy(false);
      toast(`«${name}» cargado: ${num(res.records.length)} registros válidos.`);
      activate(id);
    } catch (e) { busy(false); toast(e.message || 'No se pudo procesar el dataset.', true); }
  };
  dlg.returnValue = '';
  dlg.showModal();
}
async function removeDataset(id) {
  const ds = state.datasets.find((d) => d.id === id);
  if (!ds || ds.source !== 'upload') return;
  if (!confirm(`¿Quitar «${ds.name}» de la aplicación? El archivo original no se modifica.`)) return;
  state.datasets = state.datasets.filter((d) => d.id !== id);
  state.cmpCache.clear();
  await IDB.del(id);
  if (state.activeId === id) { const first = state.datasets[0]; if (first) activate(first.id); else { state.activeId = null; refresh(); } }
  else renderDsList();
}

// ---------------- filtros y cálculo ----------------
function period(ds) {
  const m = ds.meta;
  const dMin = U.startOfDay(m.tMin), dMax = U.startOfDay(m.tMax) + U.DAY;
  let from = state.filters.from ?? dMin, to = state.filters.to != null ? state.filters.to + U.DAY : dMax;
  from = Math.max(from, dMin); to = Math.min(to, dMax);
  if (to <= from) to = from + U.DAY;
  return { from, to, dMin, dMax };
}
function passDims(r) {
  for (const k in state.filters.sets) {
    const s = state.filters.sets[k];
    if (s && s.size && !s.has(r[k] ?? 'Sin dato')) return false;
  }
  return true;
}
function filteredFor(ds) {
  const { from, to } = period(ds);
  let recs = ds.records.filter((r) => r.t != null && r.t >= from && r.t < to && passDims(r));
  if (state.settings.excluirAtipicos) recs = recs.filter((r) => !(r.flags & 1024));
  return { recs, from, to };
}
function computeFor(ds) {
  const { recs, from, to } = filteredFor(ds);
  if (!recs.length) return { recs, K: null, from, to };
  const K = analyze(recs, { from, to, settings: state.settings, quality: ds.quality });
  return { recs, K, from, to };
}
function compute() {
  const ds = active();
  state.K = null; state.N = null; state.recs = [];
  if (!ds || ds.status !== 'ready') return;
  const { recs, K } = computeFor(ds);
  state.recs = recs; state.K = K; state.N = K ? narrative(K) : null;
}
function filtersKey() {
  return JSON.stringify([state.filters.from, state.filters.to, Object.entries(state.filters.sets).map(([k, s]) => [k, [...s].sort()]), state.settings]);
}
function toggleFilter(k, v) {
  if (v == null || v === '') return;
  const s = state.filters.sets[k] || (state.filters.sets[k] = new Set());
  if (s.has(v)) s.delete(v); else s.add(v);
  state.table.page = 0;
  refresh();
}
export function filtersText() {
  const parts = [];
  const ds = active();
  if (ds && (state.filters.from != null || state.filters.to != null)) { const p = period(ds); parts.push('Período ' + periodText(p.from, p.to)); }
  for (const [k, s] of Object.entries(state.filters.sets)) {
    if (!s.size) continue;
    const lab = (FILTER_DIMS.find((d) => d.k === k) || {}).label || EXTRA_DIMS[k] || k;
    parts.push(lab + ': ' + [...s].join(', '));
  }
  if (state.settings.excluirAtipicos) parts.push('Sin valores atípicos extremos');
  return parts.length ? parts.join('; ') : 'Sin filtros (dataset completo)';
}

// ---------------- renderizado general ----------------
function refresh() {
  compute();
  renderNav(); renderDsList(); renderTitleblock(); renderFilters(); renderChips(); renderView();
}
function renderNav() {
  $('#nav').innerHTML = SECTIONS.map((s) => `<a href="#${s.id}" ${s.id === state.section ? 'aria-current="page"' : ''}><span class="n">${s.n}</span><span>${s.name}</span></a>`).join('');
}
function renderDsList() {
  $('#dsList').innerHTML = state.datasets.map((d) => {
    const meta = d.status === 'ready' ? num(d.quality.validRows) + ' OT' : d.status === 'loading' ? 'Cargando…' : d.status === 'error' ? 'Error al leer' : d.source === 'bundled' ? 'Incluido' : 'Guardado en este navegador';
    return `<li class="ds-item ${d.id === state.activeId ? 'active' : ''}"><button class="ds-pick" data-ds="${d.id}" type="button" title="${esc(d.file || '')}"><span class="dot"></span><span><span class="ds-name">${esc(d.name)}</span><span class="ds-meta">${meta}</span></span></button>` +
      (d.source === 'upload' ? `<button class="ds-del" data-del="${d.id}" type="button" aria-label="Quitar ${esc(d.name)}"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>` : '') + '</li>';
  }).join('') || '<li class="muted" style="padding:0 8px;font-size:12.5px;color:var(--muted)">Sin datasets todavía.</li>';
}
function renderTitleblock() {
  const ds = active(), K = state.K;
  const menu = `<button class="menu-btn" id="btnMenu" type="button" aria-label="Abrir menú"><svg viewBox="0 0 20 20"><path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button>`;
  const actions = `<div class="tb-actions"><button class="btn" id="tbUpload" type="button"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 13V3m0 0L6 7m4-4 4 4M3 13v2.5A1.5 1.5 0 0 0 4.5 17h11a1.5 1.5 0 0 0 1.5-1.5V13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>Cargar</button>` +
    `<button class="btn btn-primary" id="tbPdf" type="button" ${K ? '' : 'disabled'}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 2.5h6.5L15 6v11.5H5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M11 2.5V6h4M7.5 11h5M7.5 14h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>Exportar informe PDF</button></div>`;
  if (!ds || ds.status !== 'ready') {
    $('#titleblock').innerHTML = `<div class="tb-cell"><div class="tb-title">${menu}<div><span class="tb-label">Dataset</span><div class="tb-value">Sin dataset activo</div></div></div></div>` +
      ['Período', 'Órdenes', 'Equipos', 'Calidad de datos', 'Emitido'].map((l, i) => `<div class="tb-cell ${i > 2 ? 'opt' : ''} ${i === 4 ? 'tb-issued' : ''}"><span class="tb-label">${l}</span><div class="tb-value">—</div></div>`).join('') + actions;
    return;
  }
  const p = period(ds);
  const Q = ds.quality;
  const sub = ds.source === 'bundled' ? 'Incluido: ' + ds.file : 'Cargado: ' + ds.file;
  $('#titleblock').innerHTML =
    `<div class="tb-cell"><div class="tb-title">${menu}<div style="min-width:0"><span class="tb-label">${esc(sub)}</span><div class="tb-value">${esc(ds.name)}</div></div></div></div>` +
    `<div class="tb-cell"><span class="tb-label">Período analizado</span><div class="tb-value"><span style="white-space:nowrap">${fmtDate(p.from)}</span> <small>a</small> <span style="white-space:nowrap">${fmtDate(p.to - 1)}</span></div></div>` +
    `<div class="tb-cell"><span class="tb-label">Órdenes en análisis</span><div class="tb-value">${num(state.recs.length)} <small>de ${num(Q.validRows)}</small></div></div>` +
    `<div class="tb-cell"><span class="tb-label">Equipos</span><div class="tb-value">${num(K ? K.NEq : 0)}</div></div>` +
    `<div class="tb-cell opt"><span class="tb-label">Calidad de datos</span><div class="tb-value dqi-chip" title="${K ? STATUS[K.status.dqi].label : ''}">${pct(Q.dqi)} ${K ? `<span class="st st-${K.status.dqi}"><span class="ic" aria-label="${STATUS[K.status.dqi].label}">${STATUS[K.status.dqi].icon}</span></span>` : ''}</div></div>` +
    `<div class="tb-cell opt tb-issued"><span class="tb-label">Emitido</span><div class="tb-value">${fmtDate(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()))}</div></div>` + actions;
}
let openPop = null;
function renderFilters() {
  const ds = active();
  const fb = $('#filterbar');
  if (!ds || ds.status !== 'ready') { fb.innerHTML = ''; return; }
  const p = period(ds);
  const years = [...new Set(U.monthRange(p.dMin, p.dMax).map((m) => m.slice(0, 4)))];
  const preset = `<select id="fPreset" aria-label="Período predefinido"><option value="">Período…</option><option value="all">Todo el período</option><option value="12m">Últimos 12 meses</option><option value="3m">Último trimestre</option>${years.map((y) => `<option value="y${y}">Año ${y}</option>`).join('')}</select>`;
  fb.innerHTML = `<span class="fb-label">Filtros</span>` +
    `<div class="fctl date-group">${preset}<input class="date-in" type="date" id="fFrom" aria-label="Desde" value="${U.isoDay(p.from)}" min="${U.isoDay(p.dMin)}" max="${U.isoDay(p.dMax - 1)}"><span class="muted" style="color:var(--muted)">a</span><input class="date-in" type="date" id="fTo" aria-label="Hasta" value="${U.isoDay(p.to - 1)}" min="${U.isoDay(p.dMin)}" max="${U.isoDay(p.dMax - 1)}"></div>` +
    FILTER_DIMS.map((d) => {
      const s = state.filters.sets[d.k];
      const n = s ? s.size : 0;
      const v = n === 0 ? 'Todas' : n === 1 ? [...s][0] : n + ' seleccionadas';
      return `<div class="fctl"><button type="button" class="${n ? 'on' : ''}" data-pop="${d.k}" aria-haspopup="true" aria-expanded="false">${d.label}: <span class="v">${esc(v)}</span><svg viewBox="0 0 12 12"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button></div>`;
    }).join('') +
    (Object.values(state.filters.sets).some((s) => s.size) || state.filters.from != null || state.filters.to != null ? `<button class="btn btn-ghost btn-sm" id="fClear" type="button">Limpiar filtros</button>` : '');
}
function showPop(btn, k) {
  closePop();
  const ds = active();
  const counts = U.countBy(ds.records, (r) => r[k] ?? 'Sin dato');
  let vals = [...counts.entries()];
  if (k === 'crit') vals.sort((a, b) => String(a[0]).localeCompare(String(b[0]))); else vals.sort((a, b) => b[1] - a[1]);
  const sel = state.filters.sets[k] || new Set();
  const pop = document.createElement('div');
  pop.className = 'pop';
  pop.innerHTML = (vals.length > 8 ? `<input type="search" placeholder="Buscar" aria-label="Buscar valor">` : '') +
    `<div class="pop-list">${vals.map(([v, c]) => `<label><input type="checkbox" value="${esc(v)}" ${sel.has(v) ? 'checked' : ''}> <span>${esc(v)}</span><span class="c">${num(c)}</span></label>`).join('')}</div>` +
    `<div class="pop-foot"><button class="link-btn" type="button" data-act="none">Quitar selección</button><button class="btn btn-primary btn-sm" type="button" data-act="ok">Aplicar</button></div>`;
  btn.parentElement.appendChild(pop);
  btn.setAttribute('aria-expanded', 'true');
  openPop = { pop, btn };
  const r = pop.getBoundingClientRect();
  if (r.right > window.innerWidth - 8) pop.style.left = Math.min(0, window.innerWidth - 8 - r.right) + 'px';
  const search = $('input[type="search"]', pop);
  if (search) { search.focus(); search.oninput = () => { const q = U.normKey(search.value); $$('.pop-list label', pop).forEach((l) => { l.hidden = q && !U.normKey(l.textContent).includes(q); }); }; }
  pop.onclick = (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'none') { $$('input[type="checkbox"]', pop).forEach((c) => { c.checked = false; }); return; }
    const chosen = $$('input[type="checkbox"]:checked', pop).map((c) => c.value);
    state.filters.sets[k] = new Set(chosen);
    closePop(); state.table.page = 0; refresh();
  };
}
function closePop() { if (openPop) { openPop.btn.setAttribute('aria-expanded', 'false'); openPop.pop.remove(); openPop = null; } }
function renderChips() {
  const el = $('#chips');
  const chips = [];
  for (const [k, s] of Object.entries(state.filters.sets)) {
    for (const v of s) {
      const lab = (FILTER_DIMS.find((d) => d.k === k) || {}).label || EXTRA_DIMS[k] || k;
      chips.push(`<span class="chip">${esc(lab)}: ${esc(v)}<button type="button" data-chip="${k}" data-v="${esc(v)}" aria-label="Quitar filtro ${esc(v)}"><svg viewBox="0 0 16 16" width="12" height="12"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button></span>`);
    }
  }
  if (state.settings.excluirAtipicos) chips.push('<span class="chip">Sin atípicos extremos<button type="button" data-chip="__out" aria-label="Incluir atípicos"><svg viewBox="0 0 16 16" width="12" height="12"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button></span>');
  el.innerHTML = chips.length ? chips.join('') + '<span class="note">Haz clic en barras, puntos o filas para filtrar.</span>' : '';
}

// ---------------- gráficos ----------------
function disposeCharts() { for (const c of state.charts) c.inst.dispose(); state.charts = []; }
function mountCharts(specs) {
  const T = tokens();
  for (const s of specs) {
    const el = document.getElementById(s.id);
    if (!el) continue;
    const inst = window.echarts.init(el, null, { renderer: 'canvas' });
    try { inst.setOption(s.opt({ ...T, w: el.clientWidth })); } catch (e) { console.error('Gráfico', s.id, e); }
    if (s.click) inst.on('click', (p) => s.click(p));
    state.charts.push({ inst, spec: s });
  }
}
const ro = new ResizeObserver(U.debounce(() => { for (const c of state.charts) c.inst.resize(); }, 120));

function panel({ title, sub, how, cls = 'c12', chart, h = '', body = '', pre = '', foot = '', id }) {
  const hid = 'how-' + (chart || id || U.uid());
  return `<section class="panel ${cls}" ${id ? `id="${id}"` : ''}><div class="panel-head"><div><h2>${title}</h2>${sub ? `<div class="sub">${sub}</div>` : ''}</div>` +
    (how ? `<button class="how-btn" type="button" aria-expanded="false" aria-controls="${hid}">${icInfo}Cómo leer</button>` : '') + `</div>` +
    (how ? `<div class="how" id="${hid}" hidden>${how}</div>` : '') + pre +
    (chart ? `<div class="chart ${h}" id="${chart}" role="img" aria-label="${esc(title)}"></div>` : '') + body + (foot ? `<div class="panel-foot">${foot}</div>` : '') + `</section>`;
}
function secHead(id, lead) {
  const s = SECTIONS.find((x) => x.id === id);
  return `<div class="sec-head"><div><span class="sec-num">Sección ${s.n}</span><h1>${s.name}</h1>${lead ? `<p>${lead}</p>` : ''}</div></div>`;
}
function kpiTile(id, K) {
  const d = KPI_DEFS[id];
  const dim = DIMENSIONS.find((x) => x.kpis.includes(id));
  const s = K.status[id], sc = K.scores[id];
  return `<div class="kpi" title="${esc((dim ? dim.name + '. ' : '') + d.read)}"><div class="kpi-name"><span>${d.name}</span></div>` +
    `<div class="kpi-val">${fmtKpi(id, K.kpi[id])}</div><div class="kpi-meta"><span>Meta ${targetText(id, K.settings.targets)}</span>${stHtml(s)}</div>` +
    `<div class="bar" aria-hidden="true"><i class="bg-${s}" style="width:${sc == null ? 0 : Math.max(3, sc)}%"></i></div></div>`;
}
function statTile(name, value, note = '') {
  return `<div class="kpi"><div class="kpi-name"><span>${name}</span></div><div class="kpi-val">${value}</div>${note ? `<div class="kpi-meta"><span>${note}</span></div>` : ''}</div>`;
}

// ---------------- vistas ----------------
function renderView() {
  disposeCharts();
  closePop();
  const view = $('#view');
  const ds = active();
  if (!ds || ds.status !== 'ready') { view.innerHTML = emptyState(); return; }
  if (state.section === 'metodologia') { view.innerHTML = viewMetodologia(); return; }
  if (state.section === 'comparar') { viewComparar(view); return; }
  if (!state.K) {
    view.innerHTML = secHead(state.section) + `<div class="empty"><h2>No hay órdenes con estos filtros</h2><p>Amplía el período o quita algún filtro para volver a ver indicadores.</p><button class="btn btn-primary" type="button" id="emptyClear">Limpiar filtros</button></div>`;
    return;
  }
  const fn = { resumen: viewResumen, datos: viewDatos, confiabilidad: viewConfiabilidad, fallas: viewFallas, gestion: viewGestion, costos: viewCostos, registros: viewRegistros }[state.section] || viewResumen;
  const { html, charts = [] } = fn(state.K, ds);
  view.innerHTML = html;
  mountCharts(charts);
}
function emptyState() {
  const ds = active();
  if (ds && ds.status === 'loading') return `<div class="empty"><span class="spinner"></span><h2>Procesando ${esc(ds.name)}</h2></div>`;
  if (!window.echarts || !window.Papa) return `<div class="empty"><h2>No se cargaron las librerías de la aplicación</h2><p>WebAppMant usa ECharts, PapaParse y jsPDF desde una red de distribución (CDN). Revisa tu conexión a internet y recarga la página.</p></div>`;
  const fileMsg = state.manifestError === 'file'
    ? `<p>Abriste el archivo directamente desde el disco, y el navegador bloquea la lectura de los datasets incluidos. Ábrela desde GitHub Pages o con doble clic en <b>ABRIR-APP.bat</b>. También puedes cargar tu propio archivo ahora.</p>`
    : `<p>Carga un archivo CSV o Excel exportado de tu CMMS (SAP PM, Maximo u otro). La aplicación reconoce las columnas, depura los datos y calcula los indicadores en tu navegador.</p>`;
  const saved = state.datasets.filter((d) => d.source === 'upload').length;
  const cleanMsg = CLEAN ? `<p style="font-size:12.5px;color:var(--muted)">${saved ? `Tienes ${saved} ${U.plural(saved, 'dataset guardado', 'datasets guardados')} en este navegador; elígelo en la lista de la izquierda o carga uno nuevo. ` : ''}¿Prefieres partir con datos de ejemplo? <a href="./${location.hash}">Abrir con los datasets incluidos</a>.</p>` : '';
  return `<div class="empty"><h2>${CLEAN ? 'Página en limpio: carga tu dataset' : 'Carga un dataset de mantenimiento'}</h2>${fileMsg}<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><button class="btn btn-primary" type="button" id="emptyUpload">Cargar dataset</button><a class="btn" href="plantilla/plantilla_dataset_CMMS.csv" download>Descargar plantilla CSV</a></div><p style="font-size:12.5px;color:var(--muted)">También puedes arrastrar el archivo a esta ventana.</p>${cleanMsg}</div>`;
}

// 1) Resumen ejecutivo
function viewResumen(K) {
  const N = state.N, lv = K.level;
  const pos = U.clamp(K.idm ?? 0, 0, 100);
  const scale = `<div class="scale" aria-label="Escala de madurez: nivel ${lv.n} de 5"><div class="scale-marker" style="left:${pos}%"></div><div class="scale-bar">${LEVELS.map((l) => `<div class="scale-seg ${l.n === lv.n ? 'on' : l.n < lv.n ? 'past' : ''}"></div>`).join('')}</div>` +
    `<div class="scale-names">${LEVELS.map((l) => `<span class="${l.n === lv.n ? 'on' : ''}"><b>Nivel ${l.n}</b>${l.name}</span>`).join('')}</div></div>`;
  const hero = `<section class="panel hero c12"><div class="hero-main"><span class="hero-label">Índice de desempeño de mantenimiento IDM-7</span>` +
    `<div class="hero-score"><span class="big">${num(K.idm, 0)}</span><span class="of">/ 100</span><div class="hero-level">Nivel ${lv.n}: ${lv.name}<span>${periodText(K.from, K.to)}, ${num(K.nOT)} OT, ${num(K.NEq)} equipos</span></div></div>` +
    scale + `<p class="verdict">${esc(N.verdict)}</p></div><div class="hero-side"><div class="chart" id="chRadar" role="img" aria-label="Radar de dimensiones del IDM-7"></div></div></section>`;
  const tiles = `<div class="kpis c12">${KPI_ORDER.map((id) => kpiTile(id, K)).join('')}</div>`;
  const findings = `<ul class="findings">${N.findings.slice(0, 9).map((f) => `<li><span class="fi-ic st st-${f.sev}" aria-label="${STATUS[f.sev].label}">${STATUS[f.sev].icon}</span><div><div class="fi-t">${esc(f.title)}<small>${esc(f.area)}</small></div><p>${esc(f.text)}</p></div></li>`).join('')}</ul>`;
  const recs = `<ol class="recs">${N.recs.slice(0, 7).map((r) => `<li><div><span class="ra">${esc(r.area)}</span><p>${esc(r.text)}</p></div></li>`).join('')}</ol>`;
  const html = secHead('resumen', `Diagnóstico integral del período ${periodText(K.from, K.to)}. El índice combina siete dimensiones evaluadas contra metas de referencia que puedes ajustar en Metodología y metas.`) +
    `<div class="grid">${hero}${tiles}` +
    panel({ title: 'Órdenes de trabajo por mes y tipo', sub: 'Haz clic en un tipo para filtrar', cls: 'c7', chart: 'chTrend', how: '<b>Cada columna es un mes</b> y sus segmentos, los tipos de mantenimiento. Una organización proactiva muestra el segmento correctivo pequeño y estable. Las franjas sombreadas marcan meses con caída anómala de registros (posible subregistro).' }) +
    panel({ title: 'Puntaje por dimensión', sub: 'Escala 0–100; la línea marca el umbral del nivel 4 (70 pts)', cls: 'c5', chart: 'chDims', how: 'Cada dimensión promedia los puntajes de sus indicadores. <b>Verde</b>: cumple meta; <b>ámbar</b>: brecha moderada; <b>rojo</b>: brecha crítica. El IDM-7 pondera estas dimensiones según los pesos definidos en Metodología.' }) +
    panel({ title: 'Hallazgos clave', sub: 'Generados a partir de los datos filtrados, ordenados por severidad', cls: 'c7', body: findings }) +
    panel({ title: 'Recomendaciones prioritarias', sub: 'Acciones sugeridas según las brechas detectadas', cls: 'c5', body: recs }) + `</div>`;
  return {
    html, charts: [
      { id: 'chRadar', opt: (T) => C.radar(K, T) },
      { id: 'chTrend', opt: (T) => C.trendTipo(K, T), click: (p) => p.seriesName && toggleFilter('tipo', p.seriesName) },
      { id: 'chDims', opt: (T) => C.dimBars(K, T) },
    ],
  };
}

// 2) Calidad de datos
function viewDatos(K, ds) {
  const Q = ds.quality;
  const rules = RULE_SUMMARY(Q);
  const sevTxt = { error: 'Error', aviso: 'Advertencia' };
  const ruleMeta = Object.fromEntries((Q.rulesMeta || []).map((r) => [r.id, r]));
  const rulesTbl = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Regla</th><th class="r">Afectados</th><th class="r">%</th><th>Tratamiento</th></tr></thead><tbody>` +
    rules.map((r) => `<tr><td>${esc(r.name)}</td><td class="r">${num(r.n)}</td><td class="r">${pct(r.rate)}</td><td class="muted">${esc(TREAT[r.id] || '')}</td></tr>`).join('') + '</tbody></table></div>';
  const fixes = [
    ['Marca de texto (apóstrofo inicial) de la exportación', Q.apostrophes, 'Eliminada; es un artefacto de Excel/SAP'],
    ['Espacios sobrantes', Q.trimmed, 'Recortados'],
    ['Decimales con coma', Q.decComma, 'Convertidos a punto decimal'],
    ['Separadores de miles', Q.thousands, 'Eliminados'],
    ['Fechas en formato mes-día', Q.dateSwap, 'Reordenadas a día-mes'],
    ['Categorías con variantes de escritura', Q.normalizations.reduce((s, x) => s + x.n, 0), 'Unificadas a la escritura dominante'],
    ['Filas duplicadas idénticas', Q.dupExact, 'Eliminadas'],
    ['OT repetidas con contenido distinto', Q.dupOT, 'Se conserva la primera'],
    ['Valores inválidos (fecha, número o dominio)', Q.invalid, 'Tratados como dato faltante'],
  ];
  const fixTbl = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Corrección</th><th class="r">Celdas o filas</th><th>Tratamiento</th></tr></thead><tbody>` +
    fixes.map(([a, n, t]) => `<tr><td>${a}</td><td class="r">${num(n)}</td><td class="muted">${t}</td></tr>`).join('') +
    `<tr><td>Tarifa de mano de obra</td><td class="r">${clp(Q.tarifa, 'unit')}/HH</td><td class="muted">${Q.tarifaInferida ? 'Inferida de los datos: (total − repuestos − externo) / HH' : 'Valor por defecto (no se pudo inferir)'}</td></tr></tbody></table></div>`;
  const normTbl = Q.normalizations.length ? `<div class="tbl-wrap" style="max-height:320px"><table class="tbl"><thead><tr><th>Campo</th><th>Valor original</th><th>Valor estándar</th><th class="r">Registros</th></tr></thead><tbody>` +
    Q.normalizations.slice(0, 80).map((x) => `<tr><td>${esc((FIELDS.find((f) => f.k === x.field) || {}).label || x.field)}</td><td><code>${esc(JSON.stringify(x.from))}</code></td><td>${esc(x.to)}</td><td class="r">${num(x.n)}</td></tr>`).join('') + '</tbody></table></div>' : '<p class="muted">No fue necesario unificar categorías.</p>';
  const outTbl = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Variable</th><th class="r">Q3</th><th class="r">Cerco superior</th><th class="r">Registros sobre el cerco</th></tr></thead><tbody>` +
    Object.entries(Q.fences).map(([k, f]) => { const money = k === 'ctot'; const fm = (v) => (money ? clp(v) : hours(v)); return `<tr><td>${esc((FIELDS.find((x) => x.k === k) || {}).label)}</td><td class="r">${fm(f.q3)}</td><td class="r">${fm(f.hi)}</td><td class="r">${num(f.n)}</td></tr>`; }).join('') + '</tbody></table></div>';
  const brk = Q.breaks.length ? `<div class="notice" style="margin-top:10px"><b>Posible subregistro.</b> ${Q.breaks.length} ${U.plural(Q.breaks.length, 'mes registra', 'meses registran')} menos de la mitad de la mediana de los seis meses previos (${Q.breaks.map((b) => U.monthLabel(b.m)).join(', ')}). Los indicadores mensuales de esos meses pueden estar sesgados.</div>` : '';
  const unm = Q.unmapped.length ? `<p class="panel-foot">Columnas del archivo no utilizadas: ${Q.unmapped.map(esc).join(', ')}.</p>` : '';
  const html = secHead('datos', 'Antes de interpretar los indicadores conviene saber cuánto confiar en los datos. La calidad se evalúa sobre el dataset completo en cinco dimensiones (DAMA-DMBOK, ISO 8000-8).') +
    `<div class="grid">` +
    panel({ title: 'Índice de calidad de datos', sub: `${num(Q.rawRows)} filas leídas, ${num(Q.validRows)} válidas`, cls: 'c5', chart: 'chQDims', h: 'h-sm',
      pre: `<div class="hero-score" style="margin:2px 0 4px"><span class="big" style="font-size:44px">${pct(Q.dqi)}</span>${stHtml(K.status.dqi)}</div>`,
      how: '<b>Completitud</b>: campos clave con dato. <b>Validez</b>: valores con formato y dominio correctos. <b>Consistencia</b>: reglas lógicas entre campos (fechas, estados, costos). <b>Unicidad</b>: ausencia de duplicados. <b>Plausibilidad</b>: ausencia de valores extremos (Tukey sobre el logaritmo). El índice es el promedio ponderado (25/20/25/15/15).' }) +
    panel({ title: 'Volumen de registros por mes', sub: 'En ámbar, los meses con caída o alza anómala', cls: 'c7', chart: 'chVolume', h: 'h-sm', body: brk, how: 'Un CMMS estable registra un volumen mensual parecido. Una caída brusca suele indicar <b>subregistro</b> (OT no ingresadas o exportación incompleta), no una mejora real.' }) +
    panel({ title: 'Completitud de campos clave', sub: 'Modo, causa y aviso se evalúan solo en correctivas; fecha de fin, solo en OT cerradas', cls: 'c6', chart: 'chCompl', h: 'h-xl' }) +
    panel({ title: 'Reglas de consistencia', sub: 'Registros que no cumplen cada regla lógica', cls: 'c6', body: rulesTbl, foot: 'Los registros afectados se conservan y se marcan con banderas en Registros.' }) +
    panel({ title: 'Correcciones aplicadas automáticamente', cls: 'c7', body: fixTbl + unm }) +
    panel({ title: 'Valores atípicos extremos', sub: 'Cerco de Tukey Q3 + 3·RIC sobre el logaritmo', cls: 'c5', body: outTbl, foot: `${num(Q.outlierRows)} registros marcados. Puedes excluirlos del análisis en Metodología y metas.` }) +
    panel({ title: 'Categorías unificadas', sub: 'Variantes de escritura convertidas al valor estándar', cls: 'c12', body: normTbl }) + `</div>`;
  return {
    html, charts: [
      { id: 'chQDims', opt: (T) => C.qualityDims(Q, T) },
      { id: 'chVolume', opt: (T) => C.volumeChart(Q, T) },
      { id: 'chCompl', opt: (T) => C.completenessBars(Q, T) },
    ],
  };
}
const TREAT = {
  finIni: 'Duración excluida del cálculo', iniCre: 'Tiempo de espera excluido', planCre: 'La fecha planificada no se usa en indicadores',
  cerradaSinFin: 'Excluida del cumplimiento de plazo', abiertaConFin: 'Se mantiene como pendiente', dtSpan: 'Se conserva; revisar el registro de detención',
  costo: 'Se usa el costo total informado', status: 'Prevalece el estado de la OT', clase: 'Prevalece el tipo de mantenimiento', sinModo: 'Se agrupa como «Sin registrar»',
};

// 3) Disponibilidad y confiabilidad
function viewConfiabilidad(K) {
  const T0 = K.settings.targets;
  const strip = `<div class="kpis c12">${kpiTile('disp', K)}${statTile('Disponibilidad inherente', pct(K.Ai, 2), 'MTBF / (MTBF + MTTR)')}${kpiTile('mtbf', K)}${kpiTile('mttr', K)}${statTile('Detención media por falla', hours(K.MDT), 'MDT')}${statTile('Tasa de fallas', num(K.lambdaEqYear, 1), 'fallas por equipo al año')}${kpiTile('reinc', K)}</div>`;
  const ws = K.weibull;
  if (!state.weibullSel || !ws.find((w) => w.name === state.weibullSel && w.beta)) state.weibullSel = (ws.find((w) => w.beta) || {}).name || null;
  const sel = ws.find((w) => w.name === state.weibullSel) || K.weibullFleet;
  const wTbl = `<div class="tbl-wrap"><table class="tbl" id="tblWeibull"><thead><tr><th>Tipo de equipo</th><th class="r">Fallas</th><th class="r">Suspensiones</th><th class="r">β forma</th><th class="r">η escala (h)</th><th class="r">R²</th><th class="r">MTBF Weibull (h)</th><th class="r">Vida B10 (h)</th><th>Patrón</th><th>Estrategia sugerida</th></tr></thead><tbody>` +
    [...ws, K.weibullFleet].map((w) => `<tr data-w="${esc(w.name)}" style="cursor:pointer;${w.name === state.weibullSel ? 'background:var(--accent-soft)' : ''}${w === K.weibullFleet ? ';font-weight:600' : ''}"><td class="nw">${esc(w.name)}</td><td class="r">${num(w.nF)}</td><td class="r">${num(w.nS)}</td><td class="r">${w.beta ? num(w.beta, 2) : '—'}</td><td class="r">${w.eta ? num(w.eta, 0) : '—'}</td><td class="r">${w.r2 ? num(w.r2, 3) : '—'}</td><td class="r">${w.mtbfW ? num(w.mtbfW, 0) : '—'}</td><td class="r">${w.b10 ? num(w.b10, 0) : '—'}</td><td class="nw">${esc(w.pattern || '')}</td><td class="muted nw">${esc(weibullStrategyShort(w.pattern))}</td></tr>`).join('') + '</tbody></table></div>' +
    `<ul class="refs" style="margin-top:10px">${['Mortalidad infantil', 'Aleatorio', 'Desgaste'].map((p) => `<li><b>${p}.</b> ${esc(weibullStrategy(p))}</li>`).join('')}</ul>`;
  const html = secHead('confiabilidad', 'Cuánto tiempo están disponibles los equipos, con qué frecuencia fallan y qué patrón siguen sus fallas. Base: EN 13306, ISO 14224 y análisis de Weibull con suspensiones.') +
    `<div class="grid">${strip}` +
    panel({ title: 'Disponibilidad operacional mensual', sub: `Meta ${targetText('disp', T0)}`, cls: 'c6', chart: 'chAvail', h: 'h-sm', how: 'Disponibilidad = 1 − horas de detención / (equipos × horas del mes). Se compara con la meta (línea). Los meses sombreados tienen posible subregistro: allí la disponibilidad tiende a verse artificialmente alta.' }) +
    panel({ title: 'MTBF mensual del parque', sub: 'Horas de operación entre fallas', cls: 'c6', chart: 'chMtbf', h: 'h-sm', how: 'MTBF del mes = (equipos × horas del mes − detención) / fallas del mes. Una tendencia creciente indica mejora de confiabilidad, siempre que el registro sea completo.' }) +
    panel({ title: 'Disponibilidad por unidad', sub: 'Haz clic en una unidad para filtrar', cls: 'c6', chart: 'chAvailU', h: 'h-sm' }) +
    panel({ title: 'Reincidencia por tipo de equipo', sub: `Fallas a ≤ ${K.settings.reincDias} días de la anterior en el mismo equipo`, cls: 'c6', chart: 'chReinc', h: 'h-sm', how: 'Una reincidencia alta revela reparaciones que no eliminan la causa: la falla vuelve al poco tiempo. Es el primer candidato para análisis causa raíz (RCA).' }) +
    panel({ title: 'Análisis de Weibull por tipo de equipo', sub: 'Regresión de rangos medianos (X sobre Y) con rangos ajustados de Johnson. Haz clic en una fila para ver su gráfico', cls: 'c12', body: wTbl,
      how: '<b>β (forma)</b> describe cómo cambia el riesgo de falla con el tiempo: β < 1 el riesgo baja (mortalidad infantil, fallas inducidas por intervenir); β ≈ 1 es constante (aleatorio); β > 1 crece (desgaste). <b>η (escala)</b> es la vida característica: a η horas ha fallado el 63,2% de la población. <b>B10</b> es el tiempo en que falla el 10%. Los equipos sin fallas y el tiempo final sin falla entran como suspensiones.' }) +
    panel({ title: 'Gráfico de probabilidad de Weibull', sub: esc(sel ? sel.name + (sel.beta ? `: β = ${num(sel.beta, 2)}, η = ${num(sel.eta, 0)} h, R² = ${num(sel.r2, 3)}` : '') : ''), cls: 'c6', chart: 'chWeib', h: 'h-lg', how: 'En este papel probabilístico una distribución de Weibull se ve como recta. Si los puntos siguen la línea ajustada, el modelo describe bien los datos. La pendiente es β.' }) +
    panel({ title: 'Curvas de confiabilidad R(t)', sub: 'Probabilidad de operar sin fallar hasta t horas (cuatro tipos con más fallas)', cls: 'c6', chart: 'chRel', h: 'h-lg', how: 'R(t) = exp(−(t/η)^β). Por ejemplo, el punto de 500 h indica qué fracción de los equipos sigue funcionando 500 horas después de su última reparación.' }) +
    panel({ title: 'Parámetro de forma β por tipo de equipo', sub: 'La línea marca β = 1 (tasa de falla constante)', cls: 'c12', chart: 'chBeta', h: 'h-sm', foot: '<span class="legend-inline"><span><i style="background:' + tokens().series[6] + '"></i>Mortalidad infantil (β &lt; 0,9)</span><span><i style="background:' + tokens().series[0] + '"></i>Aleatorio (0,9 a 1,1)</span><span><i style="background:' + tokens().series[1] + '"></i>Desgaste (β &gt; 1,1)</span></span>' }) + `</div>`;
  return {
    html, charts: [
      { id: 'chAvail', opt: (T) => C.lineTrend(K, T, { key: 'A', name: 'Disponibilidad', scale: 100, dec: 2, unit: '%', target: T0.disp.meta, targetLabel: 'Meta ' + num(T0.disp.meta, 1) + '%' }) },
      { id: 'chMtbf', opt: (T) => C.lineTrend(K, T, { key: 'mtbf', name: 'MTBF', dec: 0, unit: ' h', target: T0.mtbf.meta, targetLabel: 'Meta ' + num(T0.mtbf.meta) + ' h', min: 0 }) },
      { id: 'chAvailU', opt: (T) => C.simpleBars(K.by.unidad.map((u) => ({ ...u, Ap: u.A * 100 })).sort((a, b) => a.Ap - b.Ap), T, { metric: 'Ap', fmt: (v) => num(v, 2) + '%', axisFmt: (v) => num(v, 1) + '%', min: (v) => Math.floor(v.min - 0.5), max: 100, target: T0.disp.meta, targetLabel: 'Meta' }), click: (p) => toggleFilter('unidad', p.name) },
      { id: 'chReinc', opt: (T) => C.simpleBars(K.reincByTipoEq.map((x) => ({ ...x, p: x.pct * 100 })), T, { metric: 'p', fmt: (v) => num(v, 1) + '%', axisFmt: (v) => v + '%', color: T.series[1], target: T0.reinc.meta, targetLabel: 'Meta', max: 100 }), click: (p) => toggleFilter('tipoEq', p.name) },
      { id: 'chWeib', opt: (T) => C.weibullPlot(sel, T) },
      { id: 'chRel', opt: (T) => C.reliabilityCurves(ws, T) },
      { id: 'chBeta', opt: (T) => C.betaBars(K, T) },
    ],
  };
}

// 4) Análisis de fallas
function viewFallas(K) {
  const m = state.paretoMetric;
  const mLab = { n: 'Frecuencia', dt: 'Detención', cost: 'Costo' };
  const seg = `<div class="toolbar" role="group" aria-label="Métrica del Pareto">${Object.entries(mLab).map(([k, l]) => `<button type="button" class="btn btn-sm ${k === m ? 'btn-primary' : ''}" data-pm="${k}">${l}</button>`).join('')}</div>`;
  const sortP = (rows) => [...rows].sort((a, b) => b[m] - a[m]);
  const fmtM = m === 'cost' ? (v) => clp(v) : m === 'dt' ? (v) => num(v, 0) + ' h' : (v) => num(v);
  const quad = ['Agudo y crónico', 'Crónico', 'Agudo', 'Controlado'];
  const quadTxt = `<div class="legend-inline">${quad.map((q) => `<span><b>${q}</b>: ${num(K.quadCount[q])} equipos, ${num(K.quadDt[q], 0)} h (${pct(K.quadDt[q] / (K.dtCorr || 1), 0)})</span>`).join('')}</div>`;
  const ba = K.badActors.slice(0, 15);
  const baTbl = `<div class="tbl-wrap"><table class="tbl" id="tblBad"><thead><tr><th class="r">#</th><th>Equipo</th><th>Tipo</th><th>Unidad</th><th>Crit.</th><th class="r">Fallas</th><th class="r">Detención (h)</th><th class="r">Detención media (h)</th><th class="r">MTBF (h)</th><th class="r">Costo de fallas</th><th>Cuadrante</th></tr></thead><tbody>` +
    ba.map((e, i) => `<tr data-eq="${esc(e.equipo)}" style="cursor:pointer"><td class="r muted">${i + 1}</td><td class="nw"><b>${esc(e.equipo)}</b></td><td class="nw">${esc(e.tipoEq || '')}</td><td>${esc(e.unidad || '')}</td><td>${esc(e.crit || '')}</td><td class="r">${num(e.nF)}</td><td class="r">${num(e.dtF, 0)}</td><td class="r">${num(e.mdt, 1)}</td><td class="r">${num(e.mtbf, 0)}</td><td class="r">${clp(e.costF)}</td><td class="nw">${e.quad}</td></tr>`).join('') + '</tbody></table></div>';
  const html = secHead('fallas', `${num(K.nF)} órdenes correctivas analizadas como fallas funcionales (EN 13306). Pareto, diagrama de dispersión logarítmica (Knights, 2001) y malos actores.`) +
    `<div class="grid">` +
    panel({ title: 'Pareto de modos de falla', sub: 'Las barras atenuadas quedan fuera del 80% acumulado. Clic para filtrar', cls: 'c6', chart: 'chParetoM', h: 'h-lg', body: '', how: 'Se ordenan los modos de falla de mayor a menor. Las barras intensas son las pocas causas que explican el 80% del total: ahí rinde más el esfuerzo de mejora. Cambia la métrica para ver el Pareto por horas de detención o costo.' }).replace('<div class="chart', seg + '<div class="chart') +
    panel({ title: 'Pareto de causas de falla', sub: 'Misma métrica seleccionada', cls: 'c6', chart: 'chParetoC', h: 'h-lg', body: '' }).replace('<div class="chart', seg.replace(/data-pm/g, 'data-pm2') + '<div class="chart') +
    panel({ title: 'Diagrama de dispersión logarítmica (Jack-knife)', sub: 'Cada punto es un equipo. Clic para filtrar', cls: 'c12', chart: 'chJK', h: 'h-xl', body: quadTxt,
      how: 'Eje X: número de fallas; eje Y: detención media por falla, ambos en escala logarítmica. Las líneas límite son los promedios del parque. <b>Crónico</b> (derecha abajo): falla seguido, se repara rápido; ataca la confiabilidad (RCA, rediseño). <b>Agudo</b> (izquierda arriba): falla poco pero detiene mucho; ataca la mantenibilidad (repuestos, procedimientos). <b>Agudo y crónico</b>: prioridad máxima. Las diagonales unen equipos con igual detención total.' }) +
    panel({ title: 'Malos actores', sub: 'Quince equipos con más horas de detención por fallas. Clic en una fila para filtrar', cls: 'c12', body: baTbl, foot: `${K.n80} equipos concentran el 80% de la detención por fallas.` }) +
    panel({ title: 'Fallas por unidad y mes', sub: 'Intensidad = número de correctivas', cls: 'c12', chart: 'chHeatUM', h: 'h-sm' }) +
    panel({ title: 'Matriz de modos de falla por tipo de equipo', sub: 'Doce modos más frecuentes (taxonomía ISO 14224)', cls: 'c12', chart: 'chHeatMT', h: 'h-xl' }) +
    panel({ title: 'Fallas por turno', cls: 'c6', chart: 'chTurno', h: 'h-sm', how: 'Una concentración marcada en un turno puede indicar diferencias de dotación, supervisión o condiciones de operación.' }) +
    panel({ title: 'Síntomas reportados', sub: 'Cómo se detectaron las fallas', cls: 'c6', chart: 'chSint', h: 'h-sm' }) + `</div>`;
  return {
    html, charts: [
      { id: 'chParetoM', opt: (T) => C.paretoBars(sortP(K.paretoModo), T, { metric: m, valueFmt: fmtM }), click: (p) => toggleFilter('modo', p.name) },
      { id: 'chParetoC', opt: (T) => C.paretoBars(sortP(K.paretoCausa), T, { metric: m, valueFmt: fmtM, color: T.series[6] }), click: (p) => toggleFilter('causa', p.name) },
      { id: 'chJK', opt: (T) => C.jackknife(K, T), click: (p) => p.data && p.data.e && toggleFilter('equipo', p.data.e.equipo) },
      { id: 'chHeatUM', opt: (T) => C.heatmap(K.heatUM, T), click: (p) => toggleFilter('unidad', K.heatUM.y[p.value[1]]) },
      { id: 'chHeatMT', opt: (T) => C.heatmap(K.heatMT, T, { rotate: 30 }), click: (p) => toggleFilter('modo', K.heatMT.y[p.value[1]]) },
      { id: 'chTurno', opt: (T) => C.simpleBars(K.by.turno.map((t) => ({ ...t })).sort((a, b) => b.nF - a.nF), T, { metric: 'nF', horizontal: false, color: T.series[1] }) },
      { id: 'chSint', opt: (T) => C.paretoBars(K.paretoSintoma, T, { metric: 'n', limit: 8, color: T.series[0] }) },
    ],
  };
}

// 5) Gestión del trabajo
function viewGestion(K) {
  const T0 = K.settings.targets;
  const strip = `<div class="kpis c12">${['proact', 'pred', 'plan', 'onTime', 'backlog'].map((id) => kpiTile(id, K)).join('')}${statTile('OT pendientes', num(K.nPend), `${num(K.nOpen)} abiertas, ${num(K.nExec)} en ejecución`)}${statTile('Capacidad ejecutada', num(K.capWeek, 0) + ' HH', 'por semana')}</div>`;
  const html = secHead('gestion', 'Cómo se distribuye, planifica y cumple el trabajo de mantenimiento, y cuánta carga queda pendiente (métricas SMRP de trabajo y backlog).') +
    `<div class="grid">${strip}` +
    panel({ title: 'Mix de mantenimiento por unidad', sub: 'Porcentaje de OT por tipo. Clic para filtrar', cls: 'c6', chart: 'chMixU', h: 'h-lg', how: 'Compara la proporción proactiva (preventiva + predictiva) entre unidades. Las unidades con más correctivo son candidatas a revisar su plan de mantenimiento.' }) +
    panel({ title: 'Horas de mano de obra por puesto de trabajo', sub: 'HH por tipo de mantenimiento', cls: 'c6', chart: 'chHHP', h: 'h-lg' }) +
    panel({ title: 'Trabajo planificado y cumplimiento de plazo', sub: `Meta ${targetText('plan', T0)} en ambos`, cls: 'c6', chart: 'chPlan', h: 'h-sm', how: '<b>Planificado</b>: OT preparadas antes de ejecutarse. <b>Cumplimiento</b>: OT cerradas antes de su fecha de necesidad. Ambos miden la disciplina del ciclo de planificación y programación.' }) +
    panel({ title: 'Proporción de trabajo correctivo', sub: `Referencia: ${num(100 - T0.proact.meta, 0)}% o menos`, cls: 'c6', chart: 'chCorr', h: 'h-sm' }) +
    panel({ title: 'Antigüedad del backlog', sub: 'OT pendientes según días desde su creación al cierre del período', cls: 'c6', chart: 'chAging', h: 'h-sm', how: 'Un backlog sano se renueva: la mayoría de las OT pendientes debería tener pocas semanas. Muchas OT con más de 90 días indican trabajo que nunca se programa o que no se cierra en el sistema.' }) +
    panel({ title: 'Backlog por puesto de trabajo', sub: 'HH estimadas de OT pendientes', cls: 'c6', chart: 'chBkP', h: 'h-sm' }) +
    panel({ title: 'Tiempo de espera de las fallas', sub: 'Horas desde el aviso hasta el inicio de la intervención', cls: 'c6', chart: 'chEsp', h: 'h-sm' }) +
    panel({ title: 'Órdenes por prioridad', sub: 'Número de OT por tipo de mantenimiento', cls: 'c6', chart: 'chPrio', h: 'h-sm' }) +
    panel({ title: 'Mix por criticidad del equipo', sub: 'Los equipos críticos (A) deberían tener el mayor componente proactivo', cls: 'c12', chart: 'chMixC', h: 'h-xs' }) + `</div>`;
  const prioOrder = ['Muy alta', 'Alta', 'Media', 'Baja'];
  return {
    html, charts: [
      { id: 'chMixU', opt: (T) => C.stackedShareByGroup([...K.by.unidad].sort((a, b) => a.proact - b.proact), T), click: (p) => toggleFilter('unidad', p.name) },
      { id: 'chHHP', opt: (T) => C.stackedShareByGroup(K.by.puesto, T, { field: 'hhByTipo', absolute: true, valueFmt: (v) => num(v, 0) + ' HH' }), click: (p) => toggleFilter('puesto', p.name) },
      { id: 'chPlan', opt: (T) => C.multiLineTrend(K, T, [{ key: 'plan', name: 'Planificado', scale: 100 }, { key: 'onTime', name: 'Cumplimiento de plazo', scale: 100 }], { target: T0.plan.meta, targetLabel: 'Meta' }) },
      { id: 'chCorr', opt: (T) => C.lineTrend(K, T, { key: 'corrPct', name: 'Correctivo', scale: 100, dec: 1, unit: '%', target: 100 - T0.proact.meta, targetLabel: 'Referencia', color: T.series[1], min: 0 }) },
      { id: 'chAging', opt: (T) => C.agingBars(K, T) },
      { id: 'chBkP', opt: (T) => C.simpleBars(K.backlogPuesto, T, { metric: 'hh', fmt: (v) => num(v, 0) + ' HH', color: T.seq[5] }), click: (p) => toggleFilter('puesto', p.name) },
      { id: 'chEsp', opt: (T) => C.simpleBars(K.espHist, T, { metric: 'n', horizontal: false, color: T.series[1] }) },
      { id: 'chPrio', opt: (T) => C.stackedShareByGroup([...K.by.prio].sort((a, b) => prioOrder.indexOf(a.key) - prioOrder.indexOf(b.key)), T, { absolute: true, horizontal: false }) },
      { id: 'chMixC', opt: (T) => C.stackedShareByGroup(K.by.crit, T), click: (p) => toggleFilter('crit', p.name) },
    ],
  };
}

// 6) Costos
function viewCostos(K) {
  const ct = K.costTotal || 1;
  const strip = `<div class="kpis c12">${statTile('Costo total', clp(K.costTotal), periodText(K.from, K.to))}${kpiTile('costCorr', K)}${statTile('Costo medio OT correctiva', clp(K.costPerOT.Correctivo))}${statTile('Costo medio OT preventiva', clp(K.costPerOT.Preventivo))}${statTile('Repuestos', pct(K.comp.rep / ct), clp(K.comp.rep))}${statTile('Servicios externos', pct(K.comp.ext / ct), clp(K.comp.ext))}${statTile('Mano de obra', pct(K.comp.mo / ct), clp(K.comp.mo) + ' a ' + clp(K.quality.tarifa, 'unit') + '/HH')}</div>`;
  const html = secHead('costos', 'Estructura y evolución del gasto de mantenimiento (CLP). MM$ = millones de pesos; M$ = miles de pesos.') +
    `<div class="grid">${strip}` +
    panel({ title: 'Costo mensual por componente', sub: 'Mano de obra, servicios externos y repuestos', cls: 'c12', chart: 'chCostM', h: 'h-sm' }) +
    panel({ title: 'Costo total por tipo de mantenimiento', cls: 'c6', chart: 'chCostT', h: 'h-sm', how: 'Muestra a qué estrategia se destina el presupuesto. En una organización proactiva el gasto preventivo y predictivo supera al correctivo.' }) +
    panel({ title: 'Costo medio por orden de trabajo', cls: 'c6', chart: 'chCostOT', h: 'h-sm', how: 'Compara cuánto cuesta en promedio cada tipo de intervención. La diferencia entre correctiva y preventiva cuantifica el valor económico de anticiparse a la falla.' }) +
    panel({ title: 'Costo por unidad y tipo', sub: 'Clic para filtrar', cls: 'c6', chart: 'chCostU', h: 'h-lg' }) +
    panel({ title: 'Equipos de mayor costo', sub: 'Diez equipos con más gasto total. Clic para filtrar', cls: 'c6', chart: 'chCostE', h: 'h-lg' }) +
    panel({ title: 'Costo por tipo de equipo', cls: 'c12', chart: 'chCostTE', h: 'h-lg' }) + `</div>`;
  return {
    html, charts: [
      { id: 'chCostM', opt: (T) => C.costCompTrend(K, T) },
      { id: 'chCostT', opt: (T) => C.costByTipo(K, T, 'total'), click: (p) => toggleFilter('tipo', p.name) },
      { id: 'chCostOT', opt: (T) => C.costByTipo(K, T, 'perOT') },
      { id: 'chCostU', opt: (T) => C.stackedShareByGroup([...K.by.unidad].sort((a, b) => b.cost - a.cost), T, { field: 'costByTipo', absolute: true, valueFmt: clp }), click: (p) => toggleFilter('unidad', p.name) },
      { id: 'chCostE', opt: (T) => C.simpleBars(K.badByCost.slice(0, 10).map((e) => ({ ...e, key: e.equipo })), T, { metric: 'cost', fmt: clp, color: T.comp.ext }), click: (p) => toggleFilter('equipo', p.name) },
      { id: 'chCostTE', opt: (T) => C.stackedShareByGroup([...K.by.tipoEq].sort((a, b) => b.cost - a.cost), T, { field: 'costByTipo', absolute: true, valueFmt: clp }), click: (p) => toggleFilter('tipoEq', p.name) },
    ],
  };
}

// 7) Comparación
async function compareList() {
  const ready = state.datasets.filter((d) => d.status === 'ready');
  const key = filtersKey();
  const out = [];
  for (const d of ready) {
    const ck = d.id + '|' + key;
    let c = state.cmpCache.get(ck);
    if (!c) { c = computeFor(d); state.cmpCache.set(ck, c); }
    if (c.K) out.push({ id: d.id, name: d.name, K: c.K, ds: d });
  }
  return out;
}
export { compareList };
async function viewComparar(view) {
  const idle = state.datasets.filter((d) => d.status === 'idle');
  const list = await compareList();
  const T0 = state.settings.targets;
  const loadBtn = idle.length ? `<div class="notice">Hay ${idle.length} ${U.plural(idle.length, 'dataset sin procesar', 'datasets sin procesar')}. <button class="link-btn" type="button" id="cmpLoadAll">Procesar todos para compararlos</button></div>` : '';
  if (list.length < 2) {
    view.innerHTML = secHead('comparar', 'Compara el desempeño de varios datasets con el mismo modelo, los mismos filtros y las mismas metas.') + loadBtn +
      `<div class="empty"><h2>Se necesitan al menos dos datasets procesados</h2><p>Procesa los datasets incluidos o carga otro archivo para comparar, por ejemplo, dos plantas o dos períodos.</p></div>`;
    return;
  }
  const head = `<tr><th>Indicador</th><th>Meta</th>${list.map((x) => `<th class="r">${esc(x.name)}</th>`).join('')}</tr>`;
  const rowIdm = `<tr><td><b>IDM-7</b></td><td class="muted">≥ 70 (nivel 4)</td>${list.map((x) => `<td class="r"><b>${num(x.K.idm, 1)}</b><br><span class="muted">Nivel ${x.K.level.n}, ${x.K.level.name.toLowerCase()}</span></td>`).join('')}</tr>`;
  const rows = KPI_ORDER.map((id) => `<tr><td>${KPI_DEFS[id].name}</td><td class="muted nw">${targetText(id, T0)}</td>${list.map((x) => `<td class="r nw">${fmtKpi(id, x.K.kpi[id])}<br>${stHtml(x.K.status[id])}</td>`).join('')}</tr>`).join('');
  const extra = [
    ['OT analizadas', (K) => num(K.nOT)], ['Fallas (correctivas)', (K) => num(K.nF)], ['Detención por fallas', (K) => num(K.dtCorr, 0) + ' h'],
    ['Costo total', (K) => clp(K.costTotal)], ['Weibull parque: β', (K) => (K.weibullFleet.beta ? num(K.weibullFleet.beta, 2) : '—')], ['Equipos agudos y crónicos', (K) => num(K.quadCount['Agudo y crónico'])],
  ].map(([l, f]) => `<tr><td>${l}</td><td class="muted">—</td>${list.map((x) => `<td class="r">${f(x.K)}</td>`).join('')}</tr>`).join('');
  view.innerHTML = secHead('comparar', 'Mismo modelo, mismos filtros y mismas metas para todos los datasets procesados; cada uno sobre su propio período de datos.') + loadBtn +
    `<div class="grid">` +
    panel({ title: 'IDM-7 por dataset', sub: 'Líneas: umbrales de los niveles 2 a 5', cls: 'c5', chart: 'chCmpIdm', h: 'h-sm' }) +
    panel({ title: 'Puntaje por dimensión', cls: 'c7', chart: 'chCmpDims', h: 'h-sm' }) +
    panel({ title: 'Indicadores por dataset', cls: 'c12', body: `<div class="tbl-wrap"><table class="tbl"><thead>${head}</thead><tbody>${rowIdm}${rows}${extra}</tbody></table></div>` }) + `</div>`;
  mountCharts([{ id: 'chCmpIdm', opt: (T) => C.compareIdm(list, T), click: (p) => activate(list[p.dataIndex].id) }, { id: 'chCmpDims', opt: (T) => C.compareDims(list, T) }]);
}

// 8) Registros
function viewRegistros(K) {
  const tq = U.normKey(state.table.q);
  let rows = state.recs;
  if (state.table.onlyFlags) rows = rows.filter((r) => r.flags);
  if (tq) rows = rows.filter((r) => U.normKey([r.ot, r.equipo, r.modo, r.causa, r.desc, r.tipoEq].join(' ')).includes(tq));
  const per = 50, pages = Math.max(1, Math.ceil(rows.length / per));
  state.table.page = Math.min(state.table.page, pages - 1);
  const slice = rows.slice(state.table.page * per, state.table.page * per + per);
  const flags = (f) => Object.entries(FLAG_NAMES).filter(([b]) => f & +b).map(([, n]) => `<span class="tag">${n}</span>`).join('');
  const html = secHead('registros', 'Órdenes depuradas que alimentan el análisis, con las banderas de calidad detectadas. Puedes descargarlas para reproducir los cálculos.') +
    `<div class="grid"><section class="panel c12"><div class="toolbar"><input type="search" id="tblQ" placeholder="Buscar OT, equipo, modo, causa o descripción" value="${esc(state.table.q)}" aria-label="Buscar registros">` +
    `<label class="switch" style="font-size:13px"><input type="checkbox" id="tblFlags" ${state.table.onlyFlags ? 'checked' : ''}> Solo con banderas de calidad</label>` +
    `<span style="margin-left:auto"></span><button class="btn btn-sm" type="button" id="tblCsv">Descargar CSV depurado (${num(rows.length)})</button></div>` +
    `<div class="tbl-wrap" style="max-height:640px"><table class="tbl"><thead><tr><th>OT</th><th>Creación</th><th>Equipo</th><th>Tipo de equipo</th><th>Unidad</th><th>Crit.</th><th>Tipo</th><th>Estado</th><th>Modo de falla</th><th class="r">Detención (h)</th><th class="r">HH</th><th class="r">Costo</th><th>Banderas</th></tr></thead><tbody>` +
    slice.map((r) => `<tr><td class="nw">${esc(r.ot)}</td><td class="nw">${fmtDate(r.fc ?? r.fi)}</td><td class="nw">${esc(r.equipo)}</td><td class="nw">${esc(r.tipoEq || '')}</td><td>${esc(r.unidad || '')}</td><td>${esc(r.crit || '')}</td><td>${esc(r.tipo)}</td><td class="nw">${esc(r.estado)}</td><td>${esc(r.modo || '')}</td><td class="r">${num(r.dt, 1)}</td><td class="r">${num(r.hh, 1)}</td><td class="r nw">${clp(r.ctot)}</td><td><span class="flags">${flags(r.flags)}</span></td></tr>`).join('') +
    `</tbody></table></div><div class="pager"><span>${num(rows.length)} registros. Página ${state.table.page + 1} de ${pages}</span><span style="display:flex;gap:6px"><button class="btn btn-sm" type="button" data-pg="-1" ${state.table.page === 0 ? 'disabled' : ''}>Anterior</button><button class="btn btn-sm" type="button" data-pg="1" ${state.table.page >= pages - 1 ? 'disabled' : ''}>Siguiente</button></span></div></section></div>`;
  state.table.rows = rows;
  return { html, charts: [] };
}

// 9) Metodología y metas
function viewMetodologia() {
  const S = state.settings, T0 = S.targets;
  const dimRows = DIMENSIONS.map((d) => `<tr><td><b>${d.name}</b></td><td class="muted">${d.q}</td><td>${d.kpis.map((k) => KPI_DEFS[k].short).join(', ')}</td><td class="r"><input type="number" min="0" max="100" step="1" data-w="${d.id}" value="${S.weights[d.id]}" aria-label="Peso de ${d.name}"></td></tr>`).join('');
  const wsum = Object.values(S.weights).reduce((a, b) => a + (+b || 0), 0);
  const kRows = KPI_ORDER.map((id) => {
    const d = KPI_DEFS[id], t = T0[id];
    const inputs = d.dir === 'band'
      ? `<td class="r nw"><input type="number" step="0.5" data-t="${id}.lo" value="${t.lo}" aria-label="Límite inferior"> a <input type="number" step="0.5" data-t="${id}.hi" value="${t.hi}" aria-label="Límite superior"></td><td class="r"><input type="number" step="0.5" data-t="${id}.crit" value="${t.crit}" aria-label="Umbral crítico"></td>`
      : `<td class="r nw">${d.dir === 'higher' ? '≥' : '≤'} <input type="number" step="any" data-t="${id}.meta" value="${t.meta}" aria-label="Meta"></td><td class="r nw">${d.dir === 'higher' ? '≤' : '≥'} <input type="number" step="any" data-t="${id}.crit" value="${t.crit}" aria-label="Umbral crítico"></td>`;
    return `<tr><td><b>${d.name}</b><br><span class="muted">${d.unit === '%' ? 'porcentaje' : d.unit === 'h' ? 'horas' : 'semanas'}</span></td><td class="formula">${esc(d.formula)}</td>${inputs}<td class="muted">${esc(d.ref)}</td></tr>`;
  }).join('');
  const lvRows = LEVELS.map((l) => `<tr><td class="nw"><b>Nivel ${l.n}</b></td><td class="nw">${l.name}</td><td class="r nw">${l.n === 5 ? '≥ 85' : l.min + ' a < ' + l.max}</td><td class="muted">${l.desc}</td></tr>`).join('');
  return secHead('metodologia', 'Cómo se calculan los indicadores y el índice IDM-7. Las metas, umbrales y pesos son editables; los cambios se guardan en este navegador y se aplican de inmediato a toda la aplicación y al informe PDF.') +
    `<div class="grid">` +
    panel({ title: 'Modelo IDM-7', sub: 'Índice de desempeño de mantenimiento en siete dimensiones', cls: 'c12',
      body: `<p class="formula" style="max-width:92ch;margin-bottom:12px">Cada indicador se transforma en un puntaje de 0 a 100 por interpolación lineal entre su <b>umbral crítico</b> (0 puntos) y su <b>meta</b> (100 puntos). Para el backlog se usa una banda: dentro de ella vale 100; sobre la banda decrece hasta 0 en el umbral crítico y bajo ella decrece hasta 50. El puntaje de cada dimensión es el promedio de sus indicadores, y el IDM-7 es el promedio ponderado de las dimensiones con dato. El semáforo usa tres estados: <b>cumple</b> (100 pts), <b>brecha moderada</b> (50 a 99 pts) y <b>brecha crítica</b> (bajo 50 pts).</p>` +
        `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Dimensión</th><th>Pregunta que responde</th><th>Indicadores</th><th class="r">Peso (%)</th></tr></thead><tbody>${dimRows}<tr><td colspan="3" class="r muted">Suma de pesos</td><td class="r"><b>${num(wsum)}</b></td></tr></tbody></table></div>` }) +
    panel({ title: 'Indicadores, fórmulas y metas', sub: 'Valores por defecto basados en referencias de clase mundial para plantas de proceso', cls: 'c12',
      body: `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Indicador</th><th>Fórmula</th><th class="r">Meta (100 pts)</th><th class="r">Umbral crítico (0 pts)</th><th>Referencia</th></tr></thead><tbody>${kRows}</tbody></table></div>` +
        `<div class="toolbar" style="margin-top:10px"><button class="btn btn-sm" type="button" id="btnReset">Restaurar valores por defecto</button></div>` }) +
    panel({ title: 'Parámetros de cálculo', cls: 'c6',
      body: `<div class="form-row"><label>Ventana de reincidencia (días)<input type="number" min="1" max="365" id="pReinc" value="${S.reincDias}"></label>` +
        `<label>Tarifa HH por defecto (CLP)<input type="number" min="0" step="500" id="pTarifa" value="${S.tarifa}"></label>` +
        `<label class="switch"><input type="checkbox" id="pOut" ${S.excluirAtipicos ? 'checked' : ''}> Excluir valores atípicos extremos del análisis</label></div>` +
        `<p class="panel-foot">La tarifa por defecto solo se usa si el dataset no permite inferirla. Se considera falla toda OT correctiva (falla funcional, EN 13306). El período de cada análisis va desde el primer al último día con registros, o el rango filtrado.</p>` }) +
    panel({ title: 'Escala de madurez', cls: 'c6', body: `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nivel</th><th>Nombre</th><th class="r">IDM-7</th><th>Descripción</th></tr></thead><tbody>${lvRows}</tbody></table></div>` }) +
    panel({ title: 'Supuestos y limitaciones', cls: 'c6', body: `<ul class="refs">
      <li>El parque considerado son los equipos con al menos una OT en el período filtrado; equipos sin registros no entran al denominador de la disponibilidad.</li>
      <li>La disponibilidad usa la detención registrada en cada OT; no descuenta paradas programadas de planta ni tiempo sin demanda.</li>
      <li>El MTBF del parque aproxima el tiempo de operación como tiempo calendario menos detención.</li>
      <li>En Weibull, el tiempo previo a la primera falla observada se desconoce (censura por la izquierda) y no se usa; intervalos menores a 1 h se tratan como reintervenciones.</li>
      <li>Los indicadores mensuales se asignan por fecha de creación de la OT.</li>
      <li>Las metas por defecto son referenciales; ajústalas al contexto de la planta antes de concluir.</li></ul>` }) +
    panel({ title: 'Referencias', cls: 'c6', body: `<ol class="refs">${REFERENCES.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>` }) + `</div>`;
}
export const REFERENCES = [
  'Abernethy, R. B. (2006). The New Weibull Handbook (5.ª ed.). North Palm Beach: R. B. Abernethy.',
  'CEN (2017). EN 13306:2017 Maintenance – Maintenance terminology. Bruselas: Comité Europeo de Normalización.',
  'CEN (2019). EN 15341:2019 Maintenance – Maintenance Key Performance Indicators. Bruselas: Comité Europeo de Normalización.',
  'DAMA International (2017). DAMA-DMBOK: Data Management Body of Knowledge (2.ª ed.). Technics Publications.',
  'ISO (2016). ISO 14224:2016 Petroleum, petrochemical and natural gas industries – Collection and exchange of reliability and maintenance data for equipment. Ginebra: ISO.',
  'ISO (2014). ISO 55000:2014 Asset management – Overview, principles and terminology. Ginebra: ISO.',
  'ISO (2015). ISO 8000-8:2015 Data quality – Information and data quality: Concepts and measuring. Ginebra: ISO.',
  'Knights, P. F. (2001). Rethinking Pareto analysis: maintenance applications of logarithmic scatterplots. Journal of Quality in Maintenance Engineering, 7(4), 252–263.',
  'Moubray, J. (1997). Reliability-Centred Maintenance (2.ª ed.). Oxford: Butterworth-Heinemann.',
  'SAE International (2009). SAE JA1011 Evaluation Criteria for Reliability-Centered Maintenance (RCM) Processes.',
  'SMRP (Society for Maintenance & Reliability Professionals). SMRP Best Practices: Maintenance & Reliability Body of Knowledge, métricas de trabajo, confiabilidad y backlog.',
  'Wireman, T. (2005). Developing Performance Indicators for Managing Maintenance (2.ª ed.). Nueva York: Industrial Press.',
];

// ---------------- eventos ----------------
function bindEvents() {
  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (SECTIONS.some((s) => s.id === id) && id !== state.section) { state.section = id; renderNav(); renderView(); window.scrollTo({ top: 0 }); closeRail(); }
  });
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (openPop && !openPop.pop.contains(t) && !openPop.btn.contains(t)) closePop();
    const popBtn = t.closest('[data-pop]');
    if (popBtn) { if (openPop && openPop.btn === popBtn) closePop(); else showPop(popBtn, popBtn.dataset.pop); return; }
    const dsb = t.closest('[data-ds]'); if (dsb) { activate(dsb.dataset.ds); closeRail(); return; }
    const del = t.closest('[data-del]'); if (del) { removeDataset(del.dataset.del); return; }
    const chip = t.closest('[data-chip]');
    if (chip) {
      if (chip.dataset.chip === '__out') { state.settings.excluirAtipicos = false; saveSettings(); }
      else state.filters.sets[chip.dataset.chip]?.delete(chip.dataset.v);
      refresh(); return;
    }
    if (t.closest('#fClear') || t.closest('#emptyClear')) { state.filters = emptyFilters(); refresh(); return; }
    if (t.closest('#btnUpload') || t.closest('#tbUpload') || t.closest('#emptyUpload')) { $('#fileInput').click(); return; }
    if (t.closest('#tbPdf')) { openPdfDialog(); return; }
    if (t.closest('#btnMenu')) { openRail(); return; }
    if (t.closest('#scrim')) { closeRail(); return; }
    const how = t.closest('.how-btn');
    if (how) { const n = document.getElementById(how.getAttribute('aria-controls')); const open = how.getAttribute('aria-expanded') !== 'true'; how.setAttribute('aria-expanded', open); n.hidden = !open; return; }
    const pm = t.closest('[data-pm],[data-pm2]');
    if (pm) { state.paretoMetric = pm.dataset.pm || pm.dataset.pm2; renderView(); return; }
    const wr = t.closest('#tblWeibull tr[data-w]');
    if (wr) { state.weibullSel = wr.dataset.w; renderView(); return; }
    const br = t.closest('#tblBad tr[data-eq]');
    if (br) { toggleFilter('equipo', br.dataset.eq); return; }
    const pg = t.closest('[data-pg]');
    if (pg) { state.table.page += +pg.dataset.pg; renderView(); return; }
    if (t.closest('#tblCsv')) { downloadCSV(); return; }
    if (t.closest('#cmpLoadAll')) { loadAllForCompare(); return; }
    if (t.closest('#btnReset')) { state.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); saveSettings(); state.cmpCache.clear(); refresh(); toast('Metas y pesos restaurados.'); return; }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePop(); closeRail(); } });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'fileInput') { handleFile(t.files[0]); t.value = ''; return; }
    if (t.id === 'fPreset') { applyPreset(t.value); return; }
    if (t.id === 'fFrom' || t.id === 'fTo') {
      const v = U.parseIsoDay(t.value);
      if (t.id === 'fFrom') state.filters.from = v; else state.filters.to = v;
      refresh(); return;
    }
    if (t.id === 'tblFlags') { state.table.onlyFlags = t.checked; state.table.page = 0; renderView(); return; }
    if (t.matches('[data-w]') || t.matches('[data-t]') || ['pReinc', 'pTarifa', 'pOut'].includes(t.id)) { updateSetting(t); return; }
  });
  document.addEventListener('input', U.debounce((e) => {
    if (e.target.id === 'tblQ') { state.table.q = e.target.value; state.table.page = 0; const pos = e.target.selectionStart; renderView(); const n = $('#tblQ'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
  }, 250));
  // Arrastrar y soltar
  let dragN = 0;
  window.addEventListener('dragenter', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { dragN++; $('#dropOverlay').hidden = false; } });
  window.addEventListener('dragleave', () => { dragN = Math.max(0, dragN - 1); if (!dragN) $('#dropOverlay').hidden = true; });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => { e.preventDefault(); dragN = 0; $('#dropOverlay').hidden = true; const f = e.dataTransfer?.files?.[0]; if (f) handleFile(f); });
  // Tema
  $('#btnTheme').addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('webappmant.theme', next); } catch (e) { /* sin persistencia */ }
    updateThemeLabel(); renderView();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!document.documentElement.dataset.theme) { updateThemeLabel(); renderView(); } });
  ro.observe($('#view'));
}
function updateThemeLabel() { $('#themeLabel').textContent = isDark() ? 'Tema claro' : 'Tema oscuro'; }
function openRail() { $('#rail').classList.add('open'); $('#scrim').hidden = false; }
function closeRail() { $('#rail').classList.remove('open'); $('#scrim').hidden = true; }
function applyPreset(v) {
  const ds = active(); if (!ds) return;
  const { dMin, dMax } = period(ds);
  const last = dMax - U.DAY;
  if (v === 'all') { state.filters.from = null; state.filters.to = null; }
  else if (v === '12m') { const d = new Date(last); state.filters.from = Math.max(dMin, Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), d.getUTCDate() + 1)); state.filters.to = null; }
  else if (v === '3m') { const d = new Date(last); state.filters.from = Math.max(dMin, Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 3, d.getUTCDate() + 1)); state.filters.to = null; }
  else if (v.startsWith('y')) { const y = +v.slice(1); state.filters.from = Math.max(dMin, Date.UTC(y, 0, 1)); state.filters.to = Math.min(last, Date.UTC(y, 11, 31)); }
  refresh();
}
const updateSetting = U.debounce((t) => {
  const S = state.settings;
  if (t.matches('[data-w]')) S.weights[t.dataset.w] = Math.max(0, +t.value || 0);
  else if (t.matches('[data-t]')) { const [id, f] = t.dataset.t.split('.'); if (t.value !== '' && isFinite(+t.value)) S.targets[id][f] = +t.value; }
  else if (t.id === 'pReinc') S.reincDias = Math.max(1, Math.round(+t.value || 30));
  else if (t.id === 'pTarifa') S.tarifa = Math.max(0, +t.value || 0);
  else if (t.id === 'pOut') S.excluirAtipicos = t.checked;
  const bad = Object.entries(S.targets).find(([id, x]) => KPI_DEFS[id].dir !== 'band' && x.meta === x.crit);
  if (bad) { toast('La meta y el umbral crítico de «' + KPI_DEFS[bad[0]].name + '» no pueden ser iguales.', true); return; }
  saveSettings(); state.cmpCache.clear();
  compute(); renderTitleblock(); renderChips();
  if (state.section === 'metodologia') { const y = window.scrollY; renderView(); window.scrollTo({ top: y }); } else renderView();
  toast('Parámetros actualizados.');
}, 350);
function downloadCSV() {
  const ds = active();
  const blob = new Blob([recordsToCSV(state.table.rows || state.recs)], { type: 'text/csv;charset=utf-8' });
  saveBlob(blob, (ds ? ds.name : 'dataset').replace(/[^\w\-áéíóúñ ]+/gi, '').replace(/\s+/g, '_') + '_depurado.csv');
}
const saveBlob = U.saveBlob;
async function loadAllForCompare() {
  busy(true, 'Procesando datasets…');
  await nextFrame();
  for (const d of state.datasets) if (d.status === 'idle') { $('#busyText').textContent = 'Procesando ' + d.name + '…'; await nextFrame(); await ensureLoaded(d); }
  busy(false); renderDsList(); renderView();
}

// ---------------- PDF ----------------
function openPdfDialog() {
  if (!state.K) return;
  const dlg = $('#dlgPdf');
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LS_PDF) || '{}'); } catch (e) { saved = {}; }
  const ds = active();
  $('#pdfTitle').value = saved.title || 'Informe de desempeño de mantenimiento';
  $('#pdfAuthor').value = saved.author || '';
  $('#pdfProgram').value = saved.program || '';
  $('#pdfInst').value = saved.inst || '';
  $('#pdfOrg').value = saved.org || (ds.meta.sociedad ? 'Sociedad ' + ds.meta.sociedad : '');
  const nReady = state.datasets.filter((d) => d.status === 'ready').length;
  $('#pdfCompare').disabled = state.datasets.length < 2;
  $('#pdfCompare').parentElement.title = nReady < 2 ? 'Se procesarán los datasets incluidos para compararlos' : '';
  dlg.returnValue = '';
  dlg.onclose = async () => {
    if (dlg.returnValue !== 'ok') return;
    const meta = { title: $('#pdfTitle').value.trim() || 'Informe de desempeño de mantenimiento', author: $('#pdfAuthor').value.trim(), program: $('#pdfProgram').value.trim(), inst: $('#pdfInst').value.trim(), org: $('#pdfOrg').value.trim() };
    try { localStorage.setItem(LS_PDF, JSON.stringify(meta)); } catch (e) { /* sin persistencia */ }
    const opts = { compare: $('#pdfCompare').checked && !$('#pdfCompare').disabled, annex: $('#pdfAnnex').checked, tables: $('#pdfTables').checked };
    busy(true, 'Generando informe PDF…');
    await nextFrame();
    try {
      if (opts.compare) for (const d of state.datasets) if (d.status === 'idle') { $('#busyText').textContent = 'Procesando ' + d.name + ' para la comparación…'; await nextFrame(); await ensureLoaded(d); }
      const list = opts.compare ? await compareList() : [];
      $('#busyText').textContent = 'Dibujando gráficos y tablas…';
      await nextFrame();
      const { generateReport } = await import('./report.js?v=1.0.8');
      const name = await generateReport({ K: state.K, N: state.N, ds, meta, opts, compare: list, filters: filtersText(), recsN: state.recs.length, references: REFERENCES });
      busy(false);
      toast('Informe descargado: ' + name);
      renderDsList();
    } catch (e) {
      console.error(e); busy(false); toast('No se pudo generar el PDF: ' + (e.message || e), true);
    }
  };
  dlg.showModal();
}

// ---------------- inicio ----------------
async function init() {
  updateThemeLabel();
  const id = location.hash.slice(1);
  if (SECTIONS.some((s) => s.id === id)) state.section = id;
  bindEvents();
  renderNav(); renderTitleblock();
  if (!window.echarts || !window.Papa) { renderView(); return; }
  $('#view').innerHTML = '<div class="empty"><span class="spinner"></span><h2>Preparando la aplicación</h2></div>';
  // Modo limpio (?limpio): sin datasets de ejemplo ni dataset activo al abrir.
  if (CLEAN) { const lm = $('#lnkMode'); lm.href = './'; lm.textContent = 'Ver con los datasets de ejemplo'; }
  if (!CLEAN) await loadManifest();
  await restoreUploads();
  renderDsList();
  const first = state.datasets[0];
  if (first && !CLEAN) await activate(first.id); else { renderTitleblock(); renderView(); }
}
// Plantilla generada en el cliente como respaldo del archivo estático.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href$="plantilla_dataset_CMMS.csv"]');
  if (!a) return;
  e.preventDefault();
  saveBlob(new Blob([templateCSV()], { type: 'text/csv;charset=utf-8' }), 'plantilla_dataset_CMMS.csv');
});
init();
