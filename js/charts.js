// Constructores de opciones ECharts. Cada función recibe el resultado del
// análisis (K) y los tokens de tema (T) y devuelve una opción lista para usar,
// tanto en pantalla como en el informe PDF (T.print = true).
import { num, pct, compact, clp, monthLabel } from './util.js?v=1.0.11';
import { TIPOS, DIMENSIONS, KPI_DEFS } from './kpi.js?v=1.0.11';

// ---------- tokens ----------
export function themeTokens(mode = 'light', print = false) {
  const L = mode !== 'dark';
  const series = L ? ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
    : ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
  return {
    mode, print,
    font: '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
    fs: print ? 14 : 12,
    surface: L ? '#ffffff' : '#161c23',
    ink: L ? '#16202c' : '#e8ecf0',
    ink2: L ? '#4a5565' : '#b4bdc8',
    muted: L ? '#7a8494' : '#8a94a2',
    grid: L ? '#e6e9ee' : '#28313b',
    axis: L ? '#c3cad3' : '#3a4550',
    series,
    tipo: { Preventivo: series[0], Correctivo: series[1], Predictivo: series[2], Otro: L ? '#9aa3af' : '#6b7480' },
    comp: { mo: '#008300', ext: L ? '#6250d6' : '#9085e9', rep: L ? '#eda100' : '#c98500' },
    seq: L ? ['#eef4fc', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'] : ['#1b2530', '#13304f', '#184f95', '#1c5cab', '#2a78d6', '#5598e7', '#86b6ef', '#cde2fb'],
    crit: L ? { A: '#184f95', B: '#3987e5', C: '#86b6ef' } : { A: '#86b6ef', B: '#3987e5', C: '#1c5cab' },
    status: { ok: '#0ca30c', warn: '#fab219', serious: '#ec835a', crit: '#d03b3b' },
    ref: L ? '#16202c' : '#e8ecf0',
  };
}

const anim = (T) => (T.print ? { animation: false } : { animationDuration: 450, animationDurationUpdate: 300 });
function base(T, extra = {}) {
  return {
    ...anim(T),
    backgroundColor: T.print ? T.surface : 'transparent',
    textStyle: { fontFamily: T.font, color: T.ink2, fontSize: T.fs },
    tooltip: T.print ? { show: false } : {
      confine: true, backgroundColor: T.surface, borderColor: T.axis, borderWidth: 1, padding: [8, 10],
      textStyle: { color: T.ink, fontFamily: T.font, fontSize: 12 }, extraCssText: 'box-shadow:0 4px 16px rgba(0,0,0,.12);border-radius:6px;',
    },
    ...extra,
  };
}
const axisCommon = (T) => ({
  axisLine: { lineStyle: { color: T.axis } }, axisTick: { show: false },
  axisLabel: { color: T.muted, fontSize: T.fs - 1, fontFamily: T.font },
  splitLine: { lineStyle: { color: T.grid, width: 1 } },
  nameTextStyle: { color: T.muted, fontSize: T.fs - 1 },
});
const catAxis = (T, data, extra = {}) => ({ type: 'category', data, ...axisCommon(T), splitLine: { show: false }, ...extra });
const valAxis = (T, extra = {}) => ({ type: 'value', ...axisCommon(T), axisLine: { show: false }, ...extra });
const legend = (T, extra = {}) => ({ top: 0, left: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, itemGap: 16, textStyle: { color: T.ink2, fontSize: T.fs - 1 }, ...extra });
const gridBox = (T, extra = {}) => ({ left: 8, right: 16, top: 36, bottom: 8, containLabel: true, ...extra });
const tipLine = (rows) => rows.map(([c, l, v]) => `<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;min-width:170px"><span style="display:flex;align-items:center;gap:6px">${c ? `<i style="width:8px;height:8px;border-radius:2px;background:${c};display:inline-block"></i>` : ''}${l}</span><b style="font-weight:600">${v}</b></div>`).join('');
const tipHead = (s) => `<div style="font-weight:600;margin-bottom:4px">${s}</div>`;

// Áreas sombreadas para meses con posible subregistro.
function breakArea(K, T, labels) {
  const Q = K.quality;
  if (!Q || !Q.breaks.length) return undefined;
  const set = new Set(Q.breaks.map((b) => monthLabel(b.m)));
  const runs = [];
  let start = null, prev = null;
  labels.forEach((l) => {
    if (set.has(l)) { if (start == null) start = l; prev = l; }
    else if (start != null) { runs.push([start, prev]); start = null; }
  });
  if (start != null) runs.push([start, prev]);
  if (!runs.length) return undefined;
  return {
    silent: true, itemStyle: { color: T.mode === 'dark' ? 'rgba(250,178,25,.08)' : 'rgba(250,178,25,.12)' },
    label: { show: true, position: 'insideTop', color: T.muted, fontSize: T.fs - 2, formatter: 'Posible subregistro' },
    data: runs.map(([a, b]) => [{ xAxis: a }, { xAxis: b }]),
  };
}

// ---------- tendencias ----------
export function trendTipo(K, T) {
  const labels = K.monthly.map((m) => m.label);
  const series = TIPOS.map((t, i) => ({
    name: t, type: 'bar', stack: 'ot', barMaxWidth: 24, data: K.monthly.map((m) => m.n[t]),
    itemStyle: { color: T.tipo[t], borderColor: T.surface, borderWidth: 1, borderRadius: i === TIPOS.length - 1 ? [4, 4, 0, 0] : 0 },
    emphasis: { focus: 'series' },
    markArea: i === 0 ? breakArea(K, T, labels) : undefined,
  }));
  return base(T, {
    legend: legend(T), grid: gridBox(T),
    tooltip: { ...base(T).tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: T.mode === 'dark' ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.04)' } },
      formatter: (ps) => tipHead(ps[0].axisValue) + tipLine(ps.map((p) => [p.color, p.seriesName, num(p.value)])) + tipLine([[null, 'Total', num(ps.reduce((s, p) => s + p.value, 0))]]) },
    xAxis: catAxis(T, labels), yAxis: valAxis(T, { axisLabel: { ...axisCommon(T).axisLabel, formatter: compact } }), series,
  });
}
function lineSeries(T, name, data, color, extra = {}) {
  return { name, type: 'line', data, showSymbol: false, symbolSize: 8, smooth: false, connectNulls: true, lineStyle: { width: 2, color, cap: 'round', join: 'round' }, itemStyle: { color, borderColor: T.surface, borderWidth: 2 }, ...extra };
}
function refLine(T, value, label) {
  return { silent: true, symbol: 'none', lineStyle: { color: T.ref, width: 1, type: 'solid', opacity: 0.55 }, label: { formatter: label, position: 'insideEndTop', color: T.ink2, fontSize: T.fs - 2 }, data: [{ yAxis: value }] };
}
export function lineTrend(K, T, { key, name, scale = 1, dec = 1, unit = '', target, targetLabel, color, min }) {
  const labels = K.monthly.map((m) => m.label);
  const data = K.monthly.map((m) => (m[key] == null ? null : +(m[key] * scale).toFixed(dec + 2)));
  const s = lineSeries(T, name, data, color || T.series[0], {
    showSymbol: data.length <= 24, markLine: target != null ? refLine(T, target, targetLabel) : undefined, markArea: breakArea(K, T, labels),
    endLabel: { show: !T.print ? false : true },
  });
  const vals = data.filter((v) => v != null);
  const lo = min != null ? min : vals.length ? Math.min(...vals, target ?? Infinity) : 0;
  return base(T, {
    grid: gridBox(T, { top: 20 }),
    tooltip: { ...base(T).tooltip, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: T.axis } }, formatter: (ps) => tipHead(ps[0].axisValue) + tipLine([[color || T.series[0], name, ps[0].value == null ? '—' : num(ps[0].value, dec) + unit]]) },
    xAxis: catAxis(T, labels, { boundaryGap: false }),
    yAxis: valAxis(T, { scale: true, min: min != null ? min : (v) => Math.floor(Math.min(v.min, lo) * 0.98 * 100) / 100, axisLabel: { ...axisCommon(T).axisLabel, formatter: (v) => num(v, dec > 1 ? 1 : 0) + unit } }),
    series: [s],
  });
}
export function multiLineTrend(K, T, lines, { unit = '%', dec = 1, target, targetLabel, min } = {}) {
  const labels = K.monthly.map((m) => m.label);
  const series = lines.map((l, i) => lineSeries(T, l.name, K.monthly.map((m) => (m[l.key] == null ? null : +(m[l.key] * (l.scale || 1)).toFixed(dec + 2))), l.color || T.series[i], {
    showSymbol: labels.length <= 24, markLine: i === 0 && target != null ? refLine(T, target, targetLabel) : undefined, markArea: i === 0 ? breakArea(K, T, labels) : undefined,
  }));
  return base(T, {
    legend: legend(T), grid: gridBox(T),
    tooltip: { ...base(T).tooltip, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: T.axis } }, formatter: (ps) => tipHead(ps[0].axisValue) + tipLine(ps.map((p) => [p.color, p.seriesName, p.value == null ? '—' : num(p.value, dec) + unit])) },
    xAxis: catAxis(T, labels, { boundaryGap: false }),
    yAxis: valAxis(T, { min: min ?? 0, max: unit === '%' ? 100 : undefined, axisLabel: { ...axisCommon(T).axisLabel, formatter: (v) => num(v, 0) + unit } }), series,
  });
}

