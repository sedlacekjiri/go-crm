// Entry point: login, navigation (sidebar / phone tab bar), hash router.
import { dueCount, today } from './lib.js';
import { ICONS, seg } from './components.js';
import { currency, hasToken, isAdmin, loadData, loadTodayRate, setToken, state } from './store.js';
import { $, esc, openModal, storage, toast } from './util.js';
import * as dashboard from './views/dashboard.js';
import * as goals from './views/goals.js';
import * as importView from './views/import.js';
import * as partner from './views/partner.js';
import * as partnerForm from './views/partner-form.js';
import * as partners from './views/partners.js';
import * as pipeline from './views/pipeline.js';
import * as sales from './views/sales.js';
import * as tasks from './views/tasks.js';

const NAV = [
  { href: '#/', key: 'home', label: 'Home', icon: ICONS.home },
  { href: '#/partners', key: 'partners', label: 'Partners', icon: ICONS.partners },
  { href: '#/tasks', key: 'tasks', label: 'Tasks', icon: ICONS.tasks },
  { href: '#/pipeline', key: 'pipeline', label: 'Pipeline', icon: ICONS.pipeline },
  { href: '#/sales', key: 'sales', label: 'Sales', icon: ICONS.sales },
  { href: '#/goals', key: 'goals', label: 'Goals', icon: ICONS.goals },
];

const ROUTES = [
  { re: /^\/$/, nav: 'home', view: dashboard },
  { re: /^\/partners$/, nav: 'partners', view: partners },
  { re: /^\/partners\/new$/, nav: 'partners', view: partnerForm },
  { re: /^\/partner\/([\w-]+)$/, nav: 'partners', view: partner },
  { re: /^\/partner\/([\w-]+)\/edit$/, nav: 'partners', view: partnerForm },
  { re: /^\/tasks$/, nav: 'tasks', view: tasks },
  { re: /^\/pipeline$/, nav: 'pipeline', view: pipeline },
  { re: /^\/sales$/, nav: 'sales', view: sales },
  { re: /^\/sales\/import$/, nav: 'sales', view: importView },
  { re: /^\/goals$/, nav: 'goals', view: goals },
];

const page = $('#page');

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path, query: new URLSearchParams(qs || '') };
}

export const navigate = (hash) => {
  if (location.hash === hash) render();
  else location.hash = hash;
};

let renderId = 0;
async function render() {
  const { path, query } = parseHash();
  const route = ROUTES.find((r) => r.re.test(path)) || ROUTES[0];
  const params = path.match(route.re)?.slice(1) ?? [];
  highlightNav(route.nav);
  const id = ++renderId;
  page.onclick = null; // views that use a page-wide click handler set it again
  try {
    await route.view.render(page, { params, query, navigate, refresh, isCurrent: () => id === renderId });
  } catch (e) {
    if (id === renderId) page.innerHTML = `<div class="banner error-banner">${esc(e.message || e)}</div>`;
  }
}

// Reload the CRM data from the server and redraw the current page.
export async function refresh() {
  await loadData();
  updateBadges();
  await render();
}

function highlightNav(key) {
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === key));
}

function updateBadges() {
  const due = dueCount(today(), state);
  document.querySelectorAll('[data-nav="tasks"] .badge-count').forEach((b) => {
    b.textContent = due;
    b.hidden = !due;
  });
}

function buildNav() {
  const item = (n) =>
    `<a href="${n.href}" data-nav="${n.key}">${n.icon}<span>${n.label}</span>${n.key === 'tasks' ? '<em class="badge-count" hidden title="Due today or overdue"></em>' : ''}</a>`;
  $('#nav').innerHTML = NAV.map(item).join('');
  $('#tabbar').innerHTML = NAV.map(item).join('');
  $('#roleNote').textContent = isAdmin() ? 'Admin' : 'View only';
  renderCurrencySwitch();
}

function renderCurrencySwitch() {
  const html = seg('currency', currency.value, [
    { value: 'EUR', label: 'EUR' },
    { value: 'ISK', label: 'ISK' },
  ]);
  document.querySelectorAll('.currency-seg').forEach((el) => {
    el.outerHTML = html.replace('class="seg"', 'class="seg currency-seg"');
  });
}

// Global clicks: currency switch, theme, log out, phone menu.
document.addEventListener('click', (e) => {
  const cur = e.target.closest('.currency-seg button[data-value]');
  if (cur) {
    currency.set(cur.dataset.value);
    renderCurrencySwitch();
    render();
    return;
  }
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'theme') toggleTheme();
  if (action === 'logout') logout();
  if (action === 'menu') {
    const m = openModal(
      'Menu',
      `<div class="stack">
        <p class="muted">${isAdmin() ? 'Admin – full access' : 'View only'}${currency.rate ? ` · 1 € = ${currency.rate.toFixed(1)} kr` : ''}</p>
        <button class="btn secondary block" data-m="theme">Switch light / dark</button>
        <button class="btn secondary block" data-m="logout">Log out</button>
      </div>`
    );
    m.el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-m]');
      if (!b) return;
      m.close();
      if (b.dataset.m === 'theme') toggleTheme();
      else logout();
    });
  }
});

function toggleTheme() {
  const root = document.documentElement;
  const dark = root.getAttribute('data-theme') === 'dark' || (!root.hasAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
  const next = dark ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  storage.set('go-crm-theme', next);
  render(); // charts read colors from CSS
}

function logout() {
  setToken(null);
  showLogin();
}

function showLogin(message = '') {
  $('#appView').classList.add('hidden');
  $('#loginView').classList.remove('hidden');
  $('#loginError').textContent = message;
  $('#password').value = '';
}

async function start(fromLogin = false) {
  try {
    await loadData();
  } catch (e) {
    if (e.status === 401) setToken(null);
    showLogin(e.status === 401 && !fromLogin ? '' : e.message);
    return;
  }
  $('#loginView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  buildNav();
  updateBadges();
  render();
  loadTodayRate().then(() => document.querySelector('[data-rate]') && render());
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  setToken($('#password').value, $('#remember').checked);
  $('#loginError').textContent = '';
  start(true);
});

window.addEventListener('go-crm:logout', () => {
  setToken(null);
  showLogin('Please log in again.');
});
window.addEventListener('hashchange', () => {
  window.scrollTo(0, 0);
  render();
});

if (hasToken()) start();
else showLogin();
