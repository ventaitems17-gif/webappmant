// Informe PDF (jsPDF + AutoTable). Estructura académica: portada con cajetín,
// índice, guía de lectura, secciones numeradas con figuras y tablas
// numeradas, conclusiones, recomendaciones y anexos metodológicos.
import * as U from './util.js?v=1.0.11';
import * as C from './charts.js?v=1.0.11';
import { KPI_DEFS, KPI_ORDER, DIMENSIONS, LEVELS, targetText, critText, fmtKpi, weibullStrategy, RULE_SUMMARY } from './kpi.js?v=1.0.11';

const { num, pct, clp, hours, fmtDate, monthLabel } = U;

// Paleta del informe (RGB).
const P = {
  ink: [22, 32, 44], ink2: [74, 85, 101], muted: [111, 121, 136], line: [221, 226, 232], line2: [195, 202, 211],
  frame: [43, 58, 74], accent: [11, 79, 108], soft: [226, 237, 242], s2: [247, 249, 251], white: [255, 255, 255],
  ok: [12, 163, 12], warn: [250, 178, 25], crit: [208, 59, 59], okInk: [0, 99, 0], warnInk: [138, 90, 0], critInk: [166, 42, 42],
};
const STL = { ok: 'Cumple', warn: 'Brecha moderada', crit: 'Brecha crítica', na: 'Sin dato', info: 'Contexto' };

// Helvetica estándar usa WinAnsi: se reemplazan los símbolos que no admite.
function tx(s) {
  return String(s ?? '')
    .replace(/β/g, 'beta').replace(/η/g, 'eta').replace(/λ/g, 'lambda').replace(/Σ/g, 'suma de ').replace(/≥/g, '>=').replace(/≤/g, '<=')
    .replace(/−/g, '-').replace(/≈/g, '~').replace(/→/g, '->').replace(/×/g, 'x').replace(/·/g, '·').replace(/≠/g, '<>').replace(/[  ]/g, ' ')
    .replace(/[^\x00-\xFF–—‘’“”•…€]/g, '');
}

