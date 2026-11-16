/* =========================================================================
   THE CONSISTENCY CLUB — script.js (vanilla JS frontend)
   Talks to Code.gs through google.script.run (when served by Apps Script)
   or through fetch() to the Web App URL (when hosted elsewhere).
   ========================================================================= */
'use strict';

/* ------------------------------------------------------------------ */
/* 1. CONFIG & STATE                                                   */
/* ------------------------------------------------------------------ */
const CONFIG = {
  /** Only needed when this page is hosted outside Apps Script (e.g. GitHub Pages). */
  API_URL: 'https://script.google.com/macros/s/AKfycbwO4avEI5NFBWn125HSt86107BXHENXMyszAAQtLj15Zw_AId5K39PJLWvhrXwJ51J89g/exec',
  TIMEZONE: 'Asia/Kolkata',
  QUOTE_INTERVAL_MS: 9000
};

const QUOTES = [
  'Consistency beats motivation.',
  'One hour of learning every day creates a different future.',
  'Small improvements compound.',
  "Don't break the chain.",
  "Compete with yesterday's version of yourself.",
  'Show up on the hard days — that is where habits are built.',
  'Progress, not perfection.'
];

const MEMBER_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const HABITS = ['wake', 'exercise', 'food', 'water', 'learning'];
const HABIT_META = {
  wake: { label: 'Early wake-up', icon: 'sun' },
  exercise: { label: 'Workout', icon: 'dumbbell' },
  food: { label: 'Healthy food', icon: 'food' },
  water: { label: 'Water intake', icon: 'droplet' },
  learning: { label: 'Upskilling', icon: 'book' }
};
const VIEW_TITLES = {
  overview: 'Overview', daily: 'Daily Habits', leaderboard: 'Group Leaderboard', analytics: 'Habit Analytics',
  learning: 'Learning Tracker', timeline: 'Learning Timeline', members: 'Members', member: 'Personal Dashboard', setup: 'Setup'
};

const state = {
  ready: false,
  members: [],          // all members incl. inactive
  settings: null,
  today: '',
  route: 'overview',
  params: [],
  charts: {},
  lastMemberId: '',
  ovDate: '',
  lb: { period: 'daily', date: '' },
  an: { period: 'weekly', date: '', member: 'ALL' },
  pd: { date: '', calMonth: null, calYear: null },
  df: null,             // daily form state
  renderToken: 0
};

