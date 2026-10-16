// ETL del dataset CMMS: lectura, mapeo de columnas, depuración y
// diagnóstico de calidad de datos (dimensiones DAMA / ISO 8000).
import { normKey, median, quantile, monthKey, monthRange, DAY, HOUR } from './util.js?v=1.0.8';

// Modelo canónico de datos. "aliases" se comparan normalizados (sin tildes,
// minúsculas, solo letras y números). El orden de los alias define la preferencia.
export const FIELDS = [
  { k: 'ot', label: 'Orden de trabajo (OT)', type: 'id', req: true, aliases: ['ot', 'orden', 'ordentrabajo', 'ordendetrabajo', 'nroot', 'numeroot', 'workorder', 'wo', 'order', 'aufnr'] },
  { k: 'aviso', label: 'Aviso', type: 'text', aliases: ['aviso', 'notificacion', 'notification', 'qmnum', 'nroaviso'] },
  { k: 'fc', label: 'Fecha de creación', type: 'date', aliases: ['fechacreacion', 'fcreacion', 'creacion', 'fechaaviso', 'createdon', 'erdat', 'fechaalta', 'fecha'] },
  { k: 'fi', label: 'Fecha de inicio', type: 'date', req: true, aliases: ['fechainicio', 'inicio', 'finicio', 'fechainicioreal', 'start', 'startdate', 'gstri', 'fechaini'] },
  { k: 'ff', label: 'Fecha de fin', type: 'date', aliases: ['fechafin', 'fin', 'ffin', 'fechatermino', 'termino', 'end', 'enddate', 'getri', 'fechacierre'] },
  { k: 'fn', label: 'Fecha de necesidad', type: 'date', aliases: ['fechanecesidad', 'necesidad', 'fecharequerida', 'requireddate', 'duedate', 'fechacompromiso'] },
  { k: 'fp', label: 'Fecha planificada', type: 'date', aliases: ['fechaplanificada', 'fechaprogramada', 'planificada', 'programada', 'plannedstart', 'gstrp'] },
  { k: 'equipo', label: 'Equipo (TAG)', type: 'text', req: true, aliases: ['equipo', 'tag', 'equipment', 'equnr', 'activo', 'asset', 'idequipo', 'codigoequipo'] },
  { k: 'unidad', label: 'Unidad', type: 'cat', aliases: ['unidad', 'unidadproceso', 'unit', 'planta', 'sistema'] },
  { k: 'area', label: 'Área', type: 'cat', aliases: ['area', 'zona', 'sector', 'areaproceso'] },
  { k: 'tipoEq', label: 'Tipo de equipo', type: 'cat', aliases: ['tipoequipo', 'claseequipo', 'equipmenttype', 'familia', 'tipoactivo', 'eqtyp', 'categoria'] },
  { k: 'crit', label: 'Criticidad', type: 'cat', aliases: ['criticidad', 'criticality', 'abckz', 'indicadorabc', 'clasecriticidad'] },
  { k: 'puesto', label: 'Puesto de trabajo', type: 'cat', aliases: ['puestotrabajo', 'puesto', 'especialidad', 'workcenter', 'arbpl', 'disciplina', 'cuadrilla'] },
  { k: 'tipo', label: 'Tipo de mantenimiento', type: 'cat', req: true, aliases: ['tipomantenimiento', 'tipomant', 'tipodemantenimiento', 'maintenancetype', 'tipoot', 'clasemantenimiento', 'ilart', 'tipo'] },
  { k: 'plan', label: 'Planificado', type: 'bool', aliases: ['planificado', 'planned', 'esplanificado', 'programado'] },
  { k: 'prio', label: 'Prioridad', type: 'cat', aliases: ['prioridad', 'priority', 'prio'] },
  { k: 'modo', label: 'Modo de falla', type: 'cat', aliases: ['modofalla', 'mododefalla', 'failuremode', 'modo'] },
  { k: 'causa', label: 'Causa', type: 'cat', aliases: ['causa', 'cause', 'causaraiz', 'causafalla'] },
  { k: 'sintoma', label: 'Síntoma', type: 'cat', aliases: ['sintoma', 'symptom', 'sintomas'] },
  { k: 'desc', label: 'Descripción', type: 'text', aliases: ['descripcion', 'description', 'texto', 'textobreve', 'ktext'] },
  { k: 'estado', label: 'Estado de la OT', type: 'cat', aliases: ['estado', 'estadoot', 'status', 'statususuario'] },
  { k: 'sys', label: 'Status de sistema', type: 'cat', aliases: ['statussistema', 'systemstatus', 'estadosistema'] },
  { k: 'clase', label: 'Clase de orden', type: 'cat', aliases: ['claseorden', 'clasedeorden', 'ordertype', 'auart'] },
  { k: 'dt', label: 'Tiempo de detención (h)', type: 'num', aliases: ['downtimeh', 'downtime', 'tiempodetencion', 'detencionh', 'horasdetencion', 'indisponibilidadh', 'paradah'] },
  { k: 'hh', label: 'Horas de mano de obra', type: 'num', aliases: ['horasmanoobra', 'hh', 'horashombre', 'manhours', 'horastrabajo', 'hhreales', 'laborhours'] },
  { k: 'crep', label: 'Costo repuestos (CLP)', type: 'money', aliases: ['costorepuestosclp', 'costorepuestos', 'repuestos', 'costomateriales', 'materialcost'] },
  { k: 'cext', label: 'Costo externo (CLP)', type: 'money', aliases: ['costoexternoclp', 'costoexterno', 'serviciosexternos', 'costoservicios', 'externalcost', 'costocontratista'] },
  { k: 'ctot', label: 'Costo total (CLP)', type: 'money', aliases: ['costototalclp', 'costototal', 'totalcost', 'costoreal', 'costo'] },
  { k: 'dur', label: 'Duración de la OT (h)', type: 'num', aliases: ['duracionoth', 'duracionot', 'duracion', 'duracionh', 'duration'] },
  { k: 'esp', label: 'Tiempo de espera (h)', type: 'num', aliases: ['tiempoesperah', 'tiempoespera', 'espera', 'waittime', 'tiempologistico'] },
  { k: 'rep', label: 'Tiempo de reparación (h)', type: 'num', aliases: ['tiemporeparacionh', 'tiemporeparacion', 'reparacion', 'repairtime', 'ttr'] },
  { k: 'nrep', label: 'Cantidad de repuestos', type: 'num', aliases: ['cantidadrepuestos', 'nrepuestos', 'cantrepuestos'] },
  { k: 'turno', label: 'Turno', type: 'cat', aliases: ['turno', 'shift'] },
  { k: 'ubic', label: 'Ubicación técnica', type: 'text', aliases: ['ubicaciontecnica', 'functionallocation', 'tplnr'] },
  { k: 'centro', label: 'Centro', type: 'cat', aliases: ['centro', 'werks', 'plant', 'centroplanificacion'] },
  { k: 'soc', label: 'Sociedad', type: 'cat', aliases: ['sociedad', 'company', 'bukrs'] },
];
export const FIELD = Object.fromEntries(FIELDS.map((f) => [f.k, f]));

