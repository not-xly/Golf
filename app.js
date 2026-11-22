'use strict';
// Tarjeta de golf: par y dificultad por hoyo (datos del campo) y, para cada uno de
// los 4 jugadores, nombre, hándicap y golpes de la ronda.
const KEY = 'golf-v1';
const HOLES = 18;
const MAX_HCP = 18;
const PLAYERS = 4;

const blankHole = () => ({ par: null, hcp: null });
const blankScore = () => ({ g: null, s: null, p: null });
const blankScores = () => Array.from({ length: HOLES }, blankScore);
const blankPlayer = () => ({ name: '', handicap: '', scores: blankScores() });
const blankState = () => ({
  course: '', active: 0,
  holes: Array.from({ length: HOLES }, blankHole),
  players: Array.from({ length: PLAYERS }, blankPlayer),
});

function load() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return blankState();
  try {
    const d = JSON.parse(raw);
    const st = blankState();
    st.course = d.course || '';
    st.holes = st.holes.map((h, i) => {
      const o = (d.holes || [])[i] || {};
      return { par: o.par ?? null, hcp: o.hcp ?? null };
    });
    if (Array.isArray(d.players)) {
      st.players = st.players.map((pl, k) => {
        const o = d.players[k] || {};
        return {
          name: o.name || '', handicap: o.handicap || '',
          scores: pl.scores.map((sc, i) => Object.assign(sc, (o.scores || [])[i])),
        };
      });
      st.active = Math.min(PLAYERS - 1, Math.max(0, d.active | 0));
    } else {
      // Versión anterior, de un solo jugador: sus golpes pasan al jugador 1
      st.players[0].handicap = d.handicap || '';
      st.players[0].scores = st.players[0].scores.map((sc, i) => {
        const o = (d.holes || [])[i] || {};
        return { g: o.g ?? null, s: o.s ?? null, p: o.p ?? null };
      });
    }
    return st;
  } catch (e) {
    // No sobrescribir datos que no se han podido leer
    localStorage.setItem(KEY + '-backup-' + Date.now(), raw);
    alert('No se pudieron leer los datos guardados. Se ha hecho una copia de seguridad.');
    return blankState();
  }
}

const state = load();
const save = () => localStorage.setItem(KEY, JSON.stringify(state));
const $ = (id) => document.getElementById(id);
const rowsEl = $('rows');

