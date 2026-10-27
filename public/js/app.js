// Entry point: login, navigation (sidebar / phone tab bar), hash router.
import { dueCount, inboxItems, today } from './lib.js';
import { avatar, ICONS, roleLabel, seg } from './components.js';
import { api, can, currency, hasToken, isAdmin, isTeamAdmin, loadData, loadTodayRate, login, logoutSession, setToken, state, userById } from './store.js';
import { $, esc, openModal, storage, toast } from './util.js';
import { eventModal } from './events.js';
import { mountSearch } from './search.js';
import { bodyHtml, timeAgo } from './comments.js';
import * as dashboard from './views/dashboard.js';
import * as goals from './views/goals.js';
import * as importView from './views/import.js';
import * as partner from './views/partner.js';
import * as partnerForm from './views/partner-form.js';
import * as partners from './views/partners.js';
import * as pipeline from './views/pipeline.js';
import * as sales from './views/sales.js';
import * as tasks from './views/tasks.js';
import * as team from './views/team.js';
import * as marketing from './views/marketing.js';
import * as collaborators from './views/collaborators.js';
import * as report from './views/report.js';
import * as library from './views/library.js';

// Menu in groups: general on top, then Sales (just for you) and Marketing.
// `group` is also what colleagues get access to (Team → sections).
const NAV = [
  { href: '#/', key: 'home', label: 'Home', icon: ICONS.home, group: '' },
  { href: '#/tasks', key: 'tasks', label: 'Tasks', icon: ICONS.tasks, group: '' },
  { href: '#/partners', key: 'partners', label: 'Partners', icon: ICONS.partners, group: 'Sales' },
  { href: '#/pipeline', key: 'pipeline', label: 'Pipeline', icon: ICONS.pipeline, group: 'Sales' },
  { href: '#/sales', key: 'sales', label: 'Sales', icon: ICONS.sales, group: 'Sales' },
  { href: '#/goals', key: 'goals', label: 'Goals', icon: ICONS.goals, group: 'Sales' },
  { href: '#/marketing', key: 'marketing', label: 'Marketing', icon: ICONS.marketing, group: 'Marketing' },
  { href: '#/collaborators', key: 'collaborators', label: 'Collaborators', icon: ICONS.collab, group: 'Marketing' },
  { href: '#/files', key: 'files', label: 'Files', icon: ICONS.files, group: 'Marketing' },
  { href: '#/report', key: 'report', label: 'Report', icon: ICONS.report, group: 'Marketing' },
];

// NAV items with a heading before the first item of each group.
const GROUP_SECTION = { Sales: 'sales', Marketing: 'marketing' };
const allowedNav = () => NAV.filter((n) => !n.group || can(GROUP_SECTION[n.group]));

const grouped = (items, link, label) => {
  let last = null;
  return items
    .map((n) => {
      const head = n.group && n.group !== last ? label(n.group) : '';
      last = n.group;
      return head + link(n);
    })
    .join('');
};

const TABS = ['home', 'tasks', 'partners', 'marketing'];

const ROUTES = [
  { re: /^\/$/, nav: 'home', view: dashboard },
  { re: /^\/partners$/, nav: 'partners', view: partners },
  { re: /^\/partners\/new$/, nav: 'partners', view: partnerForm },
  { re: /^\/partner\/([\w-]+)$/, nav: 'partners', view: partner },
  { re: /^\/partner\/([\w-]+)\/edit$/, nav: 'partners', view: partnerForm },
  { re: /^\/tasks$/, nav: 'tasks', view: tasks },
  { re: /^\/team$/, nav: 'team', view: team },
  { re: /^\/marketing$/, nav: 'marketing', view: marketing },
  { re: /^\/collaborators$/, nav: 'collaborators', view: collaborators },
  { re: /^\/report$/, nav: 'report', view: report },
  { re: /^\/files$/, nav: 'files', view: library },
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
  let route = ROUTES.find((r) => r.re.test(path)) || ROUTES[0];
  // Sections you don't have access to aren't reachable by URL either.
  const navItem = NAV.find((n) => n.key === route.nav);
  if (navItem?.group && !can(GROUP_SECTION[navItem.group])) route = ROUTES[0];
  const params = path.match(route.re)?.slice(1) ?? [];
  highlightNav(route.nav);
  const id = ++renderId;
  page.onclick = null; // views that use a page-wide click handler set it again
  page.ondragenter = page.ondragleave = page.ondragover = page.ondrop = null;
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
  document.querySelector('#tabbar [data-nav="more"]')?.classList.toggle('active', !TABS.includes(key));
}

