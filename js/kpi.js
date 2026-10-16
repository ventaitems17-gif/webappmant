// Motor de indicadores de mantenimiento y modelo de evaluación IDM-7.
// Referencias: EN 13306:2017 (terminología), EN 15341:2019 (KPI de mantenimiento),
// SMRP Best Practices (métricas), ISO 14224:2016 (datos de confiabilidad),
// Knights (2001) diagramas de dispersión logarítmica, Abernethy (2006) Weibull.
import { HOUR, DAY, sum, mean, median, groupBy, monthRange, monthKey, monthStart, monthEnd, linreg, gamma, num, pct, clp, hours, monthLabel } from './util.js?v=1.0.8';

export const TIPOS = ['Preventivo', 'Correctivo', 'Predictivo'];

export const DEFAULT_SETTINGS = {
  tarifa: 22000,
  reincDias: 30,
  excluirAtipicos: false,
  weights: { disp: 15, conf: 20, mant: 15, estr: 15, plan: 15, cost: 10, datos: 10 },
  targets: {
    disp: { meta: 99.5, crit: 98 },
    mtbf: { meta: 2000, crit: 500 },
    reinc: { meta: 10, crit: 40 },
    mttr: { meta: 8, crit: 24 },
    mwt: { meta: 12, crit: 48 },
    proact: { meta: 80, crit: 50 },
    pred: { meta: 25, crit: 5 },
    plan: { meta: 90, crit: 60 },
    onTime: { meta: 90, crit: 60 },
    backlog: { lo: 2, hi: 4, crit: 8 },
    costCorr: { meta: 30, crit: 70 },
    dqi: { meta: 98, crit: 85 },
  },
};

export const DIMENSIONS = [
  { id: 'disp', name: 'Disponibilidad', kpis: ['disp'], q: '¿Están los equipos disponibles cuando la operación los necesita?' },
  { id: 'conf', name: 'Confiabilidad', kpis: ['mtbf', 'reinc'], q: '¿Con qué frecuencia fallan y cuántas fallas se repiten?' },
  { id: 'mant', name: 'Mantenibilidad', kpis: ['mttr', 'mwt'], q: '¿Qué tan rápido se responde y se repara?' },
  { id: 'estr', name: 'Estrategia proactiva', kpis: ['proact', 'pred'], q: '¿Se anticipan las fallas o se reacciona a ellas?' },
  { id: 'plan', name: 'Planificación y control', kpis: ['plan', 'onTime', 'backlog'], q: '¿Se planifica, se cumple y se controla la carga de trabajo?' },
  { id: 'cost', name: 'Eficiencia de costos', kpis: ['costCorr'], q: '¿Cuánto del gasto se va en reparar fallas?' },
  { id: 'datos', name: 'Calidad de datos', kpis: ['dqi'], q: '¿Son confiables los datos sobre los que se decide?' },
];

export const KPI_DEFS = {
  disp: { name: 'Disponibilidad operacional', short: 'Disponibilidad', unit: '%', dir: 'higher', dec: 2,
    formula: 'A = 1 − Σ detención / (N.º equipos × horas del período)', ref: 'EN 13306:2017; EN 15341:2019',
    read: 'Fracción del tiempo calendario en que el parque estuvo disponible. Cada décima bajo la meta equivale a horas de producción en riesgo.' },
  mtbf: { name: 'Tiempo medio entre fallas', short: 'MTBF', unit: 'h', dir: 'higher', dec: 0,
    formula: 'MTBF = (N.º equipos × horas del período − Σ detención) / N.º de fallas', ref: 'EN 13306:2017; ISO 14224:2016',
    read: 'Horas de operación, en promedio, entre dos fallas de un mismo equipo. Más alto es mejor.' },
  reinc: { name: 'Reincidencia de fallas', short: 'Reincidencia', unit: '%', dir: 'lower', dec: 1,
    formula: 'Fallas ocurridas a ≤ D días de la falla anterior del mismo equipo / total de fallas', ref: 'SMRP (fallas repetitivas); RCM',
    read: 'Indica fallas que vuelven pronto tras una intervención: reparación incompleta o causa raíz no resuelta.' },
  mttr: { name: 'Tiempo medio de reparación', short: 'MTTR', unit: 'h', dir: 'lower', dec: 1,
    formula: 'MTTR = Σ tiempo de reparación de correctivas / N.º de fallas', ref: 'EN 13306:2017; EN 15341:2019',
    read: 'Duración media de la reparación activa. Refleja procedimientos, competencias y acceso a repuestos.' },
  mwt: { name: 'Tiempo medio de espera', short: 'MWT', unit: 'h', dir: 'lower', dec: 1,
    formula: 'MWT = Σ (inicio − creación) de correctivas / N.º de fallas', ref: 'EN 13306:2017 (retardo logístico y administrativo)',
    read: 'Tiempo desde el aviso hasta que comienza la intervención: logística, permisos y disponibilidad de cuadrillas.' },
  proact: { name: 'Trabajo proactivo', short: 'Proactivo', unit: '%', dir: 'higher', dec: 1,
    formula: '(OT preventivas + predictivas) / OT totales', ref: 'SMRP Best Practices (trabajo proactivo / reactivo)',
    read: 'Proporción del trabajo que anticipa la falla. Las organizaciones de clase mundial superan el 80%.' },
  pred: { name: 'Mantenimiento predictivo', short: 'Predictivo', unit: '%', dir: 'higher', dec: 1,
    formula: 'OT predictivas (basadas en condición) / OT totales', ref: 'EN 13306:2017 (mantenimiento basado en la condición)',
    read: 'Peso de las tareas basadas en condición, eficaces cuando los modos de falla son aleatorios.' },
  plan: { name: 'Trabajo planificado', short: 'Planificado', unit: '%', dir: 'higher', dec: 1,
    formula: 'OT planificadas / OT con dato de planificación', ref: 'SMRP Best Practices (trabajo planificado)',
    read: 'Trabajo preparado antes de ejecutarse (alcance, repuestos, permisos). Meta típica: 85–90% o más.' },
  onTime: { name: 'Cumplimiento de fecha requerida', short: 'Cumplimiento', unit: '%', dir: 'higher', dec: 1,
    formula: 'OT cerradas con fin ≤ fecha de necesidad / OT cerradas con ambas fechas', ref: 'SMRP Best Practices (cumplimiento)',
    read: 'Mide la confiabilidad del área de mantenimiento como proveedor interno: terminar cuando se necesita.' },
  backlog: { name: 'Backlog de trabajo', short: 'Backlog', unit: 'sem', dir: 'band', dec: 1,
    formula: 'HH de OT pendientes / capacidad semanal ejecutada (HH/semana)', ref: 'SMRP Best Practices; Wireman (2005)',
    read: 'Semanas de trabajo acumulado. Entre 2 y 4 semanas es una carga sana; más indica falta de capacidad.' },
  costCorr: { name: 'Costo correctivo sobre el total', short: 'Costo correctivo', unit: '%', dir: 'lower', dec: 1,
    formula: 'Costo de OT correctivas / costo total de mantenimiento', ref: 'EN 15341:2019 (indicadores económicos)',
    read: 'Peso del gasto destinado a reparar fallas. Un valor alto indica una estrategia reactiva y costosa.' },
  dqi: { name: 'Índice de calidad de datos', short: 'Calidad de datos', unit: '%', dir: 'higher', dec: 1,
    formula: 'Promedio ponderado de completitud, validez, consistencia, unicidad y plausibilidad', ref: 'ISO 8000-8; DAMA-DMBOK; ISO 14224:2016',
    read: 'Confianza en los datos de origen. Un índice bajo obliga a interpretar los indicadores con cautela.' },
};
export const KPI_ORDER = ['disp', 'mtbf', 'reinc', 'mttr', 'mwt', 'proact', 'pred', 'plan', 'onTime', 'backlog', 'costCorr', 'dqi'];