/* ------------------------------------------------------------------ */
/* 2. API                                                              */
/* ------------------------------------------------------------------ */
function isGas() { return typeof google !== 'undefined' && google.script && google.script.run; }
function storageGet(k) { try { return window.localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function storageSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
function apiUrl() { return CONFIG.API_URL || storageGet('cc_api_url'); }
function uid() { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

function api(action, payload, opts) {
  payload = Object.assign({}, payload || {});
  if (opts && opts.write && !payload.requestId) payload.requestId = uid();
  return new Promise(function (resolve, reject) {
    function handle(res) {
      if (typeof res === 'string') { try { res = JSON.parse(res); } catch (e) { return reject(new Error('Invalid response from server.')); } }
      if (!res || !res.ok) {
        const err = new Error(res && res.error ? res.error.message : 'Request failed.');
        err.code = res && res.error ? res.error.code : 'ERROR';
        err.details = res && res.error ? res.error.details : null;
        return reject(err);
      }
      resolve(res.data);
    }
    if (isGas()) {
      google.script.run.withSuccessHandler(handle)
        .withFailureHandler(function (e) { reject(new Error((e && e.message) || 'Network error.')); })
        .api(action, payload);
      return;
    }
    const url = apiUrl();
    if (!url) { const e = new Error('Backend URL is not configured.'); e.code = 'NO_API'; return reject(e); }
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: action, payload: payload }), redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(handle)
      .catch(function (e) {
        reject(new Error(/fetch|network|load/i.test(e.message) ? 'Cannot reach the backend. Check the Web App URL and its access setting.' : e.message));
      });
  });
}

/* ------------------------------------------------------------------ */
/* 3. UTILITIES                                                        */
/* ------------------------------------------------------------------ */
const $ = function (sel, root) { return (root || document).querySelector(sel); };
const $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function istToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: CONFIG.TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function parseD(s) { const p = String(s).split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
function fmtD(d) { return d.toISOString().slice(0, 10); }
function addDays(s, n) { const d = parseD(s); d.setUTCDate(d.getUTCDate() + n); return fmtD(d); }
function fmtDate(s, opts) {
  if (!s) return '—';
  return new Intl.DateTimeFormat('en-IN', Object.assign({ timeZone: 'UTC', day: 'numeric', month: 'short' }, opts || {})).format(parseD(s));
}
function fmtLong(s) { return fmtDate(s, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
function fmtTime12(t) {
  if (!t) return '—';
  const p = t.split(':'); let h = +p[0]; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return h + ':' + p[1] + ' ' + ap;
}
function fmtMl(ml) { return ml >= 1000 || ml === 0 ? (Math.round(ml / 10) / 100) + ' L' : ml + ' ml'; }
function fmtMin(m) { m = +m || 0; if (m < 60) return m + ' min'; const h = Math.floor(m / 60), r = m % 60; return h + 'h' + (r ? ' ' + r + 'm' : ''); }
function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
function relTime(stamp) {
  if (!stamp) return '';
  const day = stamp.slice(0, 10), time = stamp.slice(11, 16);
  if (day === state.today) return 'Today ' + fmtTime12(time);
  if (day === addDays(state.today, -1)) return 'Yesterday ' + fmtTime12(time);
  return fmtDate(day) + ' ' + fmtTime12(time);
}
function memberById(id) { return state.members.find(function (m) { return m.memberId === id; }) || null; }
function activeMembers() { return state.members.filter(function (m) { return m.active; }); }
function colorIndex(id) { const i = state.members.findIndex(function (m) { return m.memberId === id; }); return (i < 0 ? 0 : i) % MEMBER_COLORS.length; }
function memberColor(id) { return MEMBER_COLORS[colorIndex(id)]; }
function avatar(id, size) {
  const m = memberById(id) || { initials: '?', name: '' };
  return '<span class="avatar ' + (size || '') + ' c' + (colorIndex(id) + 1) + '" aria-hidden="true">' + esc(m.initials) + '</span>';
}
function memberOptions(selected, includeAll) {
  return (includeAll ? '<option value="ALL"' + (selected === 'ALL' ? ' selected' : '') + '>All members</option>' : '') +
    activeMembers().map(function (m) { return '<option value="' + esc(m.memberId) + '"' + (m.memberId === selected ? ' selected' : '') + '>' + esc(m.name) + '</option>'; }).join('');
}
function defaultMember() { return state.lastMemberId && memberById(state.lastMemberId) ? state.lastMemberId : (activeMembers()[0] || {}).memberId; }

/* ------------------------------------------------------------------ */
/* 4. ICONS (Lucide-style inline SVG)                                  */
/* ------------------------------------------------------------------ */
const ICONS = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  timeline: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  minus: '<path d="M5 12h14"/>',
  spark: '<path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z"/>',
  sun: '<path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m8 6 4-4 4 4"/><path d="M16 18a4 4 0 0 0-8 0"/>',
  dumbbell: '<path d="M6.5 6.5 17.5 17.5"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/>',
  food: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  play: '<path d="m6 3 14 9-14 9V3z"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.48 12.89 17 22l-5-3-5 3 1.52-9.11"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  dot: '<circle cx="12" cy="12" r="4"/>'
};
function icon(name, cls) { return '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || ICONS.dot) + '</svg>'; }
function hydrateIcons(root) { $$('[data-icon]', root).forEach(function (el) { if (!el.firstChild) el.innerHTML = icon(el.getAttribute('data-icon')); }); }

/* ------------------------------------------------------------------ */
/* 5. UI PRIMITIVES — toast, modal, loading, empty states              */
/* ------------------------------------------------------------------ */
function toast(msg, type) {
  type = type || 'success';
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = icon(type === 'error' ? 'alert' : type === 'info' ? 'info' : 'check') + '<div>' + esc(msg) + '</div>';
  $('#toasts').appendChild(el);
  setTimeout(function () { el.classList.add('hide'); setTimeout(function () { el.remove(); }, 300); }, type === 'error' ? 6000 : 3500);
}
function toastError(err) { toast(err && err.message ? err.message : String(err), 'error'); }

let modalResolve = null;
function openModal(title, bodyHtml, buttons) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHtml;
  const foot = $('#modalFoot');
  foot.innerHTML = '';
  (buttons || []).forEach(function (b) {
    const btn = document.createElement('button');
    btn.className = 'btn ' + (b.cls || '');
    btn.innerHTML = (b.icon ? icon(b.icon) : '') + esc(b.label);
    btn.addEventListener('click', function () { b.onClick(btn); });
    foot.appendChild(btn);
  });
  $('#modal').hidden = false;
  hydrateIcons($('#modal'));
  const first = $('#modalBody input, #modalBody select, #modalBody textarea');
  if (first) setTimeout(function () { first.focus(); }, 50);
  return $('#modalBody');
}
function closeModal() { $('#modal').hidden = true; $('#modalBody').innerHTML = ''; if (modalResolve) { modalResolve(false); modalResolve = null; } }

function confirmDialog(title, message, confirmLabel, danger) {
  return new Promise(function (resolve) {
    openModal(title, '<p>' + esc(message) + '</p>', [
      { label: 'Cancel', cls: 'ghost', onClick: function () { closeModal(); } },
      { label: confirmLabel || 'Confirm', cls: danger ? 'danger' : 'primary', onClick: function () { modalResolve = null; $('#modal').hidden = true; resolve(true); } }
    ]);
    modalResolve = resolve;
  });
}

/** Runs an async action with the button in a loading/disabled state (prevents double submits). */
function withBusy(btn, fn) {
  if (btn && btn.disabled) return Promise.resolve();
  if (btn) { btn.disabled = true; btn.classList.add('loading'); }
  return Promise.resolve().then(fn).finally(function () { if (btn) { btn.disabled = false; btn.classList.remove('loading'); } });
}

function skeleton(n, cls) { let s = ''; for (let i = 0; i < (n || 3); i++) s += '<div class="skeleton ' + (cls || 'sk-card') + '"></div>'; return s; }
function emptyState(iconName, title, text, actionHtml) {
  return '<div class="empty">' + icon(iconName || 'inbox') + '<div class="strong">' + esc(title) + '</div>' + (text ? '<div class="small">' + esc(text) + '</div>' : '') + (actionHtml || '') + '</div>';
}
function errorState(err, retryFn) {
  const id = 'retry' + uid();
  setTimeout(function () { const b = document.getElementById(id); if (b) b.addEventListener('click', retryFn); }, 0);
  return emptyState('alert', 'Could not load data', err && err.message ? err.message : String(err), '<button class="btn sm" id="' + id + '">' + icon('refresh') + 'Try again</button>');
}

function statusPill(st) {
  if (st === 'YES') return '<span class="pill yes">' + icon('check') + 'YES</span>';
  if (st === 'NO') return '<span class="pill no">' + icon('x') + 'NO</span>';
  return '<span class="pill nl">NOT LOGGED</span>';
}
function topicPill(st) {
  const cls = { 'IN PROGRESS': 'inprogress', PAUSED: 'paused', COMPLETED: 'completed', ABANDONED: 'abandoned' }[st] || 'nl';
  return '<span class="pill ' + cls + '">' + esc(st) + '</span>';
}
function noticeHtml(tone, text) {
  const ic = tone === 'warning' ? 'alert' : tone === 'success' ? 'award' : 'info';
  return '<div class="notice ' + tone + '">' + icon(ic) + '<div>' + esc(text) + '</div></div>';
}
function progressBar(pct, cls) { return '<div class="progress ' + (cls || '') + '"><span data-w="' + Math.max(0, Math.min(100, pct)) + '"></span></div>'; }
function animateBars(root) {
  requestAnimationFrame(function () { $$('.progress > span[data-w]', root).forEach(function (s) { s.style.width = s.getAttribute('data-w') + '%'; }); });
}
function field(label, inner, opts) {
  opts = opts || {};
  return '<label class="field ' + (opts.cls || '') + '"><span>' + esc(label) + (opts.req ? ' <span class="req">*</span>' : '') + '</span>' + inner + (opts.hint ? '<span class="field-hint">' + esc(opts.hint) + '</span>' : '') + '</label>';
}
function selectHtml(id, options, selected, placeholder) {
  return '<select id="' + id + '">' + (placeholder ? '<option value="">' + esc(placeholder) + '</option>' : '') +
    options.map(function (o) { return '<option' + (o === selected ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
}

/* ------------------------------------------------------------------ */
/* 6. CHARTS                                                           */
/* ------------------------------------------------------------------ */
function destroyCharts() { Object.keys(state.charts).forEach(function (k) { try { state.charts[k].destroy(); } catch (e) { /* ignore */ } delete state.charts[k]; }); }
function chartCard(id, title, sub, wide) {
  return '<div class="card chart-card' + (wide ? ' wide' : '') + '"><h3>' + esc(title) + '</h3><div class="sub">' + esc(sub || '') + '</div><div class="chart-box"><canvas id="' + id + '" role="img" aria-label="' + esc(title) + '"></canvas></div></div>';
}
function makeChart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  if (typeof Chart === 'undefined') { canvas.parentNode.innerHTML = '<div class="chart-fallback">Charts unavailable (Chart.js could not load). See the data table below.</div>'; return; }
  if (state.charts[id]) state.charts[id].destroy();
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.color = '#64748B';
  const base = {
    responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false, labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8 } },
      tooltip: { backgroundColor: '#0F172A', padding: 10, cornerRadius: 8, titleFont: { weight: '600' } }
    },
    scales: {
      x: { grid: { display: false }, border: { color: '#E2E8F0' }, ticks: { font: { size: 11 } } },
      y: { beginAtZero: true, grid: { color: '#F1F5F9' }, border: { display: false }, ticks: { font: { size: 11 }, precision: 0 } }
    }
  };
  const merged = Object.assign({}, config);
  merged.options = deepMerge(base, config.options || {});
  state.charts[id] = new Chart(canvas, merged);
}
function deepMerge(a, b) {
  const out = Array.isArray(a) ? a.slice() : Object.assign({}, a);
  Object.keys(b).forEach(function (k) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') out[k] = deepMerge(a[k], b[k]);
    else out[k] = b[k];
  });
  return out;
}
function barDataset(label, values, colors) {
  return { label: label, data: values, backgroundColor: colors, borderRadius: 4, borderSkipped: 'bottom', maxBarThickness: 44, categoryPercentage: .7 };
}

/* ------------------------------------------------------------------ */
/* 7. ROUTER                                                           */
/* ------------------------------------------------------------------ */
function navigate(route) {
  route = route.replace(/^#/, '') || 'overview';
  try { history.replaceState(null, '', '#' + route); } catch (e) { /* sandboxed iframe */ }
  render(route);
}
function render(route) {
  const parts = route.split('/');
  let view = parts[0];
  if (!VIEW_TITLES[view] || view === 'setup') view = 'overview';
  if (view === 'member' && !parts[1]) view = 'members';
  if (state.route === 'daily' && view !== 'daily' && state.df && state.df.dirty.size) {
    if (!window.confirm('You have unsaved changes in Daily Habits. Leave without saving?')) return;
    state.df.dirty.clear();
  }
  state.route = view; state.params = parts.slice(1);
  state.renderToken++;
  destroyCharts();
  $$('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + view; });
  $$('.nav-item').forEach(function (a) { a.classList.toggle('active', a.dataset.view === view || (view === 'member' && a.dataset.view === 'members')); });
  $('#topbarTitle').textContent = VIEW_TITLES[view];
  closeSidebar();
  window.scrollTo(0, 0);
  const fn = { overview: renderOverview, daily: renderDaily, leaderboard: renderLeaderboard, analytics: renderAnalytics, learning: renderLearning, timeline: renderTimeline, members: renderMembers, member: renderMemberDashboard }[view];
  fn();
}
function stillCurrent(token) { return token === state.renderToken; }
function openSidebar() { $('#sidebar').classList.add('open'); $('#scrim').hidden = false; }
function closeSidebar() { $('#sidebar').classList.remove('open'); $('#scrim').hidden = true; }

/* ------------------------------------------------------------------ */
/* 8. OVERVIEW                                                         */
/* ------------------------------------------------------------------ */
function renderOverview() {
  const token = state.renderToken;
  const date = state.ovDate || state.today;
  $('#ovDate').value = date; $('#ovDate').max = state.today;
  $('#ovStats').innerHTML = skeleton(6, 'sk-card" style="height:90px');
  $('#ovMembers').innerHTML = skeleton(5);
  $('#ovLeaderboard').innerHTML = skeleton(4, 'sk-line'); $('#ovWeekly').innerHTML = skeleton(4, 'sk-line'); $('#ovActivity').innerHTML = skeleton(4, 'sk-line');
  api('getDashboardData', { date: date }).then(function (d) {
    if (!stillCurrent(token)) return;
    const g = d.group;
    const lt = state.settings.learningTargetMin;
    $('#ovStats').innerHTML = [
      stat('check', 'Habits completed', g.habitsCompleted + ' <small>/ ' + g.habitsPossible + '</small>', g.habitsPending + ' still pending'),
      stat('target', 'Group average score', g.averageScore + ' <small>/ 100</small>', 'Across ' + plural(g.memberCount, 'member')),
      stat('dumbbell', 'Workout minutes', g.workoutMinutes, 'Logged ' + (date === state.today ? 'today' : 'on ' + fmtDate(date))),
      stat('droplet', 'Water consumed', g.waterLitres + ' <small>L</small>', 'Group total'),
      stat('book', 'Learning hours', g.learningHours + ' <small>h</small>', 'All sessions'),
      stat('award', 'Learning target met', g.learningTargetMet + ' <small>/ ' + g.memberCount + '</small>', lt + '+ min of learning')
    ].join('');
    $('#ovMembers').innerHTML = d.members.length ? d.members.map(memberCardHtml).join('') : emptyState('users', 'No active members', 'Add members on the Members page.');
    bindMemberCards($('#ovMembers'));
    $('#ovLeaderboard').innerHTML = miniLeaderboard(d.leaderboard.rows);
    $('#ovWeekLabel').textContent = fmtDate(d.weeklyReport.range.start) + ' – ' + fmtDate(d.weeklyReport.range.fullEnd);
    $('#ovWeekly').innerHTML = weeklyReportHtml(d.weeklyReport);
    $('#ovActivity').innerHTML = activityHtml(d.activity);
    hydrateIcons($('#view-overview'));
    animateBars($('#view-overview'));
  }).catch(function (err) {
    if (!stillCurrent(token)) return;
    $('#ovStats').innerHTML = ''; $('#ovLeaderboard').innerHTML = ''; $('#ovWeekly').innerHTML = ''; $('#ovActivity').innerHTML = '';
    $('#ovMembers').innerHTML = '<div class="card" style="grid-column:1/-1">' + errorState(err, renderOverview) + '</div>';
  });
}
function stat(ic, label, value, sub) {
  return '<div class="stat"><div class="stat-label">' + icon(ic) + esc(label) + '</div><div class="stat-value">' + value + '</div><div class="stat-sub">' + esc(sub) + '</div></div>';
}
function memberCardHtml(c) {
  const dots = HABITS.map(function (h) {
    const st = c.statuses[h];
    return '<span class="mc-dot ' + (st === 'YES' ? 'yes' : st === 'NO' ? 'no' : '') + '" title="' + HABIT_META[h].label + ': ' + st + '"></span>';
  }).join('');
  return '<button class="member-card" data-member="' + esc(c.memberId) + '" aria-label="Open ' + esc(c.name) + '\'s dashboard">' +
    '<div class="mc-top">' + avatar(c.memberId) + '<div><div class="mc-name">' + esc(c.name) + '</div><div class="small muted">' + c.completed + ' / 5 habits</div></div></div>' +
    '<div class="mc-score"><b>' + c.points + '%</b><span class="muted small">daily score</span></div>' +
    '<div class="mc-dots">' + dots + '</div>' +
    '<div class="mc-meta">' +
    '<div><span>Consistency</span><b>' + c.consistency + '%</b></div>' +
    '<div><span>Learning</span><b title="' + esc(c.currentTopic) + '">' + (c.currentTopic ? esc(c.currentTopic) : '—') + '</b></div>' +
    '<div><span>Topic duration</span><b>' + (c.currentTopic ? 'Day ' + c.currentTopicDay : '—') + '</b></div>' +
    '<div><span>Current streak</span><b>' + plural(c.currentStreak, 'day') + '</b></div>' +
    '</div></button>';
}
function bindMemberCards(root) {
  $$('[data-member]', root).forEach(function (el) {
    el.addEventListener('click', function () { navigate('member/' + el.dataset.member); });
  });
}
function miniLeaderboard(rows) {
  if (!rows.length) return emptyState('trophy', 'No members yet');
  return rows.map(function (r) {
    return '<div class="lb-row"><span class="rank r' + r.rank + '">' + r.rank + '</span>' +
      '<div class="lb-name">' + avatar(r.memberId, 'sm') + esc(r.name) + (r.tied ? ' <span class="tie">TIE</span>' : '') + '</div>' +
      '<div><span class="lb-points">' + r.points + '</span> <span class="muted small">pts' + (r.pending ? ' · ' + r.pending + ' pending' : '') + '</span></div></div>';
  }).join('');
}
function weeklyReportHtml(w) {
  const item = function (ic, k, v) { return '<div class="report-item"><span class="report-ico">' + icon(ic) + '</span><div><div class="k">' + esc(k) + '</div><div class="v">' + v + '</div></div></div>'; };
  const names = function (arr, fmt) { return arr.length ? arr.map(fmt).join(', ') : '<span class="muted">Not enough data yet</span>'; };
  return '<div class="report-list">' +
    item('trophy', 'Top performer', names(w.topPerformers, function (p) { return esc(p.name) + ' <span class="muted small">(' + p.points + ' pts)</span>'; })) +
    item('trend', 'Most improved vs last week', names(w.mostImproved, function (p) { return esc(p.name) + ' <span class="muted small">(+' + p.delta + ' avg/day)</span>'; })) +
    item('dumbbell', 'Total workouts', w.totalWorkouts + ' <span class="muted small">sessions</span>') +
    item('book', 'Total learning', w.totalLearningHours + ' <span class="muted small">hours</span>') +
    item('award', 'Best-performing habit', w.bestHabit ? esc(w.bestHabit.label) + ' <span class="muted small">(' + w.bestHabit.rate + '%)</span>' : '<span class="muted">—</span>') +
    item('target', 'Needs improvement', w.weakestHabit ? esc(w.weakestHabit.label) + ' <span class="muted small">(' + w.weakestHabit.rate + '%)</span>' : '<span class="muted">—</span>') +
    item('flag', 'Topics completed', w.completions.length ? w.completions.map(function (c) { return esc(c.memberName) + ' finished <b>' + esc(c.topicName) + '</b>'; }).join('<br>') : '<span class="muted">None this week yet</span>') +
    '</div>';
}
function activityHtml(items) {
  if (!items || !items.length) return emptyState('inbox', 'No activity yet', 'Entries will appear here as soon as someone logs a habit.');
  const ic = { water: 'droplet', food: 'food', learning: 'book', topic: 'flag', habit: 'check' };
  return '<div class="activity">' + items.map(function (a) {
    return '<div class="activity-item">' + avatar(a.memberId, 'sm') + '<span class="muted">' + icon(ic[a.type]) + '</span><div><b>' + esc(a.memberName) + '</b> ' + esc(a.text) +
      (a.date !== (a.at || '').slice(0, 10) ? ' <span class="muted small">(for ' + fmtDate(a.date) + ')</span>' : '') + '</div><span class="when">' + relTime(a.at) + '</span></div>';
  }).join('') + '</div>';
}

/* ------------------------------------------------------------------ */
/* 9. DAILY HABITS FORM                                                */
/* ------------------------------------------------------------------ */
function renderDaily() {
  const p = state.params;
  const memberId = p[0] && memberById(p[0]) ? p[0] : defaultMember();
  const date = p[1] && /^\d{4}-\d{2}-\d{2}$/.test(p[1]) && p[1] <= state.today ? p[1] : (state.df && state.df.memberId === memberId ? state.df.date : state.today);
  $('#dfMember').innerHTML = memberOptions(memberId);
  $('#dfDate').value = date; $('#dfDate').max = state.today;
  loadDailyForm(memberId, date);
}

function loadDailyForm(memberId, date) {
  const token = state.renderToken;
  state.lastMemberId = memberId;
  state.df = { memberId: memberId, date: date, day: null, topics: [], dirty: new Set(), pendingFood: [], topicMode: '', topicId: '' };
  updateSaveBar();
  $('#dfBody').innerHTML = skeleton(4, 'sk-card" style="height:260px');
  $('#dfScore').innerHTML = '';
  Promise.all([api('getDailyHabit', { memberId: memberId, date: date }), api('getLearningTopics', { memberId: memberId })])
    .then(function (res) {
      if (!stillCurrent(token) || state.df.memberId !== memberId || state.df.date !== date) return;
      state.df.day = res[0]; state.df.topics = res[1];
      drawDailyForm();
    }).catch(function (err) { if (stillCurrent(token)) $('#dfBody').innerHTML = '<div class="card wide">' + errorState(err, function () { loadDailyForm(memberId, date); }) + '</div>'; });
}

function drawDailyForm() {
  const df = state.df, d = df.day, s = state.settings;
  drawDailyScore();
  const exYes = d.statuses.exercise === 'YES', exNo = d.statuses.exercise === 'NO';
  const fdSt = d.statuses.food;
  const lnDeclared = d.learning.declared || (d.learning.minutes > 0 ? 'YES' : '');

  $('#dfBody').innerHTML =
    // ---- Wake-up
    '<div class="card habit-card" data-section="wake">' + habitTitle('wake', 'Early wake-up', '<span id="wkPill">' + statusPill(d.statuses.wake) + '</span>') +
    '<div class="target-line"><span>Target: <b>at or before ' + fmtTime12(s.wakeTarget) + '</b></span><span>Actual: <b id="wkActual">' + fmtTime12(d.wake.time) + '</b></span></div>' +
    '<div class="form-grid">' + field('Actual wake-up time', '<input type="time" id="wkTime" value="' + esc(d.wake.time) + '">', { hint: 'Status is calculated automatically.' }) +
    field('Notes (optional)', '<input id="wkNotes" maxlength="500" value="' + esc(d.wake.notes) + '" placeholder="e.g. slept late">') + '</div></div>' +

    // ---- Workout
    '<div class="card habit-card" data-section="exercise">' + habitTitle('exercise', 'Workout / exercise', statusPill(d.statuses.exercise)) +
    '<div>' + ynSeg('exStatus', d.statuses.exercise) + '</div>' +
    '<div id="exYes" class="form-grid"' + (exYes ? '' : ' hidden') + '>' +
    field('Exercise type', selectHtml('exType', s.exerciseTypes, d.exercise.type, 'Select type'), { req: true }) +
    field('Duration (minutes)', '<input type="number" id="exDuration" min="1" max="600" inputmode="numeric" value="' + (d.exercise.duration || '') + '">', { req: true }) +
    field('Activity description', '<input id="exDesc" maxlength="500" value="' + esc(d.exercise.description) + '" placeholder="e.g. 5 km easy run">', { cls: 'full' }) +
    field('Notes (optional)', '<input id="exNotesYes" maxlength="500" value="' + esc(exYes ? d.exercise.notes : '') + '">', { cls: 'full' }) + '</div>' +
    '<div id="exNo"' + (exNo ? '' : ' hidden') + '>' + field('Reason (optional)', '<input id="exNotesNo" maxlength="500" value="' + esc(exNo ? d.exercise.notes : '') + '" placeholder="e.g. rest day">') + '</div>' +
    '</div>' +

    // ---- Healthy food
    '<div class="card habit-card" data-section="food">' + habitTitle('food', 'Healthy food', statusPill(fdSt)) +
    '<div>' + ynSeg('fdStatus', fdSt) + '</div>' +
    '<div class="list" id="fdList"></div>' +
    '<div class="add-row">' + field('Meal', selectHtml('fdMeal', s.mealCategories, guessMeal())) +
    field('What did you eat?', '<input id="fdDesc" maxlength="500" placeholder="e.g. Oats with banana and nuts">') +
    '<button class="btn" id="fdAdd" type="button">' + icon('plus') + 'Add</button></div>' +
    field('Food notes (optional)', '<input id="fdNotes" maxlength="500" value="' + esc(d.food.notes) + '">') +
    '</div>' +

    // ---- Water
    '<div class="card habit-card" data-section="water" id="waterCard"></div>' +

    // ---- Upskilling
    '<div class="card habit-card wide" data-section="learning">' + habitTitle('learning', 'Upskilling / learning', '<span id="lnPill">' + statusPill(d.statuses.learning) + '</span>') +
    '<div class="target-line"><span>Daily target: <b>' + s.learningTargetMin + ' min</b></span><span>Logged on this date: <b id="lnMin">' + fmtMin(d.learning.minutes) + '</b></span></div>' +
    progressBar(d.learning.percent, d.learning.minutes >= s.learningTargetMin ? 'success' : '') +
    '<div class="list" id="lnToday"></div>' +
    '<div><div class="small muted" style="margin-bottom:6px">Did you study ' + (df.date === state.today ? 'today' : 'on this day') + '?</div>' + ynSeg('lnStatus', lnDeclared) + '</div>' +
    '<div id="lnYes" hidden></div>' +
    '<div id="lnNo" hidden>' + noticeHtml('info', d.learning.minutes > 0 ? 'Sessions already logged for this date still count. Status is calculated from logged minutes.' : 'Upskilling will be recorded as NO for this date. You can change it later.') + '</div>' +
    '</div>';

  drawFoodList();
  drawWaterCard();
  drawLearningToday();
  bindDailyForm();
  hydrateIcons($('#dfBody'));
  animateBars($('#dfBody'));
}

function habitTitle(h, title, right) {
  return '<div class="habit-title"><span class="habit-ico">' + icon(HABIT_META[h].icon) + '</span><div><h3>' + esc(title) + '</h3></div><span class="dirty-tag" hidden>EDITED</span>' + right + '</div>';
}
function ynSeg(id, value) {
  return '<div class="seg yn" id="' + id + '" role="radiogroup">' +
    '<button type="button" data-v="YES" class="' + (value === 'YES' ? 'active' : '') + '">Yes</button>' +
    '<button type="button" data-v="NO" class="' + (value === 'NO' ? 'active' : '') + '">No</button></div>';
}
function segValue(id) { const b = $('#' + id + ' button.active'); return b ? b.dataset.v : ''; }
function guessMeal() { const h = +new Intl.DateTimeFormat('en-GB', { timeZone: CONFIG.TIMEZONE, hour: '2-digit', hourCycle: 'h23' }).format(new Date()); return h < 11 ? 'Breakfast' : h < 16 ? 'Lunch' : h < 19 ? 'Snacks' : 'Dinner'; }

function drawDailyScore() {
  const d = state.df.day;
  $('#dfScore').innerHTML = '<span class="muted small">Score</span><span class="big">' + d.points + '</span><span class="muted small">/ 100 · ' + d.completed + ' done · ' + d.pending + ' pending</span>';
}

function drawFoodList() {
  const df = state.df;
  const saved = df.day.foodLogs.map(function (f) {
    return '<div class="list-item"><div class="grow"><div class="tag">' + esc(f.mealCategory) + '</div>' + esc(f.description) + '</div>' +
      '<button class="icon-btn" data-del-food="' + esc(f.foodId) + '" aria-label="Delete entry">' + icon('trash') + '</button></div>';
  }).join('');
  const pending = df.pendingFood.map(function (f, i) {
    return '<div class="list-item pending"><div class="grow"><div class="tag">' + esc(f.mealCategory) + ' · not saved yet</div>' + esc(f.description) + '</div>' +
      '<button class="icon-btn" data-rm-pending="' + i + '" aria-label="Remove">' + icon('x') + '</button></div>';
  }).join('');
  $('#fdList').innerHTML = saved + pending || '<div class="small muted">No meals logged for this date yet. Add each meal below — multiple entries are welcome.</div>';
  $$('[data-del-food]', $('#fdList')).forEach(function (b) {
    b.addEventListener('click', function () {
      confirmDialog('Delete meal entry?', 'This removes the food entry permanently.', 'Delete', true).then(function (okd) {
        if (!okd) return;
        withBusy(b, function () {
          return api('deleteFoodLog', { foodId: b.dataset.delFood }, { write: true }).then(function () { toast('Meal entry deleted'); return refreshDay(); }).catch(toastError);
        });
      });
    });
  });
  $$('[data-rm-pending]', $('#fdList')).forEach(function (b) {
    b.addEventListener('click', function () { df.pendingFood.splice(+b.dataset.rmPending, 1); drawFoodList(); if (!df.pendingFood.length && !segValue('fdStatus')) markDirty('food', false); updateSaveBar(); });
  });
}

function drawWaterCard() {
  const d = state.df.day, w = d.water;
  const done = w.ml >= w.targetMl;
  $('#waterCard').innerHTML = habitTitle('water', 'Water intake', statusPill(d.statuses.water)) +
    '<div class="water-hero"><div><span class="big">' + (Math.round(w.ml / 10) / 100) + ' L</span> <span class="muted">/ ' + (w.targetMl / 1000) + ' L</span></div>' +
    '<div class="muted small">' + w.percent + '% · ' + (done ? 'Target reached!' : fmtMl(w.remainingMl) + ' to go') + '</div></div>' +
    progressBar(w.percent, 'lg ' + (done ? 'success' : '')) +
    '<div class="quick-add">' + [250, 500, 750, 1000].map(function (ml) { return '<button class="btn" type="button" data-water="' + ml + '">+' + (ml === 1000 ? '1 litre' : ml + ' ml') + '</button>'; }).join('') + '</div>' +
    '<div class="custom-water">' + field('Custom amount (litres)', '<input type="number" id="wtCustom" min="0.05" max="5" step="0.05" inputmode="decimal" placeholder="e.g. 0.3">') +
    '<button class="btn" id="wtAdd" type="button">' + icon('plus') + 'Add</button></div>' +
    '<div class="small muted">Water is saved instantly and always adds to the day\'s total.</div>' +
    '<div class="list">' + (d.waterLogs.length ? d.waterLogs.map(function (l) {
      return '<div class="list-item"><div class="grow">+' + fmtMl(l.amountMl) + ' <span class="muted small">· ' + relTime(l.createdAt) + '</span></div>' +
        '<button class="icon-btn" data-del-water="' + esc(l.logId) + '" aria-label="Remove water entry">' + icon('trash') + '</button></div>';
    }).join('') : '') + '</div>';
  animateBars($('#waterCard'));
  $$('[data-water]', $('#waterCard')).forEach(function (b) { b.addEventListener('click', function () { addWater(b, { amountMl: +b.dataset.water }); }); });
  $('#wtAdd').addEventListener('click', function () {
    const v = parseFloat($('#wtCustom').value);
    if (!(v >= 0.05 && v <= 5)) { toast('Enter between 0.05 and 5 litres.', 'error'); return; }
    addWater($('#wtAdd'), { amountMl: Math.round(v * 1000) });
  });
  $$('[data-del-water]', $('#waterCard')).forEach(function (b) {
    b.addEventListener('click', function () {
      confirmDialog('Remove water entry?', 'The amount will be subtracted from the day\'s total.', 'Remove', true).then(function (okd) {
        if (!okd) return;
        withBusy(b, function () { return api('deleteWaterLog', { logId: b.dataset.delWater }, { write: true }).then(function () { toast('Water entry removed'); return refreshDay(['water']); }).catch(toastError); });
      });
    });
  });
}
function addWater(btn, payload) {
  const df = state.df;
  withBusy(btn, function () {
    return api('addWaterLog', Object.assign({ memberId: df.memberId, date: df.date }, payload), { write: true })
      .then(function (w) { toast('+' + fmtMl(payload.amountMl) + ' added · ' + w.litres + ' L / ' + (w.targetMl / 1000) + ' L'); return refreshDay(['water']); })
      .catch(toastError);
  });
}

function drawLearningToday() {
  const d = state.df.day;
  $('#lnToday').innerHTML = d.learningLogs.map(function (l) {
    return '<div class="list-item"><div class="grow"><div class="tag">' + esc(l.topicName) + ' · ' + fmtMin(l.duration) + '</div>' + esc(l.whatLearned) +
      (l.resourceUrl ? ' <a href="' + esc(l.resourceUrl) + '" target="_blank" rel="noopener">' + icon('link', 'sm') + '</a>' : '') + '</div>' +
      '<button class="icon-btn" data-del-learn="' + esc(l.logId) + '" aria-label="Delete session">' + icon('trash') + '</button></div>';
  }).join('');
  $$('[data-del-learn]', $('#lnToday')).forEach(function (b) {
    b.addEventListener('click', function () {
      confirmDialog('Delete learning session?', 'The minutes will be removed from the topic and the day. Topic history is kept.', 'Delete', true).then(function (okd) {
        if (!okd) return;
        withBusy(b, function () { return api('deleteLearningLog', { logId: b.dataset.delLearn }, { write: true }).then(function () { toast('Session deleted'); return refreshDay(['learning']); }).catch(toastError); });
      });
    });
  });
}

/** Learning session form: continue active topic, resume a paused one, or start new. */
function drawLearningYes() {
  const df = state.df, s = state.settings;
  const active = df.topics.find(function (t) { return t.status === 'IN PROGRESS'; });
  const resumable = df.topics.filter(function (t) { return t.status === 'PAUSED' || t.status === 'ABANDONED'; });
  if (!df.topicMode) { df.topicMode = active ? 'existing' : 'new'; df.topicId = active ? active.topicId : ''; }
  const choice = function (mode, id, title, sub) {
    const sel = df.topicMode === mode && (mode === 'new' || df.topicId === id);
    return '<label class="choice' + (sel ? ' selected' : '') + '"><input type="radio" name="lnTopic" data-mode="' + mode + '" data-id="' + esc(id) + '"' + (sel ? ' checked' : '') + '><div class="grow"><b>' + esc(title) + '</b><div class="small muted">' + sub + '</div></div></label>';
  };
  let html = '<div class="topic-choice">';
  if (active) html += choice('existing', active.topicId, 'Continue: ' + active.name, esc(active.category) + ' · Day ' + active.daysSinceStart + ' · ' + active.totalHours + ' h so far');
  resumable.forEach(function (t) { html += choice('resume', t.topicId, 'Resume existing topic: ' + t.name, topicPill(t.status) + ' · ' + esc(t.category) + ' · ' + t.totalHours + ' h logged'); });
  html += choice('new', '', 'Start a new topic', active ? 'You will be asked what to do with ' + esc(active.name) + '.' : 'Creates a topic record and tracks it from this date.');
  html += '</div>';
  html += '<div id="lnNewTopic" class="form-grid"' + (df.topicMode === 'new' ? '' : ' hidden') + '>' +
    field('Topic name', '<input id="lnTopicName" maxlength="80" placeholder="e.g. Python">', { req: true }) +
    field('Category', selectHtml('lnCategory', s.learningCategories, '', 'Select category'), { req: true }) +
    field('Expected completion date (optional)', '<input type="date" id="lnExpected" min="' + df.date + '">') + '</div>';
  html += '<div class="form-grid">' +
    field('Learning duration (minutes)', '<input type="number" id="lnDuration" min="1" max="720" inputmode="numeric" placeholder="60">', { req: true }) +
    field('Resource URL (optional)', '<input type="url" id="lnUrl" maxlength="500" placeholder="https://…">') +
    field('What did you learn?', '<textarea id="lnWhat" maxlength="1000" placeholder="Key concepts, exercises, notes…"></textarea>', { req: true, cls: 'full' }) +
    field('Additional notes (optional)', '<input id="lnNotes" maxlength="500">', { cls: 'full' }) + '</div>';
  $('#lnYes').innerHTML = html;
  $$('input[name="lnTopic"]').forEach(function (r) {
    r.addEventListener('change', function () {
      df.topicMode = r.dataset.mode; df.topicId = r.dataset.id;
      $$('.choice', $('#lnYes')).forEach(function (c) { c.classList.toggle('selected', c.querySelector('input').checked); });
      $('#lnNewTopic').hidden = df.topicMode !== 'new';
      markDirty('learning');
    });
  });
  $$('input, select, textarea', $('#lnYes')).forEach(function (el) { el.addEventListener('input', function () { markDirty('learning'); }); });
}

function bindDailyForm() {
  const s = state.settings;
  // wake
  $('#wkTime').addEventListener('input', function () {
    const t = this.value;
    $('#wkPill').innerHTML = statusPill(t ? (t <= s.wakeTarget ? 'YES' : 'NO') : 'NOT LOGGED');
    $('#wkActual').textContent = fmtTime12(t);
    markDirty('wake');
  });
  $('#wkNotes').addEventListener('input', function () { markDirty('wake'); });
  // exercise
  segBind('exStatus', function (v) { $('#exYes').hidden = v !== 'YES'; $('#exNo').hidden = v !== 'NO'; markDirty('exercise'); });
  ['exType', 'exDuration', 'exDesc', 'exNotesYes', 'exNotesNo'].forEach(function (id) { $('#' + id).addEventListener('input', function () { markDirty('exercise'); }); });
  // food
  segBind('fdStatus', function () { markDirty('food'); });
  $('#fdNotes').addEventListener('input', function () { markDirty('food'); });
  $('#fdAdd').addEventListener('click', addPendingFood);
  $('#fdDesc').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addPendingFood(); } });
  // learning
  segBind('lnStatus', function (v) { applyLearningToggle(v); markDirty('learning'); });
  applyLearningToggle(segValue('lnStatus'), true);
}
function applyLearningToggle(v, initial) {
  const showYes = v === 'YES' && !(initial && state.df.day.learning.minutes > 0);
  const more = $('#lnMore'); if (more && !initial) more.remove();
  $('#lnYes').hidden = !showYes; $('#lnNo').hidden = v !== 'NO';
  if (showYes && !$('#lnYes').innerHTML) { drawLearningYes(); hydrateIcons($('#lnYes')); }
  if (initial && v === 'YES' && state.df.day.learning.minutes > 0) {
    // Already studied: show a compact "log another session" button instead of the full form.
    $('#lnYes').hidden = true;
    const btn = document.createElement('button');
    btn.className = 'btn sm'; btn.type = 'button'; btn.id = 'lnMore'; btn.innerHTML = icon('plus') + 'Log another session';
    btn.addEventListener('click', function () { btn.remove(); drawLearningYes(); hydrateIcons($('#lnYes')); $('#lnYes').hidden = false; markDirty('learning'); });
    $('#lnYes').parentNode.insertBefore(btn, $('#lnYes'));
  }
}
function segBind(id, onChange) {
  $$('#' + id + ' button').forEach(function (b) {
    b.addEventListener('click', function () {
      const wasActive = b.classList.contains('active');
      $$('#' + id + ' button').forEach(function (x) { x.classList.remove('active'); });
      if (!wasActive) b.classList.add('active');
      onChange(wasActive ? '' : b.dataset.v);
    });
  });
}
function addPendingFood() {
  const desc = $('#fdDesc').value.trim();
  if (desc.length < 2) { toast('Describe what you ate (at least 2 characters).', 'error'); $('#fdDesc').focus(); return; }
  state.df.pendingFood.push({ mealCategory: $('#fdMeal').value, description: desc });
  $('#fdDesc').value = '';
  drawFoodList(); markDirty('food');
}
function markDirty(section, on) {
  const df = state.df;
  if (on === false) df.dirty.delete(section); else df.dirty.add(section);
  $$('#dfBody [data-section]').forEach(function (c) {
    const isD = df.dirty.has(c.dataset.section);
    c.classList.toggle('dirty', isD);
    const tag = c.querySelector('.dirty-tag'); if (tag) tag.hidden = !isD;
  });
  updateSaveBar();
}
function updateSaveBar() {
  const df = state.df;
  const n = df ? df.dirty.size : 0;
  $('#saveInfo').innerHTML = n ? '<b>' + plural(n, 'section') + ' changed</b> — ' + Array.from(df.dirty).map(function (s) { return HABIT_META[s].label; }).join(', ') : 'No unsaved changes';
  $('#dfSave').disabled = !n;
  $('#dfReset').disabled = !n;
}