// Campos clave para la dimensión de completitud. "cond" restringe el denominador.
const KEY_FIELDS = [
  { k: 'ot' }, { k: 'fc' }, { k: 'fi' }, { k: 'ff', cond: (r) => r.estado === 'Cerrada' },
  { k: 'fn' }, { k: 'equipo' }, { k: 'unidad' }, { k: 'tipoEq' }, { k: 'crit' }, { k: 'tipo' },
  { k: 'plan' }, { k: 'estado' }, { k: 'dt' }, { k: 'hh' }, { k: 'ctot' },
  { k: 'modo', cond: (r) => r.tipo === 'Correctivo' }, { k: 'causa', cond: (r) => r.tipo === 'Correctivo' },
  { k: 'aviso', cond: (r) => r.tipo === 'Correctivo' },
];

// ---------------- lectura de archivos ----------------
export async function readFile(file) {
  const name = file.name || 'dataset';
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'xlsx' || ext === 'xls' || ext === 'ods') {
    await ensureXLSX();
    const buf = await file.arrayBuffer();
    const wb = window.XLSX.read(buf, { type: 'array', cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    return { aoa, sheet: wb.SheetNames[0] };
  }
  const text = await file.text();
  return { aoa: parseCSV(text) };
}
export function parseCSV(text) {
  const res = window.Papa.parse(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy', delimitersToGuess: [',', ';', '\t', '|'] });
  return res.data;
}
let xlsxPromise = null;
function ensureXLSX() {
  if (window.XLSX) return Promise.resolve();
  if (!xlsxPromise) {
    xlsxPromise = new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = ok;
      s.onerror = () => { xlsxPromise = null; fail(new Error('No se pudo cargar el lector de Excel. Revisa tu conexión o guarda el archivo como CSV.')); };
      document.head.appendChild(s);
    });
  }
  return xlsxPromise;
}