// ---------- IDM ----------
export function radar(K, T, others = []) {
  const narrow = T.w && T.w < 520;
  const ind = DIMENSIONS.map((d) => ({ name: narrow ? d.name.replace(' ', '\n') : d.name, max: 100 }));
  const val = DIMENSIONS.map((d) => { const x = K.dims.find((y) => y.id === d.id); return x && x.score != null ? +x.score.toFixed(1) : 0; });
  return base(T, {
    tooltip: { ...base(T).tooltip, trigger: 'item', formatter: (p) => tipHead(p.name) + tipLine(DIMENSIONS.map((d, i) => [null, d.name, num(p.value[i], 0) + ' pts'])) },
    legend: legend(T, { show: true, data: ['Desempeño actual', 'Umbral nivel 4 (70 pts)'] }),
    radar: {
      indicator: ind, radius: T.print ? '68%' : T.w && T.w < 520 ? '46%' : '66%', center: ['50%', '56%'], splitNumber: 4, shape: 'polygon',
      axisName: { color: T.ink2, fontSize: T.w && T.w < 520 ? T.fs - 2 : T.fs - 1, fontFamily: T.font },
      splitLine: { lineStyle: { color: T.grid } }, splitArea: { show: false }, axisLine: { lineStyle: { color: T.grid } },
    },
    series: [{
      type: 'radar', symbolSize: 7,
      data: [
        { name: 'Umbral nivel 4 (70 pts)', value: DIMENSIONS.map(() => 70), symbol: 'none', lineStyle: { color: T.muted, width: 1 }, areaStyle: { opacity: 0 }, itemStyle: { color: T.muted } },
        { name: 'Desempeño actual', value: val, lineStyle: { color: T.series[0], width: 2 }, areaStyle: { color: T.series[0], opacity: 0.12 }, itemStyle: { color: T.series[0], borderColor: T.surface, borderWidth: 2 } },
      ],
    }],
  });
}
export function dimBars(K, T) {
  const dims = [...K.dims].reverse();
  return base(T, {
    grid: gridBox(T, { top: 8, right: 48 }),
    tooltip: { ...base(T).tooltip, trigger: 'item', formatter: (p) => tipHead(p.name) + tipLine([[null, 'Puntaje', num(p.value, 0) + ' / 100'], [null, 'Peso en el IDM', dims[p.dataIndex].weight + '%']]) },
    xAxis: valAxis(T, { max: 100, axisLabel: { ...axisCommon(T).axisLabel, formatter: (v) => v } }),
    yAxis: catAxis(T, dims.map((d) => d.name), { axisLine: { show: false } }),
    series: [{
      type: 'bar', barMaxWidth: 18, data: dims.map((d) => ({ value: d.score == null ? 0 : +d.score.toFixed(1), itemStyle: { color: T.status[d.status === 'na' ? 'warn' : d.status] } })),
      itemStyle: { borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: T.ink, fontSize: T.fs - 1, formatter: (p) => num(p.value, 0) },
      markLine: { silent: true, symbol: 'none', lineStyle: { color: T.ref, width: 1, opacity: 0.5, type: 'solid' }, label: { show: false }, data: [{ xAxis: 70 }] },
    }],
  });
}