/** Re-fetches the current day; redraws only the given parts (preserves typed input elsewhere). */
function refreshDay(parts) {
  const df = state.df;
  return api('getDailyHabit', { memberId: df.memberId, date: df.date }).then(function (day) {
    if (state.df !== df) return;
    df.day = day;
    drawDailyScore();
    if (!parts || parts.indexOf('food') !== -1 || !parts.length) drawFoodList();
    if (!parts || parts.indexOf('water') !== -1) drawWaterCard();
    if (!parts || parts.indexOf('learning') !== -1) {
      drawLearningToday();
      $('#lnMin').textContent = fmtMin(day.learning.minutes);
      $('#lnPill').innerHTML = statusPill(day.statuses.learning);
    }
    hydrateIcons($('#dfBody'));
  });
}

/** Builds the partial payload from dirty sections, validating on the client first. */
function collectDailyPayload() {
  const df = state.df, p = { memberId: df.memberId, date: df.date };
  const errors = [];
  if (df.dirty.has('wake')) { p.wakeUpTime = $('#wkTime').value; p.wakeUpNotes = $('#wkNotes').value.trim(); }
  if (df.dirty.has('exercise')) {
    const st = segValue('exStatus');
    p.exerciseStatus = st;
    if (st === 'YES') {
      p.exerciseType = $('#exType').value; p.exerciseDuration = $('#exDuration').value === '' ? '' : Number($('#exDuration').value);
      p.exerciseDescription = $('#exDesc').value.trim(); p.exerciseNotes = $('#exNotesYes').value.trim();
      if (!p.exerciseType) errors.push('Choose an exercise type.');
      if (!(p.exerciseDuration >= 1 && p.exerciseDuration <= 600 && Number.isInteger(p.exerciseDuration))) errors.push('Exercise duration must be 1–600 minutes.');
    } else if (st === 'NO') p.exerciseNotes = $('#exNotesNo').value.trim();
  }
  if (df.dirty.has('food')) {
    const st = segValue('fdStatus');
    if (st || df.day.statuses.food !== 'NOT LOGGED') p.healthyFoodStatus = st;
    p.foodNotes = $('#fdNotes').value.trim();
    if (df.pendingFood.length) p.foodEntries = df.pendingFood.slice();
    if ($('#fdDesc').value.trim()) errors.push('You typed a meal but did not click "Add". Add it or clear the field.');
    if (st === 'YES' && !df.day.foodLogs.length && !df.pendingFood.length) errors.push('Describe at least one meal when healthy food is YES.');
  }
  let learningNeedsSwitch = null;
  if (df.dirty.has('learning')) {
    const st = segValue('lnStatus');
    const formOpen = !$('#lnYes').hidden && $('#lnYes').innerHTML;
    if (st === 'YES' && formOpen) {
      const l = { topicMode: df.topicMode, topicId: df.topicId, duration: Number($('#lnDuration').value), whatLearned: $('#lnWhat').value.trim(), resourceUrl: $('#lnUrl').value.trim(), notes: $('#lnNotes').value.trim() };
      if (df.topicMode === 'new') {
        l.newTopic = { topicName: $('#lnTopicName').value.trim(), category: $('#lnCategory').value, expectedEndDate: $('#lnExpected').value };
        if (l.newTopic.topicName.length < 2) errors.push('Enter a topic name.');
        if (!l.newTopic.category) errors.push('Choose a learning category.');
        const dup = df.topics.find(function (t) { return t.name.toLowerCase() === l.newTopic.topicName.toLowerCase() && t.status !== 'COMPLETED'; });
        if (dup) errors.push('"' + dup.name + '" already exists (' + dup.status + '). Select it above instead of creating a duplicate.');
      }
      if (!(l.duration >= 1 && l.duration <= 720 && Number.isInteger(l.duration))) errors.push('Learning duration must be 1–720 minutes.');
      if (l.whatLearned.length < 3) errors.push('Describe what you learned.');
      if (l.resourceUrl && !/^https?:\/\/\S+$/i.test(l.resourceUrl)) errors.push('Resource URL must start with http:// or https://');
      p.studiedToday = 'YES'; p.learning = l;
      const active = df.topics.find(function (t) { return t.status === 'IN PROGRESS'; });
      if (active && (df.topicMode === 'new' || (df.topicMode === 'resume' && df.topicId !== active.topicId))) learningNeedsSwitch = active;
    } else if (st === 'NO') p.studiedToday = 'NO';
    else if (st === '' && df.day.learning.declared) p.studiedToday = '';
  }
  return { payload: p, errors: errors, switchFrom: learningNeedsSwitch };
}