export const LEVELS = [
  { n: 1, min: 0, max: 40, name: 'Reactivo', desc: 'La organización responde a las fallas; el trabajo no planificado domina y los datos sostienen poco las decisiones.' },
  { n: 2, min: 40, max: 55, name: 'En desarrollo', desc: 'Existen planes preventivos, pero la ejecución reactiva y las brechas de control limitan los resultados.' },
  { n: 3, min: 55, max: 70, name: 'Sistemático', desc: 'El plan preventivo está establecido y controlado; la confiabilidad empieza a gestionarse con indicadores.' },
  { n: 4, min: 70, max: 85, name: 'Proactivo', desc: 'Predominan las estrategias basadas en condición y el análisis de fallas; los costos están bajo control.' },
  { n: 5, min: 85, max: 101, name: 'Excelencia', desc: 'Desempeño de clase mundial sostenido, con mejora continua basada en datos de alta calidad.' },
];
export function levelOf(score) {
  if (score == null) return null;
  return LEVELS.find((l) => score >= l.min && score < l.max) || LEVELS[LEVELS.length - 1];
}

export const STATUS = {
  ok: { label: 'Cumple', icon: '●' },
  warn: { label: 'Brecha moderada', icon: '▲' },
  crit: { label: 'Brecha crítica', icon: '■' },
  na: { label: 'Sin dato', icon: '○' },
  info: { label: 'Contexto', icon: '◆' },
};

export function scoreKpi(id, v, targets) {
  if (v == null || !isFinite(v)) return null;
  const d = KPI_DEFS[id], t = targets[id];
  if (d.dir === 'higher') {
    if (v >= t.meta) return 100;
    if (v <= t.crit) return 0;
    return ((v - t.crit) / (t.meta - t.crit)) * 100;
  }
  if (d.dir === 'lower') {
    if (v <= t.meta) return 100;
    if (v >= t.crit) return 0;
    return ((t.crit - v) / (t.crit - t.meta)) * 100;
  }
  // banda (backlog)
  if (v >= t.lo && v <= t.hi) return 100;
  if (v > t.hi) return v >= t.crit ? 0 : ((t.crit - v) / (t.crit - t.hi)) * 100;
  return 50 + 50 * (v / t.lo);
}
export function statusOf(score) {
  if (score == null) return 'na';
  if (score >= 99.95) return 'ok';
  return score >= 50 ? 'warn' : 'crit';
}
export function targetText(id, targets) {
  const d = KPI_DEFS[id], t = targets[id];
  const u = d.unit === '%' ? '%' : ' ' + d.unit;
  if (d.dir === 'band') return `${num(t.lo, 0)}–${num(t.hi, 0)}${u}`;
  return (d.dir === 'higher' ? '≥ ' : '≤ ') + num(t.meta, d.unit === 'h' ? 0 : 1) + u;
}
export function critText(id, targets) {
  const d = KPI_DEFS[id], t = targets[id];
  const u = d.unit === '%' ? '%' : ' ' + d.unit;
  if (d.dir === 'band') return '≥ ' + num(t.crit, 0) + u;
  return (d.dir === 'higher' ? '≤ ' : '≥ ') + num(t.crit, d.unit === 'h' ? 0 : 1) + u;
}
export function fmtKpi(id, v) {
  const d = KPI_DEFS[id];
  if (v == null || !isFinite(v)) return '—';
  if (d.unit === '%') return num(v, d.dec) + '%';
  if (d.unit === 'h') return num(v, d.dec) + ' h';
  if (d.unit === 'sem') return num(v, d.dec) + ' sem';
  return num(v, d.dec);
}