export async function generateReport({ K, N, ds, meta, opts, compare, filters, recsN, references }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setLineHeightFactor(1.42);
  const W = 210, H = 297, ML = 20, MR = 20, CW = W - ML - MR, TOP = 24, BOTTOM = 280;
  let y = TOP;
  let figN = 0, tabN = 0;
  const toc = [];
  const T = C.themeTokens('light', true);
  const issued = new Date();
  const issuedTxt = fmtDate(Date.UTC(issued.getFullYear(), issued.getMonth(), issued.getDate()));
  const lh = (pt) => pt * 0.3528 * 1.42;
  const font = (style = 'normal', size = 9.5, color = P.ink2) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color); };
  const newPage = () => { doc.addPage(); y = TOP; };
  const ensure = (h) => { if (y + h > BOTTOM) newPage(); };
  const line = (x1, y1, x2, y2, c = P.line, w = 0.2) => { doc.setDrawColor(...c); doc.setLineWidth(w); doc.line(x1, y1, x2, y2); };

  function statusShape(s, x, cy, r = 1.25) {
    const c = s === 'ok' ? P.ok : s === 'warn' ? P.warn : s === 'crit' ? P.crit : P.muted;
    doc.setFillColor(...c); doc.setDrawColor(...c); doc.setLineWidth(0.3);
    if (s === 'ok') doc.circle(x, cy, r, 'F');
    else if (s === 'warn') doc.triangle(x - r * 1.15, cy + r, x + r * 1.15, cy + r, x, cy - r * 1.1, 'F');
    else if (s === 'crit') doc.rect(x - r, cy - r, r * 2, r * 2, 'F');
    else if (s === 'info') { doc.triangle(x, cy - r * 1.2, x + r * 1.2, cy, x, cy + r * 1.2, 'F'); doc.triangle(x, cy - r * 1.2, x - r * 1.2, cy, x, cy + r * 1.2, 'F'); }
    else doc.circle(x, cy, r, 'S');
  }
  function para(text, { size = 9.5, color = P.ink2, style = 'normal', width = CW, x = ML, after = 2.5 } = {}) {
    font(style, size, color);
    const lines = doc.splitTextToSize(tx(text), width);
    const l = lh(size);
    for (const ln of lines) { ensure(l); doc.text(ln, x, y + l * 0.72); y += l; }
    y += after;
  }
  // Párrafo con un prefijo en negrita en la misma línea.
  function leadPara(lead, text, { size = 9.5, width = CW, x = ML, after = 2.5 } = {}) {
    font('bold', size, P.ink);
    const lw = doc.getTextWidth(tx(lead) + ' ');
    font('normal', size, P.ink2);
    const first = doc.splitTextToSize(tx(text), width - lw);
    const l = lh(size);
    ensure(l);
    font('bold', size, P.ink); doc.text(tx(lead), x, y + l * 0.72);
    font('normal', size, P.ink2);
    const firstLine = first[0] || '';
    doc.text(firstLine, x + lw, y + l * 0.72);
    y += l;
    const rest = tx(text).slice(firstLine.length).trim();
    if (rest) { y -= 0; const lines = doc.splitTextToSize(rest, width); for (const ln of lines) { ensure(l); doc.text(ln, x, y + l * 0.72); y += l; } }
    y += after;
  }
  function h1(title, { num: n } = {}) {
    newPage();
    toc.push({ level: 1, title: (n ? n + '. ' : '') + title, page: doc.getNumberOfPages() });
    font('bold', 10, P.accent);
    if (n) doc.text(n.startsWith('Anexo') ? n : 'Sección ' + n, ML, y + 3);
    font('bold', 19, P.ink);
    const lines = doc.splitTextToSize(tx(title), CW);
    doc.text(lines, ML, y + 11);
    y += 11 + (lines.length - 1) * lh(19) + 4;
    line(ML, y, ML + CW, y, P.frame, 0.5);
    y += 6;
  }
  function h2(title) {
    ensure(16);
    y += 2;
    toc.push({ level: 2, title, page: doc.getNumberOfPages() });
    font('bold', 12, P.ink);
    doc.text(tx(title), ML, y + 4);
    y += 8;
  }
  function howBox(text, { width = CW, x = ML } = {}) {
    font('normal', 8.4, P.ink2);
    const lines = doc.splitTextToSize(tx(text), width - 9);
    const l = lh(8.4);
    const hh = 6.4 + lines.length * l + 2;
    ensure(hh);
    doc.setFillColor(...P.s2); doc.rect(x, y, width, hh, 'F');
    doc.setFillColor(...P.accent); doc.rect(x, y, 0.9, hh, 'F');
    font('bold', 8.4, P.ink); doc.text('Cómo leer', x + 4.5, y + 4.6);
    font('normal', 8.4, P.ink2);
    let yy = y + 4.6 + l;
    for (const ln of lines) { doc.text(ln, x + 4.5, yy); yy += l; }
    y += hh + 3;
  }
  function figure(option, { ratio = 0.42, caption, how, reading, width = CW }) {
    const wpx = 1000, hpx = Math.round(wpx * ratio);
    const img = C.renderImage(option, wpx, hpx);
    const hmm = width * ratio;
    font('normal', 8.4);
    const howH = how ? 6.4 + doc.splitTextToSize(tx(how), width - 9).length * lh(8.4) + 5 : 0;
    font('normal', 9.5);
    const readH = reading ? doc.splitTextToSize(tx('Lectura: ' + reading), width).length * lh(9.5) + 3 : 0;
    ensure(Math.min(hmm + 9 + howH + readH, BOTTOM - TOP));
    doc.addImage(img, 'PNG', ML, y, width, hmm, undefined, 'FAST');
    y += hmm + 2;
    figN++;
    font('bold', 8.6, P.ink);
    const lab = 'Figura ' + figN + '.';
    doc.text(lab, ML, y + 3);
    const lw = doc.getTextWidth(lab + ' ');
    font('normal', 8.6, P.ink2);
    const cl = doc.splitTextToSize(tx(caption), width - lw);
    doc.text(cl, ML + lw, y + 3);
    y += 3 + cl.length * lh(8.6) + 2;
    if (how) howBox(how, { width });
    if (reading) leadPara('Lectura:', reading);
    y += 1.5;
  }
  function tableTitle(title) {
    tabN++;
    ensure(18);
    font('bold', 8.6, P.ink);
    const lab = 'Tabla ' + tabN + '.';
    doc.text(lab, ML, y + 3);
    const lw = doc.getTextWidth(lab + ' ');
    font('normal', 8.6, P.ink2);
    doc.text(doc.splitTextToSize(tx(title), CW - lw), ML + lw, y + 3);
    y += 6;
  }
  function table(head, body, { title, statusCol = -1, colStyles = {}, fontSize = 8.2, after = 5, note } = {}) {
    if (title) tableTitle(title);
    doc.autoTable({
      startY: y, margin: { left: ML, right: MR, top: TOP, bottom: H - BOTTOM }, head: [head.map(tx)], body: body.map((r) => r.map((c) => (typeof c === 'object' && c !== null ? { ...c, content: tx(c.content) } : tx(c)))),
      theme: 'plain', styles: { font: 'helvetica', fontSize, textColor: P.ink2, cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 }, lineColor: P.line, lineWidth: { bottom: 0.15 }, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: P.s2, textColor: P.ink, fontStyle: 'bold', lineWidth: { bottom: 0.3 }, lineColor: P.line2 },
      columnStyles: colStyles, rowPageBreak: 'avoid',
      didParseCell: (d) => { if (d.section === 'body' && d.column.index === statusCol) d.cell.styles.cellPadding = { top: 1.6, bottom: 1.6, left: 6, right: 2 }; },
      didDrawCell: (d) => {
        if (d.section === 'body' && d.column.index === statusCol) {
          const s = Object.keys(STL).find((k) => STL[k] === d.cell.raw || STL[k] === (d.cell.raw && d.cell.raw.content));
          if (s) statusShape(s, d.cell.x + 3, d.cell.y + d.cell.height / 2, 1.1);
        }
      },
      didDrawPage: () => {},
    });
    y = doc.lastAutoTable.finalY + 2;
    if (note) { font('italic', 7.8, P.muted); const nl = doc.splitTextToSize(tx(note), CW); ensure(nl.length * lh(7.8)); doc.text(nl, ML, y + 2.6); y += nl.length * lh(7.8) + 1; }
    y += after;
  }
  function bullets(items, { size = 9.3, numbered = false } = {}) {
    items.forEach((it, i) => {
      const l = lh(size);
      font('normal', size, P.ink2);
      const lines = doc.splitTextToSize(tx(it), CW - 7);
      ensure(Math.min(lines.length, 3) * l);
      font(numbered ? 'bold' : 'normal', size, numbered ? P.accent : P.ink2);
      doc.text(numbered ? i + 1 + '.' : '•', ML + 1, y + l * 0.72);
      font('normal', size, P.ink2);
      for (const ln of lines) { ensure(l); doc.text(ln, ML + 7, y + l * 0.72); y += l; }
      y += 1.2;
    });
    y += 1.5;
  }
  const kpiRows = (ids) => ids.map((id) => [KPI_DEFS[id].name, fmtKpi(id, K.kpi[id]), targetText(id, K.settings.targets), critText(id, K.settings.targets), K.scores[id] == null ? '—' : num(K.scores[id], 0), STL[K.status[id]]]);
  const kpiCols = { 0: { cellWidth: 55 }, 1: { halign: 'right', cellWidth: 20 }, 2: { halign: 'right', cellWidth: 20 }, 3: { halign: 'right', cellWidth: 24 }, 4: { halign: 'right', cellWidth: 16 }, 5: { cellWidth: 35 } };
  const kpiHead = ['Indicador', 'Valor', 'Meta', 'Umbral crítico', 'Puntaje', 'Estado'];
  const periodTxt = fmtDate(K.from) + ' a ' + fmtDate(K.to - 1);

  // =============== PORTADA ===============
  // Marca: curva de la bañera.
  doc.setDrawColor(...P.accent); doc.setLineWidth(0.5); doc.roundedRect(ML, 18, 11, 11, 2, 2, 'S');
  doc.setLineWidth(0.7);
  const bt = [];
  for (let i = 0; i <= 24; i++) { const t = i / 24; const v = 0.85 * Math.pow(1 - t, 5) + 0.1 + 0.8 * Math.pow(t, 4); bt.push([ML + 2 + t * 7, 18 + 2.2 + (1 - v) * 6.6]); }
  doc.lines(bt.slice(1).map((p, i) => [p[0] - bt[i][0], p[1] - bt[i][1]]), bt[0][0], bt[0][1], [1, 1], 'S', false);
  doc.setFillColor(...P.accent); doc.circle(bt[24][0], bt[24][1], 0.8, 'F');
  font('bold', 11, P.ink); doc.text('WebAppMant', ML + 14, 22.6);
  font('normal', 8.5, P.muted); doc.text('Análisis de desempeño de mantenimiento', ML + 14, 26.8);
  font('normal', 8.5, P.muted); doc.text(tx('Emitido el ' + U.fmtDateLong(Date.UTC(issued.getFullYear(), issued.getMonth(), issued.getDate()))), W - MR, 22.6, { align: 'right' });

  y = 62;
  font('bold', 26, P.ink);
  const tl = doc.splitTextToSize(tx(meta.title), CW - 10);
  doc.text(tl, ML, y); y += tl.length * lh(26) * 0.95;
  font('normal', 12.5, P.ink2);
  const st = doc.splitTextToSize(tx(`Diagnóstico del sistema de mantenimiento a partir de ${num(recsN)} órdenes de trabajo del CMMS, con el modelo de evaluación IDM-7.`), CW - 20);
  doc.text(st, ML, y + 2); y += st.length * lh(12.5) + 8;
  line(ML, y, ML + 40, y, P.accent, 1.2);
  y += 14;

  // Bloque del índice
  font('bold', 9, P.muted); doc.text('Índice de desempeño de mantenimiento (IDM-7)', ML, y);
  y += 4;
  font('bold', 64, P.ink); doc.text(num(K.idm, 0), ML - 1.5, y + 22);
  const sw = doc.getTextWidth(num(K.idm, 0));
  font('normal', 16, P.muted); doc.text('/ 100', ML + sw + 2, y + 22);
  font('bold', 15, P.ink); doc.text(tx('Nivel ' + K.level.n + ': ' + K.level.name), ML + sw + 26, y + 13);
  font('normal', 9.2, P.ink2);
  const ld = doc.splitTextToSize(tx(K.level.desc), CW - sw - 28);
  doc.text(ld, ML + sw + 26, y + 18.5);
  y += 32;
  // Escala de madurez
  const segW = [40, 15, 15, 15, 15].map((v) => (v / 100) * CW);
  let sx = ML;
  LEVELS.forEach((l, i) => {
    const w = segW[i] - 1;
    doc.setFillColor(...(l.n === K.level.n ? P.accent : l.n < K.level.n ? [150, 182, 196] : P.line));
    doc.rect(sx, y, w, 3.2, 'F');
    font(l.n === K.level.n ? 'bold' : 'normal', 7.6, l.n === K.level.n ? P.ink : P.muted);
    doc.text('Nivel ' + l.n, sx, y + 7.4);
    font('normal', 7.6, l.n === K.level.n ? P.ink : P.muted);
    doc.text(tx(l.name), sx, y + 10.8);
    sx += segW[i];
  });
  const mx = ML + (U.clamp(K.idm, 0, 100) / 100) * CW;
  doc.setFillColor(...P.ink); doc.triangle(mx - 1.8, y - 3.2, mx + 1.8, y - 3.2, mx, y - 0.4, 'F');
  y += 20;

  // Cajetín (rótulo) de la portada
  const cells = [
    ['Autor', meta.author || '—'], ['Programa o cargo', meta.program || '—'],
    ['Institución', meta.inst || '—'], ['Planta u organización', meta.org || '—'],
    ['Dataset', ds.name + ' (' + (ds.file || '') + ')'], ['Período analizado', periodTxt],
    ['Órdenes analizadas', num(recsN) + ' de ' + num(ds.quality.validRows) + ' válidas (' + num(ds.quality.rawRows) + ' leídas)'], ['Equipos', num(K.NEq)],
    ['Filtros aplicados', filters], ['Calidad de datos (DQI)', pct(ds.quality.dqi)],
  ];
  const cbY = Math.max(y, 196);
  const rowH = 12.5, colW = CW / 2;
  const rows = Math.ceil(cells.length / 2);
  doc.setDrawColor(...P.frame); doc.setLineWidth(0.6); doc.rect(ML, cbY, CW, rows * rowH);
  doc.setLineWidth(0.2); doc.setDrawColor(...P.line2);
  for (let r = 1; r < rows; r++) doc.line(ML, cbY + r * rowH, ML + CW, cbY + r * rowH);
  doc.line(ML + colW, cbY, ML + colW, cbY + rows * rowH);
  cells.forEach(([lab, val], i) => {
    const cx = ML + (i % 2) * colW + 3, cy = cbY + Math.floor(i / 2) * rowH;
    font('normal', 7.2, P.muted); doc.text(tx(lab), cx, cy + 4.2);
    font('bold', 8.8, P.ink);
    const vl = doc.splitTextToSize(tx(val), colW - 6);
    doc.text(vl.slice(0, 2), cx, cy + 8.4, { lineHeightFactor: 1.1 });
  });
  font('italic', 7.6, P.muted);
  doc.text(doc.splitTextToSize(tx('Informe generado automáticamente por WebAppMant a partir de los datos cargados. Las metas son referenciales y configurables; ver Anexo A para fórmulas, supuestos y criterios de puntaje.'), CW), ML, cbY + rows * rowH + 6);

  // =============== PÁGINA 2: contenido y guía de lectura (se completa al final) ===============
  doc.addPage();
  const tocPage = doc.getNumberOfPages();

  // =============== 1. RESUMEN EJECUTIVO ===============
  h1('Resumen ejecutivo', { num: '1' });
  para(N.verdict, { size: 10.2, color: P.ink });
  // Radar a la izquierda y tabla de dimensiones a la derecha.
  ensure(84);
  const radarImg = C.renderImage(C.radar(K, { ...T, fs: 13 }), 540, 455);
  doc.addImage(radarImg, 'PNG', ML - 2, y, 92, 77.5, undefined, 'FAST');
  const tx0 = ML + 96, tw = CW - 96;
  let ty = y + 4;
  font('bold', 8.6, P.ink); doc.text('Dimensión', tx0, ty); doc.text('Peso', tx0 + tw - 26, ty, { align: 'right' }); doc.text('Puntaje', tx0 + tw, ty, { align: 'right' });
  ty += 2; line(tx0, ty, tx0 + tw, ty, P.line2, 0.3); ty += 1;
  for (const d of K.dims) {
    ty += 6.6;
    statusShape(d.status, tx0 + 1.5, ty - 1.2, 1.1);
    font('normal', 8.8, P.ink); doc.text(tx(d.name), tx0 + 5, ty);
    font('normal', 8.8, P.muted); doc.text(d.weight + '%', tx0 + tw - 26, ty, { align: 'right' });
    font('bold', 8.8, P.ink); doc.text(d.score == null ? '—' : num(d.score, 0), tx0 + tw, ty, { align: 'right' });
    line(tx0, ty + 2.4, tx0 + tw, ty + 2.4, P.line, 0.15);
  }
  ty += 7.5;
  font('bold', 9.4, P.ink); doc.text('IDM-7', tx0 + 5, ty); doc.text(num(K.idm, 1) + ' / 100', tx0 + tw, ty, { align: 'right' });
  y += 81;
  figN++;
  font('bold', 8.6, P.ink); doc.text('Figura ' + figN + '.', ML, y);
  font('normal', 8.6, P.ink2); doc.text(tx('Perfil de las siete dimensiones del IDM-7 frente al umbral del nivel 4 (70 puntos).'), ML + doc.getTextWidth('Figura ' + figN + '. ') + 0.5, y);
  y += 5;
  howBox('Cada eje es una dimensión puntuada de 0 a 100. Cuanto más se acerca el polígono azul al borde, mejor es el desempeño; las zonas hundidas son las brechas prioritarias. El polígono gris marca 70 puntos, el umbral del nivel proactivo.');

  table(kpiHead, kpiRows(KPI_ORDER), { title: 'Tablero de indicadores del período con su estado frente a las metas.', statusCol: 5, colStyles: kpiCols, note: 'Puntaje: 100 = cumple la meta; 0 = igual o peor que el umbral crítico; interpolación lineal entre ambos.' });

  h2('Hallazgos clave');
  N.findings.slice(0, 10).forEach((f) => {
    font('normal', 9.2);
    const lines = doc.splitTextToSize(tx(f.text), CW - 7);
    ensure(lh(9.4) + Math.min(lines.length, 2) * lh(9.2));
    statusShape(f.sev, ML + 1.6, y + 2.6, 1.15);
    font('bold', 9.4, P.ink); doc.text(tx(f.title), ML + 6, y + 3.4);
    const tw2 = doc.getTextWidth(tx(f.title));
    font('normal', 8, P.muted); doc.text(tx(f.area), ML + 6 + tw2 + 2.5, y + 3.4);
    y += lh(9.4) + 0.6;
    font('normal', 9.2, P.ink2);
    for (const ln of lines) { ensure(lh(9.2)); doc.text(ln, ML + 6, y + lh(9.2) * 0.72); y += lh(9.2); }
    y += 2.2;
  });
  h2('Recomendaciones prioritarias');
  bullets(N.recs.slice(0, 7).map((r) => r.area + '. ' + r.text), { numbered: true });

  // =============== 2. DATOS Y CALIDAD ===============
  const Q = ds.quality;
  h1('Datos y calidad de la información', { num: '2' });
  para(`El análisis se basa en el archivo «${ds.file}», con ${num(Q.rawRows)} filas leídas y ${num(Q.validRows)} registros válidos tras la depuración, ${num(ds.meta.nEquipos)} equipos y ${ds.meta.unidades.length} unidades (${ds.meta.unidades.join(', ')}). Se reconocieron ${Object.keys(ds.meta.map).length} campos del modelo de datos. La calidad se evaluó sobre el dataset completo en cinco dimensiones, siguiendo DAMA-DMBOK e ISO 8000-8; el índice resultante es ${pct(Q.dqi)} (${STL[K.status.dqi].toLowerCase()} frente a la meta ${targetText('dqi', K.settings.targets)}).`);
  const dimNames = { completitud: 'Completitud', validez: 'Validez', consistencia: 'Consistencia', unicidad: 'Unicidad', plausibilidad: 'Plausibilidad' };
  const lowDim = Object.entries(Q.dims).sort((a, b) => a[1] - b[1])[0];
  figure(C.qualityDims(Q, T), { ratio: 0.3, caption: 'Puntaje por dimensión de calidad de datos.', how: 'Completitud: campos clave con dato. Validez: formato y dominio correctos. Consistencia: reglas lógicas entre campos. Unicidad: sin duplicados. Plausibilidad: sin valores extremos. Verde sobre 98%, ámbar entre 90% y 98%, rojo bajo 90%.', reading: `La dimensión más débil es ${dimNames[lowDim[0]].toLowerCase()} (${pct(lowDim[1])}).` });
  const rules = RULE_SUMMARY(Q);
  table(['Regla de consistencia', 'Afectados', 'Evaluados', '%'], rules.map((r) => [r.name, num(r.n), num(r.den), pct(r.rate)]), { title: 'Resultado de las reglas de consistencia entre campos.', colStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } } });
  figure(C.volumeChart(Q, T), { ratio: 0.34, caption: 'Volumen de órdenes registradas por mes; en ámbar los meses con variación anómala.', how: 'Un CMMS estable registra un volumen mensual similar. Una caída brusca suele reflejar subregistro (órdenes no ingresadas o exportación incompleta), no una mejora real.',
    reading: Q.breaks.length ? `${Q.breaks.length} meses (${Q.breaks.map((b) => monthLabel(b.m)).join(', ')}) registran menos de la mitad de la mediana de los seis meses previos. Los indicadores mensuales de ese tramo deben leerse con cautela.` : 'No se detectan rupturas del volumen mensual.' });
  const fixes = [
    ['Apóstrofo inicial (marca de texto de la exportación)', num(Q.apostrophes), 'Eliminado'],
    ['Decimales con coma y separadores de miles', num(Q.decComma + Q.thousands), 'Convertidos a formato numérico'],
    ['Categorías con variantes de escritura', num(Q.normalizations.reduce((s, x) => s + x.n, 0)), 'Unificadas a la escritura dominante'],
    ['Filas duplicadas y OT repetidas', num(Q.dupExact + Q.dupOT), 'Eliminadas (se conserva la primera)'],
    ['Valores inválidos', num(Q.invalid), 'Tratados como dato faltante'],
    ['Registros con valores atípicos extremos', num(Q.outlierRows), K.settings.excluirAtipicos ? 'Excluidos del análisis' : 'Marcados; se conservan en el análisis'],
    ['Tarifa de mano de obra', clp(Q.tarifa, 'unit') + '/HH', Q.tarifaInferida ? 'Inferida de los datos' : 'Valor por defecto'],
  ];
  table(['Tratamiento', 'Cantidad', 'Acción'], fixes, { title: 'Correcciones aplicadas automáticamente durante la depuración.', colStyles: { 1: { halign: 'right', cellWidth: 26 } } });
  const imp = [];
  const planCre = rules.find((r) => r.id === 'planCre');
  if (planCre && planCre.rate > 0.2) imp.push(`La fecha planificada es anterior a la creación en el ${pct(planCre.rate)} de las órdenes, por lo que no se usa para medir el cumplimiento del programa; en su lugar se usa la fecha de necesidad.`);
  if (Q.breaks.length) imp.push('La caída de volumen desde ' + monthLabel(Q.breaks[0].m) + ' puede elevar artificialmente la disponibilidad y el MTBF de esos meses.');
  const ab = rules.find((r) => r.id === 'abiertaConFin');
  if (ab && ab.rate > 0.1) imp.push(`El ${pct(ab.rate)} de las OT abiertas tiene fecha de fin registrada: el estado de las órdenes no se actualiza de forma consistente al cerrarlas.`);
  if (Q.outlierRows) imp.push(`${num(Q.outlierRows)} registros presentan valores extremos de detención, horas o costo; se conservaron porque pueden ser eventos reales de alta severidad.`);
  if (imp.length) { h2('Implicancias para el análisis'); bullets(imp); }

  // =============== 3. DISPONIBILIDAD Y CONFIABILIDAD ===============
  h1('Disponibilidad y confiabilidad', { num: '3' });
  para(`En el período se registraron ${num(K.nF)} fallas (órdenes correctivas) en ${num(K.NEq)} equipos, con ${num(K.dtCorr, 0)} horas de detención por fallas. La disponibilidad operacional alcanza ${pct(K.A, 2)} y la inherente ${pct(K.Ai, 2)}; el MTBF del parque es ${num(K.MTBF, 0)} h y el MTTR ${hours(K.MTTR)}.`);
  table(kpiHead, kpiRows(['disp', 'mtbf', 'reinc', 'mttr', 'mwt']), { title: 'Indicadores de disponibilidad, confiabilidad y mantenibilidad.', statusCol: 5, colStyles: kpiCols });
  const mA = K.monthly.filter((m) => m.A != null);
  const aMin = mA.reduce((a, b) => (b.A < a.A ? b : a), mA[0] || {}), aMax = mA.reduce((a, b) => (b.A > a.A ? b : a), mA[0] || {});
  const T0 = K.settings.targets;
  figure(C.lineTrend(K, T, { key: 'A', name: 'Disponibilidad', scale: 100, dec: 2, unit: '%', target: T0.disp.meta, targetLabel: 'Meta ' + num(T0.disp.meta, 1) + '%' }), { ratio: 0.34, caption: 'Disponibilidad operacional mensual del parque.', how: 'Disponibilidad = 1 − horas de detención / (equipos × horas del mes). La línea horizontal es la meta.',
    reading: mA.length ? `La disponibilidad mensual varió entre ${pct(aMin.A, 2)} (${aMin.label}) y ${pct(aMax.A, 2)} (${aMax.label}); ${mA.filter((m) => m.A * 100 >= T0.disp.meta).length} de ${mA.length} meses alcanzaron la meta.` : '' });
  figure(C.lineTrend(K, T, { key: 'mtbf', name: 'MTBF', dec: 0, unit: ' h', target: T0.mtbf.meta, targetLabel: 'Meta ' + num(T0.mtbf.meta) + ' h', min: 0 }), { ratio: 0.34, caption: 'MTBF mensual del parque (horas de operación entre fallas).', reading: `El MTBF global del período es ${num(K.MTBF, 0)} h, equivalente a ${num(K.lambdaEqYear, 1)} fallas por equipo al año.` });
  h2('Análisis de Weibull');
  const wf = K.weibull.filter((w) => w.beta);
  para(`Se ajustó una distribución de Weibull de dos parámetros a los tiempos entre fallas de cada tipo de equipo mediante regresión de rangos medianos (X sobre Y), incorporando como suspensiones los equipos sin fallas y el tiempo final sin falla (rangos ajustados de Johnson y aproximación de Bernard). Para el parque completo, beta = ${num(K.weibullFleet.beta, 2)} y eta = ${num(K.weibullFleet.eta, 0)} h (R² = ${num(K.weibullFleet.r2, 3)}).`);
  if (opts.tables) table(['Tipo de equipo', 'Fallas', 'Susp.', 'Beta', 'Eta (h)', 'R²', 'B10 (h)', 'Patrón'], [...K.weibull, K.weibullFleet].map((w) => [w.name, num(w.nF), num(w.nS), w.beta ? num(w.beta, 2) : '—', w.eta ? num(w.eta, 0) : '—', w.r2 ? num(w.r2, 3) : '—', w.b10 ? num(w.b10, 0) : '—', w.pattern || '']), { title: 'Parámetros de Weibull por tipo de equipo.', colStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } } });
  figure(C.betaBars(K, T), { ratio: 0.36, caption: 'Parámetro de forma beta por tipo de equipo (violeta: mortalidad infantil; azul: aleatorio; naranjo: desgaste).', how: 'beta < 1: el riesgo de falla disminuye con el tiempo (fallas tempranas, a menudo inducidas por la intervención). beta ~ 1: riesgo constante (fallas aleatorias). beta > 1: el riesgo aumenta (desgaste).',
    reading: `${wf.filter((w) => w.pattern === 'Mortalidad infantil').length} de ${wf.length} tipos muestran mortalidad infantil. ${weibullStrategy(K.weibullFleet.pattern)}` });
  const wTop = wf[0] || K.weibullFleet;
  figure(C.weibullPlot(wTop, T), { ratio: 0.5, caption: `Gráfico de probabilidad de Weibull: ${wTop.name} (beta = ${num(wTop.beta, 2)}, eta = ${num(wTop.eta, 0)} h).`, how: 'En papel de Weibull la distribución se ve como una recta; su pendiente es beta. Si los puntos siguen la recta ajustada, el modelo describe bien los datos.' });
  const rel = wf.slice(0, 4).map((w) => `${w.name.toLowerCase()} ${pct(Math.exp(-Math.pow(720 / w.eta, w.beta)), 0)}`).join(', ');
  figure(C.reliabilityCurves(K.weibull, T), { ratio: 0.42, caption: 'Curvas de confiabilidad R(t) de los cuatro tipos de equipo con más fallas.', how: 'R(t) es la probabilidad de operar sin fallar hasta t horas desde la última reparación: R(t) = exp(−(t/eta)^beta).', reading: rel ? `La probabilidad de operar un mes (720 h) sin fallar es: ${rel}.` : '' });

  // =============== 4. ANÁLISIS DE FALLAS ===============
  h1('Análisis de fallas', { num: '4' });
  const pm = K.paretoModo;
  let k80 = 0; for (const p of pm) { k80++; if (p.cum >= 0.8) break; }
  para(`Se analizaron ${num(K.nF)} fallas clasificadas en ${pm.length} modos de falla y ${K.paretoCausa.length} causas. ${k80} modos explican el 80% de las fallas, y ${K.n80} equipos concentran el 80% de las horas de detención.`);
  figure(C.paretoBars(pm, T, { metric: 'n' }), { ratio: 0.5, caption: 'Pareto de modos de falla por frecuencia, con porcentaje acumulado.', how: 'Los modos se ordenan de mayor a menor frecuencia. Las barras intensas son los pocos modos que explican el 80% del total: ahí rinde más el esfuerzo de mejora; las atenuadas son la cola de baja frecuencia.',
    reading: pm.length ? `«${pm[0].key}» lidera con ${num(pm[0].n)} eventos (${pct(pm[0].n / K.nF)}), seguido de «${(pm[1] || {}).key || '—'}» y «${(pm[2] || {}).key || '—'}».` : '' });
  const pc = K.paretoCausa;
  figure(C.paretoBars(pc, T, { metric: 'n', color: T.series[6] }), { ratio: 0.5, caption: 'Pareto de causas de falla por frecuencia.', reading: pc.length ? `La causa más frecuente es «${pc[0].key}» (${pct(pc[0].n / K.nF)} de las fallas); las tres primeras suman ${pct(pc.slice(0, 3).reduce((s, p) => s + p.n, 0) / K.nF)}.` : '' });
  h2('Diagrama de dispersión logarítmica (Jack-knife)');
  figure(C.jackknife(K, T), { ratio: 0.62, caption: 'Diagrama Jack-knife de equipos: número de fallas frente a detención media por falla (escalas logarítmicas).', how: 'Las líneas límite son los promedios del parque. Crónicos (abajo a la derecha): fallan seguido y se reparan rápido; atacar la confiabilidad. Agudos (arriba a la izquierda): fallan poco pero detienen mucho; atacar la mantenibilidad. Agudos y crónicos (arriba a la derecha): prioridad máxima. Las diagonales unen equipos con igual detención total.',
    reading: `${num(K.quadCount['Agudo y crónico'])} equipos son agudos y crónicos (${pct(K.quadDt['Agudo y crónico'] / (K.dtCorr || 1))} de la detención), ${num(K.quadCount['Crónico'])} crónicos, ${num(K.quadCount['Agudo'])} agudos y ${num(K.quadCount['Controlado'])} controlados.` });
  if (opts.tables) table(['#', 'Equipo', 'Tipo', 'Unidad', 'Crit.', 'Fallas', 'Detención (h)', 'MDT (h)', 'Costo fallas', 'Cuadrante'], K.badActors.slice(0, 12).map((e, i) => [i + 1, e.equipo, e.tipoEq || '', e.unidad || '', e.crit || '', num(e.nF), num(e.dtF, 0), num(e.mdt, 1), clp(e.costF), e.quad]),
    { title: 'Malos actores: equipos con mayor detención por fallas.', fontSize: 7.6, colStyles: { 0: { halign: 'right', cellWidth: 7 }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } } });
  figure(C.heatmap(K.heatMT, T, { rotate: 30 }), { ratio: 0.6, caption: 'Matriz de modos de falla por tipo de equipo (número de fallas, doce modos más frecuentes).', how: 'Cada celda cuenta las fallas de un modo en un tipo de equipo; el tono más oscuro indica más eventos. Permite identificar los pares equipo-modo que conviene abordar con análisis RCM o RCA.' });

  // =============== 5. GESTIÓN DEL TRABAJO ===============
  h1('Gestión del trabajo', { num: '5' });
  para(`De las ${num(K.nOT)} órdenes del período, ${pct(K.proact)} son proactivas (preventivo ${pct(K.nPrev / K.nOT)}, predictivo ${pct(K.pred)}) y ${pct(1 - K.proact)} correctivas. Quedan ${num(K.nPend)} órdenes pendientes con ${num(K.bHH, 0)} HH estimadas, frente a una capacidad ejecutada de ${num(K.capWeek, 0)} HH por semana.`);
  table(kpiHead, kpiRows(['proact', 'pred', 'plan', 'onTime', 'backlog']), { title: 'Indicadores de estrategia, planificación y control.', statusCol: 5, colStyles: kpiCols });
  const uSorted = [...K.by.unidad].sort((a, b) => a.proact - b.proact);
  figure(C.stackedShareByGroup(uSorted, T), { ratio: 0.42, caption: 'Mix de mantenimiento por unidad (porcentaje de órdenes por tipo).', how: 'Cada barra suma 100%. Las unidades con mayor segmento correctivo (naranjo) son candidatas a revisar su plan de mantenimiento.',
    reading: uSorted.length > 1 ? `La unidad más reactiva es ${uSorted[0].key} (${pct(1 - uSorted[0].proact)} correctivo) y la más proactiva, ${uSorted[uSorted.length - 1].key} (${pct(uSorted[uSorted.length - 1].proact)} proactivo).` : '' });
  figure(C.multiLineTrend(K, T, [{ key: 'plan', name: 'Planificado', scale: 100 }, { key: 'onTime', name: 'Cumplimiento de plazo', scale: 100 }], { target: T0.plan.meta, targetLabel: 'Meta' }), { ratio: 0.34, caption: 'Trabajo planificado y cumplimiento de la fecha requerida, por mes.', reading: `En promedio, el ${pct(K.plan)} del trabajo fue planificado y el ${pct(K.onTime)} de las órdenes cerradas terminó a tiempo.` });
  const old = K.aging[K.aging.length - 1];
  figure(C.agingBars(K, T), { ratio: 0.32, caption: 'Antigüedad del backlog (órdenes pendientes por días desde su creación).', how: 'Un backlog sano se renueva y la mayoría de sus órdenes tiene pocas semanas. Muchas órdenes antiguas indican trabajo que no se programa o que no se cierra en el sistema.',
    reading: K.nPend ? `El ${pct(old.n / K.nPend)} de las órdenes pendientes supera los 90 días de antigüedad.` : 'No hay órdenes pendientes.' });
  figure(C.stackedShareByGroup(K.by.puesto, T, { field: 'hhByTipo', absolute: true, valueFmt: (v) => num(v, 0) + ' HH' }), { ratio: 0.3, caption: 'Horas de mano de obra por puesto de trabajo y tipo de mantenimiento.' });

  // =============== 6. COSTOS ===============
  h1('Costos de mantenimiento', { num: '6' });
  const ct = K.costTotal || 1;
  const ratio = K.costPerOT.Correctivo && K.costPerOT.Preventivo ? K.costPerOT.Correctivo / K.costPerOT.Preventivo : null;
  para(`El costo total del período es ${clp(K.costTotal)}: repuestos ${pct(K.comp.rep / ct)}, servicios externos ${pct(K.comp.ext / ct)} y mano de obra ${pct(K.comp.mo / ct)} (tarifa ${clp(Q.tarifa, 'unit')}/HH). Las órdenes correctivas concentran el ${pct(K.costCorr)} del gasto.` + (ratio ? ` Una OT correctiva cuesta en promedio ${num(ratio, 1)} veces una preventiva.` : ''));
  table(kpiHead, kpiRows(['costCorr']), { title: 'Indicador económico.', statusCol: 5, colStyles: kpiCols });
  const mMax = K.monthly.reduce((a, b) => (b.comp.rep + b.comp.ext + b.comp.mo > a.comp.rep + a.comp.ext + a.comp.mo ? b : a), K.monthly[0]);
  figure(C.costCompTrend(K, T), { ratio: 0.36, caption: 'Costo mensual por componente (CLP).', reading: mMax ? `El mes de mayor gasto fue ${mMax.label}, con ${clp(mMax.comp.rep + mMax.comp.ext + mMax.comp.mo)}.` : '' });
  figure(C.costByTipo(K, T, 'total'), { ratio: 0.3, caption: 'Costo total por tipo de mantenimiento.', how: 'En una organización proactiva el gasto preventivo y predictivo supera al correctivo.' });
  const uc = [...K.by.unidad].sort((a, b) => b.cost - a.cost);
  figure(C.stackedShareByGroup(uc, T, { field: 'costByTipo', absolute: true, valueFmt: clp }), { ratio: 0.38, caption: 'Costo por unidad y tipo de mantenimiento.', reading: uc.length ? `${uc[0].key} es la unidad de mayor gasto (${clp(uc[0].cost)}, ${pct(uc[0].cost / ct)} del total).` : '' });
  const ce = K.badByCost.slice(0, 10).map((e) => ({ ...e, key: e.equipo }));
  figure(C.simpleBars(ce, T, { metric: 'cost', fmt: clp, color: T.comp.ext }), { ratio: 0.42, caption: 'Diez equipos de mayor costo total.', reading: ce.length ? `Los tres primeros (${ce.slice(0, 3).map((e) => e.key).join(', ')}) suman ${pct(ce.slice(0, 3).reduce((s, e) => s + e.cost, 0) / ct)} del gasto.` : '' });

  // =============== 7. COMPARACIÓN ===============
  let secN = 7;
  if (opts.compare && compare.length >= 2) {
    h1('Comparación entre datasets', { num: String(secN) });
    para(`Se compararon ${compare.length} datasets con el mismo modelo, filtros y metas; cada uno sobre su propio período de datos. El mejor desempeño corresponde a ${[...compare].sort((a, b) => b.K.idm - a.K.idm)[0].name} y el más bajo a ${[...compare].sort((a, b) => a.K.idm - b.K.idm)[0].name}.`);
    figure(C.compareIdm(compare, T), { ratio: 0.26 + compare.length * 0.03, caption: 'IDM-7 por dataset; las líneas verticales marcan los umbrales de los niveles 2 a 5.' });
    figure(C.compareDims(compare, T), { ratio: 0.4, caption: 'Puntaje por dimensión y dataset.' });
    table(['Indicador', 'Meta', ...compare.map((x) => x.name)], [
      ['IDM-7 (nivel)', '>= 70', ...compare.map((x) => num(x.K.idm, 1) + ' (N' + x.K.level.n + ')')],
      ...KPI_ORDER.map((id) => [KPI_DEFS[id].short, targetText(id, T0), ...compare.map((x) => fmtKpi(id, x.K.kpi[id]))]),
    ], { title: 'Indicadores por dataset.', fontSize: 7.8, colStyles: Object.fromEntries(compare.map((_, i) => [i + 2, { halign: 'right' }])) });
    secN++;
  }

  // =============== CONCLUSIONES ===============
  h1('Conclusiones y recomendaciones', { num: String(secN) });
  para(N.verdict, { color: P.ink });
  const strong = KPI_ORDER.filter((id) => K.status[id] === 'ok').map((id) => KPI_DEFS[id].name.toLowerCase());
  const weak = KPI_ORDER.filter((id) => K.status[id] === 'crit').map((id) => KPI_DEFS[id].name.toLowerCase());
  const mid = KPI_ORDER.filter((id) => K.status[id] === 'warn').map((id) => KPI_DEFS[id].name.toLowerCase());
  const concl = [];
  if (strong.length) concl.push('Cumplen la meta: ' + strong.join(', ') + '.');
  if (mid.length) concl.push('Presentan brecha moderada: ' + mid.join(', ') + '.');
  if (weak.length) concl.push('Presentan brecha crítica: ' + weak.join(', ') + '.');
  if (wf.length) concl.push(`El patrón de falla dominante es ${K.weibullFleet.pattern ? K.weibullFleet.pattern.toLowerCase() : 'indeterminado'} (beta del parque ${num(K.weibullFleet.beta, 2)}), lo que orienta la estrategia: ${weibullStrategy(K.weibullFleet.pattern).charAt(0).toLowerCase() + weibullStrategy(K.weibullFleet.pattern).slice(1)}`);
  if (K.n80) concl.push(`La detención está concentrada: ${K.n80} equipos explican el 80% de las horas perdidas por fallas, por lo que un programa focalizado de malos actores tiene alto retorno.`);
  h2('Síntesis del diagnóstico');
  bullets(concl);
  h2('Plan de acción recomendado');
  table(['Prioridad', 'Ámbito', 'Acción', 'Indicadores'], N.recs.map((r) => [r.prio === 1 ? 'Alta' : r.prio === 2 ? 'Media' : 'Baja', r.area, r.text, r.kpis.map((k) => KPI_DEFS[k].short).join(', ')]),
    { colStyles: { 0: { cellWidth: 17 }, 1: { cellWidth: 26 }, 3: { cellWidth: 28 } }, fontSize: 8, title: 'Acciones recomendadas según las brechas detectadas.' });
  h2('Limitaciones');
  bullets([
    'El parque considerado son los equipos con al menos una orden en el período; los equipos sin registros no entran al cálculo de disponibilidad.',
    'La disponibilidad se basa en la detención registrada en las órdenes y no descuenta paradas programadas de planta ni tiempo sin demanda.',
    'En el análisis de Weibull se desconoce el tiempo previo a la primera falla observada (censura por la izquierda); se agregan tiempos de equipos distintos del mismo tipo.',
    'Las metas por defecto son referenciales de clase mundial para plantas de proceso; deben validarse con la estrategia y el contexto de la organización.',
    ...(Q.breaks.length ? ['La caída de volumen detectada desde ' + monthLabel(Q.breaks[0].m) + ' sugiere subregistro; las tendencias de ese tramo son menos confiables.'] : []),
  ], { size: 9 });

  // =============== ANEXOS ===============
  if (opts.annex) {
    h1('Definiciones, fórmulas y modelo de puntaje', { num: 'Anexo A' });
    para('Cada indicador se transforma en un puntaje de 0 a 100 por interpolación lineal entre su umbral crítico (0 puntos) y su meta (100 puntos). Para el backlog se usa una banda: dentro de ella vale 100; sobre la banda decrece hasta 0 en el umbral crítico y bajo ella decrece hasta 50. El puntaje de cada dimensión es el promedio de sus indicadores y el IDM-7 es el promedio ponderado de las dimensiones con dato. El semáforo distingue tres estados: cumple (100 puntos), brecha moderada (50 a 99) y brecha crítica (menos de 50).');
    table(['Indicador', 'Fórmula', 'Meta', 'Crítico', 'Referencia'], KPI_ORDER.map((id) => [KPI_DEFS[id].name, KPI_DEFS[id].formula, targetText(id, T0), critText(id, T0), KPI_DEFS[id].ref]),
      { title: 'Indicadores, fórmulas, metas y referencias normativas.', fontSize: 7.6, colStyles: { 0: { cellWidth: 34 }, 2: { cellWidth: 17 }, 3: { cellWidth: 17 }, 4: { cellWidth: 34 } } });
    table(['Dimensión', 'Pregunta que responde', 'Indicadores', 'Peso'], DIMENSIONS.map((d) => [d.name, d.q, d.kpis.map((k) => KPI_DEFS[k].short).join(', '), K.settings.weights[d.id] + '%']), { title: 'Dimensiones y ponderaciones del modelo IDM-7.', colStyles: { 3: { halign: 'right', cellWidth: 14 } } });
    table(['Nivel', 'Nombre', 'IDM-7', 'Descripción'], LEVELS.map((l) => ['Nivel ' + l.n, l.name, l.n === 5 ? '>= 85' : l.min + ' a < ' + l.max, l.desc]), { title: 'Escala de madurez del mantenimiento.', colStyles: { 0: { cellWidth: 16 }, 1: { cellWidth: 26 }, 2: { cellWidth: 20 } } });
    h2('Parámetros del cálculo');
    bullets([
      'Falla: toda orden correctiva (falla funcional según EN 13306).',
      `Período: ${periodTxt}; horas calendario ${num(K.H, 0)} h por equipo.`,
      `Ventana de reincidencia: ${K.settings.reincDias} días.`,
      `Tarifa de mano de obra: ${clp(Q.tarifa, 'unit')}/HH (${Q.tarifaInferida ? 'inferida de los datos' : 'valor por defecto'}).`,
      'Valores atípicos: cerco de Tukey Q3 + 3·RIC sobre el logaritmo de detención, horas, costo y duración.',
      'Weibull: regresión de rangos medianos X sobre Y, rangos ajustados de Johnson y aproximación de Bernard; intervalos menores a 1 h excluidos.',
      'Jack-knife: límites en el promedio de fallas por equipo con fallas y en la detención media por falla del parque (Knights, 2001).',
      `Filtros aplicados: ${filters}.`,
    ], { size: 8.8 });
    h1('Referencias', { num: 'Anexo B' });
    references.forEach((r) => para(r, { size: 9, after: 2.2 }));
  }

  // =============== CONTENIDO Y GUÍA (página 2) ===============
  doc.setPage(tocPage);
  y = TOP;
  font('bold', 19, P.ink); doc.text('Contenido', ML, y + 8); y += 13;
  line(ML, y, ML + CW, y, P.frame, 0.5); y += 6;
  for (const e of toc) {
    const isH1 = e.level === 1;
    font(isH1 ? 'bold' : 'normal', isH1 ? 10 : 9, isH1 ? P.ink : P.ink2);
    const xx = ML + (isH1 ? 0 : 6);
    const t = tx(e.title);
    doc.textWithLink(t, xx, y, { pageNumber: e.page });
    const tw3 = doc.getTextWidth(t);
    doc.setDrawColor(...P.line2); doc.setLineWidth(0.15);
    doc.setLineDashPattern([0.4, 1.2], 0); doc.line(xx + tw3 + 2, y - 0.8, ML + CW - 8, y - 0.8); doc.setLineDashPattern([], 0);
    doc.text(String(e.page), ML + CW, y, { align: 'right' });
    y += isH1 ? 6.4 : 5.2;
    if (y > 165) break;
  }
  y = Math.max(y + 6, 150);
  font('bold', 13, P.ink); doc.text('Cómo leer este informe', ML, y); y += 6;
  para('El informe evalúa el sistema de mantenimiento con el modelo IDM-7: doce indicadores agrupados en siete dimensiones (disponibilidad, confiabilidad, mantenibilidad, estrategia proactiva, planificación y control, costos y calidad de datos). Cada indicador se compara con una meta y un umbral crítico, y se resume en un puntaje de 0 a 100.', { size: 9.2 });
  const legendY = y + 1;
  [['ok', 'Cumple la meta (100 puntos).'], ['warn', 'Brecha moderada: avanza 50% o más entre el umbral crítico y la meta.'], ['crit', 'Brecha crítica: menos de 50 puntos; requiere acción prioritaria.']].forEach(([s, t2], i) => {
    statusShape(s, ML + 2, legendY + i * 6 + 1.6, 1.3);
    font('bold', 9, P.ink); doc.text(STL[s], ML + 6, legendY + i * 6 + 2.6);
    font('normal', 9, P.ink2); doc.text(tx(t2), ML + 36, legendY + i * 6 + 2.6);
  });
  y = legendY + 20;
  para('Las figuras incluyen un recuadro «Cómo leer» que explica el gráfico y una «Lectura» con el dato principal. Las secciones siguen el orden de un diagnóstico: primero la calidad de los datos, luego los resultados técnicos y económicos, y al final las conclusiones y el plan de acción.', { size: 9.2 });
  font('bold', 9, P.ink); doc.text('Escala de madurez', ML, y + 3); y += 6;
  LEVELS.forEach((l) => {
    font('bold', 8.6, l.n === K.level.n ? P.accent : P.ink); doc.text(tx('Nivel ' + l.n + ', ' + l.name + (l.n === 5 ? ' (>= 85)' : ' (' + l.min + ' a ' + l.max + ')')), ML, y + 3);
    font('normal', 8.4, P.ink2); const dl = doc.splitTextToSize(tx(l.desc), CW - 62); doc.text(dl, ML + 62, y + 3);
    y += Math.max(5.2, dl.length * lh(8.4) + 1.2);
  });

  // =============== ENCABEZADOS Y PIES ===============
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    if (i > 1) {
      font('normal', 7.6, P.muted);
      doc.text(tx(meta.title).slice(0, 80), ML, 13);
      doc.text(tx(ds.name), W - MR, 13, { align: 'right' });
      line(ML, 15, W - MR, 15, P.line, 0.2);
    }
    line(ML, 286, W - MR, 286, P.line, 0.2);
    font('normal', 7.6, P.muted);
    doc.text(tx('WebAppMant, informe emitido el ' + issuedTxt + (meta.author ? ' por ' + meta.author : '')), ML, 290.5);
    doc.text('Página ' + i + ' de ' + total, W - MR, 290.5, { align: 'right' });
  }
  doc.setProperties({ title: tx(meta.title), subject: tx('Desempeño de mantenimiento: ' + ds.name), author: tx(meta.author || 'WebAppMant'), keywords: 'mantenimiento, confiabilidad, Weibull, KPI, CMMS, IDM-7', creator: 'WebAppMant' });
  const fname = ('Informe_mantenimiento_' + ds.name).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').replace(/_+$/, '') + '_' + U.isoDay(Date.UTC(issued.getFullYear(), issued.getMonth(), issued.getDate())) + '.pdf';
  U.saveBlob(doc.output('blob'), fname);
  return fname;
}