function saveDaily() {
  const df = state.df;
  if (!df || !df.dirty.size) { toast('Nothing to save yet.', 'info'); return; }
  const c = collectDailyPayload();
  if (c.errors.length) { toast(c.errors[0], 'error'); return; }
  const proceed = function (extra) {
    if (extra) Object.assign(c.payload.learning, extra);
    const btn = $('#dfSave');
    withBusy(btn, function () {
      return api('saveDailyHabit', c.payload, { write: true }).then(function (day) {
        const m = memberById(df.memberId);
        toast('Saved ' + (m ? m.name : '') + '\'s habits for ' + fmtDate(df.date) + ' — ' + day.points + '/100 points');
        loadDailyForm(df.memberId, df.date);
      }).catch(function (err) {
        if (err.code === 'ACTIVE_TOPIC_EXISTS' && err.details) { switchTopicDialog(err.details.activeTopic, describeTarget(c.payload.learning), df.date).then(function (x) { if (x) proceed(x); }); return; }
        toastError(err);
      });
    });
  };
  if (c.switchFrom) {
    switchTopicDialog(c.switchFrom, describeTarget(c.payload.learning), df.date).then(function (x) { if (x) proceed(x); });
  } else proceed();
}
function describeTarget(l) {
  if (!l) return 'a new topic';
  if (l.topicMode === 'new') return l.newTopic.topicName;
  const t = state.df.topics.find(function (x) { return x.topicId === l.topicId; });
  return t ? t.name : 'another topic';
}

/* ------------------------------------------------------------------ */
/* 10. TOPIC SWITCH / ACTION DIALOGS (shared)                          */
/* ------------------------------------------------------------------ */
function completionFields(prefix) {
  return '<div class="form-grid">' +
    field('Completion summary', '<textarea id="' + prefix + 'Summary" maxlength="2000" placeholder="What did you cover? How did it go?"></textarea>', { req: true, cls: 'full' }) +
    field('Skills acquired', '<input id="' + prefix + 'Skills" maxlength="1000" placeholder="e.g. Python basics, OOP, file I/O">', { req: true, cls: 'full' }) +
    field('Practical project (optional)', '<input id="' + prefix + 'Project" maxlength="1000" placeholder="e.g. Built a CLI expense tracker">', { cls: 'full' }) +
    field('Resource or project URL (optional)', '<input type="url" id="' + prefix + 'Url" maxlength="500" placeholder="https://github.com/…">', { cls: 'full' }) + '</div>';
}
function readCompletion(prefix) {
  const c = { summary: $('#' + prefix + 'Summary').value.trim(), skills: $('#' + prefix + 'Skills').value.trim(), projectDescription: $('#' + prefix + 'Project').value.trim(), projectUrl: $('#' + prefix + 'Url').value.trim() };
  if (c.summary.length < 5) throw new Error('Completion summary must be at least 5 characters.');
  if (c.skills.length < 2) throw new Error('List the skills you acquired.');
  if (c.projectUrl && !/^https?:\/\/\S+$/i.test(c.projectUrl)) throw new Error('URL must start with http:// or https://');
  return c;
}

/** Asks what to do with the active topic before switching. Resolves {previousTopicAction, completion?, abandonReason?} or null. */
function switchTopicDialog(active, targetName, date) {
  return new Promise(function (resolve) {
    const body = openModal('Switching topics',
      noticeHtml('info', 'You are currently learning ' + active.name + ' (Day ' + active.daysSinceStart + ', ' + active.totalHours + ' h). Before switching to ' + targetName + ', what would you like to do with it?') +
      '<div class="topic-choice">' +
      '<label class="choice selected"><input type="radio" name="swAct" value="PAUSE" checked><div class="grow"><b>Pause it</b><div class="small muted">Keep it for later — you can resume anytime. All logs are preserved.</div></div></label>' +
      '<label class="choice"><input type="radio" name="swAct" value="COMPLETE"><div class="grow"><b>Mark as completed</b><div class="small muted">Record a completion summary and skills acquired.</div></div></label>' +
      '<label class="choice"><input type="radio" name="swAct" value="ABANDON"><div class="grow"><b>Abandon it</b><div class="small muted">Stop tracking it. History is kept and it can still be resumed.</div></div></label>' +
      '</div><div id="swComplete" hidden>' + completionFields('sw') + '</div>' +
      '<div id="swAbandon" hidden>' + field('Reason (optional)', '<input id="swReason" maxlength="300">') + '</div>' +
      '<div class="small muted">The switch will be recorded on ' + fmtDate(date, { day: 'numeric', month: 'short', year: 'numeric' }) + '.</div>',
      [
        { label: 'Cancel', cls: 'ghost', onClick: function () { closeModal(); } },
        { label: 'Continue', cls: 'primary', onClick: function () {
          const act = $('input[name="swAct"]:checked').value;
          const out = { previousTopicAction: act };
          try {
            if (act === 'COMPLETE') out.completion = readCompletion('sw');
            if (act === 'ABANDON') out.abandonReason = $('#swReason').value.trim();
          } catch (e) { toastError(e); return; }
          modalResolve = null; $('#modal').hidden = true; resolve(out);
        } }
      ]);
    modalResolve = function () { resolve(null); };
    $$('input[name="swAct"]', body).forEach(function (r) {
      r.addEventListener('change', function () {
        $$('.choice', body).forEach(function (c) { c.classList.toggle('selected', c.querySelector('input').checked); });
        $('#swComplete').hidden = r.value !== 'COMPLETE' || !r.checked;
        $('#swAbandon').hidden = r.value !== 'ABANDON' || !r.checked;
      });
    });
  });
}