const player = (k = state.active) => state.players[k];
// Valor de un dato del hoyo i: par y dificultad son del campo; el resto, del jugador
const val = (i, f, k = state.active) => (f === 'par' || f === 'hcp' ? state.holes[i][f] : player(k).scores[i][f]);
const sum = (f, k = state.active) => {
  let t = 0, any = false;
  for (let i = 0; i < HOLES; i++) { const v = val(i, f, k); if (v != null) { t += v; any = true; } }
  return any ? t : null;
};
// Hándicap del jugador como número (admite coma decimal), o null si está vacío
const handicapValue = (k = state.active) => {
  const v = parseFloat(String(player(k).handicap).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};

// Golpes de ventaja en un hoyo: hándicap redondeado repartido por dificultad
// (1 = el más difícil). Con 20 de hándicap: 1 golpe en todos y 2 en los de dificultad 1 y 2.
// Hándicap negativo: se devuelven golpes en los hoyos más fáciles.
// Devuelve null si hace falta la dificultad del hoyo y no está puesta.
function strokesReceived(i, handicap) {
  const hc = Math.round(handicap);
  const n = Math.abs(hc);
  const base = Math.floor(n / HOLES), rest = n % HOLES;
  let extra = 0;
  if (rest > 0) {
    // Dificultades que reciben (o devuelven) el golpe sobrante
    const lo = hc > 0 ? 1 : HOLES - rest + 1, hi = hc > 0 ? rest : HOLES;
    const si = state.holes[i].hcp;
    if (si != null) extra = si >= lo && si <= hi ? 1 : 0;
    else {
      // Sin dificultad: solo se sabe si esos números ya están en otros hoyos
      for (let k = lo; k <= hi; k++) if (!state.holes.some((h) => h.hcp === k)) return null;
    }
  }
  return Math.sign(hc) * (base + extra);
}

// Puntos Stableford: 2 por hacer el par neto, +1 por cada golpe menos, −1 por cada golpe más, mínimo 0.
function holePoints(i, k) {
  const par = state.holes[i].par, g = player(k).scores[i].g;
  if (g == null || par == null) return null;
  const handicap = handicapValue(k);
  const extra = handicap == null ? 0 : strokesReceived(i, handicap);
  if (extra == null) return null;
  return Math.max(0, 2 + par + extra - g);
}
const pointsOf = (i, k = state.active) => holePoints(i, k);
const totalPoints = (k) => {
  let t = 0, any = false;
  for (let i = 0; i < HOLES; i++) { const v = pointsOf(i, k); if (v != null) { t += v; any = true; } }
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
  inp.value = show(val(i, f));
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
  const pts = document.createElement('td'); pts.className = 'pts'; tr.append(pts);
  return tr;
}

function totalRow(label, cls) {
  const tr = document.createElement('tr');
  tr.className = 'total ' + cls;
  tr.innerHTML = `<td class="lbl">${label}</td><td data-t="par"></td><td></td>
    <td class="split" data-t="g"></td><td data-t="s"></td><td data-t="p"></td>
    <td class="pts" data-t="pts"></td>`;
  return tr;
}

const totals = [];
function build() {
  rowsEl.textContent = '';
  for (let i = 0; i < HOLES; i++) {
    rowsEl.append(holeRow(i));
  }
  const all = totalRow('Total', 'grand'); totals.push(all); rowsEl.append(all);
  const box = $('players');
  for (let k = 0; k < PLAYERS; k++) {
    const d = document.createElement('div');
    d.className = 'player'; d.dataset.k = k;
    d.innerHTML = `<input type="text" maxlength="14" placeholder="Jugador ${k + 1}" autocomplete="off" enterkeyhint="done"
      aria-label="Nombre del jugador ${k + 1}"><span class="pinfo"></span>`;
    box.append(d);
  }
}

function refreshRow(i) {
  const h = Object.assign({}, state.holes[i], player().scores[i]);
  const tr = rowsEl.querySelector(`tr[data-i="${i}"]`);
  // Los golpes cortos más los putts no pueden superar el total de golpes
  const bad = h.g != null && (h.s || 0) + (h.p || 0) > h.g;
  for (const f of ['g', 's', 'p']) tr.querySelector(`[data-f="${f}"]`).classList.toggle('warn', bad);
  const pts = pointsOf(i);
  const ptd = tr.querySelector('td.pts');
  ptd.textContent = pts == null ? '–' : pts;
  ptd.classList.toggle('empty', pts == null);
  const b = tr.querySelector('[data-hcp]');
  b.textContent = h.hcp == null ? '–' : h.hcp;
  b.classList.toggle('empty', h.hcp == null);
  b.setAttribute('aria-label', `Dificultad hoyo ${i + 1}: ${h.hcp == null ? 'sin asignar' : h.hcp}`);
}

function refreshTotals() {
  for (const t of totals) {
    for (const f of ['par', 'g', 's', 'p']) t.querySelector(`[data-t="${f}"]`).textContent = show(sum(f));
    t.querySelector('[data-t="pts"]').textContent = show(totalPoints(state.active));
  }
  const dash = (v) => (v == null ? '–' : v);
  $('sumPoints').textContent = dash(totalPoints(state.active));
  $('sumStrokes').textContent = dash(sum('g'));
  $('sumPutts').textContent = dash(sum('p'));
  $('sumDiff').textContent = dash(diffPar(state.active));
  refreshPlayers();
}

// Diferencia con el par, solo sobre los hoyos jugados que tienen par
function diffPar(k) {
  let d = 0, any = false;
  for (let i = 0; i < HOLES; i++) {
    const g = val(i, 'g', k), par = state.holes[i].par;
    if (g != null && par != null) { d += g - par; any = true; }
  }
  return any ? signed(d) : null;
}

// Cabecera de jugadores: nombre y, debajo, golpes y puntos de cada uno
function refreshPlayers() {
  $('players').querySelectorAll('.player').forEach((d) => {
    const k = +d.dataset.k;
    d.classList.toggle('on', k === state.active);
    const inp = d.querySelector('input');
    if (document.activeElement !== inp) inp.value = player(k).name;
    const g = sum('g', k), pt = totalPoints(k);
    d.querySelector('.pinfo').textContent = g == null ? '\u00a0' : `${g} g · ${pt == null ? '–' : pt} p`;
  });
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
  const i = +inp.dataset.i, f = inp.dataset.f;
  (f === 'par' ? state.holes[i] : player().scores[i])[f] = clean === '' ? null : parseInt(clean, 10);
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
$('handicap').addEventListener('input', (e) => {
  const clean = e.target.value.replace(/[^\d.,]/g, '');
  if (clean !== e.target.value) e.target.value = clean;
  player().handicap = clean;
  save(); refreshAll();
});
$('handicap').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
// Tocar un jugador lo selecciona; tocar el seleccionado permite escribir su nombre
$('players').addEventListener('click', (e) => {
  const d = e.target.closest('.player');
  if (!d || +d.dataset.k === state.active) return;
  setActive(+d.dataset.k);
});
$('players').addEventListener('input', (e) => {
  const k = +e.target.closest('.player').dataset.k;
  player(k).name = e.target.value;
  save();
});
$('players').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
function setActive(k) {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  state.active = k;
  save(); reloadInputs();
}
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
    b.innerHTML = `${n}<small>${owner === i ? 'este' : owner >= 0 ? 'hoyo ' + (owner + 1) : '&nbsp;'}</small>`;
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
  save(); refreshAll(); closeSheet();
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
  rowsEl.querySelectorAll('input[data-f]').forEach((inp) => { inp.value = show(val(+inp.dataset.i, inp.dataset.f)); });
  $('course').value = state.course;
  $('handicap').value = player().handicap;
  refreshAll();
}
$('newRound').addEventListener('click', () => {
  if (!confirm('¿Empezar una ronda nueva? Se borran los golpes de los 4 jugadores.')) return;
  for (const pl of state.players) pl.scores = blankScores();
  save(); reloadInputs(); document.querySelector('main').scrollTop = 0;
});
$('resetCourse').addEventListener('click', () => {
  if (!confirm('¿Borrar todo? Se pierden el par, la dificultad, el nombre del campo y los golpes.')) return;
  state.course = '';
  state.holes = Array.from({ length: HOLES }, blankHole);
  for (const pl of state.players) pl.scores = blankScores();
  save(); reloadInputs(); document.querySelector('main').scrollTop = 0;
});

build();
reloadInputs();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