// ------------------------------------------------------------------
// Análisis principal. `recs` ya viene filtrado; [from, to) es el período.
// ------------------------------------------------------------------
export function analyze(recs, { from, to, settings, quality }) {
  const S = settings;
  const H = Math.max(1, (to - from) / HOUR);
  const weeks = H / 168;
  const equipos = new Set(recs.map((r) => r.equipo).filter(Boolean));
  const NEq = equipos.size || 1;
  const corr = recs.filter((r) => r.tipo === 'Correctivo');
  const byTipo = Object.fromEntries(TIPOS.map((t) => [t, recs.filter((r) => r.tipo === t)]));
  const nOT = recs.length, nF = corr.length;
  const dtTotal = sum(recs, (r) => r.dt);
  const dtCorr = sum(corr, (r) => r.dt);
  const has = (k) => recs.some((r) => r[k] != null);

  const A = has('dt') ? 1 - dtTotal / (NEq * H) : null;
  const MTBF = nF ? (NEq * H - dtTotal) / nF : null;
  const MTTR = mean(corr, (r) => r.rep ?? r.dur);
  const MDT = has('dt') ? mean(corr, (r) => r.dt) : null;
  const MWT = mean(corr, (r) => r.esp);
  const Ai = MTBF != null && MTTR != null ? MTBF / (MTBF + MTTR) : null;
  const lambdaEqYear = nF / (NEq * H / 8760);

  // Reincidencia: fallas a ≤ D días de la anterior del mismo equipo.
  const D = S.reincDias * DAY;
  let reincN = 0;
  const corrByEq = groupBy(corr, (r) => r.equipo);
  const reincByTipoEq = new Map();
  for (const [, g] of corrByEq) {
    const s = g.map((r) => r.fi ?? r.t).filter((v) => v != null).sort((a, b) => a - b);
    let rep = 0;
    for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] <= D) rep++;
    reincN += rep;
    const te = g[0].tipoEq || 'Sin tipo';
    const o = reincByTipoEq.get(te) || { n: 0, rep: 0 };
    o.n += g.length; o.rep += rep;
    reincByTipoEq.set(te, o);
  }
  const reinc = nF ? reincN / nF : null;

  const nPrev = byTipo.Preventivo.length, nPred = byTipo.Predictivo.length;
  const proact = nOT ? (nPrev + nPred) / nOT : null;
  const pred = nOT ? nPred / nOT : null;
  const planKnown = recs.filter((r) => r.plan != null);
  const plan = planKnown.length ? planKnown.filter((r) => r.plan).length / planKnown.length : null;
  const closed = recs.filter((r) => r.estado === 'Cerrada');
  const otPool = closed.filter((r) => r.ff != null && r.fn != null);
  const onTime = otPool.length ? otPool.filter((r) => r.ff <= r.fn).length / otPool.length : null;
  const pend = recs.filter((r) => r.estado !== 'Cerrada');
  const bHH = sum(pend, (r) => r.hh);
  const capWeek = sum(closed, (r) => r.hh) / weeks;
  const backlogW = has('hh') && capWeek > 0 ? bHH / capWeek : null;

  const costTotal = sum(recs, (r) => r.ctot);
  const costBy = Object.fromEntries(TIPOS.map((t) => [t, sum(byTipo[t], (r) => r.ctot)]));
  const costCorr = costTotal > 0 ? costBy.Correctivo / costTotal : null;
  const comp = { rep: sum(recs, (r) => r.crep), ext: sum(recs, (r) => r.cext), mo: sum(recs, (r) => r.cmo) };
  const costPerOT = Object.fromEntries(TIPOS.map((t) => [t, byTipo[t].length ? costBy[t] / byTipo[t].length : null]));
  const hhTotal = sum(recs, (r) => r.hh);
  const hhBy = Object.fromEntries(TIPOS.map((t) => [t, sum(byTipo[t], (r) => r.hh)]));

  const kpi = {
    disp: A != null ? A * 100 : null, mtbf: MTBF, reinc: reinc != null ? reinc * 100 : null,
    mttr: MTTR, mwt: MWT, proact: proact != null ? proact * 100 : null, pred: pred != null ? pred * 100 : null,
    plan: plan != null ? plan * 100 : null, onTime: onTime != null ? onTime * 100 : null, backlog: backlogW,
    costCorr: costCorr != null ? costCorr * 100 : null, dqi: quality ? quality.dqi * 100 : null,
  };
  const scores = {}, status = {};
  for (const id of KPI_ORDER) { scores[id] = scoreKpi(id, kpi[id], S.targets); status[id] = statusOf(scores[id]); }
  const dims = DIMENSIONS.map((d) => {
    const ss = d.kpis.map((k) => scores[k]).filter((v) => v != null);
    const score = ss.length ? ss.reduce((a, b) => a + b, 0) / ss.length : null;
    return { ...d, score, weight: S.weights[d.id] || 0, status: statusOf(score) };
  });
  const wsum = dims.filter((d) => d.score != null).reduce((s, d) => s + d.weight, 0);
  const idm = wsum ? dims.filter((d) => d.score != null).reduce((s, d) => s + d.weight * d.score, 0) / wsum : null;

  // ---------- series mensuales ----------
  const months = monthRange(from, to);
  const recByM = groupBy(recs, (r) => (r.t != null ? monthKey(r.t) : null));
  const monthly = months.map((m) => {
    const g = recByM.get(m) || [];
    const ms = Math.max(from, monthStart(m)), me = Math.min(to, monthEnd(m));
    const Hm = Math.max(1, (me - ms) / HOUR);
    const c = g.filter((r) => r.tipo === 'Correctivo');
    const dt = sum(g, (r) => r.dt);
    const n = Object.fromEntries(TIPOS.map((t) => [t, g.filter((r) => r.tipo === t).length]));
    const cost = Object.fromEntries(TIPOS.map((t) => [t, sum(g.filter((r) => r.tipo === t), (r) => r.ctot)]));
    const pk = g.filter((r) => r.plan != null);
    const cl = g.filter((r) => r.estado === 'Cerrada' && r.ff != null && r.fn != null);
    return {
      m, label: monthLabel(m), total: g.length, n, cost, nF: c.length, dt,
      comp: { rep: sum(g, (r) => r.crep), ext: sum(g, (r) => r.cext), mo: sum(g, (r) => r.cmo) },
      A: g.length ? 1 - dt / (NEq * Hm) : null,
      mtbf: c.length ? (NEq * Hm - dt) / c.length : null,
      mttr: mean(c, (r) => r.rep ?? r.dur),
      proact: g.length ? (n.Preventivo + n.Predictivo) / g.length : null,
      corrPct: g.length ? n.Correctivo / g.length : null,
      plan: pk.length ? pk.filter((r) => r.plan).length / pk.length : null,
      onTime: cl.length ? cl.filter((r) => r.ff <= r.fn).length / cl.length : null,
    };
  });

  // ---------- agrupaciones ----------
  const groupStats = (key) => {
    const out = [];
    for (const [k, g] of groupBy(recs, (r) => r[key] ?? 'Sin dato')) {
      const c = g.filter((r) => r.tipo === 'Correctivo');
      const eq = new Set(g.map((r) => r.equipo)).size || 1;
      const dt = sum(g, (r) => r.dt);
      out.push({
        key: k, n: g.length, nF: c.length, dt, dtF: sum(c, (r) => r.dt), cost: sum(g, (r) => r.ctot), hh: sum(g, (r) => r.hh), eq,
        byTipo: Object.fromEntries(TIPOS.map((t) => [t, g.filter((r) => r.tipo === t).length])),
        costByTipo: Object.fromEntries(TIPOS.map((t) => [t, sum(g.filter((r) => r.tipo === t), (r) => r.ctot)])),
        hhByTipo: Object.fromEntries(TIPOS.map((t) => [t, sum(g.filter((r) => r.tipo === t), (r) => r.hh)])),
        A: 1 - dt / (eq * H), mtbf: c.length ? (eq * H - dt) / c.length : null, mttr: mean(c, (r) => r.rep ?? r.dur),
        proact: g.length ? g.filter((r) => r.tipo !== 'Correctivo' && r.tipo !== 'Otro').length / g.length : null,
      });
    }
    return out.sort((a, b) => b.n - a.n);
  };
  const by = {
    unidad: groupStats('unidad'), area: groupStats('area'), tipoEq: groupStats('tipoEq'), crit: groupStats('crit'),
    puesto: groupStats('puesto'), turno: groupStats('turno'), prio: groupStats('prio'),
  };
  by.crit.sort((a, b) => String(a.key).localeCompare(String(b.key)));

  // ---------- Pareto de fallas ----------
  const pareto = (key) => {
    const g = groupBy(corr, (r) => r[key] || 'Sin registrar');
    const rows = [...g.entries()].map(([k, a]) => ({ key: k, n: a.length, dt: sum(a, (r) => r.dt), cost: sum(a, (r) => r.ctot) }));
    rows.sort((a, b) => b.n - a.n);
    let acc = 0;
    for (const r of rows) { acc += r.n; r.cum = nF ? acc / nF : 0; }
    return rows;
  };
  const paretoModo = pareto('modo'), paretoCausa = pareto('causa'), paretoSintoma = pareto('sintoma');

  // ---------- equipos: malos actores y Jack-knife ----------
  const eqStats = [];
  for (const [e, g] of groupBy(recs, (r) => r.equipo)) {
    const c = g.filter((r) => r.tipo === 'Correctivo');
    const dt = sum(g, (r) => r.dt), dtF = sum(c, (r) => r.dt);
    eqStats.push({
      equipo: e, tipoEq: g[0].tipoEq, unidad: g[0].unidad, area: g[0].area, crit: g[0].crit, n: g.length, nF: c.length, dt, dtF,
      cost: sum(g, (r) => r.ctot), costF: sum(c, (r) => r.ctot), mdt: c.length ? dtF / c.length : null,
      mttr: mean(c, (r) => r.rep ?? r.dur), mtbf: c.length ? (H - dt) / c.length : null,
    });
  }
  const withF = eqStats.filter((e) => e.nF > 0);
  const jkX = withF.length ? sum(withF, (e) => e.nF) / withF.length : null;
  const jkY = nF ? dtCorr / nF : null;
  for (const e of eqStats) {
    if (!e.nF || jkX == null) { e.quad = 'Sin fallas'; continue; }
    const hiN = e.nF > jkX, hiD = (e.mdt || 0) > jkY;
    e.quad = hiN && hiD ? 'Agudo y crónico' : hiN ? 'Crónico' : hiD ? 'Agudo' : 'Controlado';
  }
  const quadCount = Object.fromEntries(['Agudo y crónico', 'Crónico', 'Agudo', 'Controlado'].map((q) => [q, eqStats.filter((e) => e.quad === q).length]));
  const quadDt = Object.fromEntries(['Agudo y crónico', 'Crónico', 'Agudo', 'Controlado'].map((q) => [q, sum(eqStats.filter((e) => e.quad === q), (e) => e.dtF)]));
  const badActors = [...withF].sort((a, b) => b.dtF - a.dtF || b.nF - a.nF);
  let acc = 0, n80 = 0;
  for (const e of badActors) { if (dtCorr > 0 && acc / dtCorr >= 0.8) break; acc += e.dtF; n80++; }
  const badByCost = [...eqStats].sort((a, b) => b.cost - a.cost);

  // ---------- Weibull por tipo de equipo ----------
  const eqByTipo = groupBy(eqStats, (e) => e.tipoEq || 'Sin tipo');
  const weibull = [];
  for (const [te, list] of eqByTipo) weibull.push(weibullFit(te, list.map((e) => e.equipo), corrByEq, from, to));
  weibull.sort((a, b) => b.nF - a.nF);
  const weibullFleet = weibullFit('Parque completo', [...equipos], corrByEq, from, to);

  // ---------- matrices ----------
  const units = by.unidad.map((u) => u.key).sort();
  const heatUM = { x: months.map(monthLabel), y: units, data: [] };
  const corrByUM = groupBy(corr, (r) => (r.unidad || 'Sin dato') + '|' + (r.t != null ? monthKey(r.t) : ''));
  units.forEach((u, yi) => months.forEach((m, xi) => heatUM.data.push([xi, yi, (corrByUM.get(u + '|' + m) || []).length])));
  const topModos = paretoModo.filter((p) => p.key !== 'Sin registrar').slice(0, 12).map((p) => p.key);
  const tiposEq = by.tipoEq.map((t) => t.key);
  const heatMT = { x: tiposEq, y: topModos, data: [] };
  const corrByMT = groupBy(corr, (r) => (r.modo || 'Sin registrar') + '|' + (r.tipoEq || 'Sin dato'));
  topModos.forEach((mo, yi) => tiposEq.forEach((t, xi) => heatMT.data.push([xi, yi, (corrByMT.get(mo + '|' + t) || []).length])));

  // ---------- backlog ----------
  const ref = to;
  const buckets = [{ k: '≤ 7 días', max: 7 }, { k: '8–30 días', max: 30 }, { k: '31–90 días', max: 90 }, { k: '> 90 días', max: Infinity }];
  const aging = buckets.map((b) => ({ key: b.k, n: 0, hh: 0, byEstado: { Abierta: 0, 'En ejecución': 0 } }));
  for (const r of pend) {
    const age = r.t != null ? (ref - r.t) / DAY : 0;
    const i = buckets.findIndex((b) => age <= b.max);
    aging[i].n++; aging[i].hh += r.hh || 0;
    if (aging[i].byEstado[r.estado] != null) aging[i].byEstado[r.estado]++;
  }
  const backlogPuesto = [...groupBy(pend, (r) => r.puesto || 'Sin dato')].map(([k, g]) => ({ key: k, n: g.length, hh: sum(g, (r) => r.hh) })).sort((a, b) => b.hh - a.hh);

  // Distribución del tiempo de espera de correctivas (h).
  const espBins = [0, 4, 8, 12, 24, 48, 72, Infinity];
  const espHist = espBins.slice(0, -1).map((lo, i) => ({ key: espBins[i + 1] === Infinity ? '> ' + lo + ' h' : lo + '–' + espBins[i + 1] + ' h', n: 0 }));
  for (const r of corr) if (r.esp != null) { const i = espBins.findIndex((b, j) => r.esp >= b && r.esp < espBins[j + 1]); if (i >= 0) espHist[i].n++; }

  // ---------- tendencia (primera vs segunda mitad del período) ----------
  const half = Math.floor(monthly.length / 2);
  const h1 = monthly.slice(0, half), h2 = monthly.slice(half);
  const agg = (arr) => { const t = sum(arr, (x) => x.total), c = sum(arr, (x) => x.nF); return { corrPct: t ? c / t : null, n: t }; };
  const trend = monthly.length >= 4 ? { h1: agg(h1), h2: agg(h2), h1Label: h1[0].label + ' a ' + h1[h1.length - 1].label, h2Label: h2[0].label + ' a ' + h2[h2.length - 1].label } : null;

  return {
    from, to, H, NEq, nOT, nF, nPrev, nPred, nPend: pend.length, nOpen: pend.filter((r) => r.estado === 'Abierta').length,
    nExec: pend.filter((r) => r.estado === 'En ejecución').length, nClosed: closed.length,
    dtTotal, dtCorr, dtPrev: sum(byTipo.Preventivo, (r) => r.dt), A, Ai, MTBF, MTTR, MDT, MWT, lambdaEqYear, reinc, reincN,
    proact, pred, plan, onTime, onTimeN: otPool.length, bHH, capWeek, backlogW,
    costTotal, costBy, comp, costPerOT, costCorr, hhTotal, hhBy,
    kpi, scores, status, dims, idm, level: levelOf(idm),
    monthly, by, paretoModo, paretoCausa, paretoSintoma, eqStats, badActors, badByCost, n80, quadCount, quadDt, jk: { x: jkX, y: jkY },
    weibull, weibullFleet, heatUM, heatMT, aging, backlogPuesto, espHist, trend,
    reincByTipoEq: [...reincByTipoEq].map(([k, o]) => ({ key: k, n: o.n, rep: o.rep, pct: o.n ? o.rep / o.n : 0 })).sort((a, b) => b.pct - a.pct),
    settings: S, quality,
  };
}

