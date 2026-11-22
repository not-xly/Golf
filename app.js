'use strict';
// Tarjeta de golf: par y dificultad por hoyo (datos del campo) y golpes de la ronda.
const KEY = 'golf-v1';
const HOLES = 18;
const MAX_HCP = 9;

const blankHole = () => ({ par: null, hcp: null, g: null, s: null, p: null });

function load() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return { course: '', holes: Array.from({ length: HOLES }, blankHole) };
  try {
    const d = JSON.parse(raw);
    const holes = Array.from({ length: HOLES }, (_, i) => Object.assign(blankHole(), (d.holes || [])[i]));
    return { course: d.course || '', holes };
  } catch (e) {
    // No sobrescribir datos que no se han podido leer
    localStorage.setItem(KEY + '-backup-' + Date.now(), raw);
    alert('No se pudieron leer los datos guardados. Se ha hecho una copia de seguridad.');
    return { course: '', holes: Array.from({ length: HOLES }, blankHole) };
  }
}

const state = load();
const save = () => localStorage.setItem(KEY, JSON.stringify(state));
const $ = (id) => document.getElementById(id);
const rowsEl = $('rows');

const sum = (from, to, f) => {
  let t = 0, any = false;
  for (let i = from; i < to; i++) { const v = state.holes[i][f]; if (v != null) { t += v; any = true; } }
  return any ? t : null;
};
const show = (v) => (v == null ? '' : String(v));
const signed = (d) => (d === 0 ? 'E' : d > 0 ? '+' + d : String(d));

function cellInput(i, f) {
  const inp = document.createElement('input');
  inp.className = 'cell';
  inp.type = 'text';
  inp.inputMode = 'numeric';
  inp.pattern = '[0-9]*';
  inp.maxLength = 2;
  inp.autocomplete = 'off';
  inp.dataset.i = i; inp.dataset.f = f;
  inp.value = show(state.holes[i][f]);
  inp.setAttribute('aria-label', `Hoyo ${i + 1} ${f}`);
  return inp;
}

function holeRow(i) {
  const tr = document.createElement('tr');
  tr.dataset.i = i;
  const h = document.createElement('td'); h.className = 'hole'; h.textContent = i + 1; tr.append(h);
  const par = document.createElement('td'); par.append(cellInput(i, 'par')); tr.append(par);
  const hc = document.createElement('td');
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'cell hcp'; b.dataset.hcp = i;
  hc.append(b); tr.append(hc);
  for (const f of ['g', 's', 'p']) {
    const td = document.createElement('td');
    if (f === 'g') td.className = 'split';
    td.append(cellInput(i, f)); tr.append(td);
  }
  return tr;
}

function totalRow(label, cls) {
  const tr = document.createElement('tr');
  tr.className = 'total ' + cls;
  tr.innerHTML = `<td class="lbl">${label}</td><td data-t="par"></td><td></td>
    <td class="split" data-t="g"></td><td data-t="s"></td><td data-t="p"></td>`;
  return tr;
}

const totals = [];
function build() {
  rowsEl.textContent = '';
  for (let i = 0; i < HOLES; i++) {
    rowsEl.append(holeRow(i));
  }
  const all = totalRow('Total', 'grand'); all.range = [0, 18]; totals.push(all); rowsEl.append(all);
  $('course').value = state.course;
}

function refreshRow(i) {
  const h = state.holes[i];
  const tr = rowsEl.querySelector(`tr[data-i="${i}"]`);
  // Los golpes cortos más los putts no pueden superar el total de golpes
  const bad = h.g != null && (h.s || 0) + (h.p || 0) > h.g;
  for (const f of ['g', 's', 'p']) tr.querySelector(`[data-f="${f}"]`).classList.toggle('warn', bad);
  const b = tr.querySelector('[data-hcp]');
  b.textContent = h.hcp == null ? '–' : h.hcp;
  b.classList.toggle('empty', h.hcp == null);
  b.setAttribute('aria-label', `Dificultad hoyo ${i + 1}: ${h.hcp == null ? 'sin asignar' : h.hcp}`);
}