function topicActions(t, active, onDone) {
  return {
    pause: function (btn) {
      const body = openModal('Pause "' + t.name + '"?', '<p>Pausing keeps all sessions. You can resume it later from the Learning Tracker or the daily form.</p>' + field('Pause date', '<input type="date" id="paDate" value="' + state.today + '" min="' + t.startDate + '" max="' + state.today + '">'), [
        { label: 'Cancel', cls: 'ghost', onClick: closeModal },
        { label: 'Pause topic', cls: 'primary', icon: 'pause', onClick: function (b) { withBusy(b, function () { return api('pauseLearningTopic', { topicId: t.topicId, date: $('#paDate', body).value }, { write: true }).then(function () { closeModal(); toast('"' + t.name + '" paused'); onDone(); }).catch(toastError); }); } }
      ]);
    },
    complete: function () {
      const body = openModal('Complete "' + t.name + '"', completionFields('cp') + field('Completion date', '<input type="date" id="cpDate" value="' + state.today + '" min="' + t.startDate + '" max="' + state.today + '">'), [
        { label: 'Cancel', cls: 'ghost', onClick: closeModal },
        { label: 'Mark completed', cls: 'success', icon: 'flag', onClick: function (b) {
          let c; try { c = readCompletion('cp'); } catch (e) { toastError(e); return; }
          withBusy(b, function () { return api('completeLearningTopic', { topicId: t.topicId, summary: c.summary, projectDescription: c.projectDescription, skills: c.skills, projectUrl: c.projectUrl, date: $('#cpDate', body).value }, { write: true }).then(function () { closeModal(); toast('Congratulations — "' + t.name + '" completed!'); onDone(); }).catch(toastError); });
        } }
      ]);
    },
    abandon: function () {
      const body = openModal('Abandon "' + t.name + '"?', noticeHtml('warning', 'The topic will be marked ABANDONED. Its sessions and history stay, and you can resume it later.') + field('Reason (optional)', '<input id="abReason" maxlength="300">'), [
        { label: 'Cancel', cls: 'ghost', onClick: closeModal },
        { label: 'Abandon topic', cls: 'danger', icon: 'ban', onClick: function (b) { withBusy(b, function () { return api('abandonLearningTopic', { topicId: t.topicId, reason: $('#abReason', body).value.trim() }, { write: true }).then(function () { closeModal(); toast('"' + t.name + '" marked abandoned'); onDone(); }).catch(toastError); }); } }
      ]);
    },
    resume: function () {
      const go = function (extra) {
        return api('resumeLearningTopic', Object.assign({ topicId: t.topicId, date: state.today }, extra || {}), { write: true })
          .then(function () { toast('Resumed "' + t.name + '"'); onDone(); }).catch(toastError);
      };
      if (active && active.topicId !== t.topicId) switchTopicDialog(active, t.name, state.today).then(function (x) { if (x) go(x); });
      else confirmDialog('Resume "' + t.name + '"?', 'It becomes your active topic again and new sessions add to its existing total.', 'Resume').then(function (okd) { if (okd) go(); });
    }
  };
}

function newTopicDialog(memberId, active, onDone) {
  const s = state.settings;
  const body = openModal('Start a new topic',
    '<div class="form-grid">' +
    field('Topic name', '<input id="ntName" maxlength="80" placeholder="e.g. React">', { req: true, cls: 'full' }) +
    field('Category', selectHtml('ntCategory', s.learningCategories, '', 'Select category'), { req: true }) +
    field('Start date', '<input type="date" id="ntStart" value="' + state.today + '" max="' + state.today + '">', { req: true }) +
    field('Expected completion (optional)', '<input type="date" id="ntExpected">', { cls: 'full' }) + '</div>' +
    (active ? noticeHtml('info', '"' + active.name + '" is in progress. You will choose to pause, complete or abandon it next.') : ''),
    [
      { label: 'Cancel', cls: 'ghost', onClick: closeModal },
      { label: active ? 'Next' : 'Create topic', cls: 'primary', onClick: function (b) {
        const p = { memberId: memberId, topicName: $('#ntName').value.trim(), category: $('#ntCategory').value, startDate: $('#ntStart').value, expectedEndDate: $('#ntExpected').value };
        if (p.topicName.length < 2) return toast('Enter a topic name.', 'error');
        if (!p.category) return toast('Choose a category.', 'error');
        if (!p.startDate) return toast('Choose a start date.', 'error');
        if (p.expectedEndDate && p.expectedEndDate < p.startDate) return toast('Expected completion cannot be before the start date.', 'error');
        const send = function (extra) {
          return api('createLearningTopic', Object.assign(p, extra || {}), { write: true }).then(function () { closeModal(); toast('Started "' + p.topicName + '"'); onDone(); }).catch(function (err) {
            if (err.code === 'DUPLICATE_TOPIC') { closeModal(); toast(err.message, 'error'); return; }
            toastError(err);
          });
        };
        if (active) { $('#modal').hidden = true; switchTopicDialog(active, p.topicName, p.startDate).then(function (x) { if (x) send(x); else closeModal(); }); }
        else withBusy(b, function () { return send(); });
      } }
    ]);
  return body;
}