// Ubica la fila de encabezados (la primera con al menos 3 celdas no vacías).
export function headerRow(aoa) {
  for (let i = 0; i < Math.min(aoa.length, 20); i++) {
    const nonEmpty = aoa[i].filter((c) => String(c ?? '').trim() !== '').length;
    if (nonEmpty >= 3) return i;
  }
  return 0;
}
export function autoMap(headers) {
  const keys = headers.map((h) => normKey(String(h ?? '').replace(/^'/, '')));
  const map = {};
  const used = new Set();
  for (const f of FIELDS) {
    for (const a of [normKey(f.k), ...f.aliases.map(normKey)]) {
      const idx = keys.findIndex((h, i) => !used.has(i) && h === a);
      if (idx >= 0) { map[f.k] = idx; used.add(idx); break; }
    }
  }
  return map;
}
export function missingRequired(map) {
  // El tipo de mantenimiento puede deducirse de la clase de orden (PM01/PM02/PM03).
  return FIELDS.filter((f) => f.req && map[f.k] == null && !(f.k === 'tipo' && map.clase != null)).map((f) => f.k);
}

// ---------------- normalización de valores ----------------
function parseNum(v, money) {
  if (v === '' || v == null) return { v: null };
  if (typeof v === 'number') return { v: isFinite(v) ? v : null, bad: !isFinite(v) };
  let t = String(v).replace(/\s|\$/g, '');
  let fix = null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) { t = t.replace(/\./g, '').replace(',', '.'); fix = 'miles'; }
  else if (money && /^-?\d{1,3}(,\d{3})+$/.test(t)) { t = t.replace(/,/g, ''); fix = 'miles'; }
  else if (/^-?\d+,\d+$/.test(t)) { t = t.replace(',', '.'); fix = 'coma'; }
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) { t = t.replace(/,/g, ''); fix = 'miles'; }
  const n = Number(t);
  if (t === '' || !isFinite(n)) return { v: null, bad: true };
  return { v: n, fix };
}
function parseDate(v) {
  if (v === '' || v == null) return { v: null };
  if (typeof v === 'number') {
    // Número de serie de Excel (días desde 1899-12-30).
    if (v > 20000 && v < 80000) return { v: Math.round((v - 25569) * DAY) };
    return { v: null, bad: true };
  }
  const s = String(v).trim();
  let m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) {
    let d = +m[1], mo = +m[2], y = +m[3];
    let fix = null;
    if (y < 100) y += 2000;
    if (mo > 12 && d <= 12) { [d, mo] = [mo, d]; fix = 'mes-dia'; }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return { v: null, bad: true };
    return { v: Date.UTC(y, mo - 1, d, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)), fix };
  }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m) return { v: Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) };
  return { v: null, bad: true };
}
function canonTipo(s) {
  const k = normKey(s);
  if (!k) return null;
  if (k.startsWith('corr') || k.includes('correct') || k === 'pm01' || k === 'cm' || k.startsWith('emerg') || k.startsWith('reactiv') || k.startsWith('falla')) return 'Correctivo';
  if (k.startsWith('pred') || k === 'pm03' || k.includes('condicion') || k === 'cbm' || k.startsWith('inspec') || k.startsWith('sintomat')) return 'Predictivo';
  if (k.startsWith('prev') || k === 'pm02' || k === 'pm' || k.startsWith('sistemat') || k.startsWith('program')) return 'Preventivo';
  return 'Otro';
}
function canonClase(s) {
  const k = normKey(s);
  return k === 'pm01' ? 'Correctivo' : k === 'pm02' ? 'Preventivo' : k === 'pm03' ? 'Predictivo' : null;
}
function canonBool(s) {
  const k = normKey(s);
  if (!k) return null;
  if (['si', 's', 'yes', 'y', '1', 'true', 'x', 'verdadero', 'planificado'].includes(k)) return true;
  if (['no', 'n', '0', 'false', 'falso', 'noplanificado'].includes(k)) return false;
  return undefined;
}
function canonEstado(s) {
  const k = normKey(s);
  if (!k) return null;
  if (/^(cerr|teco|clsd|close|finaliz|complet|termin|liquid)/.test(k)) return 'Cerrada';
  if (/^(enejec|ejec|pcnf|cnf|progres|encurso|inici)/.test(k)) return 'En ejecución';
  if (/^(abier|rel|crtd|open|pend|liber|nuev|emit)/.test(k)) return 'Abierta';
  return undefined;
}
function canonCrit(s) {
  const k = normKey(s);
  if (!k) return null;
  if (['a', '1', 'alta', 'critico', 'critica', 'high'].includes(k)) return 'A';
  if (['b', '2', 'media', 'medio', 'semicritico', 'medium'].includes(k)) return 'B';
  if (['c', '3', 'baja', 'bajo', 'nocritico', 'low'].includes(k)) return 'C';
  return undefined;
}
function canonPrio(s) {
  const k = normKey(s);
  if (!k) return null;
  if (k === 'muyalta' || k.startsWith('emerg') || k === 'urgente' || k === 'critica') return 'Muy alta';
  if (k === 'alta' || k === 'high') return 'Alta';
  if (k === 'media' || k === 'medium' || k === 'normal') return 'Media';
  if (k === 'baja' || k === 'low') return 'Baja';
  return undefined;
}
function sysToEstado(s) {
  const k = normKey(s);
  if (!k) return null;
  if (k.includes('teco') || k.includes('clsd') || k.includes('cerr')) return 'Cerrada';
  if (k.includes('pcnf') || k.includes('cnf')) return 'En ejecución';
  if (k.includes('rel') || k.includes('crtd') || k.includes('lib')) return 'Abierta';
  return null;
}
function titleCase(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// Unifica variantes de mayúsculas/espacios de una categoría libre: se queda
// con la escritura más frecuente para cada clave normalizada.
function harmonize(recs, key, q) {
  const groups = new Map();
  for (const r of recs) {
    const v = r[key];
    if (!v) continue;
    const nk = normKey(v);
    let g = groups.get(nk);
    if (!g) groups.set(nk, (g = new Map()));
    g.set(v, (g.get(v) || 0) + 1);
  }
  const canon = new Map();
  for (const [nk, g] of groups) {
    let best = null, bc = -1;
    for (const [v, c] of g) if (c > bc) { best = v; bc = c; }
    canon.set(nk, best);
  }
  for (const r of recs) {
    const v = r[key];
    if (!v) continue;
    const c = canon.get(normKey(v));
    if (c !== v) { noteNorm(q, key, v, c); r[key] = c; }
  }
}
// Para dominios controlados, la escritura "estándar" es la dominante en el
// propio dataset (p. ej. CERRADA); solo las variantes minoritarias cuentan.
function tally(q, field, from, to) {
  const k = field + '' + to;
  let g = q.tallies.get(k);
  if (!g) q.tallies.set(k, (g = new Map()));
  g.set(from, (g.get(from) || 0) + 1);
}
function finalizeTallies(q) {
  for (const [k, g] of q.tallies) {
    const [field, to] = k.split('');
    let best = null, bc = -1;
    for (const [v, c] of g) if (c > bc) { best = v; bc = c; }
    for (const [v, c] of g) if (v !== best) for (let i = 0; i < c; i++) noteNorm(q, field, v, to);
  }
}
function noteNorm(q, field, from, to) {
  const k = field + '\u0001' + from + '\u0001' + to;
  q.normMap.set(k, (q.normMap.get(k) || 0) + 1);
  q.nonStandard++;
}

// Reglas de consistencia entre campos (cada una pesa igual en la dimensión).
export const RULES = [
  { id: 'finIni', dim: 'Consistencia', name: 'Fecha de fin anterior a la de inicio', sev: 'error', treat: 'Duración excluida del cálculo' },
  { id: 'iniCre', dim: 'Consistencia', name: 'Inicio anterior a la creación de la OT', sev: 'aviso', treat: 'Se conserva; tiempo de espera excluido' },
  { id: 'planCre', dim: 'Consistencia', name: 'Fecha planificada anterior a la creación', sev: 'aviso', treat: 'Se conserva; la fecha planificada no se usa en indicadores' },
  { id: 'cerradaSinFin', dim: 'Consistencia', name: 'OT cerrada sin fecha de fin', sev: 'error', treat: 'Excluida del cumplimiento de plazo' },
  { id: 'abiertaConFin', dim: 'Consistencia', name: 'OT abierta con fecha de fin', sev: 'aviso', treat: 'Se conserva como pendiente' },
  { id: 'dtSpan', dim: 'Consistencia', name: 'Detención mayor que espera + duración de la OT', sev: 'aviso', treat: 'Se conserva; revisar registro de detención' },
  { id: 'costo', dim: 'Consistencia', name: 'Costo total distinto de la suma de componentes', sev: 'aviso', treat: 'Se usa el costo total informado' },
  { id: 'status', dim: 'Consistencia', name: 'Estado de la OT distinto del status de sistema', sev: 'aviso', treat: 'Prevalece el estado de la OT' },
  { id: 'clase', dim: 'Consistencia', name: 'Tipo de mantenimiento distinto de la clase de orden', sev: 'aviso', treat: 'Prevalece el tipo de mantenimiento' },
  { id: 'sinModo', dim: 'Completitud', name: 'Correctiva sin modo de falla', sev: 'aviso', treat: 'Se agrupa como «Sin registrar»' },
];

// ---------------- proceso principal ----------------
export function processDataset(aoa, map, opts = {}) {
  const tarifaDefault = opts.tarifa || 22000;
  const hr = opts.headerIndex ?? headerRow(aoa);
  const headers = aoa[hr] || [];
  const rawRows = aoa.slice(hr + 1).filter((row) => row.some((c) => String(c ?? '').trim() !== ''));
  const q = {
    rawRows: rawRows.length, apostrophes: 0, trimmed: 0, nonStandard: 0, invalid: 0, cells: 0,
    decComma: 0, thousands: 0, dateSwap: 0, normMap: new Map(), invalidBy: {}, negatives: 0,
    dupExact: 0, dupOT: 0, tallies: new Map(), rules: Object.fromEntries(RULES.map((r) => [r.id, { n: 0, den: 0 }])),
    mapped: Object.keys(map), headers, unmapped: [],
  };
  const used = new Set(Object.values(map));
  q.unmapped = headers.map((h, i) => (used.has(i) ? null : String(h ?? '').replace(/^'/, ''))).filter(Boolean);
  const bad = (k) => { q.invalid++; q.invalidBy[k] = (q.invalidBy[k] || 0) + 1; };

  // 1) Unicidad: filas idénticas.
  const seen = new Set();
  const rows = [];
  for (const row of rawRows) {
    const sig = Object.values(map).map((i) => String(row[i] ?? '').replace(/^'/, '').trim()).join('\u0001');
    if (seen.has(sig)) { q.dupExact++; continue; }
    seen.add(sig);
    rows.push(row);
  }

  // 2) Limpieza y tipificación.
  const recs = [];
  for (const row of rows) {
    const r = { flags: 0 };
    for (const f of FIELDS) {
      const idx = map[f.k];
      if (idx == null) { r[f.k] = null; continue; }
      let v = row[idx];
      if (typeof v === 'string') {
        if (v.startsWith("'")) { v = v.slice(1); q.apostrophes++; }
        const t = v.trim().replace(/\s{2,}/g, ' ');
        if (t !== v) q.trimmed++;
        v = t;
      }
      if (v === '' || v == null) { r[f.k] = null; continue; }
      q.cells++;
      if (f.type === 'num' || f.type === 'money') {
        const p = parseNum(v, f.type === 'money');
        if (p.bad) bad(f.k);
        if (p.fix === 'coma') { q.decComma++; q.nonStandard++; }
        if (p.fix === 'miles') { q.thousands++; q.nonStandard++; }
        if (p.v != null && p.v < 0) { q.negatives++; bad(f.k); p.v = null; }
        r[f.k] = p.v;
      } else if (f.type === 'date') {
        const p = parseDate(v);
        if (p.bad) bad(f.k);
        if (p.fix) { q.dateSwap++; q.nonStandard++; }
        r[f.k] = p.v;
      } else if (f.type === 'bool') {
        const b = canonBool(v);
        if (b === undefined) { bad(f.k); r[f.k] = null; }
        else { r[f.k] = b; tally(q, f.k, String(v), b ? 'Sí' : 'No'); }
      } else {
        r[f.k] = typeof v === 'number' ? String(v) : v;
      }
    }
    // Categorías con dominio controlado.
    const rawTipo = r.tipo;
    if (rawTipo != null) {
      const c = canonTipo(rawTipo);
      if (c === 'Otro') bad('tipo');
      else tally(q, 'tipo', rawTipo, c);
      r.tipo = c;
    }
    const fromClase = r.clase != null ? canonClase(r.clase) : null;
    if (r.tipo == null && fromClase) r.tipo = fromClase;
    if (r.tipo == null) r.tipo = 'Otro';
    r._clase = fromClase;
    if (r.estado != null) {
      const c = canonEstado(r.estado);
      if (c === undefined) { bad('estado'); r.estado = null; }
      else { tally(q, 'estado', r.estado, c); r.estado = c; }
    }
    const sysE = r.sys != null ? sysToEstado(r.sys) : null;
    if (r.estado == null) r.estado = sysE || (r.ff != null ? 'Cerrada' : 'Abierta');
    r._sysE = sysE;
    if (r.crit != null) {
      const c = canonCrit(r.crit);
      if (c === undefined) { bad('crit'); r.crit = null; }
      else { tally(q, 'crit', r.crit, c); r.crit = c; }
    }
    if (r.prio != null) {
      const c = canonPrio(r.prio);
      if (c === undefined) { r.prio = titleCase(r.prio.toLowerCase()); }
      else { tally(q, 'prio', r.prio, c); r.prio = c; }
    }
    if (r.turno != null) {
      const c = titleCase(r.turno.toLowerCase());
      tally(q, 'turno', r.turno, c);
      r.turno = c;
    }
    recs.push(r);
  }
  finalizeTallies(q);
  for (const k of ['unidad', 'area', 'tipoEq', 'puesto', 'modo', 'causa', 'sintoma', 'equipo']) harmonize(recs, k, q);

  // 3) OT repetidas con contenido distinto: se conserva la primera.
  const byOT = new Map();
  const uniq = [];
  for (const r of recs) {
    if (r.ot == null) { uniq.push(r); continue; }
    if (byOT.has(r.ot)) { q.dupOT++; continue; }
    byOT.set(r.ot, r);
    uniq.push(r);
  }

  // 4) Tarifa de mano de obra inferida: (total − repuestos − externo) / HH.
  const ratios = [];
  for (const r of uniq) {
    if (r.ctot != null && r.hh > 0) {
      const mo = r.ctot - (r.crep || 0) - (r.cext || 0);
      if (mo > 0) ratios.push(mo / r.hh);
    }
  }
  const tarifaInf = ratios.length >= 20 ? median(ratios) : null;
  const tarifa = tarifaInf || tarifaDefault;

  // 5) Derivados y reglas de consistencia.
  const R = q.rules;
  const F = { finIni: 1, iniCre: 2, planCre: 4, cerradaSinFin: 8, abiertaConFin: 16, dtSpan: 32, costo: 64, status: 128, clase: 256, sinModo: 512, outlier: 1024 };
  for (const r of uniq) {
    r.t = r.fc ?? r.fi; // instante de referencia (creación del aviso/OT)
    if (r.fi != null && r.ff != null) {
      R.finIni.den++;
      if (r.ff < r.fi) { R.finIni.n++; r.flags |= F.finIni; }
    }
    if (r.dur == null && r.fi != null && r.ff != null && !(r.flags & F.finIni)) r.dur = (r.ff - r.fi) / HOUR;
    if (r.fi != null && r.fc != null) {
      R.iniCre.den++;
      if (r.fi < r.fc - 60000) { R.iniCre.n++; r.flags |= F.iniCre; }
    }
    if (r.esp == null && r.fi != null && r.fc != null && !(r.flags & F.iniCre)) r.esp = (r.fi - r.fc) / HOUR;
    if (r.fp != null && r.fc != null) {
      R.planCre.den++;
      if (r.fp < r.fc - 60000) { R.planCre.n++; r.flags |= F.planCre; }
    }
    if (r.estado === 'Cerrada') { R.cerradaSinFin.den++; if (r.ff == null) { R.cerradaSinFin.n++; r.flags |= F.cerradaSinFin; } }
    if (r.estado === 'Abierta' && map.ff != null) { R.abiertaConFin.den++; if (r.ff != null) { R.abiertaConFin.n++; r.flags |= F.abiertaConFin; } }
    if (r.dt != null && (r.dur != null || r.esp != null)) {
      R.dtSpan.den++;
      if (r.dt > (r.dur || 0) + (r.esp || 0) + 0.05) { R.dtSpan.n++; r.flags |= F.dtSpan; }
    }
    if (r.ctot == null && (r.crep != null || r.cext != null || r.hh != null)) {
      r.ctot = (r.crep || 0) + (r.cext || 0) + (r.hh || 0) * tarifa;
      r._ctotDerived = true;
    } else if (r.ctot != null && (r.crep != null || r.cext != null) && r.hh != null) {
      R.costo.den++;
      const exp = (r.crep || 0) + (r.cext || 0) + r.hh * tarifa;
      if (Math.abs(r.ctot - exp) > Math.max(1000, 0.01 * r.ctot)) { R.costo.n++; r.flags |= F.costo; }
    }
    if (r.ctot != null) r.cmo = Math.max(0, r.ctot - (r.crep || 0) - (r.cext || 0));
    if (r._sysE) { R.status.den++; if (r._sysE !== r.estado) { R.status.n++; r.flags |= F.status; } }
    if (r._clase && r.tipo !== 'Otro') { R.clase.den++; if (r._clase !== r.tipo) { R.clase.n++; r.flags |= F.clase; } }
    if (r.tipo === 'Correctivo') { R.sinModo.den++; if (!r.modo) { R.sinModo.n++; r.flags |= F.sinModo; } }
    delete r._sysE; delete r._clase;
  }

  // 6) Plausibilidad: valores atípicos extremos. Tiempos y costos tienen cola
  // larga (aprox. log-normal), por eso el cerco de Tukey (Q3 + 3·RIC) se
  // aplica sobre el logaritmo de los valores positivos.
  const fences = {};
  let outlierRows = 0;
  for (const k of ['dt', 'hh', 'ctot', 'dur']) {
    const vals = uniq.map((r) => r[k]).filter((v) => v != null && v > 0).map(Math.log).sort((a, b) => a - b);
    if (vals.length < 30) continue;
    const q1 = quantile(vals, 0.25), q3 = quantile(vals, 0.75);
    fences[k] = { q1: Math.exp(q1), q3: Math.exp(q3), hi: Math.exp(q3 + 3 * (q3 - q1)), n: 0 };
  }
  for (const r of uniq) {
    let o = false;
    for (const k in fences) if (r[k] != null && r[k] > fences[k].hi) { fences[k].n++; o = true; }
    if (o) { r.flags |= F.outlier; outlierRows++; }
  }

  // 7) Volumen mensual: rupturas que sugieren subregistro.
  const tms = uniq.map((r) => r.t).filter((v) => v != null);
  let tMin = Infinity, tMax = -Infinity;
  for (const v of tms) { if (v < tMin) tMin = v; if (v > tMax) tMax = v; }
  const months = isFinite(tMin) ? monthRange(tMin, tMax + 1) : [];
  const mCount = Object.fromEntries(months.map((m) => [m, 0]));
  for (const v of tms) mCount[monthKey(v)]++;
  const volume = months.map((m) => ({ m, n: mCount[m] }));
  // La línea base es la mediana de los últimos seis meses no marcados, para
  // que un subregistro prolongado no se convierta en la nueva normalidad.
  const breaks = [];
  const normal = [];
  volume.forEach((p, i) => {
    const base = normal.length >= 3 ? median(normal.slice(-6)) : null;
    if (i >= 3 && base > 0 && p.n < 0.5 * base) breaks.push({ m: p.m, n: p.n, base, kind: 'caída' });
    else if (i >= 3 && base > 0 && p.n > 2 * base) breaks.push({ m: p.m, n: p.n, base, kind: 'alza' });
    else normal.push(p.n);
  });
  const partial = [];
  if (months.length) {
    const first = months[0], last = months[months.length - 1];
    const dFirst = new Date(tMin).getUTCDate();
    if (dFirst > 7) partial.push({ m: first, note: 'inicia el día ' + dFirst });
    const dLast = new Date(tMax).getUTCDate();
    const dim = new Date(Date.UTC(new Date(tMax).getUTCFullYear(), new Date(tMax).getUTCMonth() + 1, 0)).getUTCDate();
    if (dLast < dim - 6) partial.push({ m: last, note: 'termina el día ' + dLast });
  }

  // 8) Completitud por campo.
  const completeness = KEY_FIELDS.map(({ k, cond }) => {
    const pool = cond ? uniq.filter(cond) : uniq;
    if (map[k] == null && !(k === 'tipo' && map.clase != null) && !(k === 'estado' && map.sys != null)) return { k, label: FIELD[k].label, present: false, value: 0, den: pool.length };
    const ok = pool.filter((r) => r[k] != null && r[k] !== '').length;
    return { k, label: FIELD[k].label, present: true, value: pool.length ? ok / pool.length : 1, den: pool.length, missing: pool.length - ok };
  });

  // 9) Índice de calidad de datos (DQI).
  const ruleScores = RULES.filter((x) => x.dim === 'Consistencia' && R[x.id].den > 0).map((x) => 1 - R[x.id].n / R[x.id].den);
  const dims = {
    completitud: completeness.reduce((s, c) => s + c.value, 0) / completeness.length,
    validez: q.cells ? Math.max(0, 1 - (q.invalid + 0.5 * q.nonStandard) / q.cells) : 1,
    consistencia: ruleScores.length ? ruleScores.reduce((a, b) => a + b, 0) / ruleScores.length : 1,
    unicidad: q.rawRows ? 1 - (q.dupExact + q.dupOT) / q.rawRows : 1,
    plausibilidad: uniq.length ? 1 - outlierRows / uniq.length : 1,
  };
  const W = { completitud: 0.25, validez: 0.2, consistencia: 0.25, unicidad: 0.15, plausibilidad: 0.15 };
  const dqi = Object.keys(W).reduce((s, k) => s + W[k] * dims[k], 0);

  const quality = {
    ...q, normMap: undefined, tallies: undefined,
    normalizations: [...q.normMap.entries()].map(([k, n]) => { const [field, from, to] = k.split('\u0001'); return { field, from, to, n }; }).sort((a, b) => b.n - a.n),
    tarifa, tarifaInferida: !!tarifaInf, fences, outlierRows, volume, breaks, partial, completeness, dims, dqi, weights: W,
    validRows: uniq.length, flagBits: F,
  };
  const meta = {
    tMin: isFinite(tMin) ? tMin : null, tMax: isFinite(tMax) ? tMax : null,
    nEquipos: new Set(uniq.map((r) => r.equipo).filter(Boolean)).size,
    sociedad: mostCommon(uniq.map((r) => r.soc)), centros: [...new Set(uniq.map((r) => r.centro).filter(Boolean))],
    unidades: [...new Set(uniq.map((r) => r.unidad).filter(Boolean))].sort(),
    map, headers: headers.map((h) => String(h ?? '').replace(/^'/, '')),
  };
  return { records: uniq, quality, meta };
}
function mostCommon(a) {
  const m = new Map();
  for (const v of a) if (v) m.set(v, (m.get(v) || 0) + 1);
  let best = null, bc = 0;
  for (const [v, c] of m) if (c > bc) { best = v; bc = c; }
  return best;
}

// Plantilla CSV con las columnas reconocidas por la aplicación.
export function templateCSV() {
  const cols = ['OT', 'Aviso', 'Fecha_creación', 'Fecha_inicio', 'Fecha_fin', 'Equipo', 'Unidad', 'Área', 'Tipo_equipo', 'Criticidad', 'Puesto_trabajo', 'Tipo_mantenimiento', 'Planificado', 'Prioridad', 'Modo_falla', 'Causa', 'Síntoma', 'Descripción', 'Estado', 'Downtime_h', 'Horas_mano_obra', 'Costo_repuestos_CLP', 'Costo_externo_CLP', 'Costo_total_CLP', 'Duración_OT_h', 'Clase_orden', 'Status_sistema', 'Fecha_necesidad', 'Fecha_planificada', 'Tiempo_espera_h', 'Tiempo_reparacion_h', 'Cantidad_repuestos', 'Turno'];
  const rows = [
    ['4500001', '8800001', '01-01-2025 00:00', '01-01-2025 04:00', '01-01-2025 16:00', 'U-400-K-004', 'U-400', 'Servicios Auxiliares', 'Compresor', 'A', 'Rotativos', 'Correctivo', 'No', 'Alta', 'Vibración alta', 'Desalineación', 'Ruido anormal informado por operación', 'Correctivo sobre U-400-K-004', 'CERRADA', '8.0', '12.0', '1100000', '350000', '1714000', '12.0', 'PM01', 'TECO', '04-01-2025 00:00', '01-01-2025 02:00', '4.0', '8.4', '5', 'Noche'],
    ['4500002', '', '02-01-2025 00:00', '02-01-2025 08:00', '02-01-2025 14:00', 'U-100-P-029', 'U-100', 'Destilación Atmosférica', 'Bomba centrífuga', 'B', 'Rotativos', 'Preventivo', 'Sí', 'Media', '', '', 'Tarea programada según plan', 'Preventivo programado de U-100-P-029', 'CERRADA', '1.5', '5.7', '458779', '161207', '745386', '6.0', 'PM02', 'TECO', '05-01-2025 00:00', '02-01-2025 08:00', '8.0', '4.2', '2', 'Día'],
    ['4500003', '', '03-01-2025 00:00', '03-01-2025 10:00', '', 'U-500-CV-015', 'U-500', 'Parque de Tanques', 'Válvula de control', 'C', 'Instrumentación', 'Predictivo', 'Sí', 'Media', '', '', 'Inspección por condición', 'Ruta de condición de U-500-CV-015', 'EN EJECUCIÓN', '0.0', '3.3', '0', '0', '72600', '', 'PM03', 'PCNF', '06-01-2025 00:00', '03-01-2025 10:00', '10.0', '', '0', 'Tarde'],
  ];
  const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  return '﻿' + [cols, ...rows].map((r) => r.map(q).join(',')).join('\r\n');
}

export function recordsToCSV(recs) {
  const cols = ['ot', 'aviso', 'fc', 'fi', 'ff', 'fn', 'equipo', 'unidad', 'area', 'tipoEq', 'crit', 'puesto', 'tipo', 'plan', 'prio', 'modo', 'causa', 'sintoma', 'estado', 'dt', 'hh', 'crep', 'cext', 'cmo', 'ctot', 'dur', 'esp', 'rep', 'turno', 'flags'];
  const head = cols.map((c) => (FIELD[c] ? FIELD[c].label : c === 'cmo' ? 'Costo mano de obra (CLP)' : 'Banderas de calidad'));
  const fmt = (c, v) => {
    if (v == null) return '';
    if (['fc', 'fi', 'ff', 'fn'].includes(c)) { const d = new Date(v); return d.toISOString().slice(0, 16).replace('T', ' '); }
    if (c === 'plan') return v ? 'Sí' : 'No';
    return v;
  };
  const q = (s) => { const t = String(s); return /[",;\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  return '﻿' + [head.map(q).join(','), ...recs.map((r) => cols.map((c) => q(fmt(c, r[c]))).join(','))].join('\r\n');
}