function refreshTotals() {
  for (const t of totals) {
    for (const f of ['par', 'g', 's', 'p']) t.querySelector(`[data-t="${f}"]`).textContent = show(sum(t.range[0], t.range[1], f));
  }
  const g = sum(0, HOLES, 'g');
  $('sumStrokes').textContent = g == null ? '–' : g;
  const par = sum(0, HOLES, 'par');
  $('sumPar').textContent = par == null ? '–' : par;
  const p = sum(0, HOLES, 'p');
  $('sumPutts').textContent = p == null ? '–' : p;
  // Diferencia solo sobre los hoyos jugados que tienen par
  let d = 0, any = false;
  for (const h of state.holes) if (h.g != null && h.par != null) { d += h.g - h.par; any = true; }
  const el = $('sumDiff');
  el.textContent = any ? signed(d) : '–';
}

function refreshAll() {
  for (let i = 0; i < HOLES; i++) refreshRow(i);
  refreshTotals();
}

rowsEl.addEventListener('input', (e) => {
  const inp = e.target;
  if (!inp.dataset.f) return;
  const clean = inp.value.replace(/\D/g, '').slice(0, 2);
  if (clean !== inp.value) inp.value = clean;
  const i = +inp.dataset.i;
  state.holes[i][inp.dataset.f] = clean === '' ? null : parseInt(clean, 10);
  save();
  refreshRow(i);
  refreshTotals();
});

rowsEl.addEventListener('focusin', (e) => {
  if (e.target.dataset.f) setTimeout(() => e.target.select(), 0);
});

// Intro pasa al mismo dato del hoyo siguiente
rowsEl.addEventListener('keydown', (e) => {
  const inp = e.target;
  if (e.key !== 'Enter' || !inp.dataset.f) return;
  e.preventDefault();
  const next = rowsEl.querySelector(`[data-i="${+inp.dataset.i + 1}"][data-f="${inp.dataset.f}"]`);
  if (next) next.focus(); else inp.blur();
});

$('course').addEventListener('input', (e) => { state.course = e.target.value; save(); });
$('course').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

// --- Selector de dificultad ---
let sheetHole = null;
function openSheet(i) {
  sheetHole = i;
  document.activeElement && document.activeElement.blur();
  $('sheetTitle').textContent = `Dificultad del hoyo ${i + 1}`;
  const grid = $('sheetGrid');
  grid.textContent = '';
  for (let n = 1; n <= MAX_HCP; n++) {
    const owner = state.holes.findIndex((h) => h.hcp === n);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt' + (owner === i ? ' sel' : owner >= 0 ? ' used' : '');
    b.dataset.n = n;
    b.innerHTML = `${n}<small>${owner === i ? 'este hoyo' : owner >= 0 ? 'hoyo ' + (owner + 1) : 'libre'}</small>`;
    grid.append(b);
  }
  $('sheet').hidden = false; $('sheetBack').hidden = false;
}
function closeSheet() { $('sheet').hidden = true; $('sheetBack').hidden = true; sheetHole = null; }
function setHcp(n) {
  const i = sheetHole;
  // Cada número solo puede estar en un hoyo: se quita del anterior
  if (n != null) state.holes.forEach((h, j) => { if (h.hcp === n && j !== i) { h.hcp = null; refreshRow(j); } });
  state.holes[i].hcp = n;
  save(); refreshRow(i); closeSheet();
}
rowsEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-hcp]');
  if (b) openSheet(+b.dataset.hcp);
});
$('sheetGrid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-n]');
  if (b) setHcp(+b.dataset.n);
});
$('sheetClear').addEventListener('click', () => setHcp(null));
$('sheetClose').addEventListener('click', closeSheet);
$('sheetBack').addEventListener('click', closeSheet);

function reloadInputs() {
  rowsEl.querySelectorAll('input[data-f]').forEach((inp) => { inp.value = show(state.holes[+inp.dataset.i][inp.dataset.f]); });
  $('course').value = state.course;
  refreshAll();
}
$('newRound').addEventListener('click', () => {
  if (!confirm('¿Empezar una ronda nueva? Se borran los golpes de todos los hoyos.')) return;
  for (const h of state.holes) { h.g = null; h.s = null; h.p = null; }
  save(); reloadInputs(); document.querySelector('main').scrollTop = 0;
});
$('resetCourse').addEventListener('click', () => {
  if (!confirm('¿Borrar todo? Se pierden el par, la dificultad, el nombre del campo y los golpes.')) return;
  state.course = '';
  state.holes = Array.from({ length: HOLES }, blankHole);
  save(); reloadInputs(); document.querySelector('main').scrollTop = 0;
});

build();
refreshAll();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