/* ------------------------------------------------------------------ */
/* 11. LEADERBOARD                                                     */
/* ------------------------------------------------------------------ */
function renderLeaderboard() {
  const token = state.renderToken;
  const lb = state.lb;
  lb.date = lb.date || state.today;
  $('#lbDate').value = lb.date; $('#lbDate').max = state.today;
  $$('#lbPeriod button').forEach(function (b) { b.classList.toggle('active', b.dataset.v === lb.period); });
  $('#pointsGrid').innerHTML = HABITS.map(function (h) { return '<div>' + esc(HABIT_META[h].label) + '<b>20</b></div>'; }).join('') + '<div>Total<b>100</b></div>';
  $('#lbTable').innerHTML = skeleton(5, 'sk-line');
  api('getLeaderboard', { period: lb.period, date: lb.date }).then(function (d) {
    if (!stillCurrent(token)) return;
    const r = d.range;
    $('#lbRange').textContent = r.period === 'daily' ? fmtLong(r.start) : fmtDate(r.start) + ' – ' + fmtDate(r.fullEnd, { day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' + plural(r.days.length, 'day') + ' counted';
    if (!d.rows.length) { $('#lbTable').innerHTML = emptyState('trophy', 'No members'); return; }
    $('#lbTable').innerHTML = '<div class="table-wrap"><table class="tbl"><thead><tr><th>Rank</th><th>Member</th><th class="num">Points</th><th class="num">Avg / day</th>' +
      HABITS.map(function (h) { return '<th class="num" title="' + HABIT_META[h].label + ' completions">' + HABIT_META[h].label.split(' ')[0] + '</th>'; }).join('') +
      '<th class="num">Missed</th><th class="num">Pending</th><th class="num">Consistency</th></tr></thead><tbody>' +
      d.rows.map(function (x) {
        return '<tr class="clickable" data-member="' + esc(x.memberId) + '"><td><span class="rank r' + x.rank + '">' + x.rank + '</span></td>' +
          '<td><div class="lb-name">' + avatar(x.memberId, 'sm') + esc(x.name) + (x.tied ? ' <span class="tie">TIE</span>' : '') + '</div></td>' +
          '<td class="num"><b>' + x.points + '</b> <span class="muted small">/ ' + x.maxPoints + '</span></td><td class="num">' + x.avgScore + '</td>' +
          HABITS.map(function (h) { return '<td class="num">' + x.habits[h] + '</td>'; }).join('') +
          '<td class="num">' + x.missed + '</td><td class="num muted">' + x.pending + '</td><td class="num">' + x.consistency + '%</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="small muted" style="margin-top:10px">Equal points share a rank. Pending = habits not logged yet; they are not counted as failures.</p>';
    bindMemberCards($('#lbTable'));
  }).catch(function (err) { if (stillCurrent(token)) $('#lbTable').innerHTML = errorState(err, renderLeaderboard); });
}

/* ------------------------------------------------------------------ */
/* 12. ANALYTICS                                                       */
/* ------------------------------------------------------------------ */
function renderAnalytics() {
  const token = state.renderToken;
  const an = state.an;
  an.date = an.date || state.today;
  $('#anDate').value = an.date; $('#anDate').max = state.today;
  $('#anMember').innerHTML = memberOptions(an.member, true);
  $$('#anPeriod button').forEach(function (b) { b.classList.toggle('active', b.dataset.v === an.period); });
  $('#anCharts').innerHTML = skeleton(4, 'sk-card" style="height:300px');
  $('#anTable').innerHTML = '';
  api('getGroupAnalytics', { period: an.period, date: an.date }).then(function (d) {
    if (!stillCurrent(token)) return;
    destroyCharts();
    const r = d.range;
    $('#anRange').textContent = (r.period === 'daily' ? fmtLong(r.start) : fmtDate(r.start) + ' – ' + fmtDate(r.fullEnd)) + ' · ' + plural(r.days.length, 'day');
    const ms = an.member === 'ALL' ? d.members : d.members.filter(function (m) { return m.memberId === an.member; });
    if (!ms.length) { $('#anCharts').innerHTML = '<div class="card wide">' + emptyState('chart', 'No data for this selection') + '</div>'; return; }
    const labels = ms.map(function (m) { return m.name; });
    const colors = ms.map(function (m) { return memberColor(m.memberId); });
    const per = r.period === 'daily' ? 'today' : 'this ' + (r.period === 'weekly' ? 'week' : 'month');
    $('#anCharts').innerHTML =
      chartCard('chWake', 'Early wake-up success rate', '% of days woken by ' + fmtTime12(d.targets.wake) + ' ' + per) +
      chartCard('chWorkout', 'Workout frequency', 'Days with a workout ' + per) +
      chartCard('chFood', 'Healthy food consistency', '% of days marked healthy ' + per) +
      chartCard('chWater', 'Water intake performance', 'Average litres per day (target ' + d.targets.waterLitres + ' L)') +
      chartCard('chUpskill', 'Upskilling frequency', 'Days with at least one learning session ' + per) +
      chartCard('chHours', 'Learning hours comparison', 'Total hours studied ' + per) +
      chartCard('chScore', 'Daily score comparison', 'Average daily score out of 100 ' + per) +
      chartCard('chTrend', 'Weekly improvement trends', 'Average daily score per week, last 8 weeks');
    const pctAxis = { scales: { y: { max: 100, ticks: { callback: function (v) { return v + '%'; } } } } };
    const bar = function (id, label, values, extra) { makeChart(id, { type: 'bar', data: { labels: labels, datasets: [barDataset(label, values, colors)].concat(extra || []) }, options: arguments[4] || {} }); };
    bar('chWake', 'Wake-up success %', ms.map(function (m) { return m.wakeRate; }), null, pctAxis);
    bar('chWorkout', 'Workout days', ms.map(function (m) { return m.workoutDays; }), null, { plugins: { tooltip: { callbacks: { afterLabel: function (c) { return ms[c.dataIndex].workoutMinutes + ' minutes total'; } } } } });
    bar('chFood', 'Healthy food %', ms.map(function (m) { return m.foodRate; }), null, pctAxis);
    bar('chWater', 'Avg litres / day', ms.map(function (m) { return m.avgWaterLitres; }),
      [{ type: 'line', label: 'Target', data: ms.map(function () { return d.targets.waterLitres; }), borderColor: '#94A3B8', borderDash: [5, 4], borderWidth: 2, pointRadius: 0, fill: false }],
      { scales: { y: { ticks: { precision: 1 } } } });
    bar('chUpskill', 'Learning days', ms.map(function (m) { return m.learningDays; }), null, { plugins: { tooltip: { callbacks: { afterLabel: function (c) { return ms[c.dataIndex].learningTargetDays + ' day(s) met the ' + d.targets.learningMinutes + '-min target'; } } } } });
    bar('chHours', 'Learning hours', ms.map(function (m) { return m.learningHours; }), null, { scales: { y: { ticks: { precision: 1 } } } });
    bar('chScore', 'Avg daily score', ms.map(function (m) { return m.avgScore; }), null, { scales: { y: { max: 100 } } });
    const trendSeries = d.trend.series.filter(function (s) { return an.member === 'ALL' || s.memberId === an.member; });
    makeChart('chTrend', {
      type: 'line',
      data: { labels: d.trend.labels.map(function (l) { return fmtDate(l); }), datasets: trendSeries.map(function (s) { return { label: s.name, data: s.values, borderColor: memberColor(s.memberId), backgroundColor: memberColor(s.memberId), borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, tension: .25 }; }) },
      options: { plugins: { legend: { display: true, position: 'bottom' } }, scales: { y: { max: 100 } } }
    });
    $('#anTable').innerHTML = '<div class="table-wrap"><table class="tbl"><thead><tr><th>Member</th><th class="num">Wake-up</th><th class="num">Workout days</th><th class="num">Workout min</th><th class="num">Healthy food</th><th class="num">Avg water</th><th class="num">Learning days</th><th class="num">Learning h</th><th class="num">Avg score</th><th class="num">Pending</th></tr></thead><tbody>' +
      ms.map(function (m) {
        return '<tr><td><div class="lb-name">' + avatar(m.memberId, 'sm') + esc(m.name) + '</div></td><td class="num">' + m.wakeRate + '%</td><td class="num">' + m.workoutDays + '</td><td class="num">' + m.workoutMinutes + '</td><td class="num">' + m.foodRate + '%</td><td class="num">' + m.avgWaterLitres + ' L</td><td class="num">' + m.learningDays + '</td><td class="num">' + m.learningHours + '</td><td class="num"><b>' + m.avgScore + '</b></td><td class="num muted">' + m.pending + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }).catch(function (err) { if (stillCurrent(token)) $('#anCharts').innerHTML = '<div class="card wide">' + errorState(err, renderAnalytics) + '</div>'; });
}

/* ------------------------------------------------------------------ */
/* 13. LEARNING TRACKER                                                */
/* ------------------------------------------------------------------ */
function renderLearning() {
  const token = state.renderToken;
  const memberId = state.params[0] && memberById(state.params[0]) ? state.params[0] : defaultMember();
  state.lastMemberId = memberId;
  $('#ltMember').innerHTML = memberOptions(memberId);
  $('#ltBody').innerHTML = skeleton(3, 'sk-card" style="height:200px;margin-bottom:18px');
  Promise.all([api('getLearningAnalytics', { memberId: memberId }), api('getLearningHistory', { memberId: memberId })]).then(function (res) {
    if (!stillCurrent(token)) return;
    $('#ltBody').innerHTML = learningTrackerHtml(res[0], res[1], memberId);
    bindLearningTracker(res[0], memberId, renderLearning);
    hydrateIcons($('#ltBody')); animateBars($('#ltBody'));
  }).catch(function (err) { if (stillCurrent(token)) $('#ltBody').innerHTML = '<div class="card">' + errorState(err, renderLearning) + '</div>'; });
}

function learningTrackerHtml(a, hist, memberId) {
  const m = memberById(memberId);
  const cur = a.currentTopic;
  const resumable = a.topics.filter(function (t) { return t.status === 'PAUSED' || t.status === 'ABANDONED'; });
  let hero;
  if (cur) {
    hero = '<div class="card"><div class="card-head"><span class="muted small">CURRENT TOPIC</span>' + topicPill(cur.status) + '</div>' +
      '<div class="name" style="font-size:22px;font-weight:800">' + esc(cur.name) + '</div><div class="muted">' + esc(cur.category) + ' · started ' + fmtDate(cur.startDate, { day: 'numeric', month: 'short', year: 'numeric' }) + (cur.expectedEndDate ? ' · target ' + fmtDate(cur.expectedEndDate) : '') + '</div>' +
      '<div class="topic-facts"><div>Topic duration<b>Day ' + cur.daysSinceStart + '</b></div><div>Active learning days<b>' + cur.activeDays + '</b></div>' +
      '<div>Hours studied<b>' + cur.totalHours + ' h</b></div><div>Sessions<b>' + cur.sessions + '</b></div>' +
      '<div>Paused days<b>' + cur.pausedDays + '</b></div><div>Last studied<b>' + (cur.lastStudiedDate ? fmtDate(cur.lastStudiedDate) : '—') + '</b></div></div>' +
      '<div class="actions" style="margin-top:14px">' +
      '<a class="btn primary" href="#daily/' + esc(memberId) + '">' + icon('plus') + 'Log session</a>' +
      '<button class="btn" data-act="pause" data-topic="' + esc(cur.topicId) + '">' + icon('pause') + 'Pause</button>' +
      '<button class="btn" data-act="complete" data-topic="' + esc(cur.topicId) + '">' + icon('flag') + 'Complete</button>' +
      '<button class="btn ghost" data-act="abandon" data-topic="' + esc(cur.topicId) + '">' + icon('ban') + 'Abandon</button>' +
      '<button class="btn ghost" data-act="new">' + icon('plus') + 'Switch to new topic</button></div></div>';
  } else {
    hero = '<div class="card">' + emptyState('book', 'No active topic', (m ? m.name : 'This member') + ' is not learning anything right now.',
      '<div class="actions" style="justify-content:center"><button class="btn primary" data-act="new">' + icon('plus') + 'Start a new topic</button>' +
      resumable.slice(0, 3).map(function (t) { return '<button class="btn" data-act="resume" data-topic="' + esc(t.topicId) + '">' + icon('play') + 'Resume ' + esc(t.name) + '</button>'; }).join('') + '</div>') + '</div>';
  }
  const kpi = function (k, v, sub) { return '<div class="stat"><div class="stat-label">' + esc(k) + '</div><div class="stat-value">' + v + '</div>' + (sub ? '<div class="stat-sub">' + esc(sub) + '</div>' : '') + '</div>'; };
  const stats = '<div class="kpis">' +
    kpi('Total learning', a.totalHours + ' <small>h</small>', plural(a.totalSessions, 'session')) +
    kpi('Learning consistency', a.consistencyPercent + '<small>%</small>', a.studiedDays + ' of last ' + a.windowDays + ' days') +
    kpi('Completed topics', a.completedCount, a.avgDaysPerCompleted !== null ? 'Avg ' + a.avgDaysPerCompleted + ' calendar days each' : 'None yet') +
    kpi('Topic switches', a.switchCount, a.pausedCount + ' paused · ' + a.abandonedCount + ' abandoned') + '</div>';
  const insights = '<div class="card"><div class="card-head"><h3>Insights</h3></div><div class="insights">' + (a.insights.length ? a.insights.map(function (i) { return noticeHtml(i.tone, i.text); }).join('') : '<div class="muted small">Insights appear once there are a few sessions.</div>') + '</div></div>';

  const table = a.topics.length ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>Topic</th><th>Status</th><th>Start</th><th>End / pause</th><th class="num">Calendar days</th><th class="num">Active days</th><th class="num">Paused days</th><th class="num">Hours</th><th class="num">Sessions</th><th></th></tr></thead><tbody>' +
    a.topics.slice().reverse().map(function (t) {
      const end = t.status === 'COMPLETED' ? fmtDate(t.completionDate) : t.status === 'PAUSED' ? fmtDate(t.pauseDate) + ' (paused)' : t.status === 'ABANDONED' ? fmtDate(t.spanEnd) : 'Present';
      let acts = '';
      if (t.status === 'PAUSED' || t.status === 'ABANDONED') acts = '<button class="btn sm" data-act="resume" data-topic="' + esc(t.topicId) + '">' + icon('play') + 'Resume</button>';
      if (t.status === 'PAUSED') acts += ' <button class="btn sm ghost" data-act="complete" data-topic="' + esc(t.topicId) + '">Complete</button>';
      if (t.status === 'COMPLETED') acts = '<button class="btn sm ghost" data-act="view" data-topic="' + esc(t.topicId) + '">Summary</button>';
      return '<tr><td><b>' + esc(t.name) + '</b><div class="small muted">' + esc(t.category) + '</div></td><td>' + topicPill(t.status) + '</td><td>' + fmtDate(t.startDate) + '</td><td>' + end + '</td>' +
        '<td class="num">' + t.calendarDays + '</td><td class="num">' + t.activeDays + '</td><td class="num">' + t.pausedDays + '</td><td class="num">' + t.totalHours + '</td><td class="num">' + t.sessions + '</td><td style="white-space:nowrap">' + acts + '</td></tr>';
    }).join('') + '</tbody></table></div>' : emptyState('book', 'No topics yet', 'Start a topic to begin tracking your learning journey.');

  const sessions = hist.logs.length ? '<div class="list">' + hist.logs.slice(0, 15).map(function (l) {
    return '<div class="list-item"><div class="grow"><div class="tag">' + fmtDate(l.date) + ' · ' + esc(l.topicName) + ' · ' + fmtMin(l.duration) + '</div>' + esc(l.whatLearned) +
      (l.resourceUrl ? ' <a href="' + esc(l.resourceUrl) + '" target="_blank" rel="noopener">' + icon('link', 'sm') + '</a>' : '') + '</div>' +
      '<button class="icon-btn" data-del-session="' + esc(l.logId) + '" aria-label="Delete session">' + icon('trash') + '</button></div>';
  }).join('') + '</div>' : emptyState('clock', 'No sessions yet');

  const events = hist.events.length ? '<div class="activity">' + hist.events.slice(0, 15).map(function (e) {
    return '<div class="activity-item">' + topicPill(e.newStatus || e.action) + '<div><b>' + esc(e.action) + '</b> · ' + esc(e.topicName) + (e.notes ? ' <span class="muted small">— ' + esc(e.notes) + '</span>' : '') + '</div><span class="when">' + fmtDate(e.date) + '</span></div>';
  }).join('') + '</div>' : emptyState('timeline', 'No topic events yet');

  return '<div style="display:grid;gap:18px">' +
    '<div class="topic-hero">' + hero + insights + '</div>' + stats +
    '<div class="card"><div class="card-head"><h3>All topics</h3><button class="btn sm" data-act="new">' + icon('plus') + 'New topic</button></div>' + table + '</div>' +
    '<div class="grid-2"><div class="card"><div class="card-head"><h3>Recent sessions</h3></div>' + sessions + '</div>' +
    '<div class="card"><div class="card-head"><h3>Topic history</h3></div>' + events + '</div></div></div>';
}

function bindLearningTracker(a, memberId, reload) {
  const root = state.route === 'member' ? $('#pdBody') : $('#ltBody');
  const active = a.currentTopic;
  $$('[data-act]', root).forEach(function (b) {
    b.addEventListener('click', function () {
      const act = b.dataset.act;
      if (act === 'new') { newTopicDialog(memberId, active, reload); return; }
      const t = a.topics.find(function (x) { return x.topicId === b.dataset.topic; });
      if (!t) return;
      if (act === 'view') { topicSummaryDialog(t); return; }
      topicActions(t, active, reload)[act](b);
    });
  });
  $$('[data-del-session]', root).forEach(function (b) {
    b.addEventListener('click', function () {
      confirmDialog('Delete learning session?', 'The minutes will be removed from the topic and the day.', 'Delete', true).then(function (okd) {
        if (okd) withBusy(b, function () { return api('deleteLearningLog', { logId: b.dataset.delSession }, { write: true }).then(function () { toast('Session deleted'); reload(); }).catch(toastError); });
      });
    });
  });
}

function topicSummaryDialog(t) {
  openModal(t.name + ' — completed',
    '<div class="topic-facts"><div>Started<b>' + fmtDate(t.startDate) + '</b></div><div>Completed<b>' + fmtDate(t.completionDate) + '</b></div><div>Days to complete<b>' + (t.daysToComplete || '—') + '</b></div><div>Learning time<b>' + t.totalHours + ' h · ' + t.sessions + ' sessions</b></div></div>' +
    '<div><div class="small muted">Summary</div><div>' + esc(t.completionSummary || '—') + '</div></div>' +
    '<div><div class="small muted">Skills acquired</div><div>' + esc(t.skillsAcquired || '—') + '</div></div>' +
    (t.projectDescription ? '<div><div class="small muted">Project</div><div>' + esc(t.projectDescription) + '</div></div>' : '') +
    (t.projectUrl ? '<div><a href="' + esc(t.projectUrl) + '" target="_blank" rel="noopener">' + icon('link') + ' ' + esc(t.projectUrl) + '</a></div>' : ''),
    [{ label: 'Close', cls: 'primary', onClick: closeModal }]);
}

/* ------------------------------------------------------------------ */
/* 14. LEARNING TIMELINE                                               */
/* ------------------------------------------------------------------ */
function renderTimeline() {
  const token = state.renderToken;
  const sel = state.params[0] || $('#tlMember').value || 'ALL';
  $('#tlMember').innerHTML = memberOptions(sel, true);
  $('#tlBody').innerHTML = skeleton(2, 'sk-card" style="height:220px');
  api('getLearningTimeline', { memberId: sel }).then(function (rows) {
    if (!stillCurrent(token)) return;
    $('#tlBody').innerHTML = rows.map(function (r) {
      return '<div class="card"><div class="card-head"><div class="lb-name">' + avatar(r.member.memberId) + '<h3>' + esc(r.member.name.toUpperCase()) + '\'S LEARNING JOURNEY</h3></div>' +
        '<span class="muted small">' + plural(r.topics.length, 'topic') + '</span></div>' + timelineHtml(r.topics) + '</div>';
    }).join('') || emptyState('timeline', 'No members');
    hydrateIcons($('#tlBody'));
  }).catch(function (err) { if (stillCurrent(token)) $('#tlBody').innerHTML = '<div class="card">' + errorState(err, renderTimeline) + '</div>'; });
}

function timelineHtml(topics) {
  if (!topics.length) return emptyState('book', 'No topics yet', 'Topics appear here as soon as a learning session is logged.');
  const ic = { 'IN PROGRESS': 'play', PAUSED: 'pause', COMPLETED: 'check', ABANDONED: 'x' };
  const cls = { 'IN PROGRESS': 'inprogress', PAUSED: 'paused', COMPLETED: 'completed', ABANDONED: 'abandoned' };
  return '<div class="timeline">' + topics.map(function (t, i) {
    const end = t.status === 'IN PROGRESS' ? 'Present' : fmtDate(t.spanEnd, { day: 'numeric', month: 'long' });
    const next = topics[i + 1];
    return '<div class="tl-item"><div class="tl-dot ' + cls[t.status] + '">' + icon(ic[t.status]) + '</div><div>' +
      '<div class="tl-card"><div class="name">' + esc(t.name) + ' ' + topicPill(t.status) + '</div>' +
      '<div class="dates">' + fmtDate(t.startDate, { day: 'numeric', month: 'long' }) + ' – ' + end + ' · ' + esc(t.category) + '</div>' +
      '<div class="facts"><span><b>' + t.calendarDays + '</b> calendar days</span><span><b>' + t.activeDays + '</b> active days</span><span><b>' + t.totalHours + '</b> h</span><span><b>' + t.sessions + '</b> sessions</span>' +
      (t.pausedDays ? '<span><b>' + t.pausedDays + '</b> paused days</span>' : '') + (t.daysToComplete ? '<span>Completed in <b>' + t.daysToComplete + '</b> days</span>' : '') + '</div>' +
      (t.status === 'COMPLETED' && t.skillsAcquired ? '<div class="small muted" style="margin-top:6px">Skills: ' + esc(t.skillsAcquired) + '</div>' : '') + '</div>' +
      (next && t.switchedTo ? '<div class="tl-switch">' + icon('arrowDown') + 'Switched to ' + esc(t.switchedTo) + '</div>' : '') +
      '</div></div>';
  }).join('') + '</div>';
}

/* ------------------------------------------------------------------ */
/* 15. MEMBERS                                                         */
/* ------------------------------------------------------------------ */
function renderMembers() {
  const token = state.renderToken;
  $('#mbGrid').innerHTML = skeleton(5);
  Promise.all([api('getDashboardData', { date: state.today }), api('getMembers', { includeInactive: true })]).then(function (res) {
    if (!stillCurrent(token)) return;
    state.members = res[1];
    const cards = res[0].members;
    const inactive = res[1].filter(function (m) { return !m.active; });
    $('#mbGrid').innerHTML = cards.map(function (c) {
      return '<div class="member-card" style="cursor:default">' +
        '<div class="mc-top">' + avatar(c.memberId) + '<div><div class="mc-name">' + esc(c.name) + '</div><div class="small muted">' + esc(c.memberId) + ' · Active</div></div></div>' +
        '<div class="mc-meta"><div><span>Today</span><b>' + c.points + ' pts · ' + c.completed + '/5</b></div><div><span>Streak</span><b>' + plural(c.currentStreak, 'day') + ' (best ' + c.longestStreak + ')</b></div><div><span>Learning</span><b>' + (c.currentTopic ? esc(c.currentTopic) + ' · Day ' + c.currentTopicDay : '—') + '</b></div></div>' +
        '<div class="actions"><button class="btn sm primary" data-open="' + esc(c.memberId) + '">Dashboard</button><a class="btn sm" href="#daily/' + esc(c.memberId) + '">Log habits</a>' +
        '<button class="btn sm ghost" data-status="INACTIVE" data-id="' + esc(c.memberId) + '">Deactivate</button></div></div>';
    }).join('') + inactive.map(function (m) {
      return '<div class="member-card mc-inactive" style="cursor:default"><div class="mc-top">' + avatar(m.memberId) + '<div><div class="mc-name">' + esc(m.name) + '</div><div class="small muted">' + esc(m.memberId) + ' · Inactive</div></div></div>' +
        '<div class="actions"><button class="btn sm" data-status="ACTIVE" data-id="' + esc(m.memberId) + '">Reactivate</button></div></div>';
    }).join('');
    $$('[data-open]', $('#mbGrid')).forEach(function (b) { b.addEventListener('click', function () { navigate('member/' + b.dataset.open); }); });
    $$('[data-status]', $('#mbGrid')).forEach(function (b) {
      b.addEventListener('click', function () {
        const m = memberById(b.dataset.id); const deact = b.dataset.status === 'INACTIVE';
        confirmDialog((deact ? 'Deactivate ' : 'Reactivate ') + m.name + '?', deact ? 'They will be hidden from dashboards and leaderboards. All their records are kept and they can be reactivated anytime.' : 'They will appear on dashboards and leaderboards again.', deact ? 'Deactivate' : 'Reactivate', deact).then(function (okd) {
          if (okd) withBusy(b, function () { return api('updateMemberStatus', { memberId: m.memberId, status: b.dataset.status }, { write: true }).then(function () { toast(m.name + (deact ? ' deactivated' : ' reactivated')); renderMembers(); }).catch(toastError); });
        });
      });
    });
    hydrateIcons($('#mbGrid'));
  }).catch(function (err) { if (stillCurrent(token)) $('#mbGrid').innerHTML = '<div class="card" style="grid-column:1/-1">' + errorState(err, renderMembers) + '</div>'; });
}

/* ------------------------------------------------------------------ */
/* 16. PERSONAL MEMBER DASHBOARD                                       */
/* ------------------------------------------------------------------ */
function renderMemberDashboard() {
  const token = state.renderToken;
  const memberId = state.params[0];
  const m = memberById(memberId);
  if (!m) { $('#pdBody').innerHTML = '<div class="card">' + emptyState('users', 'Member not found', '', '<a class="btn" href="#members">Back to members</a>') + '</div>'; return; }
  state.lastMemberId = memberId;
  const date = state.pd.memberId === memberId && state.pd.date ? state.pd.date : state.today;
  state.pd.memberId = memberId; state.pd.date = date;
  $('#pdBody').innerHTML = skeleton(4, 'sk-card" style="height:200px;margin-bottom:18px');
  api('getMemberDashboard', { memberId: memberId, date: date }).then(function (d) {
    if (!stillCurrent(token)) return;
    state.pd.calMonth = d.calendar.month; state.pd.calYear = d.calendar.year;
    $('#pdBody').innerHTML = memberDashboardHtml(d);
    bindMemberDashboard(d);
    hydrateIcons($('#pdBody')); animateBars($('#pdBody'));
  }).catch(function (err) { if (stillCurrent(token)) $('#pdBody').innerHTML = '<div class="card">' + errorState(err, renderMemberDashboard) + '</div>'; });
}

function habitTileDetail(h, day) {
  if (h === 'wake') return day.wake.time ? 'Woke ' + fmtTime12(day.wake.time) + ' · target ' + fmtTime12(day.wake.target) : 'Target ' + fmtTime12(day.wake.target);
  if (h === 'exercise') return day.statuses.exercise === 'YES' ? esc(day.exercise.type) + ' · ' + day.exercise.duration + ' min' : (day.exercise.notes ? esc(day.exercise.notes) : '—');
  if (h === 'food') return plural(day.food.entries, 'meal') + ' logged';
  if (h === 'water') return day.water.litres + ' L / ' + (day.water.targetMl / 1000) + ' L';
  return fmtMin(day.learning.minutes) + ' / ' + day.learning.targetMin + ' min';
}

function rateList(summary) {
  return '<div class="rate-list">' + HABITS.map(function (h) {
    const r = summary.habits[h];
    return '<div class="rate-row"><span>' + esc(HABIT_META[h].label) + '</span>' + progressBar(r.rate, r.rate >= 80 ? 'success' : '') + '<span class="v">' + r.rate + '%</span></div>';
  }).join('') + '</div>';
}

function memberDashboardHtml(d) {
  const m = d.member, day = d.day, st = d.streaks;
  const head = '<div class="pd-head"><a class="btn ghost" href="#members">' + icon('back') + 'Members</a>' + avatar(m.memberId, 'lg') +
    '<div class="grow"><h1>' + esc(m.name) + '</h1><div class="muted">Personal dashboard · ' + fmtLong(d.date) + '</div></div>' +
    '<label class="field inline"><span>Date</span><input type="date" id="pdDate" value="' + d.date + '" max="' + d.today + '"></label>' +
    '<a class="btn primary" href="#daily/' + esc(m.memberId) + '/' + d.date + '">' + icon('edit') + 'Log / edit this day</a></div>';

  const tiles = '<div class="today-habits">' + HABITS.map(function (h) {
    const s = day.statuses[h];
    return '<div class="habit-tile ' + (s === 'YES' ? 'yes' : s === 'NO' ? 'no' : '') + '"><div class="t">' + icon(HABIT_META[h].icon) + esc(HABIT_META[h].label) + '</div>' + statusPill(s) + '<div class="d">' + habitTileDetail(h, day) + '</div></div>';
  }).join('') + '</div>';

  const w = d.weekly.summary, mo = d.monthly.summary;
  const kpi = function (k, v, sub) { return '<div class="stat"><div class="stat-label">' + esc(k) + '</div><div class="stat-value">' + v + '</div><div class="stat-sub">' + esc(sub) + '</div></div>'; };
  const kpis = '<div class="kpis">' +
    kpi('Daily score', day.points + ' <small>/ 100</small>', day.completed + ' done · ' + day.pending + ' pending') +
    kpi('Current streak', st.current + ' <small>days</small>', 'Longest: ' + st.longest + ' days (all 5 habits)') +
    kpi('This week', w.avgScore + ' <small>avg/day</small>', w.points + ' pts · ' + w.fullDays + ' perfect days') +
    kpi('This month', mo.consistency + '<small>%</small>', 'Consistency · ' + mo.points + ' pts') + '</div>';

  const streaks = '<div class="card"><div class="card-head"><h3>Habit streaks</h3><span class="muted small">current · best</span></div><div class="streak-row">' + HABITS.map(function (h) {
    return '<div class="streak-chip">' + esc(HABIT_META[h].label) + '<b>' + st.habits[h].current + ' <span class="muted small">· ' + st.habits[h].longest + '</span></b></div>';
  }).join('') + '</div></div>';

  const weekly = '<div class="card"><div class="card-head"><h3>Weekly performance</h3><span class="muted small">' + fmtDate(d.weekly.range.start) + ' – ' + fmtDate(d.weekly.range.fullEnd) + '</span></div>' +
    '<div class="chart-box" style="height:180px"><canvas id="pdWeek" role="img" aria-label="Daily points this week"></canvas></div><div style="margin-top:12px">' + rateList(w) + '</div></div>';
  const monthly = '<div class="card"><div class="card-head"><h3>Monthly performance</h3><span class="muted small">' + fmtDate(d.monthly.range.start, { month: 'long', year: 'numeric' }) + '</span></div>' +
    '<div class="topic-facts" style="margin:0 0 14px"><div>Points<b>' + mo.points + '</b></div><div>Perfect days<b>' + mo.fullDays + '</b></div><div>Workout minutes<b>' + mo.workoutMinutes + '</b></div><div>Learning<b>' + mo.learningHours + ' h</b></div><div>Water total<b>' + mo.waterLitres + ' L</b></div><div>Avg water/day<b>' + mo.avgWaterLitres + ' L</b></div></div>' + rateList(mo) + '</div>';

  const water = '<div class="card"><div class="card-head"><h3>Water intake</h3>' + statusPill(day.statuses.water) + '</div>' +
    '<div class="water-hero"><div><span class="big">' + day.water.litres + ' L</span> <span class="muted">/ ' + (day.water.targetMl / 1000) + ' L</span></div><div class="muted small">' + day.water.percent + '% · ' + (day.water.remainingMl ? fmtMl(day.water.remainingMl) + ' remaining' : 'target reached') + '</div></div>' +
    progressBar(day.water.percent, 'lg ' + (day.water.ml >= day.water.targetMl ? 'success' : '')) +
    '<div class="chart-box" style="height:150px;margin-top:14px"><canvas id="pdWater" role="img" aria-label="Water last 14 days"></canvas></div></div>';

  const workouts = '<div class="card"><div class="card-head"><h3>Workout history</h3><span class="muted small">last 30 days</span></div>' + (d.workouts.length ?
    '<div class="table-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Status</th><th>Type</th><th class="num">Minutes</th><th>Details</th></tr></thead><tbody>' + d.workouts.map(function (x) {
      return '<tr class="clickable" data-day="' + x.date + '"><td>' + fmtDate(x.date) + '</td><td>' + statusPill(x.status) + '</td><td>' + esc(x.type || '—') + '</td><td class="num">' + (x.duration || '—') + '</td><td class="small muted">' + esc(x.description || x.notes || '') + '</td></tr>';
    }).join('') + '</tbody></table></div>' : emptyState('dumbbell', 'No workouts logged yet')) + '</div>';

  const food = '<div class="card"><div class="card-head"><h3>Healthy food history</h3><span class="muted small">last 30 days</span></div>' + (d.food.length ?
    '<div class="list">' + d.food.slice(0, 12).map(function (f) {
      return '<div class="list-item" data-day="' + f.date + '" style="cursor:pointer"><div class="grow"><div class="tag">' + fmtDate(f.date) + '</div>' +
        (f.entries.length ? f.entries.map(function (e) { return '<div><b>' + esc(e.mealCategory) + ':</b> ' + esc(e.description) + '</div>'; }).join('') : '<span class="muted">No meal descriptions</span>') + '</div>' + statusPill(f.status) + '</div>';
    }).join('') + '</div>' : emptyState('food', 'No meals logged yet')) + '</div>';

  const la = d.learning;
  const completed = la.topics.filter(function (t) { return t.status === 'COMPLETED'; });
  const paused = la.topics.filter(function (t) { return t.status === 'PAUSED'; });
  const learning = '<div class="card"><div class="card-head"><h3>Learning tracker</h3><a class="link" href="#learning/' + esc(m.memberId) + '">Open tracker →</a></div>' +
    (la.currentTopic ? '<div class="strong" style="font-size:18px">' + esc(la.currentTopic.name) + ' ' + topicPill('IN PROGRESS') + '</div><div class="muted small">Day ' + la.currentTopic.daysSinceStart + ' · ' + la.currentTopic.activeDays + ' active days · ' + la.currentTopic.totalHours + ' h</div>' : '<div class="muted">No active topic.</div>') +
    '<div class="topic-facts"><div>Total learning<b>' + la.totalHours + ' h</b></div><div>Sessions<b>' + la.totalSessions + '</b></div><div>Consistency<b>' + la.consistencyPercent + '%</b></div><div>Switches<b>' + la.switchCount + '</b></div><div>Completed<b>' + la.completedCount + '</b></div><div>Avg days / completed<b>' + (la.avgDaysPerCompleted !== null ? la.avgDaysPerCompleted : '—') + '</b></div></div></div>';
  const topicList = function (title, arr, emptyText) {
    return '<div class="card"><div class="card-head"><h3>' + title + '</h3><span class="muted small">' + arr.length + '</span></div>' + (arr.length ? '<div class="list">' + arr.map(function (t) {
      return '<div class="list-item"><div class="grow"><b>' + esc(t.name) + '</b> <span class="muted small">' + esc(t.category) + '</span><div class="small muted">' + fmtDate(t.startDate) + ' – ' + fmtDate(t.spanEnd) + ' · ' + t.calendarDays + ' calendar days · ' + t.activeDays + ' active · ' + t.totalHours + ' h</div>' +
        (t.status === 'COMPLETED' && t.skillsAcquired ? '<div class="small">Skills: ' + esc(t.skillsAcquired) + '</div>' : '') + '</div>' +
        (t.status === 'PAUSED' ? '<button class="btn sm" data-act="resume" data-topic="' + esc(t.topicId) + '">' + icon('play') + 'Resume</button>' : '<button class="btn sm ghost" data-act="view" data-topic="' + esc(t.topicId) + '">Summary</button>') + '</div>';
    }).join('') + '</div>' : '<div class="muted small">' + emptyText + '</div>') + '</div>';
  };

  const insights = '<div class="card"><div class="card-head"><h3>Personal insights</h3></div><div class="insights">' + d.insights.map(function (i) { return noticeHtml(i.tone, i.text); }).join('') + '</div></div>';

  return '<div style="display:grid;gap:18px">' + head +
    '<div class="card"><div class="card-head"><h3>' + (d.date === d.today ? "Today's habits" : 'Habits on ' + fmtDate(d.date)) + '</h3><span class="muted small">' + day.points + ' / 100 points</span></div>' + tiles + '</div>' +
    kpis + streaks +
    '<div class="grid-2">' + weekly + monthly + '</div>' +
    '<div class="grid-2"><div class="card"><div class="card-head"><h3>Habit calendar</h3><div class="cal-head"><button class="icon-btn" id="calPrev" aria-label="Previous month">' + icon('chevL') + '</button><span class="title" id="calTitle"></span><button class="icon-btn" id="calNext" aria-label="Next month">' + icon('chevR') + '</button></div></div><div id="calBody">' + calendarHtml(d.calendar) + '</div></div>' + water + '</div>' +
    '<div class="grid-2">' + workouts + food + '</div>' +
    '<div class="grid-2">' + learning + insights + '</div>' +
    '<div class="card"><div class="card-head"><h3>Learning timeline</h3></div>' + timelineHtml(la.topics) + '</div>' +
    '<div class="grid-2">' + topicList('Completed topics', completed, 'No completed topics yet.') + topicList('Paused topics', paused, 'No paused topics.') + '</div>' +
    '</div>';
}

function calendarHtml(cal) {
  const dows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  let html = '<div class="calendar">' + dows.map(function (x) { return '<div class="cal-dow">' + x + '</div>'; }).join('');
  for (let i = 0; i < cal.firstWeekday; i++) html += '<div class="cal-empty"></div>';
  html += cal.days.map(function (dd) {
    const n = +dd.date.slice(8);
    const label = dd.state === 'future' ? 'future' : dd.state === 'none' ? 'no records' : dd.completed + ' of 5 habits completed';
    return '<button class="cal-day ' + dd.state + (dd.date === state.today ? ' today' : '') + '" data-cal="' + dd.date + '"' + (dd.state === 'future' ? ' disabled' : '') + ' title="' + fmtDate(dd.date) + ': ' + label + '" aria-label="' + fmtDate(dd.date) + ', ' + label + '">' + n +
      (dd.state !== 'future' && dd.state !== 'none' ? '<small>' + dd.completed + '/5</small>' : '') + '</button>';
  }).join('') + '</div>';
  html += '<div class="cal-legend"><span><i style="background:var(--success)"></i>All 5 completed</span><span><i style="background:#FCD34D"></i>Partially completed</span><span><i style="background:var(--danger)"></i>Logged habits missed</span><span><i style="background:#E2E8F0"></i>No records</span></div>';
  return html;
}

function bindMemberDashboard(d) {
  const memberId = d.member.memberId;
  $('#pdDate').addEventListener('change', function () { if (this.value && this.value <= state.today) { state.pd.date = this.value; renderMemberDashboard(); } });
  const setCalTitle = function () { $('#calTitle').textContent = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(state.pd.calYear, state.pd.calMonth - 1, 1))); };
  const loadCal = function (delta) {
    let mth = state.pd.calMonth + delta, yr = state.pd.calYear;
    if (mth < 1) { mth = 12; yr--; } if (mth > 12) { mth = 1; yr++; }
    const curY = +state.today.slice(0, 4), curM = +state.today.slice(5, 7);
    if (yr > curY || (yr === curY && mth > curM)) return;
    state.pd.calMonth = mth; state.pd.calYear = yr; setCalTitle();
    $('#calBody').innerHTML = skeleton(1, 'sk-card" style="height:260px');
    api('getHabitCalendar', { memberId: memberId, month: mth, year: yr }).then(function (cal) { $('#calBody').innerHTML = calendarHtml(cal); bindCalDays(); }).catch(function (e) { $('#calBody').innerHTML = errorState(e, function () { loadCal(0); }); });
  };
  const bindCalDays = function () { $$('[data-cal]', $('#calBody')).forEach(function (b) { b.addEventListener('click', function () { dayDetailsDialog(memberId, b.dataset.cal); }); }); };
  setCalTitle(); bindCalDays();
  $('#calPrev').addEventListener('click', function () { loadCal(-1); });
  $('#calNext').addEventListener('click', function () { loadCal(1); });
  $$('[data-day]', $('#pdBody')).forEach(function (el) { el.addEventListener('click', function () { dayDetailsDialog(memberId, el.dataset.day); }); });
  bindLearningTracker(d.learning, memberId, renderMemberDashboard);

  const col = memberColor(memberId);
  const weekMap = {}; d.weekly.summary.daily.forEach(function (x) { weekMap[x.date] = x; });
  const weekDays = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return addDays(d.weekly.range.start, i); });
  makeChart('pdWeek', {
    type: 'bar',
    data: { labels: weekDays.map(function (x) { return fmtDate(x, { weekday: 'short' }); }), datasets: [barDataset('Points', weekDays.map(function (x) { const r = weekMap[x]; return r ? r.points : null; }), col)] },
    options: { scales: { y: { max: 100, ticks: { stepSize: 20 } } }, plugins: { tooltip: { callbacks: { afterLabel: function (c) { const r = weekMap[weekDays[c.dataIndex]]; return r ? r.completed + ' / 5 habits' : 'Upcoming'; } } } } }
  });
  makeChart('pdWater', {
    type: 'bar',
    data: { labels: d.water.map(function (x) { return fmtDate(x.date); }), datasets: [
      barDataset('Litres', d.water.map(function (x) { return Math.round(x.ml / 10) / 100; }), '#2a78d6'),
      { type: 'line', label: 'Target', data: d.water.map(function () { return d.day.water.targetMl / 1000; }), borderColor: '#94A3B8', borderDash: [5, 4], borderWidth: 2, pointRadius: 0 }
    ] },
    options: { scales: { y: { ticks: { precision: 1 } }, x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } } } }
  });
}