// ---------- Pareto horizontal (sin doble eje) ----------
export function paretoBars(rows, T, { metric = 'n', limit = 12, unit = '', color, valueFmt } = {}) {
  const top = rows.slice(0, limit).reverse();
  const tot = rows.reduce((s, r) => s + r[metric], 0) || 1;
  let acc = 0;
  const cumMap = new Map();
  for (const r of rows) { acc += r[metric]; cumMap.set(r.key, acc / tot); }
  const fmt = valueFmt || ((v) => num(v) + unit);
  const c = color || T.series[1];
  return base(T, {
    grid: gridBox(T, { top: 8, right: 96 }),
    tooltip: { ...base(T).tooltip, trigger: 'item', formatter: (p) => { const r = top[p.dataIndex]; return tipHead(r.key) + tipLine([[c, 'Valor', fmt(r[metric])], [null, 'Participación', pct(r[metric] / tot)], [null, 'Acumulado', pct(cumMap.get(r.key))]]); } },
    xAxis: valAxis(T, { axisLabel: { ...axisCommon(T).axisLabel, formatter: compact } }),
    yAxis: catAxis(T, top.map((r) => r.key), { axisLine: { show: false }, axisLabel: { ...axisCommon(T).axisLabel, color: T.ink2, width: T.print ? 260 : 180, overflow: 'truncate' } }),
    series: [{
      type: 'bar', barMaxWidth: 16,
      data: top.map((r) => ({ value: r[metric], itemStyle: { color: c, opacity: cumMap.get(r.key) - r[metric] / tot < 0.8 ? 1 : 0.4 } })),
      itemStyle: { borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', color: T.ink2, fontSize: T.fs - 2, formatter: (p) => fmt(p.value) + '   ' + pct(cumMap.get(top[p.dataIndex].key), 0) + ' acum.' },
    }],
  });
}

// ---------- Jack-knife (Knights, 2001) ----------
export function jackknife(K, T) {
  const pts = K.eqStats.filter((e) => e.nF > 0 && e.mdt > 0);
  const xs = pts.map((e) => e.nF), ys = pts.map((e) => e.mdt);
  const xMax = Math.max(...xs, 2) * 1.4, yMin = Math.max(0.1, Math.min(...ys) * 0.7), yMax = Math.max(...ys) * 1.4;
  const crits = ['A', 'B', 'C'];
  const series = crits.map((c) => ({
    name: 'Criticidad ' + c, type: 'scatter', symbolSize: T.print ? 9 : 10,
    data: pts.filter((e) => (e.crit || 'C') === c).map((e) => ({ value: [e.nF, +e.mdt.toFixed(2)], e })),
    itemStyle: { color: T.crit[c], borderColor: T.surface, borderWidth: 1.5, opacity: 0.9 },
    emphasis: { scale: 1.4 },
  }));
  // Curvas de igual detención total (n × MDT = constante): rectas en escala log.
  const totals = [100, 300, 1000].filter((d) => d / xMax < yMax && d > yMin);
  for (const d of totals) {
    const x0 = Math.max(1, d / yMax), x1 = Math.min(xMax, d / yMin);
    series.push({ name: 'iso' + d, type: 'line', silent: true, symbol: 'none', data: [[x0, d / x0], [x1, d / x1]], lineStyle: { color: T.muted, width: 1, opacity: 0.45 },
      endLabel: { show: true, formatter: num(d) + ' h', color: T.muted, fontSize: T.fs - 2 }, tooltip: { show: false }, z: 1 });
  }
  const ml = { silent: true, symbol: 'none', lineStyle: { color: T.ref, width: 1, opacity: 0.55, type: 'solid' }, label: { color: T.ink2, fontSize: T.fs - 2 },
    data: [{ xAxis: K.jk.x, label: { formatter: 'Límite de frecuencia ' + num(K.jk.x, 1), position: 'insideEndTop' } }, { yAxis: K.jk.y, label: { formatter: 'Límite de detención ' + num(K.jk.y, 1) + ' h', position: 'insideEndTop' } }] };
  series[0].markLine = ml;
  const qlabel = (txt, x, y) => ({ type: 'text', [x[0]]: x[1], [y[0]]: y[1], style: { text: txt, fill: T.muted, font: `600 ${T.fs - 1}px ${T.font}` }, silent: true });
  return base(T, {
    legend: legend(T, { data: crits.map((c) => 'Criticidad ' + c) }),
    grid: gridBox(T, { top: 40, right: 28, left: 12, bottom: 12 }),
    tooltip: { ...base(T).tooltip, trigger: 'item', formatter: (p) => { const e = p.data.e; if (!e) return ''; return tipHead(e.equipo) + tipLine([[null, 'Tipo', e.tipoEq || '—'], [null, 'Fallas', num(e.nF)], [null, 'Detención media', num(e.mdt, 1) + ' h'], [null, 'Detención total', num(e.dtF, 0) + ' h'], [null, 'Cuadrante', e.quad]]); } },
    xAxis: { type: 'log', logBase: 10, min: 1, max: Math.pow(10, Math.ceil(Math.log10(xMax))), name: 'N.º de fallas (escala log)', nameLocation: 'middle', nameGap: 26, ...axisCommon(T) },
    yAxis: { type: 'log', logBase: 10, min: Math.pow(10, Math.floor(Math.log10(yMin))), max: Math.pow(10, Math.ceil(Math.log10(yMax))), name: 'Detención media por falla, h (log)', nameLocation: 'middle', nameGap: 40, ...axisCommon(T) },
    graphic: [qlabel('Agudo', ['left', '14%'], ['top', '16%']), qlabel('Agudo y crónico', ['right', '6%'], ['top', '16%']), qlabel('Controlado', ['left', '14%'], ['bottom', '16%']), qlabel('Crónico', ['right', '6%'], ['bottom', '16%'])],
    series,
  });
}

// ---------- Weibull ----------
export function weibullPlot(w, T) {
  if (!w || !w.points.length) return emptyOption(T, 'Sin fallas suficientes');
  const pts = w.points.map((p) => [p.t, Math.log(-Math.log(1 - p.F))]);
  const tMin = Math.min(...w.points.map((p) => p.t)), tMax = Math.max(...w.points.map((p) => p.t));
  const fitLine = w.beta ? [[tMin, w.beta * (Math.log(tMin) - Math.log(w.eta))], [tMax, w.beta * (Math.log(tMax) - Math.log(w.eta))]] : [];
  const Fs = [0.01, 0.05, 0.1, 0.2, 0.3, 0.5, 0.632, 0.8, 0.9, 0.95, 0.99];
  const yv = (F) => Math.log(-Math.log(1 - F));
  const yMin = Math.min(yv(0.01), ...pts.map((p) => p[1])), yMax = Math.max(yv(0.99), ...pts.map((p) => p[1]));
  return base(T, {
    legend: legend(T, { data: ['Fallas (rango mediano)', 'Ajuste Weibull'] }),
    grid: gridBox(T, { top: 40, left: 12, right: 24, bottom: 12 }),
    tooltip: { ...base(T).tooltip, trigger: 'item', formatter: (p) => p.seriesIndex === 0 ? tipHead('Falla') + tipLine([[null, 'Tiempo entre fallas', num(p.value[0], 0) + ' h'], [null, 'Probabilidad acumulada F(t)', pct(1 - Math.exp(-Math.exp(p.value[1])))]]) : '' },
    xAxis: { type: 'log', logBase: 10, name: 'Tiempo entre fallas, h (log)', nameLocation: 'middle', nameGap: 26, min: Math.pow(10, Math.floor(Math.log10(tMin))), max: Math.pow(10, Math.ceil(Math.log10(tMax))), ...axisCommon(T) },
    yAxis: { type: 'value', min: yMin - 0.2, max: yMax + 0.2, interval: null, name: 'F(t) acumulada', nameLocation: 'middle', nameGap: 44, ...axisCommon(T),
      axisLabel: { show: false }, splitLine: { show: false } },
    series: [
      { name: 'Fallas (rango mediano)', type: 'scatter', data: pts, symbolSize: T.print ? 6 : 7, large: pts.length > 600, itemStyle: { color: T.series[0], opacity: 0.75, borderColor: T.surface, borderWidth: 1 },
        markLine: { silent: true, symbol: 'none', lineStyle: { color: T.grid, width: 1, type: 'solid' }, label: { position: 'start', color: T.muted, fontSize: T.fs - 2, formatter: (p) => pct(p.data.F, p.data.F < 0.1 ? 0 : 0) },
          data: Fs.map((F) => ({ yAxis: yv(F), F })) } },
      { name: 'Ajuste Weibull', type: 'line', data: fitLine, symbol: 'none', lineStyle: { color: T.series[1], width: 2 }, tooltip: { show: false } },
    ],
  });
}
export function reliabilityCurves(list, T) {
  const ws = list.filter((w) => w.beta).slice(0, 4);
  if (!ws.length) return emptyOption(T, 'Sin ajustes válidos');
  const tMax = Math.max(...ws.map((w) => w.eta)) * 2.2;
  const steps = 60;
  const series = ws.map((w, i) => lineSeries(T, w.name, Array.from({ length: steps + 1 }, (_, k) => { const t = (tMax * k) / steps; return [Math.round(t), +(Math.exp(-Math.pow(t / w.eta, w.beta)) * 100).toFixed(2)]; }), T.series[[0, 6, 2, 3][i]]));
  return base(T, {
    legend: legend(T), grid: gridBox(T, { top: 40, left: 12, right: 20, bottom: 12 }),
    tooltip: { ...base(T).tooltip, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: T.axis } }, formatter: (ps) => tipHead('t = ' + num(ps[0].value[0]) + ' h') + tipLine(ps.map((p) => [p.color, p.seriesName, num(p.value[1], 1) + '%'])) },
    xAxis: valAxis(T, { type: 'value', name: 'Horas de operación', nameLocation: 'middle', nameGap: 26, axisLine: { show: true, lineStyle: { color: T.axis } }, axisLabel: { ...axisCommon(T).axisLabel, formatter: compact } }),
    yAxis: valAxis(T, { min: 0, max: 100, name: 'Confiabilidad R(t), %', nameLocation: 'middle', nameGap: 36, axisLabel: { ...axisCommon(T).axisLabel, formatter: (v) => v + '%' } }),
    series,
  });
}
export function betaBars(K, T) {
  const ws = K.weibull.filter((w) => w.beta != null).sort((a, b) => a.beta - b.beta);
  return base(T, {
    grid: gridBox(T, { top: 8, right: 56 }),
    tooltip: { ...base(T).tooltip, trigger: 'item', formatter: (p) => { const w = ws[p.dataIndex]; return tipHead(w.name) + tipLine([[null, 'β (forma)', num(w.beta, 2)], [null, 'η (escala)', num(w.eta, 0) + ' h'], [null, 'Patrón', w.pattern], [null, 'Fallas / suspensiones', w.nF + ' / ' + w.nS]]); } },
    xAxis: valAxis(T, { min: 0, max: (v) => Math.max(1.6, Math.ceil(v.max * 10 + 1) / 10) }),
    yAxis: catAxis(T, ws.map((w) => w.name), { axisLine: { show: false } }),
    series: [{
      type: 'bar', barMaxWidth: 16, data: ws.map((w) => ({ value: +w.beta.toFixed(2), itemStyle: { color: w.pattern === 'Mortalidad infantil' ? T.series[6] : w.pattern === 'Aleatorio' ? T.series[0] : T.series[1] } })),
      itemStyle: { borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: T.ink2, fontSize: T.fs - 2, formatter: (p) => 'β = ' + num(p.value, 2) },
      markLine: { silent: true, symbol: 'none', lineStyle: { color: T.ref, width: 1, opacity: 0.55, type: 'solid' }, label: { formatter: 'β = 1', color: T.ink2, fontSize: T.fs - 2 }, data: [{ xAxis: 1 }] },
    }],
  });
}