// Ajuste Weibull de 2 parámetros por regresión de rangos medianos (X sobre Y),
// con rangos ajustados de Johnson para incluir suspensiones (censura por la derecha).
export function weibullFit(name, eqList, corrByEq, from, to) {
  const items = []; // [t, isFailure]
  let excluded = 0;
  for (const e of eqList) {
    const g = corrByEq.get(e) || [];
    const ts = g.map((r) => r.fi ?? r.t).filter((v) => v != null && v >= from && v < to).sort((a, b) => a - b);
    if (!ts.length) { items.push([(to - from) / HOUR, false]); continue; }
    for (let i = 1; i < ts.length; i++) {
      const d = (ts[i] - ts[i - 1]) / HOUR;
      if (d >= 1) items.push([d, true]); else excluded++;
    }
    const s = (to - ts[ts.length - 1]) / HOUR;
    if (s > 0) items.push([s, false]);
  }
  items.sort((a, b) => a[0] - b[0]);
  const N = items.length;
  let prev = 0;
  const pts = [];
  items.forEach(([t, fail], j) => {
    if (!fail) return;
    const reverse = N - j;
    prev += (N + 1 - prev) / (1 + reverse);
    const F = (prev - 0.3) / (N + 0.4);
    pts.push({ t, F });
  });
  const nF = pts.length, nS = N - nF;
  const res = { name, nF, nS, excluded, beta: null, eta: null, r2: null, mtbfW: null, b10: null, pattern: null, points: pts };
  if (nF < 6) { res.pattern = 'Datos insuficientes'; return res; }
  const X = pts.map((p) => Math.log(p.t));
  const Y = pts.map((p) => Math.log(-Math.log(1 - p.F)));
  const fit = linreg(Y, X); // x = a + b·y  →  β = 1/b,  η = e^a
  if (!fit || fit.b <= 0) { res.pattern = 'Ajuste no válido'; return res; }
  res.beta = 1 / fit.b;
  res.eta = Math.exp(fit.a);
  res.r2 = fit.r2;
  res.mtbfW = res.eta * gamma(1 + 1 / res.beta);
  res.b10 = res.eta * Math.pow(-Math.log(0.9), 1 / res.beta);
  res.pattern = res.beta < 0.9 ? 'Mortalidad infantil' : res.beta <= 1.1 ? 'Aleatorio' : 'Desgaste';
  return res;
}
export function weibullStrategyShort(p) {
  return { 'Mortalidad infantil': 'Calidad de reparación y montaje', Aleatorio: 'Monitoreo de condición', Desgaste: 'Preventivo por tiempo (B10)' }[p] || '—';
}
export function weibullStrategy(p) {
  if (p === 'Mortalidad infantil') return 'Fallas tempranas tras intervenir: revisar calidad de reparación, montaje, puesta en marcha y repuestos. El reemplazo por tiempo no reduce el riesgo.';
  if (p === 'Aleatorio') return 'Tasa de falla constante: el mantenimiento por tiempo no ayuda; conviene el monitoreo de condición (predictivo).';
  if (p === 'Desgaste') return 'Tasa de falla creciente: el mantenimiento preventivo por tiempo es eficaz; usar la vida B10 como intervalo de referencia.';
  return 'Sin fallas suficientes para estimar el patrón.';
}