function dayDetailsDialog(memberId, date) {
  const m = memberById(memberId);
  openModal((m ? m.name : '') + ' · ' + fmtLong(date), skeleton(4, 'sk-line'), []);
  api('getDailyHabit', { memberId: memberId, date: date }).then(function (day) {
    if ($('#modal').hidden) return;
    const row = function (h, extra) { return '<div class="list-item"><div class="grow"><b>' + esc(HABIT_META[h].label) + '</b><div class="small muted">' + habitTileDetail(h, day) + '</div>' + (extra || '') + '</div>' + statusPill(day.statuses[h]) + '</div>'; };
    $('#modalBody').innerHTML = '<div class="water-hero"><div><span class="big" style="font-size:24px">' + day.points + '</span> <span class="muted">/ 100 points</span></div><span class="muted small">' + day.completed + ' completed · ' + day.missed + ' missed · ' + day.pending + ' not logged</span></div>' +
      '<div class="list">' +
      row('wake', day.wake.notes ? '<div class="small">' + esc(day.wake.notes) + '</div>' : '') +
      row('exercise', day.exercise.description ? '<div class="small">' + esc(day.exercise.description) + '</div>' : '') +
      row('food', day.foodLogs.map(function (f) { return '<div class="small"><b>' + esc(f.mealCategory) + ':</b> ' + esc(f.description) + '</div>'; }).join('') + (day.food.notes ? '<div class="small muted">' + esc(day.food.notes) + '</div>' : '')) +
      row('water', day.waterLogs.length ? '<div class="small muted">' + day.waterLogs.map(function (l) { return '+' + fmtMl(l.amountMl); }).join(', ') + '</div>' : '') +
      row('learning', day.learningLogs.map(function (l) { return '<div class="small"><b>' + esc(l.topicName) + '</b> (' + l.duration + ' min): ' + esc(l.whatLearned) + '</div>'; }).join('')) +
      '</div>' + (day.updatedAt ? '<div class="small muted">Last updated ' + relTime(day.updatedAt) + '</div>' : '');
    $('#modalFoot').innerHTML = '';
    const close = document.createElement('button'); close.className = 'btn ghost'; close.textContent = 'Close'; close.onclick = closeModal;
    const edit = document.createElement('button'); edit.className = 'btn primary'; edit.innerHTML = icon('edit') + 'Edit this day';
    edit.onclick = function () { closeModal(); navigate('daily/' + memberId + '/' + date); };
    $('#modalFoot').appendChild(close); $('#modalFoot').appendChild(edit);
  }).catch(function (e) { $('#modalBody').innerHTML = errorState(e, function () { dayDetailsDialog(memberId, date); }); });
}