// ---------- matrices de calor ----------
export function heatmap(h, T, { xName = '', yName = '', rotate = 0 } = {}) {
  const max = Math.max(1, ...h.data.map((d) => d[2]));
  return base(T, {
    grid: gridBox(T, { top: 8, bottom: 44, right: 12 }),
    tooltip: { ...base(T).tooltip, trigger: 'item', formatter: (p) => tipHead(h.y[p.value[1]]) + tipLine([[null, h.x[p.value[0]], num(p.value[2]) + ' fallas']]) },
    xAxis: catAxis(T, h.x, { axisLabel: { ...axisCommon(T).axisLabel, rotate, interval: 0, fontSize: T.fs - 2 }, axisLine: { show: false }, name: xName }),
    yAxis: catAxis(T, h.y, { axisLine: { show: false }, inverse: true, axisLabel: { ...axisCommon(T).axisLabel, color: T.ink2, width: T.print ? 220 : 170, overflow: 'truncate' }, name: yName }),
    visualMap: { min: 0, max, calculable: false, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 10, itemHeight: 140, text: [num(max), '0'], textStyle: { color: T.muted, fontSize: T.fs - 2 }, inRange: { color: T.seq.slice(0, 7) } },
    series: [{ type: 'heatmap', data: h.data, itemStyle: { borderColor: T.surface, borderWidth: 2, borderRadius: 2 }, emphasis: { itemStyle: { borderColor: T.ink, borderWidth: 1 } },
      label: { show: h.x.length * h.y.length <= 160, fontSize: T.fs - 3, color: T.ink, formatter: (p) => (p.value[2] ? p.value[2] : '') } }],
  });
}