function updateBadges() {
  const due = dueCount(today(), state);
  document.querySelectorAll('[data-nav="tasks"] .badge-count').forEach((b) => {
    b.textContent = due;
    b.hidden = !due;
  });
  const news = state.me ? inboxItems(state, state.me.id) : [];
  document.querySelectorAll('.bell-count').forEach((b) => {
    b.textContent = news.length;
    b.hidden = !news.length;
    b.classList.toggle('mention', news.some((n) => n.mentioned));
  });
}

// Comments for you: new replies on your tasks / posts and @mentions.
function inboxSheet() {
  const items = inboxItems(state, state.me.id);
  const m = openModal(
    'Comments for you',
    items.length
      ? `<ul class="inbox">${items
          .map((it, i) => {
            const who = userById(it.last.created_by);
            const title = it.type === 'task' ? it.parent.title || `Visit – ${state.partners.find((p) => p.id === it.parent.partner_id)?.name ?? ''}` : it.parent.title;
            return `<li><button type="button" class="inbox-row${it.mentioned ? ' mentioned' : ''}" data-i="${i}">${avatar(who ?? { name: '?' }, 34)}
              <span class="ib-main"><span class="ib-line"><b>${esc(who?.name.split(' ')[0] ?? 'Someone')}</b> ${it.mentioned ? 'mentioned you on' : 'commented on'} <b>${esc(title)}</b></span>
              <span class="ib-text">${bodyHtml(it.last.body)}</span>
              <span class="ib-meta">${timeAgo(it.last.created_at)}${it.comments.length > 1 ? ` · ${it.comments.length} new` : ''} · ${it.type === 'task' ? 'Task' : 'Post'}</span></span></button></li>`;
          })
          .join('')}</ul>
         <button type="button" class="btn secondary block" data-read-all>Mark all as read</button>`
      : '<div class="empty-box"><b>All caught up</b>New comments on your tasks and posts, and @mentions of you, show up here.</div>'
  );
  m.el.querySelector('.modal').classList.add('narrow');
  m.el.addEventListener('click', async (e) => {
    const row = e.target.closest('[data-i]');
    if (row) {
      const it = items[Number(row.dataset.i)];
      m.close();
      if (it.type === 'task') tasks.taskModal(it.parent, refresh);
      else marketing.postModal(it.parent, refresh);
      return;
    }
    if (!e.target.closest('[data-read-all]')) return;
    try {
      const done = await Promise.all(items.map((it) => api('/api/comments', { method: 'PUT', body: { parent_type: it.type, parent_id: it.parent.id } })));
      for (const r of done) {
        const old = (state.commentReads ??= []).find((x) => x.parent_type === r.parent_type && x.parent_id === r.parent_id);
        if (old) old.read_at = r.read_at;
        else state.commentReads.push(r);
      }
      m.close();
      onComments();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// After a comment / reaction / read: update the bell, and the 💬 counts in lists unless someone is typing on the page.
function onComments() {
  updateBadges();
  if (!document.querySelector('#page :focus')) render();
}
window.addEventListener('go-crm:comments', onComments);

// New comments from colleagues: check every minute while the CRM is open.
async function pollComments() {
  if (document.hidden || $('#appView').classList.contains('hidden')) return;
  try {
    const { comments, commentReads } = await api('/api/comments');
    const before = (state.comments ?? []).map((c) => c.id + (c.edited_at ?? '') + JSON.stringify(c.reactions)).join();
    state.comments = comments;
    state.commentReads = commentReads;
    if (comments.map((c) => c.id + (c.edited_at ?? '') + JSON.stringify(c.reactions)).join() !== before) onComments();
  } catch {}
}
setInterval(pollComments, 60_000);
document.addEventListener('visibilitychange', pollComments);

function buildNav() {
  const item = (n) =>
    `<a href="${n.href}" data-nav="${n.key}">${n.icon}<span>${n.label}</span>${n.key === 'tasks' ? '<em class="badge-count" hidden title="Due today or overdue"></em>' : ''}</a>`;
  const items = allowedNav();
  $('#nav').innerHTML = grouped(items, item, (g) => `<div class="nav-label">${g}</div>`);
  // Phones: the most used sections as tabs, the rest under "More".
  $('#tabbar').innerHTML =
    items.filter((n) => TABS.includes(n.key)).map(item).join('') +
    `<a href="#" data-action="more" data-nav="more">${ICONS.more}<span>More</span></a>`;
  renderMe();
  document.querySelectorAll('[data-team-only]').forEach((el) => (el.hidden = !isTeamAdmin()));
  renderCurrencySwitch();
}

// Photo + name + role at the bottom of the sidebar.
function renderMe() {
  const me = state.me;
  $('#meChip').innerHTML = me
    ? `${avatar(me, 34)}<span class="me-text"><b>${esc(me.name)}</b><small>${esc(roleLabel(me.role))}</small></span>`
    : '';
  $('#topMe').innerHTML = me ? avatar(me, 34) : '';
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
  if (action === 'more') {
    e.preventDefault();
    const m = openModal(
      'More',
      `<div class="sheet-me">${state.me ? `${avatar(state.me, 40)}<span class="me-text"><b>${esc(state.me.name)}</b><small>${esc(roleLabel(state.me.role))}</small></span>` : ''}</div>
       <nav class="sheet-nav">${grouped(
        allowedNav().filter((n) => !TABS.includes(n.key)),
        (n) => `<a href="${n.href}">${n.icon}<span>${n.label}</span></a>`,
        (g) => `<div class="sheet-label">${g}</div>`
      )}</nav>
       <div class="stack" style="margin-top:12px">
         <p class="muted small">${isAdmin() ? 'Admin – full access' : 'View only'}${currency.rate ? ` · 1 € = ${currency.rate.toFixed(1)} kr` : ''}</p>
         <button class="btn secondary block" data-m="profile">Edit profile</button>
         ${isTeamAdmin() ? '<button class="btn secondary block" data-m="team">Team</button>' : ''}
         <button class="btn secondary block" data-m="theme">Switch light / dark</button>
         <button class="btn secondary block" data-m="logout">Log out</button>
       </div>`
    );
    m.el.querySelector('.modal').classList.add('narrow');
    m.el.addEventListener('click', (ev) => {
      if (ev.target.closest('a')) return m.close();
      const b = ev.target.closest('[data-m]');
      if (!b) return;
      m.close();
      if (b.dataset.m === 'theme') toggleTheme();
      else if (b.dataset.m === 'profile') team.profileModal(() => (buildNav(), render()));
      else if (b.dataset.m === 'team') navigate('#/team');
      else logout();
    });
    return;
  }
  if (action === 'new') return toggleNewMenu(e.target.closest('[data-action]'));
  if (action === 'search') return searchSheet();
  if (action === 'inbox') return inboxSheet();
  if (action === 'profile') return team.profileModal(() => (buildNav(), render()));
  if (action === 'team') return navigate('#/team');
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
    m.el.querySelector('.modal').classList.add('narrow');
    m.el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-m]');
      if (!b) return;
      m.close();
      if (b.dataset.m === 'theme') toggleTheme();
      else logout();
    });
  }
});