// ------------------------------------------------------------------
// Narrativa automática: veredicto, hallazgos y recomendaciones.
// ------------------------------------------------------------------
export function narrative(K) {
  const S = K.settings, T = S.targets;
  const F = [], R = [];
  const lv = K.level;
  const dimsSorted = K.dims.filter((d) => d.score != null).sort((a, b) => a.score - b.score);
  const pts = (v) => { const r = Math.round(v); return num(r, 0) + (r === 1 ? ' punto' : ' puntos'); };
  const worst = dimsSorted[0], best = dimsSorted[dimsSorted.length - 1];
  const verdict = K.idm == null ? 'No hay datos suficientes para calcular el índice.' :
    `El sistema de mantenimiento obtiene ${num(K.idm, 0)} de 100 puntos en el IDM-7 y se ubica en el nivel ${lv.n}, «${lv.name}». ${lv.desc} ` +
    (worst && best ? `La dimensión más débil es ${worst.name.toLowerCase()} (${pts(worst.score)}) y la más sólida, ${best.name.toLowerCase()} (${pts(best.score)}).` : '');

  const sev = (id) => K.status[id];
  // Estrategia
  if (K.proact != null) {
    F.push({ sev: sev('proact'), area: 'Estrategia', title: 'Mix de mantenimiento', text: `El ${pct(1 - K.proact)} de las órdenes es correctivo y el ${pct(K.proact)} es proactivo (preventivo ${pct(K.nPrev / K.nOT)}, predictivo ${pct(K.pred)}). La meta de trabajo proactivo es ${targetText('proact', T)}.` });
  }
  // Concentración de la detención
  if (K.badActors.length && K.dtCorr > 0) {
    const share = K.n80 / Math.max(1, K.NEq);
    const top = K.badActors.slice(0, 3).map((e) => `${e.equipo} (${num(e.dtF, 0)} h)`).join(', ');
    F.push({ sev: 'info', area: 'Fallas', title: 'Concentración de la detención', text: `${K.n80} equipos (${pct(share, 0)} del parque analizado) acumulan el 80% de las horas de detención por fallas. Los de mayor impacto son ${top}.` });
  }
  // Modo de falla dominante
  const pm = K.paretoModo.filter((p) => p.key !== 'Sin registrar');
  if (pm.length) {
    const n3 = pm.slice(0, 3).reduce((s, p) => s + p.n, 0);
    F.push({ sev: 'warn', area: 'Fallas', title: 'Modos de falla dominantes', text: `«${pm[0].key}» es el modo de falla más frecuente (${num(pm[0].n)} eventos, ${pct(pm[0].n / K.nF)}). Los tres primeros modos explican el ${pct(n3 / K.nF)} de las fallas.` });
  }
  // Jack-knife
  const ac = K.eqStats.filter((e) => e.quad === 'Agudo y crónico').sort((a, b) => b.dtF - a.dtF);
  if (ac.length) {
    F.push({ sev: 'crit', area: 'Fallas', title: 'Equipos agudos y crónicos', text: `${ac.length} equipos fallan más seguido y demoran más que el promedio del parque (cuadrante agudo y crónico del diagrama Jack-knife); suman ${num(K.quadDt['Agudo y crónico'], 0)} h de detención (${pct(K.quadDt['Agudo y crónico'] / K.dtCorr)}). Destacan ${ac.slice(0, 3).map((e) => e.equipo).join(', ')}.` });
  }
  // Confiabilidad
  if (K.MTBF != null) {
    F.push({ sev: sev('mtbf'), area: 'Confiabilidad', title: 'Frecuencia de fallas', text: `El MTBF del parque es ${num(K.MTBF, 0)} h (≈ ${num(K.MTBF / 24, 0)} días), equivalente a ${num(K.lambdaEqYear, 1)} fallas por equipo al año. La disponibilidad operacional alcanza ${pct(K.A, 2)}.` });
  }
  if (K.reinc != null) {
    F.push({ sev: sev('reinc'), area: 'Confiabilidad', title: 'Fallas repetitivas', text: `El ${pct(K.reinc)} de las fallas ocurre a ${S.reincDias} días o menos de la falla anterior del mismo equipo (meta ${targetText('reinc', T)}).` });
  }
  // Weibull
  const wf = K.weibull.filter((w) => w.beta != null);
  if (wf.length) {
    const inf = wf.filter((w) => w.pattern === 'Mortalidad infantil');
    const wear = wf.filter((w) => w.pattern === 'Desgaste');
    const rnd = wf.filter((w) => w.pattern === 'Aleatorio');
    let t = `El análisis de Weibull por tipo de equipo arroja ${inf.length} con mortalidad infantil (β < 0,9), ${rnd.length} con fallas aleatorias y ${wear.length} con desgaste (β > 1,1).`;
    if (K.weibullFleet.beta != null) t += ` Para el parque completo, β = ${num(K.weibullFleet.beta, 2)} y η = ${num(K.weibullFleet.eta, 0)} h.`;
    if (inf.length >= wf.length / 2 && K.reinc != null && K.reinc * 100 > T.reinc.meta) t += ' Junto con la alta reincidencia, esto apunta a fallas inducidas por la propia intervención.';
    F.push({ sev: inf.length >= wf.length / 2 ? 'crit' : 'warn', area: 'Confiabilidad', title: 'Patrón de falla (Weibull)', text: t });
  }
  // Mantenibilidad
  if (K.MTTR != null) {
    F.push({ sev: Math.min(K.scores.mttr ?? 100, K.scores.mwt ?? 100) >= 99.95 ? 'ok' : (K.scores.mttr ?? 0) < 50 || (K.scores.mwt ?? 0) < 50 ? 'crit' : 'warn', area: 'Mantenibilidad', title: 'Tiempos de respuesta y reparación', text: `Cada falla espera en promedio ${hours(K.MWT)} antes de ser intervenida y su reparación toma ${hours(K.MTTR)}; la detención media por falla es de ${hours(K.MDT)}.` });
  }
  // Planificación
  if (K.backlogW != null) {
    F.push({ sev: sev('backlog'), area: 'Planificación', title: 'Carga de trabajo pendiente', text: `Hay ${num(K.nPend)} OT pendientes (${num(K.nOpen)} abiertas y ${num(K.nExec)} en ejecución) que suman ${num(K.bHH, 0)} HH, equivalentes a ${num(K.backlogW, 1)} semanas de capacidad ejecutada (banda sana ${targetText('backlog', T)}).` });
  }
  if (K.onTime != null) {
    F.push({ sev: sev('onTime'), area: 'Planificación', title: 'Cumplimiento de plazos', text: `El ${pct(K.onTime)} de las OT cerradas terminó dentro de la fecha requerida (meta ${targetText('onTime', T)}).` });
  }
  // Costos
  if (K.costTotal > 0) {
    const ratio = K.costPerOT.Correctivo && K.costPerOT.Preventivo ? K.costPerOT.Correctivo / K.costPerOT.Preventivo : null;
    F.push({ sev: sev('costCorr'), area: 'Costos', title: 'Estructura del gasto', text: `El costo total del período es ${clp(K.costTotal)}; el ${pct(K.costCorr)} corresponde a correctivas.` + (ratio ? ` Una OT correctiva cuesta en promedio ${num(ratio, 1)} veces una preventiva (${clp(K.costPerOT.Correctivo)} frente a ${clp(K.costPerOT.Preventivo)}).` : '') });
  }
  // Calidad de datos
  const Q = K.quality;
  if (Q) {
    const issues = [];
    const top = RULE_SUMMARY(Q).filter((r) => r.rate > 0.01).slice(0, 2);
    for (const r of top) issues.push(`${r.name.toLowerCase()} (${pct(r.rate)})`);
    if (Q.breaks.length) issues.push(`una ruptura del volumen mensual desde ${monthLabel(Q.breaks[0].m)} (${Q.breaks[0].kind} de ${pct(1 - Q.breaks[0].n / Q.breaks[0].base, 0)})`);
    F.push({ sev: sev('dqi'), area: 'Datos', title: 'Confiabilidad de los datos', text: `El índice de calidad de datos es ${pct(Q.dqi)}. Se corrigieron ${num(Q.normalizations.reduce((s, x) => s + x.n, 0))} valores no estandarizados y ${num(Q.decComma + Q.thousands)} números con separador regional; se eliminaron ${num(Q.dupExact + Q.dupOT)} registros duplicados.` + (issues.length ? ` Persisten: ${issues.join('; ')}.` : '') });
  }
  // Tendencia
  if (K.trend && K.trend.h1.corrPct != null && K.trend.h2.corrPct != null) {
    const d = K.trend.h2.corrPct - K.trend.h1.corrPct;
    F.push({ sev: d <= -0.02 ? 'ok' : d >= 0.02 ? 'crit' : 'warn', area: 'Tendencia', title: 'Evolución del trabajo correctivo', text: `La proporción correctiva pasó de ${pct(K.trend.h1.corrPct)} (${K.trend.h1Label}) a ${pct(K.trend.h2.corrPct)} (${K.trend.h2Label}), ${Math.abs(d) < 0.02 ? 'sin un cambio relevante' : d < 0 ? 'una mejora de ' + num(Math.abs(d) * 100, 1) + ' puntos' : 'un deterioro de ' + num(d * 100, 1) + ' puntos'}.` + (Q && Q.breaks.length ? ' La caída del volumen registrado obliga a leer esta tendencia con cautela.' : '') });
  }

  // ---------- recomendaciones ----------
  const push = (prio, area, text, kpis) => R.push({ prio, area, text, kpis });
  const bad = (id) => K.status[id] === 'crit' ? 1 : K.status[id] === 'warn' ? 2 : 0;
  if (bad('proact')) push(bad('proact'), 'Estrategia', 'Revisar el plan maestro con metodología RCM (SAE JA1011) en los equipos de criticidad A, priorizando los modos de falla dominantes, y migrar tareas por tiempo a monitoreo de condición donde el patrón sea aleatorio.', ['proact', 'pred']);
  if (bad('reinc') || (wf.length && wf.filter((w) => w.pattern === 'Mortalidad infantil').length >= wf.length / 2)) push(1, 'Confiabilidad', 'Aplicar análisis causa raíz (RCA) a las fallas repetitivas y establecer control de calidad de las reparaciones: procedimientos estándar, prueba funcional y verificación de alineamiento y montaje antes de entregar el equipo.', ['reinc', 'mtbf']);
  if (ac.length) push(1, 'Fallas', `Crear un programa de eliminación de malos actores para los ${ac.length} equipos del cuadrante agudo y crónico (${ac.slice(0, 3).map((e) => e.equipo).join(', ')}…), con responsables, plazos y seguimiento mensual de MTBF y detención.`, ['mtbf', 'disp']);
  if (bad('mwt')) push(bad('mwt'), 'Mantenibilidad', 'Reducir el tiempo de espera: kits de repuestos críticos, permisos de trabajo preaprobados para fallas típicas y una cuadrilla de respuesta en el turno con más fallas.', ['mwt']);
  if (bad('mttr')) push(bad('mttr'), 'Mantenibilidad', 'Estandarizar la reparación de los modos de falla más frecuentes (instructivos, herramientas especiales, capacitación) para bajar el MTTR.', ['mttr']);
  if (bad('backlog')) push(bad('backlog'), 'Planificación', K.backlogW > T.backlog.hi ? 'Ajustar la capacidad al backlog: programación semanal congelada, priorización por criticidad y riesgo, y apoyo externo temporal hasta volver a la banda de 2–4 semanas.' : 'El backlog es bajo: revisar si hay capacidad ociosa que pueda destinarse a mejoras e inspecciones.', ['backlog']);
  if (bad('onTime') || bad('plan')) push(Math.min(bad('onTime') || 3, bad('plan') || 3), 'Planificación', 'Fortalecer el ciclo de planificación y programación (identificar, planificar, programar, ejecutar, cerrar) y medir semanalmente el cumplimiento del programa.', ['plan', 'onTime']);
  if (bad('costCorr')) push(bad('costCorr'), 'Costos', 'Reasignar presupuesto desde la reparación hacia la prevención en los equipos de mayor costo de falla, evaluando cada caso con costo del ciclo de vida (LCC).', ['costCorr']);
  if (bad('disp')) push(bad('disp'), 'Disponibilidad', 'Priorizar los equipos con mayor detención por falla y evaluar redundancias o repuestos rotables en los críticos.', ['disp']);
  if (bad('dqi') || (Q && Q.breaks.length)) push(bad('dqi') || 2, 'Datos', 'Implementar gobernanza de datos de mantenimiento según ISO 14224: catálogos obligatorios de modo y causa de falla, validaciones en el CMMS al cerrar OT y auditoría mensual de calidad del registro.', ['dqi']);
  const wear = wf.filter((w) => w.pattern === 'Desgaste');
  if (wear.length) push(2, 'Confiabilidad', `Para ${wear.map((w) => w.name.toLowerCase()).join(', ')} (patrón de desgaste) definir intervalos de reemplazo preventivo cercanos a la vida B10 estimada.`, ['mtbf']);
  R.sort((a, b) => a.prio - b.prio);

  const order = { crit: 0, warn: 1, info: 2, ok: 3, na: 4 };
  F.sort((a, b) => order[a.sev] - order[b.sev]);
  return { verdict, findings: F, recs: R };
}

export function RULE_SUMMARY(Q) {
  const names = {
    finIni: 'Fecha de fin anterior a la de inicio', iniCre: 'Inicio anterior a la creación', planCre: 'Fecha planificada anterior a la creación',
    cerradaSinFin: 'OT cerrada sin fecha de fin', abiertaConFin: 'OT abierta con fecha de fin', dtSpan: 'Detención mayor que espera + duración',
    costo: 'Costo total distinto de sus componentes', status: 'Estado distinto del status de sistema', clase: 'Tipo distinto de la clase de orden', sinModo: 'Correctiva sin modo de falla',
  };
  return Object.entries(Q.rules).filter(([, v]) => v.den > 0).map(([id, v]) => ({ id, name: names[id], n: v.n, den: v.den, rate: v.n / v.den })).sort((a, b) => b.rate - a.rate);
}