// ---------- barras agrupadas por dimensión ----------
export function stackedShareByGroup(rows, T, { field = 'byTipo', keys = TIPOS, colors, horizontal = true, absolute = false, valueFmt = num, limit = 20 } = {}) {
  const top = rows.slice(0, limit);
  const cats = top.map((r) => r.key);
  const series = keys.map((k, i) => ({
    name: k, type: 'bar', stack: 's', barMaxWidth: 18, emphasis: { focus: 'series' },
    data: top.map((r) => { const tot = keys.reduce((s, kk) => s + (r[field][kk] || 0), 0) || 1; return absolute ? r[field][k] || 0 : +(((r[field][k] || 0) / tot) * 100).toFixed(2); }),
    itemStyle: { color: (colors || T.tipo)[k], borderColor: T.surface, borderWidth: 1, borderRadius: i === keys.length - 1 ? (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) : 0 },
  }));
  const vAx = valAxis(T, { max: absolute ? undefined : 100, axisLabel: { ...axisCommon(T).axisLabel, formatter: absolute ? compact : (v) => v + '%' } });
  const cAx = catAxis(T, cats, { axisLine: { show: false }, inverse: horizontal, axisLabel: { ...axisCommon(T).axisLabel, color: T.ink2, width: 150, overflow: 'truncate' } });
  return base(T, {
    legend: legend(T), grid: gridBox(T),
    tooltip: { ...base(T).tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: T.mode === 'dark' ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.04)' } },
      formatter: (ps) => { const r = top[ps[0].dataIndex]; return tipHead(r.key) + tipLine(ps.map((p) => [p.color, p.seriesName, absolute ? valueFmt(p.value) : num(p.value, 1) + '% (' + valueFmt(r[field][p.seriesName] || 0) + ')'])); } },
    xAxis: horizontal ? vAx : cAx, yAxis: horizontal ? cAx : vAx, series,
  });
}
export function simpleBars(rows, T, { metric, color, horizontal = true, fmt = num, axisFmt, limit = 15, target, targetLabel, colorBy, min, max, labels = true } = {}) {
  const top = rows.slice(0, limit);
  const data = top.map((r) => ({ value: r[metric] == null ? null : +(+r[metric]).toFixed(4), itemStyle: { color: colorBy ? colorBy(r) : color || T.series[0] } }));
  const vAx = valAxis(T, { min, max, axisLabel: { ...axisCommon(T).axisLabel, formatter: axisFmt || ((v) => compact(v)) } });
  const cAx = catAxis(T, top.map((r) => r.key), { axisLine: { show: false }, inverse: horizontal, axisLabel: { ...axisCommon(T).axisLabel, color: T.ink2, width: T.print ? 220 : 160, overflow: 'truncate', interval: 0 } });
  const s = {
    type: 'bar', barMaxWidth: horizontal ? 16 : 24, data, itemStyle: { borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
    label: { show: labels, position: horizontal ? 'right' : 'top', color: T.ink2, fontSize: T.fs - 2, formatter: (p) => fmt(p.value) },
  };
  if (target != null) s.markLine = { silent: true, symbol: 'none', lineStyle: { color: T.ref, width: 1, opacity: 0.55, type: 'solid' }, label: { formatter: targetLabel || 'Meta', color: T.ink2, fontSize: T.fs - 2, position: 'insideEndTop' }, data: [horizontal ? { xAxis: target } : { yAxis: target }] };
  return base(T, {
    grid: gridBox(T, { top: 16, right: horizontal ? 64 : 16 }),
    tooltip: { ...base(T).tooltip, trigger: 'item', formatter: (p) => tipHead(top[p.dataIndex].key) + tipLine([[p.color, 'Valor', fmt(p.value)]]) },
    xAxis: horizontal ? vAx : cAx, yAxis: horizontal ? cAx : vAx, series: [s],
  });
}

// ---------- costos ----------
export function costCompTrend(K, T) {
  const labels = K.monthly.map((m) => m.label);
  const keys = [['mo', 'Mano de obra'], ['ext', 'Servicios externos'], ['rep', 'Repuestos']];
  const series = keys.map(([k, name], i) => ({
    name, type: 'bar', stack: 'c', barMaxWidth: 24, data: K.monthly.map((m) => Math.round(m.comp[k])), emphasis: { focus: 'series' },
    itemStyle: { color: T.comp[k], borderColor: T.surface, borderWidth: 1, borderRadius: i === keys.length - 1 ? [4, 4, 0, 0] : 0 },
    markArea: i === 0 ? breakArea(K, T, labels) : undefined,
  }));
  return base(T, {
    legend: legend(T), grid: gridBox(T),
    tooltip: { ...base(T).tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: T.mode === 'dark' ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.04)' } },
      formatter: (ps) => tipHead(ps[0].axisValue) + tipLine(ps.map((p) => [p.color, p.seriesName, clp(p.value)])) + tipLine([[null, 'Total', clp(ps.reduce((s, p) => s + p.value, 0))]]) },
    xAxis: catAxis(T, labels), yAxis: valAxis(T, { axisLabel: { ...axisCommon(T).axisLabel, formatter: (v) => compact(v) } }), series,
  });
}
export function costByTipo(K, T, metric = 'total') {
  const rows = TIPOS.map((t) => ({ key: t, v: metric === 'total' ? K.costBy[t] : K.costPerOT[t] }));
  return base(T, {
    grid: gridBox(T, { top: 24 }),
    tooltip: { ...base(T).tooltip, trigger: 'item', formatter: (p) => tipHead(p.name) + tipLine([[p.color, metric === 'total' ? 'Costo total' : 'Costo medio por OT', clp(p.value)], ...(metric === 'total' ? [[null, 'Participación', pct(p.value / (K.costTotal || 1))]] : [])]) },
    xAxis: catAxis(T, rows.map((r) => r.key)),
    yAxis: valAxis(T, { axisLabel: { ...axisCommon(T).axisLabel, formatter: compact } }),
    series: [{ type: 'bar', barMaxWidth: 40, data: rows.map((r) => ({ value: Math.round(r.v || 0), itemStyle: { color: T.tipo[r.key] } })), itemStyle: { borderRadius: [4, 4, 0, 0] },
      label: { show: true, position: 'top', color: T.ink, fontSize: T.fs - 1, formatter: (p) => clp(p.value) + (metric === 'total' ? '  (' + pct(p.value / (K.costTotal || 1), 0) + ')' : '') } }],
  });
}