// "+ New" in the top bar: whatever the signed-in person can create.
function toggleNewMenu(btn) {
  const menu = $('#newMenu');
  const open = menu.hidden;
  if (open) {
    const items = [
      isAdmin() && ['task', 'Task'],
      isAdmin() && ['event', 'Event'],
      isAdmin() && can('marketing') && ['post', 'Post'],
      isAdmin() && can('sales') && ['partner', 'Partner'],
    ].filter(Boolean);
    menu.innerHTML = items.map(([v, l]) => `<button type="button" data-new="${v}">${l}</button>`).join('');
  }
  menu.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
}

$('#newMenu').addEventListener('click', (e) => {
  const v = e.target.closest('[data-new]')?.dataset.new;
  if (!v) return;
  $('#newMenu').hidden = true;
  if (v === 'task') tasks.taskModal({ type: 'todo', due_date: today() }, refresh);
  else if (v === 'event') eventModal({}, refresh);
  else if (v === 'post') marketing.postModal({}, refresh);
  else navigate('#/partners/new');
});
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('.new-menu')) $('#newMenu').hidden = true;
});

// Phones: search opens as a sheet.
function searchSheet() {
  const m = openModal('Search', '<div class="search in-sheet"><input type="search" class="input" placeholder="Partners, tasks, posts…" autocomplete="off" aria-label="Search" /><div class="search-results" hidden></div></div>');
  m.el.querySelector('.modal').classList.add('narrow');
  const input = m.el.querySelector('input');
  mountSearch(input, m.el.querySelector('.search-results'), { navigate, refresh }, () => m.close());
  input.focus();
}

mountSearch($('#searchInput'), $('#searchResults'), { navigate, refresh });
document.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k' || $('#appView').classList.contains('hidden')) return;
  e.preventDefault();
  if (getComputedStyle($('.topbar')).display === 'none') searchSheet();
  else $('#searchInput').focus();
});

function toggleTheme() {
  const root = document.documentElement;
  const dark = root.getAttribute('data-theme') === 'dark' || (!root.hasAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
  const next = dark ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  storage.set('go-crm-theme', next);
  render(); // charts read colors from CSS
}

async function logout() {
  await logoutSession();
  history.replaceState(null, '', '#/'); // the next person starts on Home
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
  $('#loginError').textContent = '';
  try {
    await login($('#email').value.trim(), $('#password').value, $('#remember').checked);
    start(true);
  } catch (err) {
    $('#loginError').textContent = err.message;
  }
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