/* ------------------------------------------------------------------ */
/* 17. STATIC EVENT BINDINGS & INIT                                    */
/* ------------------------------------------------------------------ */
function bindStatic() {
  document.addEventListener('click', function (e) {
    const a = e.target.closest('a[href^="#"]');
    if (a) { e.preventDefault(); navigate(a.getAttribute('href')); }
  });
  $('#menuBtn').addEventListener('click', openSidebar);
  $('#scrim').addEventListener('click', closeSidebar);
  $('#refreshBtn').addEventListener('click', function () { reloadMembers().then(function () { render([state.route].concat(state.params).join('/')); toast('Data refreshed', 'info'); }); });
  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', function (e) { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

  $('#ovDate').addEventListener('change', function () { if (this.value && this.value <= state.today) { state.ovDate = this.value; renderOverview(); } });

  const dfSwitch = function (memberId, date) {
    const df = state.df;
    if (df && df.dirty.size && !window.confirm('Discard unsaved changes?')) { $('#dfMember').value = df.memberId; $('#dfDate').value = df.date; return; }
    loadDailyForm(memberId, date);
  };
  $('#dfMember').addEventListener('change', function () { dfSwitch(this.value, $('#dfDate').value || state.today); });
  $('#dfDate').addEventListener('change', function () {
    if (!this.value || this.value > state.today) { toast('Pick today or a past date.', 'error'); this.value = state.df.date; return; }
    dfSwitch($('#dfMember').value, this.value);
  });
  $('#dfSave').addEventListener('click', saveDaily);
  $('#dfReset').addEventListener('click', function () {
    confirmDialog('Discard changes?', 'Unsaved edits on this page will be lost.', 'Discard', true).then(function (okd) { if (okd) loadDailyForm(state.df.memberId, state.df.date); });
  });

  $$('#lbPeriod button').forEach(function (b) { b.addEventListener('click', function () { state.lb.period = b.dataset.v; renderLeaderboard(); }); });
  $('#lbDate').addEventListener('change', function () { if (this.value) { state.lb.date = this.value > state.today ? state.today : this.value; renderLeaderboard(); } });
  $$('#anPeriod button').forEach(function (b) { b.addEventListener('click', function () { state.an.period = b.dataset.v; renderAnalytics(); }); });
  $('#anDate').addEventListener('change', function () { if (this.value) { state.an.date = this.value > state.today ? state.today : this.value; renderAnalytics(); } });
  $('#anMember').addEventListener('change', function () { state.an.member = this.value; renderAnalytics(); });
  $('#ltMember').addEventListener('change', function () { navigate('learning/' + this.value); });
  $('#tlMember').addEventListener('change', function () { navigate('timeline/' + this.value); });

  $('#addMemberForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const name = $('#newMemberName').value.trim();
    if (!/^[A-Za-z][A-Za-z .'-]{1,39}$/.test(name)) { toast('Use 2–40 letters (spaces, dots, apostrophes, hyphens allowed).', 'error'); return; }
    withBusy($('#addMemberForm button'), function () {
      return api('addMember', { name: name }, { write: true }).then(function (m) { $('#newMemberName').value = ''; toast(m.name + ' joined the club!'); return reloadMembers().then(renderMembers); }).catch(toastError);
    });
  });

  $('#setupSave').addEventListener('click', function () {
    const u = $('#setupUrl').value.trim();
    if (!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(u)) { toast('Paste the Web App URL from Apps Script (…/exec).', 'error'); return; }
    storageSet('cc_api_url', u); location.reload();
  });

  window.addEventListener('beforeunload', function (e) { if (state.df && state.df.dirty.size) { e.preventDefault(); e.returnValue = ''; } });
}

function startQuotes() {
  let i = Math.floor(Math.random() * QUOTES.length);
  const show = function () {
    const el = $('#quoteText');
    el.style.opacity = 0;
    setTimeout(function () { el.textContent = QUOTES[i % QUOTES.length]; $('#sidebarQuote').textContent = QUOTES[(i + 3) % QUOTES.length]; el.style.opacity = 1; i++; }, 250);
  };
  show(); setInterval(show, CONFIG.QUOTE_INTERVAL_MS);
}

function updateTodayChip() {
  state.today = istToday();
  $('#todayText').textContent = new Intl.DateTimeFormat('en-IN', { timeZone: CONFIG.TIMEZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
}

function reloadMembers() { return api('getMembers', { includeInactive: true }).then(function (ms) { state.members = ms; }); }

function init() {
  hydrateIcons(document);
  bindStatic();
  updateTodayChip();
  setInterval(updateTodayChip, 60000);
  startQuotes();
  if (!isGas() && !apiUrl()) {
    $$('.view').forEach(function (v) { v.hidden = v.id !== 'view-setup'; });
    $('#topbarTitle').textContent = 'Setup';
    return;
  }
  $('#view-overview').hidden = false;
  $('#ovMembers').innerHTML = skeleton(5);
  api('getBootstrap').then(function (b) {
    state.members = b.members; state.settings = b.settings; state.today = b.today || state.today;
    state.ready = true;
    navigate(location.hash || '#overview');
  }).catch(function (err) {
    $('#ovMembers').innerHTML = '<div class="card" style="grid-column:1/-1">' + errorState(err, function () { location.reload(); }) +
      (err.code === 'DB_NOT_INITIALIZED' || err.code === 'NOT_CONFIGURED' ? noticeHtml('info', 'Open the Apps Script editor and run initializeDatabase() (see README).') : '') + '</div>';
  });
}

document.addEventListener('DOMContentLoaded', init);