// ---------- backlog ----------
export function agingBars(K, T) {
  const cats = K.aging.map((a) => a.key);
  const cols = { Abierta: T.seq[6], 'En ejecución': T.seq[3] };
  const series = ['Abierta', 'En ejecución'].map((e, i) => ({
    name: e, type: 'bar', stack: 'a', barMaxWidth: 40, data: K.aging.map((a) => a.byEstado[e]),
    itemStyle: { color: cols[e], borderColor: T.surface, borderWidth: 1, borderRadius: i === 1 ? [4, 4, 0, 0] : 0 },
  }));
  return base(T, {
    legend: legend(T), grid: gridBox(T),
    tooltip: { ...base(T).tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(0,0,0,.04)' } }, formatter: (ps) => { const a = K.aging[ps[0].dataIndex]; return tipHead('Antigüedad ' + a.key) + tipLine(ps.map((p) => [p.color, p.seriesName, num(p.value) + ' OT'])) + tipLine([[null, 'HH pendientes', num(a.hh, 0)]]); } },
    xAxis: catAxis(T, cats), yAxis: valAxis(T), series,
  });
}

// ---------- calidad de datos ----------
export function qualityDims(Q, T) {
  const names = { completitud: 'Completitud', validez: 'Validez', consistencia: 'Consistencia', unicidad: 'Unicidad', plausibilidad: 'Plausibilidad' };
  const keys = Object.keys(names).reverse();
  return base(T, {
    grid: gridBox(T, { top: 8, right: 56 }),
    tooltip: { ...base(T).tooltip, trigger: 'item', formatter: (p) => tipHead(p.name) + tipLine([[null, 'Puntaje', num(p.value, 1) + '%'], [null, 'Peso en el índice', Q.weights[keys[p.dataIndex]] * 100 + '%']]) },
    xAxis: valAxis(T, { min: (v) => Math.max(0, Math.floor(v.min / 10) * 10 - 10), max: 100, axisLabel: { ...axisCommon(T).axisLabel, formatter: (v) => v + '%' } }),
    yAxis: catAxis(T, keys.map((k) => names[k]), { axisLine: { show: false } }),
    series: [{ type: 'bar', barMaxWidth: 16, data: keys.map((k) => { const v = Q.dims[k] * 100; return { value: +v.toFixed(2), itemStyle: { color: v >= 98 ? T.status.ok : v >= 90 ? T.status.warn : T.status.crit } }; }),
      itemStyle: { borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: T.ink, fontSize: T.fs - 1, formatter: (p) => num(p.value, 1) + '%' } }],
  });
}
export function volumeChart(Q, T) {
  const br = new Set(Q.breaks.map((b) => b.m));
  return base(T, {
    grid: gridBox(T, { top: 24 }),
    tooltip: { ...base(T).tooltip, trigger: 'item', formatter: (p) => { const v = Q.volume[p.dataIndex]; const b = Q.breaks.find((x) => x.m === v.m); return tipHead(monthLabel(v.m)) + tipLine([[null, 'Registros', num(v.n)], ...(b ? [[null, 'Mediana previa', num(b.base, 0)], [null, 'Señal', b.kind + ' de volumen']] : [])]); } },
    xAxis: catAxis(T, Q.volume.map((v) => monthLabel(v.m))), yAxis: valAxis(T),
    series: [{ type: 'bar', barMaxWidth: 24, itemStyle: { borderRadius: [4, 4, 0, 0] }, data: Q.volume.map((v) => ({ value: v.n, itemStyle: { color: br.has(v.m) ? T.status.warn : T.seq[5] } })),
      label: { show: true, position: 'top', color: T.muted, fontSize: T.fs - 3 } }],
  });
}
export function completenessBars(Q, T) {
  const rows = [...Q.completeness].sort((a, b) => a.value - b.value);
  return base(T, {
    grid: gridBox(T, { top: 8, right: 56 }),
    tooltip: { ...base(T).tooltip, trigger: 'item', formatter: (p) => { const c = rows[p.dataIndex]; return tipHead(c.label) + tipLine([[null, 'Completitud', c.present ? num(c.value * 100, 1) + '%' : 'Columna ausente'], [null, 'Registros evaluados', num(c.den)]]); } },
    xAxis: valAxis(T, { min: 0, max: 100, axisLabel: { ...axisCommon(T).axisLabel, formatter: (v) => v + '%' } }),
    yAxis: catAxis(T, rows.map((c) => c.label), { axisLine: { show: false } }),
    series: [{ type: 'bar', barMaxWidth: 12, itemStyle: { borderRadius: [0, 4, 4, 0] }, data: rows.map((c) => ({ value: +(c.value * 100).toFixed(2), itemStyle: { color: !c.present ? T.status.crit : c.value >= 0.98 ? T.seq[5] : T.status.warn } })),
      label: { show: true, position: 'right', color: T.ink2, fontSize: T.fs - 2, formatter: (p) => (rows[p.dataIndex].present ? num(p.value, 1) + '%' : 'Ausente') } }],
  });
}

// ---------- comparación de datasets ----------
export function compareDims(list, T) {
  const dims = DIMENSIONS.map((d) => d.name);
  const series = list.map((x, i) => ({
    name: x.name, type: 'bar', barMaxWidth: 14, barGap: '20%',
    data: DIMENSIONS.map((d) => { const s = x.K.dims.find((y) => y.id === d.id); return s && s.score != null ? +s.score.toFixed(1) : 0; }),
    itemStyle: { color: T.series[i % 8], borderRadius: [4, 4, 0, 0], borderColor: T.surface, borderWidth: 1 },
  }));
  return base(T, {
    legend: legend(T), grid: gridBox(T),
    tooltip: { ...base(T).tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(0,0,0,.04)' } }, formatter: (ps) => tipHead(ps[0].axisValue) + tipLine(ps.map((p) => [p.color, p.seriesName, num(p.value, 0) + ' pts'])) },
    xAxis: catAxis(T, dims, { axisLabel: { ...axisCommon(T).axisLabel, interval: 0, width: 90, overflow: 'break', fontSize: T.fs - 2 } }),
    yAxis: valAxis(T, { max: 100 }), series,
  });
}
export function compareIdm(list, T) {
  return base(T, {
    grid: gridBox(T, { top: 22, right: 64 }),
    tooltip: { ...base(T).tooltip, trigger: 'item', formatter: (p) => { const x = list[p.dataIndex]; return tipHead(x.name) + tipLine([[p.color, 'IDM-7', num(p.value, 1)], [null, 'Nivel', x.K.level ? x.K.level.n + ', ' + x.K.level.name.toLowerCase() : '—']]); } },
    xAxis: valAxis(T, { min: 0, max: 100 }),
    yAxis: catAxis(T, list.map((x) => x.name), { inverse: true, axisLine: { show: false } }),
    series: [{ type: 'bar', barMaxWidth: 18, data: list.map((x, i) => ({ value: x.K.idm == null ? 0 : +x.K.idm.toFixed(1), itemStyle: { color: T.series[i % 8] } })), itemStyle: { borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', color: T.ink, fontSize: T.fs - 1, formatter: (p) => num(p.value, 1) },
      markLine: { silent: true, symbol: 'none', lineStyle: { color: T.ref, width: 1, opacity: 0.4, type: 'solid' }, label: { color: T.muted, fontSize: T.fs - 3, position: 'end', formatter: (p) => ['', 'N2', 'N3', 'N4', 'N5'][[0, 40, 55, 70, 85].indexOf(p.value)] || '' }, data: [40, 55, 70, 85].map((v) => ({ xAxis: v })) } }],
  });
}

export function emptyOption(T, text) {
  return base(T, { graphic: [{ type: 'text', left: 'center', top: 'middle', style: { text, fill: T.muted, font: `${T.fs}px ${T.font}` } }], xAxis: { show: false }, yAxis: { show: false }, series: [] });
}

// Render fuera de pantalla para el PDF.
export function renderImage(option, width, height) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:${height}px;`;
  document.body.appendChild(el);
  const ch = window.echarts.init(el, null, { renderer: 'canvas', width, height, devicePixelRatio: 2 });
  ch.setOption(option);
  const url = ch.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' });
  ch.dispose();
  el.remove();
  return url;
}
