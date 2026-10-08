// Marketing: content calendar for the socials, an idea bank, and Google reviews.
import { channelTags, kpi, onSeg, pageHeader, seg } from '../components.js';
import {
  CHANNELS,
  CHECKLIST_TEMPLATES,
  FORMATS,
  monthGrid,
  monthOf,
  POST_BRANDS,
  POST_STATUSES,
  marketingDeadlines,
  postStatusLabel,
  reviewGrowth,
  reviewStats,
  shiftDate,
  shiftMonth,
  THEMES,
  today,
  weekDays,
} from '../lib.js';
import { api, isAdmin, state } from '../store.js';
import { copyText, esc, formData, monthLabel, num, openModal, options, shortDate, toast } from '../util.js';
import { taskModal } from './tasks.js';
import { editorHtml, inlineChecklist, mountEditor, progressPill, toggleInList } from '../checklist.js';

// "3 days left" / "today" / "2 days late" pill for a deadline.
export const deadlinePill = (daysLeft, prefix = '') => {
  const cls = daysLeft < 0 ? 'overdue' : daysLeft <= 2 ? 'today' : '';
  const text = daysLeft < 0 ? `${-daysLeft} day${daysLeft === -1 ? '' : 's'} late` : daysLeft === 0 ? 'due today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
  return `<span class="pill ${cls}">${prefix}${text}</span>`;
};

// View state survives navigation.
const v = { selected: null, mode: 'month', channel: '', brand: '', theme: '', stars: '' };
let reviewsCache = null; // { configured, places, snapshots, reviews }

const TABS = [
  { value: 'content', label: 'Content calendar' },
  { value: 'ideas', label: 'Ideas' },
  { value: 'reviews', label: 'Google reviews' },
];

const brandName = (b) => POST_BRANDS.find((x) => x.value === b)?.label ?? '';
const fmtName = (f) => FORMATS.find((x) => x.value === f)?.label ?? '';

export async function render(page, ctx) {
  const tab = TABS.some((t) => t.value === ctx.query.get('tab')) ? ctx.query.get('tab') : 'content';
  const t = today();
  v.selected ??= t;
  const admin = isAdmin();
  const posts = state.posts ?? [];
  const week = weekDays(t);
  const thisWeek = posts.filter((p) => p.status !== 'idea' && p.publish_date >= week[0] && p.publish_date <= week[6]);
  const next = posts
    .filter((p) => p.status !== 'idea' && p.status !== 'published' && p.publish_date >= t)
    .sort((a, b) => (a.publish_date + (a.publish_time ?? '')).localeCompare(b.publish_date + (b.publish_time ?? '')))[0];
  const ideas = posts.filter((p) => p.status === 'idea');

  page.innerHTML = `
    ${pageHeader('Marketing', 'Social media content, ideas and Google reviews', admin ? '<button class="btn secondary" data-new-idea>+ Idea</button><button class="btn" data-new-post>+ Post</button>' : '')}
    <div class="kpis">
      ${kpi('Posts this week', `${thisWeek.filter((p) => p.status === 'published').length}<small class="kpi-of"> / ${thisWeek.length}</small>`, 'published / planned')}
      ${kpi('Next post', next ? esc(shortDate(next.publish_date)) : '–', next ? `${esc(next.title)}` : 'nothing scheduled')}
      ${kpi('Ideas in the bank', ideas.length, ideas.length ? 'ready to schedule' : 'add one with + Idea')}
      <div class="kpi" id="ratingKpi"><div class="label">Google rating</div><div class="value">…</div><div class="delta"></div></div>
    </div>
    ${deadlinesCard()}
    <nav class="tabs">${TABS.map((x) => `<a href="#/marketing?tab=${x.value}" class="${x.value === tab ? 'active' : ''}">${x.label}${x.value === 'ideas' ? `<span class="count">${ideas.length}</span>` : ''}</a>`).join('')}</nav>
    <div id="mBody"></div>`;

  page.querySelector('.deadlines')?.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.dlPost) postModal(state.posts.find((x) => x.id === b.dataset.dlPost), ctx.refresh);
    else if (b.dataset.dlTask) taskModal(state.tasks.find((x) => x.id === b.dataset.dlTask), ctx.refresh);
    else if ('dlNew' in b.dataset) taskModal({ type: 'todo', category: 'marketing', start_date: today(), due_date: shiftDate(today(), 7) }, ctx.refresh);
  });
  page.querySelector('[data-new-post]')?.addEventListener('click', () => postModal({ status: 'in_progress', publish_date: v.selected, channels: ['instagram'] }, ctx.refresh));
  page.querySelector('[data-new-idea]')?.addEventListener('click', () => postModal({ status: 'idea', channels: [] }, ctx.refresh));

  const body = page.querySelector('#mBody');
  // Coming back from the Google sign-in.
  if (ctx.query.get('google')) {
    if (ctx.query.get('google') === 'connected') toast('Google account connected ✓');
    else toast(ctx.query.get('msg') || 'Google sign-in failed', 'error');
    history.replaceState(null, '', '#/marketing?tab=reviews');
    reviewsCache = null;
  }
  if (tab === 'content') renderContent(body, ctx);
  else if (tab === 'ideas') renderIdeas(body, ctx);
  else await renderReviews(body, ctx);

  // Rating tile (uses cached reviews data; loads it once if needed).
  loadReviews()
    .then((r) => {
      const el = page.querySelector('#ratingKpi');
      if (!el || !ctx.isCurrent()) return;
      // Prefer the Business Profile numbers (exact), else the Places API ones.
      const loc = (r.google?.locations ?? []).filter((l) => l.active && l.total != null).sort((a, b) => b.total - a.total)[0];
      const main = loc ? { rating: Number(loc.average), rating_count: loc.total, name: loc.title } : r.places.find((p) => p.rating) ?? null;
      el.querySelector('.value').innerHTML = main ? `<span class="star">★</span> ${main.rating.toFixed(1)}` : '–';
      el.querySelector('.delta').textContent = main ? `${num(main.rating_count)} reviews · ${main.name}` : r.configured || r.google?.configured ? 'add your business under Google reviews' : 'not connected yet';
    })
    .catch(() => {});
}

async function loadReviews(force = false) {
  if (!reviewsCache || force) reviewsCache = await api('/api/reviews');
  return reviewsCache;
}

// ── Content calendar ───────────────────────────────────────────
function renderContent(el, ctx) {
  const t = today();
  const admin = isAdmin();
  const filtered = (state.posts ?? []).filter(
    (p) => p.status !== 'idea' && p.publish_date && (!v.channel || p.channels.includes(v.channel)) && (!v.brand || p.brand === v.brand || p.brand === 'both')
  );
  const days = v.mode === 'week' ? weekDays(v.selected) : monthGrid(monthOf(v.selected));
  const byDay = new Map();
  for (const p of filtered) {
    if (!byDay.has(p.publish_date)) byDay.set(p.publish_date, []);
    byDay.get(p.publish_date).push(p);
  }
  for (const list of byDay.values()) list.sort((a, b) => (a.publish_time ?? '99').localeCompare(b.publish_time ?? '99'));
  const label = v.mode === 'week' ? `${shortDate(days[0])} – ${shortDate(days[6])}` : monthLabel(monthOf(v.selected));

  const chip = (p) =>
    `<button type="button" class="pchip st-${p.status}" data-post="${p.id}" title="${esc(`${p.title} · ${postStatusLabel(p.status)}`)}">
      <span class="dots">${p.channels.map((c) => `<i class="c-${esc(c)}"></i>`).join('')}</span><span class="tx">${p.publish_time ? `${esc(p.publish_time)} ` : ''}${esc(p.title)}</span></button>`;

  // Deadlines (post "ready by" + marketing tasks) by day, shown as ⏰ chips.
  const deadlines = new Map();
  for (const x of marketingDeadlines(state, days[0], 60).filter((x) => x.date >= days[0] && x.date <= days.at(-1))) {
    if (!deadlines.has(x.date)) deadlines.set(x.date, []);
    deadlines.get(x.date).push(x);
  }
  const dlChip = (x) =>
    `<button type="button" class="dchip ${x.date < t ? 'late' : ''}" ${x.kind === 'post' ? `data-post="${x.id}"` : `data-dl-task="${x.id}"`} title="${esc(`Deadline: ${x.title}`)}">⏰ <span class="tx">${esc(x.title)}</span></button>`;
  const limit = v.mode === 'week' ? 8 : 3;
  const cell = (d) => {
    const list = byDay.get(d) ?? [];
    const cls = [d === v.selected && 'sel', d === t && 'today', v.mode === 'month' && monthOf(d) !== monthOf(v.selected) && 'out'].filter(Boolean).join(' ');
    return `<div class="mday ${cls}" data-day="${d}">
      <div class="mday-h"><span class="dn">${v.mode === 'week' ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' }) + ' ' : ''}${Number(d.slice(8))}</span>
        ${admin ? `<button type="button" class="add" data-add="${d}" aria-label="New post on ${shortDate(d)}">+</button>` : ''}</div>
      ${(deadlines.get(d) ?? []).map(dlChip).join('')}
      ${list.slice(0, limit).map(chip).join('')}${list.length > limit ? `<span class="more">+${list.length - limit} more</span>` : ''}
    </div>`;
  };

  const sel = byDay.get(v.selected) ?? [];
  const status = (s) => filtered.filter((p) => p.status === s);
  const recent = status('published')
    .filter((p) => p.publish_date >= shiftDate(t, -14))
    .sort((a, b) => b.publish_date.localeCompare(a.publish_date));

  el.innerHTML = `
    <section class="card">
      <div class="cal-head">
        <div class="controls">
          <button class="icon-btn" data-shift="-1" aria-label="Previous">←</button><b class="num">${esc(label)}</b><button class="icon-btn" data-shift="1" aria-label="Next">→</button>
          ${v.selected !== t ? '<button class="btn secondary sm" data-go-today>Today</button>' : ''}
        </div>
        <div class="controls">
          <select class="input sm-input" data-f="brand" aria-label="Brand">${options(POST_BRANDS.filter((b) => b.value !== 'both'), v.brand, { empty: 'Both brands' })}</select>
          ${seg('pmode', v.mode, [
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ])}
        </div>
      </div>
      <div class="chips" style="margin-bottom:12px">${[{ value: '', label: 'All channels' }, ...CHANNELS]
        .map((c) => `<button type="button" data-ch="${c.value}" aria-pressed="${v.channel === c.value}">${c.value ? `<i class="cdot c-${c.value}"></i>` : ''}${c.label}</button>`)
        .join('')}</div>
      ${v.mode === 'month' ? `<div class="cal-dows">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<span>${d}</span>`).join('')}</div>` : ''}
      <div class="mcal ${v.mode}">${days.map(cell).join('')}</div>
      <div class="cal-legend"><span>⏰ Deadline</span><span><i class="lg st-idea"></i>Planned</span><span><i class="lg st-in_progress"></i>In progress</span><span><i class="lg st-scheduled"></i>Scheduled</span><span><i class="lg st-published"></i>Published</span></div>
    </section>

    <div class="grid grid-side">
      <section class="card">
        <div class="card-head"><h2>${esc(new Date(`${v.selected}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }))}</h2>
          ${admin ? `<button class="link-btn" data-add="${v.selected}">+ Post this day</button>` : ''}</div>
        ${sel.length ? `<div class="post-list">${sel.map(postCard).join('')}</div>` : '<p class="empty">No posts this day.</p>'}
      </section>
      <section class="card">
        <div class="card-head"><h2>Pipeline</h2></div>
        <div class="status-list">
          ${['in_progress', 'scheduled'].map((s) => `<div class="srow"><span class="lg st-${s}"></span><span>${postStatusLabel(s)}</span><b class="num">${status(s).length}</b></div>`).join('')}
          <div class="srow"><span class="lg st-published"></span><span>Published · last 14 days</span><b class="num">${recent.length}</b></div>
        </div>
        ${recent.length ? `<h3 class="sec" style="margin-top:16px">Recently published</h3><div class="list">${recent.slice(0, 6).map((p) => `<button class="row" data-post="${p.id}"><span class="name">${esc(p.title)}</span><span class="val">${channelTags(p.channels)}</span></button>`).join('')}</div>` : ''}
      </section>
    </div>`;

  const rerender = () => renderContent(el, ctx);
  onSeg(el, 'pmode', (m) => {
    v.mode = m;
    rerender();
  });
  el.querySelector('[data-f="brand"]').addEventListener('change', (e) => {
    v.brand = e.target.value;
    rerender();
  });
  el.onclick = (e) => {
    const b = e.target.closest('button, .mday');
    if (!b) return;
    const d = b.dataset;
    if (d.clToggle) {
      const post = state.posts.find((x) => x.id === d.clToggle);
      post.subtasks = toggleInList(post.subtasks, d.sub); // instant feedback
      renderContent(el, ctx);
      api('/api/posts', { method: 'POST', body: { id: post.id, subtasks: post.subtasks } }).catch((err) => toast(err.message, 'error'));
      return;
    }
    if (d.post) {
      e.stopPropagation();
      postModal(state.posts.find((p) => p.id === d.post), ctx.refresh);
    } else if (d.dlTask) {
      e.stopPropagation();
      taskModal(state.tasks.find((x) => x.id === d.dlTask), ctx.refresh);
    } else if (d.add) postModal({ status: 'in_progress', publish_date: d.add, channels: ['instagram'] }, ctx.refresh);
    else if (d.shift) {
      v.selected = v.mode === 'week' ? shiftDate(v.selected, 7 * Number(d.shift)) : `${shiftMonth(monthOf(v.selected), Number(d.shift))}-01`;
      rerender();
    } else if ('goToday' in d) {
      v.selected = today();
      rerender();
    } else if (d.ch !== undefined) {
      v.channel = d.ch;
      rerender();
    } else if (d.day) {
      v.selected = d.day;
      rerender();
    }
  };
}

function postCard(p) {
  return `<article class="post-card" data-post="${p.id}">
    <div class="pc-top"><span class="status st-${p.status}">${postStatusLabel(p.status)}</span>${channelTags(p.channels)}${p.publish_time ? `<span class="muted small">${esc(p.publish_time)}</span>` : ''}${readyByPill(p)}${progressPill(p)}</div>
    <h4>${esc(p.title)}</h4>
    <div class="muted small">${[brandName(p.brand), fmtName(p.format), p.theme].filter(Boolean).map(esc).join(' · ')}</div>
    ${p.caption ? `<p class="caption">${esc(p.caption.length > 180 ? `${p.caption.slice(0, 180)}…` : p.caption)}</p>` : ''}
    ${inlineChecklist(p, isAdmin())}
    <div class="pc-links">${p.media_url ? `<a href="${esc(p.media_url)}" target="_blank" rel="noreferrer">Media ↗</a>` : ''}${p.post_url ? `<a href="${esc(p.post_url)}" target="_blank" rel="noreferrer">Live post ↗</a>` : ''}
      <button type="button" class="link-btn" data-post="${p.id}">Open</button></div>
  </article>`;
}

// ── Idea bank ──────────────────────────────────────────────────
function renderIdeas(el, ctx) {
  const admin = isAdmin();
  const ideas = (state.posts ?? []).filter((p) => p.status === 'idea');
  const list = ideas.filter((p) => !v.theme || p.theme === v.theme).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const themeCount = (th) => ideas.filter((p) => p.theme === th).length;

  el.innerHTML = `
    ${
      admin
        ? `<form class="quick-idea card" data-quick>
            <input class="input" name="title" placeholder="New idea – e.g. “POV: first time driving to Vík in a camper”" required />
            <select class="input" name="theme" aria-label="Theme">${options(THEMES, v.theme, { empty: 'Theme' })}</select>
            <button class="btn" type="submit">Add idea</button>
          </form>`
        : ''
    }
    <div class="chips" style="margin:12px 0 14px">${[{ value: '', label: 'All' }, ...THEMES.map((x) => ({ value: x, label: x }))]
      .map((x) => `<button type="button" data-theme="${esc(x.value)}" aria-pressed="${v.theme === x.value}">${esc(x.label)}${x.value ? `<span class="count">${themeCount(x.value)}</span>` : `<span class="count">${ideas.length}</span>`}</button>`)
      .join('')}</div>
    ${
      list.length
        ? `<div class="idea-grid">${list
            .map(
              (p) => `<article class="idea">
                ${p.theme ? `<span class="theme">${esc(p.theme)}</span>` : ''}
                <h4>${esc(p.title)}</h4>
                ${p.caption ? `<p>${esc(p.caption.length > 140 ? `${p.caption.slice(0, 140)}…` : p.caption)}</p>` : ''}
                ${readyByPill(p)}${progressPill(p)}
                <div class="idea-foot">${channelTags(p.channels)}<span class="muted small">${esc(brandName(p.brand))}</span>
                  ${admin ? `<span class="idea-acts"><button class="btn sm" data-schedule="${p.id}">Schedule</button><button class="icon-btn round sm" data-post="${p.id}" aria-label="Edit">✎</button></span>` : ''}</div>
              </article>`
            )
            .join('')}</div>`
        : `<div class="empty-box"><b>No ideas${v.theme ? ` for “${esc(v.theme)}”` : ''} yet</b>Write ideas down the moment you get them – on the road, in a hotel lobby – and schedule them later.</div>`
    }`;

  el.querySelector('[data-quick]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    try {
      await api('/api/posts', { method: 'POST', body: { title: f.title, theme: f.theme || null, status: 'idea', channels: [] } });
      toast('Idea saved');
      ctx.refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  el.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.theme !== undefined) {
      v.theme = b.dataset.theme;
      renderIdeas(el, ctx);
    } else if (b.dataset.schedule) {
      const p = state.posts.find((x) => x.id === b.dataset.schedule);
      postModal({ ...p, status: 'scheduled', publish_date: shiftDate(today(), 1), channels: p.channels.length ? p.channels : ['instagram'] }, ctx.refresh);
    } else if (b.dataset.post) postModal(state.posts.find((x) => x.id === b.dataset.post), ctx.refresh);
  };
}

// ── Post editor (also used from Tasks) ─────────────────────────
export function postModal(post, refresh) {
  const chosen = new Set(post.channels ?? []);
  const m = openModal(
    post.id ? (post.status === 'idea' ? 'Idea' : 'Post') : post.status === 'idea' ? 'New idea' : 'New post',
    `<form>
      <label class="field"><span>Title *</span><input class="input" name="title" required value="${esc(post.title ?? '')}" placeholder="Aurora over the camper – 15 s reel" /></label>
      <div class="field"><span>Status</span><div class="chips wrap-chips" data-status>${POST_STATUSES.map((s) => `<button type="button" data-v="${s.value}" aria-pressed="${(post.status ?? 'idea') === s.value}">${s.label}</button>`).join('')}</div></div>
      <div class="form-grid" data-when>
        <label class="field"><span>Publish date</span><input class="input" type="date" name="publish_date" value="${esc(post.publish_date ?? '')}" /></label>
        <label class="field"><span>Time</span><input class="input" type="time" name="publish_time" value="${esc(post.publish_time ?? '')}" /></label>
      </div>
      <label class="field"><span>Content ready by (deadline)</span>
        <div class="follow-row"><input class="input" type="date" name="deadline" value="${esc(post.deadline ?? '')}" />
          <div class="chips wrap-chips" data-dl-quick>${[
            ['Day before posting', -1],
            ['3 days before', -3],
            ['A week before', -7],
          ]
            .map(([l, n]) => `<button type="button" data-n="${n}">${l}</button>`)
            .join('')}</div></div>
        <small>Shows in Tasks and the deadline list until the post is Scheduled or Published.</small></label>
      <div class="field"><span>Channels</span><div class="chips wrap-chips" data-channels>${CHANNELS.map((c) => `<button type="button" data-v="${c.value}" aria-pressed="${chosen.has(c.value)}"><i class="cdot c-${c.value}"></i>${c.label}</button>`).join('')}</div></div>
      <div class="form-grid three">
        <label class="field"><span>Brand</span><select class="input" name="brand">${options(POST_BRANDS, post.brand, { empty: '–' })}</select></label>
        <label class="field"><span>Format</span><select class="input" name="format">${options(FORMATS, post.format, { empty: '–' })}</select></label>
        <label class="field"><span>Theme</span><select class="input" name="theme">${options(THEMES, post.theme, { empty: '–' })}</select></label>
      </div>
      <label class="field"><span>Caption <em class="muted" data-count></em></span><textarea class="input" name="caption" rows="5" placeholder="Hook in the first line… #iceland #roadtrip">${esc(post.caption ?? '')}</textarea></label>
      ${editorHtml('+ Add checklist for this format')}
      <div class="form-grid">
        <label class="field"><span>Photos / video (link)</span><input class="input" name="media_url" value="${esc(post.media_url ?? '')}" placeholder="Google Drive / Dropbox link" /></label>
        <label class="field"><span>Live post (link)</span><input class="input" name="post_url" value="${esc(post.post_url ?? '')}" placeholder="After publishing" /></label>
      </div>
      <label class="field"><span>Notes</span><textarea class="input" name="notes" rows="2">${esc(post.notes ?? '')}</textarea></label>
      ${isAdmin() ? `<button class="btn block" type="submit">${post.id ? 'Save' : post.status === 'idea' ? 'Save idea' : 'Add post'}</button>` : ''}
      ${isAdmin() && post.id ? '<button class="btn danger block" type="button" data-remove>Delete</button>' : ''}
    </form>`
  );
  const form = m.el.querySelector('form');
  // Checklist: steps to produce the content (template depends on the chosen format).
  const getChecklist = mountEditor(m.el, post.subtasks, () => CHECKLIST_TEMPLATES[form.format.value] ?? CHECKLIST_TEMPLATES.reel);
  let status = post.status ?? 'idea';
  m.el.querySelector('[data-dl-quick]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-n]');
    if (!b) return;
    if (!form.publish_date.value) return toast('Set the publish date first', 'error');
    const d = shiftDate(form.publish_date.value, Number(b.dataset.n));
    // Publishing very soon: a deadline in the past makes no sense – use today.
    form.deadline.value = d < today() ? today() : d;
    if (d < today()) toast('Goes live soon – deadline set to today');
  });
  const whenRow = m.el.querySelector('[data-when]');
  const sync = () => (whenRow.style.opacity = status === 'idea' ? 0.5 : 1);
  sync();
  const count = () => (m.el.querySelector('[data-count]').textContent = form.caption.value ? `· ${form.caption.value.length} characters` : '');
  count();
  form.caption.addEventListener('input', count);
  m.el.querySelector('[data-status]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    status = b.dataset.v;
    m.el.querySelectorAll('[data-status] button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (status !== 'idea' && !form.publish_date.value) form.publish_date.value = shiftDate(today(), 1);
    sync();
  });
  m.el.querySelector('[data-channels]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    if (chosen.has(b.dataset.v)) chosen.delete(b.dataset.v);
    else chosen.add(b.dataset.v);
    b.setAttribute('aria-pressed', String(chosen.has(b.dataset.v)));
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(form);
    try {
      await api('/api/posts', {
        method: 'POST',
        body: { ...f, id: post.id, status, channels: [...chosen], brand: f.brand || null, format: f.format || null, theme: f.theme || null, subtasks: getChecklist() },
      });
      m.close();
      toast(post.id ? 'Saved' : status === 'idea' ? 'Idea saved' : 'Post planned');
      if (f.publish_date) v.selected = f.publish_date;
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  m.el.querySelector('[data-remove]')?.addEventListener('click', async () => {
    if (!confirm('Delete this post?')) return;
    try {
      await api(`/api/posts?id=${post.id}`, { method: 'DELETE' });
      m.close();
      toast('Deleted');
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// ── Google reviews ─────────────────────────────────────────────
async function renderReviews(el, ctx) {
  el.innerHTML = '<div class="loading">Loading reviews…</div>';
  let r;
  try {
    r = await loadReviews();
  } catch (err) {
    el.innerHTML = `<div class="banner error-banner">${esc(err.message)}</div>`;
    return;
  }
  if (!ctx.isCurrent()) return;
  const admin = isAdmin();

  const placesSetup = r.configured
    ? ''
    : `<section class="card setup">
      <div class="card-head"><h2>Rating &amp; trend (Places API)</h2></div>
      <p class="steps">The CRM reads your Google rating and reviews through Google’s official Places API. It’s free at this volume
      (1,000 requests a month are free; the CRM uses about 60).</p>
      <ol class="steps">
        <li>Open <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">console.cloud.google.com</a> → create a project <b>go-crm</b> (Google asks for a billing account – you won’t be charged within the free limit).</li>
        <li><i>APIs &amp; Services → Library</i> → search <b>Places API (New)</b> → <b>Enable</b>.</li>
        <li><i>APIs &amp; Services → Credentials → Create credentials → API key</i>. Under <i>API restrictions</i> choose <b>Places API (New)</b>.</li>
        <li>Cloudflare → <b>go-crm</b> → <i>Settings → Variables and Secrets</i> → add Secret <code>GOOGLE_PLACES_API_KEY</code> with that key.</li>
        <li><i>Deployments</i> → Retry deployment (or ask Claude to redeploy), then come back here.</li>
      </ol>
    </section>`;

  const g = r.google ?? { configured: false, connected: false, locations: [] };
  // With the Business Profile connected, its complete reviews replace the Places API sample for the same place.
  const gbpPlaces = new Set(r.reviews.filter((x) => x.source === 'gbp').map((x) => x.place_id));
  const reviews = r.reviews.filter((x) => x.source === 'gbp' || !gbpPlaces.has(x.place_id)).sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));
  const needsReply = reviews.filter((x) => x.source === 'gbp' && !x.reply_text).length;

  if (!r.places.length && !reviews.length) {
    el.innerHTML = `${googleCard(g, admin)}${placesSetup || (admin ? searchCard() : '<div class="empty-box"><b>No business connected yet</b></div>')}`;
    wireSearch(el, ctx);
    wireGoogle(el, ctx);
    return;
  }

  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const stats = reviewStats(reviews);
  const recentStats = reviewStats(reviews, since30);
  const shown = reviews.filter((x) =>
    !v.stars ? true : v.stars === 'noreply' ? x.source === 'gbp' && !x.reply_text : v.stars === 'low' ? x.rating <= 2 : x.rating === Number(v.stars)
  );
  const placeName = new Map([...g.locations.map((l) => [l.place_id ?? l.name, l.title]), ...r.places.map((p) => [p.place_id, p.name])]);
  const multiPlace = new Set(reviews.map((x) => x.place_id)).size > 1;

  el.innerHTML = `
    ${googleCard(g, admin)}
    ${placesSetup}
    <div class="place-grid">${r.places
      .map((p) => {
        const snaps = r.snapshots.filter((s) => s.place_id === p.place_id);
        const g30 = reviewGrowth(snaps.filter((s) => s.day >= since30.slice(0, 10)));
        return `<section class="card place">
          <div class="pl-top">
            <div><span class="cat ${p.label === 'camper' ? 'cat-marketing' : 'cat-sales'}">${esc(p.label === 'camper' ? 'Go Campers' : p.label === 'car' ? 'Go Car Rentals' : 'Other')}</span>
              <h3>${esc(p.name ?? 'Loading…')}</h3><div class="muted small">${esc(p.address ?? '')}</div></div>
            ${admin ? `<button class="icon-btn round sm" data-remove-place="${esc(p.place_id)}" aria-label="Stop tracking">×</button>` : ''}
          </div>
          <div class="big-rating"><b class="num">${p.rating ? p.rating.toFixed(1) : '–'}</b><span class="stars-lg">${starIcons(p.rating ?? 0)}</span></div>
          <div class="muted">${num(p.rating_count ?? 0)} reviews${g30 && g30.gained ? ` · <span class="up">+${g30.gained} in 30 days</span>` : ''}</div>
          ${snaps.length > 1 ? `<div class="spark" data-spark="${esc(p.place_id)}"></div>` : '<p class="muted small" style="margin-top:10px">The trend chart fills in as the CRM checks Google twice a day.</p>'}
          <div class="pl-acts">
            <button class="btn sm" data-copy-review="${esc(p.place_id)}">Copy “leave a review” link</button>
            ${p.maps_uri ? `<a class="btn secondary sm" href="${esc(p.maps_uri)}" target="_blank" rel="noreferrer">Google Maps ↗</a>` : ''}
          </div>
          ${p.error ? `<p class="small" style="color:var(--bad);margin-top:8px">Last refresh failed: ${esc(p.error)}</p>` : `<p class="muted small" style="margin-top:8px">Updated ${p.fetched_at ? esc(new Date(p.fetched_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : '–'}</p>`}
        </section>`;
      })
      .join('')}
      ${admin ? `<section class="card add-place"><button class="link-btn" data-show-search>+ Track another Google listing</button><div data-search-slot></div></section>` : ''}
    </div>

    <div class="grid grid-side">
      <section class="card">
        <div class="card-head"><h2>${g.connected && gbpPlaces.size ? 'Reviews · newest first' : 'Collected reviews'} <span class="muted">(${reviews.length})</span></h2>
          ${admin ? '<button class="link-btn" data-refresh>Refresh now</button>' : ''}</div>
        <div class="chips" style="margin-bottom:12px">${[
          { value: '', label: 'All' },
          { value: '5', label: '★★★★★' },
          { value: '4', label: '★★★★' },
          { value: '3', label: '★★★' },
          { value: 'low', label: '★–★★' },
          ...(gbpPlaces.size ? [{ value: 'noreply', label: `Needs reply${needsReply ? ` · ${needsReply}` : ''}` }] : []),
        ]
          .map((x) => `<button type="button" data-stars="${x.value}" aria-pressed="${v.stars === x.value}">${x.label}</button>`)
          .join('')}</div>
        ${
          shown.length
            ? `<div class="review-list">${shown
                .map(
                  (x) => `<article class="review ${x.rating <= 2 ? 'low' : ''}" data-review="${esc(x.id)}">
                  <div class="rv-top">
                    ${x.author_photo ? `<img src="${esc(x.author_photo)}" alt="" referrerpolicy="no-referrer" loading="lazy" />` : `<span class="avatar">${esc((x.author ?? '?').slice(0, 1))}</span>`}
                    <div><b>${esc(x.author ?? 'Google user')}</b><div class="muted small"><span class="stars-sm">${starIcons(x.rating)}</span> · ${x.published_at ? esc(shortDate(x.published_at.slice(0, 10))) : ''}${multiPlace ? ` · ${esc(placeName.get(x.place_id) ?? '')}` : ''}${x.language && x.language !== 'en' ? ` · ${esc(x.language.toUpperCase())}` : ''}</div></div>
                  </div>
                  ${x.text ? `<p>${esc(x.text)}</p>` : '<p class="muted">(rating only)</p>'}
                  ${x.source === 'gbp' ? replyBlock(x, admin) : x.review_uri ? `<a class="link-btn" href="${esc(x.review_uri)}" target="_blank" rel="noreferrer">Open / reply on Google ↗</a>` : ''}
                </article>`
                )
                .join('')}</div>`
            : '<p class="empty">No reviews collected yet.</p>'
        }
      </section>
      <div class="stack">
        <section class="card">
          <div class="card-head"><h2>Stars in collected reviews</h2></div>
          ${[5, 4, 3, 2, 1]
            .map((s) => {
              const n = stats.stars[s - 1];
              return `<div class="dist"><span>${s} ★</span><span class="bar"><i style="width:${stats.count ? (n / stats.count) * 100 : 0}%"></i></span><b class="num">${n}</b></div>`;
            })
            .join('')}
          <p class="muted small" style="margin-top:10px">${recentStats.count} new in the last 30 days${recentStats.average ? ` · average ${recentStats.average.toFixed(1)} ★` : ''}</p>
        </section>
        <section class="card">
          <div class="card-head"><h2>How this works</h2></div>
          ${
            gbpPlaces.size
              ? `<p class="muted small" style="line-height:1.6">Reviews come straight from your Google Business Profile – every review, newest first, checked every 2 hours.
                 Reply right here; the reply appears on Google. “Needs reply” shows what’s still waiting. Use the “leave a review” link in
                 follow-up e-mails, on flyers and as a QR code at the desk.</p>`
              : `<p class="muted small" style="line-height:1.6">Google shares the overall rating, the total count and 5 reviews each time the CRM checks (twice a day).
          The CRM keeps every review it has seen, so the list grows from the day you connected it. Use the “leave a review” link in
          follow-up e-mails, on flyers and as a QR code at the desk.</p>`
          }
        </section>
      </div>
    </div>`;

  wireGoogle(el, ctx);
  for (const p of r.places) {
    const box = el.querySelector(`[data-spark="${CSS.escape(p.place_id)}"]`);
    if (box) sparkline(box, r.snapshots.filter((s) => s.place_id === p.place_id));
  }

  el.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.replyOpen !== undefined) {
      const art = b.closest('[data-review]');
      art.querySelector('.reply-form').hidden = false;
      art.querySelector('.reply-form textarea').focus();
      b.hidden = true;
      return;
    }
    if (d.replyDelete !== undefined) {
      if (!confirm('Delete your reply on Google?')) return;
      try {
        await api('/api/google', { method: 'POST', body: { deleteReply: b.closest('[data-review]').dataset.review } });
        toast('Reply deleted');
        await loadReviews(true);
        renderReviews(el, ctx);
      } catch (err) {
        toast(err.message, 'error');
      }
      return;
    }
    if (d.stars !== undefined) {
      v.stars = d.stars;
      renderReviews(el, ctx);
    } else if (d.copyReview) copyText(`https://search.google.com/local/writereview?placeid=${d.copyReview}`);
    else if ('showSearch' in d) {
      el.querySelector('[data-search-slot]').innerHTML = searchCard(true);
      wireSearch(el, ctx);
    } else if ('refresh' in d) {
      b.disabled = true;
      b.textContent = 'Refreshing…';
      try {
        reviewsCache = await api('/api/reviews', { method: 'POST', body: { refresh: true } });
        toast('Updated from Google');
      } catch (err) {
        toast(err.message, 'error');
      }
      renderReviews(el, ctx);
    } else if (d.removePlace && confirm('Stop tracking this listing and delete its collected reviews?')) {
      await api(`/api/reviews?place_id=${encodeURIComponent(d.removePlace)}`, { method: 'DELETE' });
      await loadReviews(true);
      renderReviews(el, ctx);
    }
  };
}

const starIcons = (rating) => {
  const full = Math.round(rating);
  return `${'★'.repeat(full)}<span class="off">${'★'.repeat(Math.max(0, 5 - full))}</span>`;
};

const searchCard = (inline = false) => `
  <${inline ? 'div' : 'section class="card"'} data-search-box>
    ${inline ? '' : '<div class="card-head"><h2>Find your business on Google</h2></div><p class="muted" style="margin-bottom:12px">Search for the listing whose reviews you want to follow – e.g. Go Car Rental Iceland, then Go Campers.</p>'}
    <form class="quick-idea" data-search style="margin-top:${inline ? '12px' : '0'}">
      <input class="input" name="q" value="Go Car Rental Iceland" required />
      <select class="input" name="label" aria-label="Brand"><option value="car">Go Car Rentals</option><option value="camper">Go Campers</option><option value="other">Other</option></select>
      <button class="btn" type="submit">Search</button>
    </form>
    <div data-results></div>
  </${inline ? 'div' : 'section'}>`;

function wireSearch(el, ctx) {
  const form = el.querySelector('[data-search]');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const box = el.querySelector('[data-results]');
    box.innerHTML = '<p class="empty">Searching…</p>';
    try {
      const { results } = await api('/api/reviews', { method: 'POST', body: { search: form.q.value } });
      box.innerHTML = results.length
        ? `<div class="list" style="margin-top:10px">${results
            .slice(0, 8)
            .map(
              (p) => `<div class="row"><span class="name"><b>${esc(p.name)}</b><br><span class="muted small">${esc(p.address)}</span></span>
                <span class="val">${p.rating ? `★ ${p.rating.toFixed(1)} <small>${num(p.rating_count)}</small>` : ''} <button class="btn sm" type="button" data-add-place="${esc(p.place_id)}">Track</button></span></div>`
            )
            .join('')}</div>`
        : '<p class="empty">Nothing found – try another name.</p>';
      box.querySelectorAll('[data-add-place]').forEach((b) =>
        b.addEventListener('click', async () => {
          b.disabled = true;
          b.textContent = 'Adding…';
          try {
            reviewsCache = await api('/api/reviews', { method: 'POST', body: { add: b.dataset.addPlace, label: form.label.value } });
            toast('Listing added');
            renderReviews(el, ctx);
          } catch (err) {
            toast(err.message, 'error');
            b.disabled = false;
            b.textContent = 'Track';
          }
        })
      );
    } catch (err) {
      box.innerHTML = `<div class="banner error-banner">${esc(err.message)}</div>`;
    }
  });
}

// Review count over time as a small area line.
function sparkline(el, snaps) {
  const W = el.clientWidth || 300;
  const H = 70;
  const vals = snaps.map((s) => s.rating_count ?? 0);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const x = (i) => (i / Math.max(1, snaps.length - 1)) * (W - 4) + 2;
  const y = (val) => H - 6 - ((val - min) / Math.max(1, max - min)) * (H - 14);
  const pts = snaps.map((s, i) => `${x(i)},${y(s.rating_count ?? 0)}`).join(' ');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Review count from ${num(min)} to ${num(max)}">
      <polyline points="${x(0)},${H} ${pts} ${x(snaps.length - 1)},${H}" class="spark-area"/>
      <polyline points="${pts}" class="spark-line"/>
    </svg>
    <div class="spark-lbl"><span>${esc(shortDate(snaps[0].day))} · ${num(vals[0])}</span><span>${esc(shortDate(snaps.at(-1).day))} · ${num(vals.at(-1))}</span></div>`;
}

function readyByPill(p) {
  if (!p.deadline) return '';
  if (p.status === 'scheduled' || p.status === 'published') return '<span class="pill good">✓ ready</span>';
  return deadlinePill(Math.round((Date.parse(`${p.deadline}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86400000), 'ready by · ');
}

// Upcoming / overdue marketing deadlines (posts' "ready by" + marketing tasks) at the top of Marketing.
function deadlinesCard() {
  const list = marketingDeadlines(state, today(), 30);
  const admin = isAdmin();
  if (!list.length && !admin) return '';
  return `<section class="card deadlines">
    <div class="card-head"><h2>Deadlines <span class="muted">· next 30 days</span></h2>${admin ? '<button class="link-btn" data-dl-new>+ Task with deadline</button>' : ''}</div>
    ${
      list.length
        ? `<ul class="dl-list">${list
            .slice(0, 8)
            .map(
              (x) => `<li><button type="button" class="dl-row" ${x.kind === 'post' ? `data-dl-post="${x.id}"` : `data-dl-task="${x.id}"`}>
                <span class="dl-kind">${x.kind === 'post' ? 'Post' : 'Task'}</span>
                <span class="dl-title">${esc(x.title)}${x.kind === 'post' && x.ref.publish_date ? ` <span class="muted small">· goes live ${esc(shortDate(x.ref.publish_date))}</span>` : ''}${x.ref.subtasks?.length ? ` <span class="muted small">· ☑ ${x.ref.subtasks.filter((s) => s.done).length}/${x.ref.subtasks.length}</span>` : ''}</span>
                <span class="muted small nowrap">${esc(shortDate(x.date))}</span>${deadlinePill(x.daysLeft)}
              </button></li>`
            )
            .join('')}</ul>${list.length > 8 ? `<a class="link-btn" href="#/tasks?tab=plan">+ ${list.length - 8} more in Tasks →</a>` : ''}`
        : '<p class="empty">No deadlines coming up. Add a “ready by” date to a post, or a marketing task with a deadline.</p>'
    }
  </section>`;
}

// ── Google Business Profile (all reviews, newest first, replies) ──
const replyBlock = (x, admin) => `
  ${
    x.reply_text
      ? `<div class="reply"><div class="reply-h"><b>Your reply</b><span class="muted small">${x.reply_at ? esc(shortDate(x.reply_at.slice(0, 10))) : ''}</span>
          ${admin ? '<button type="button" class="link-btn muted" data-reply-open>Edit</button><button type="button" class="link-btn muted" data-reply-delete>Delete</button>' : ''}</div><p>${esc(x.reply_text)}</p></div>`
      : admin
        ? '<button type="button" class="btn secondary sm" data-reply-open>Reply</button>'
        : '<span class="pill">No reply yet</span>'
  }
  ${
    admin
      ? `<form class="reply-form" hidden><textarea class="input" rows="3" name="comment" placeholder="Thank you for choosing Go! …">${esc(x.reply_text ?? '')}</textarea>
          <div class="controls"><button class="btn sm" type="submit">${x.reply_text ? 'Update reply' : 'Post reply on Google'}</button></div></form>`
      : ''
  }`;

function googleCard(g, admin) {
  if (!admin && !g.connected) return '';
  if (!g.configured) {
    return `<section class="card setup gbp">
      <div class="card-head"><h2>All reviews, newest first <span class="muted">· Google Business Profile</span></h2></div>
      <p class="steps">Google’s Places API only shares 5 “most relevant” reviews. The Business Profile API (for owners and managers) gives every review,
      newest first, and lets you reply from the CRM. It needs Google’s approval of API access (requested) and a sign-in client:</p>
      <ol class="steps">
        <li>Google Cloud → project <b>go-crm</b> → <i>APIs &amp; Services → OAuth consent screen</i>: app name <b>Go CRM</b>, your e-mail, audience <b>External</b>, add yourself as a test user, then <b>Publish app</b> (so the sign-in doesn’t expire after 7 days).</li>
        <li><i>Credentials → Create credentials → OAuth client ID</i> → <b>Web application</b>. Authorised redirect URI: <code>${esc(location.origin)}/api/google/callback</code></li>
        <li>Cloudflare → go-crm → <i>Settings → Variables and Secrets</i>: Secrets <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code>, then redeploy.</li>
        <li>After Google’s approval e-mail: enable <b>My Business Account Management API</b>, <b>My Business Business Information API</b> and <b>Google My Business API</b>.</li>
      </ol>
    </section>`;
  }
  if (!g.connected) {
    return `<section class="card gbp">
      <div class="card-head"><h2>All reviews, newest first <span class="muted">· Google Business Profile</span></h2></div>
      <p class="muted" style="margin-bottom:12px">Sign in with the Google account that manages the Go Car Rental / Go Campers business profiles.
      You do this once; the CRM then keeps the reviews up to date and you can reply from here.</p>
      <button class="btn" data-g-connect>Connect Google account</button>
    </section>`;
  }
  const when = (ts) => (ts ? new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–');
  return `<section class="card gbp">
    <div class="card-head"><h2>Google Business Profile <span class="pill good">connected</span></h2>
      ${admin ? '<span class="controls"><button class="btn secondary sm" data-g-sync>Sync now</button><button class="link-btn muted" data-g-disconnect>Disconnect</button></span>' : ''}</div>
    <p class="muted small">${esc(g.email ?? '')} · last sync ${esc(when(g.last_sync))} · new reviews are checked every 2 hours</p>
    ${g.error ? `<div class="banner error-banner" style="margin:10px 0 0">${esc(g.error)}</div>` : ''}
    ${
      g.locations.length
        ? `<ul class="gbp-locs">${g.locations
            .map(
              (l) => `<li>
                ${admin ? `<input type="checkbox" data-g-active="${esc(l.name)}" ${l.active ? 'checked' : ''} aria-label="Follow ${esc(l.title)}" />` : ''}
                <div class="body"><b>${esc(l.title)}</b><span class="muted small">${esc(l.address ?? '')}${l.total != null ? ` · ${num(l.total)} reviews · ★ ${Number(l.average ?? 0).toFixed(1)}` : ''}</span></div>
                ${admin ? `<select class="input sm-input" data-g-label="${esc(l.name)}" aria-label="Brand">${options([{ value: 'car', label: 'Go Car Rentals' }, { value: 'camper', label: 'Go Campers' }, { value: 'other', label: 'Other' }], l.label)}</select>` : ''}
              </li>`
            )
            .join('')}</ul>`
        : `<p class="muted small" style="margin-top:10px">No business locations found yet.${admin ? ' <button class="link-btn" data-g-locs>Look again</button>' : ''}</p>`
    }
  </section>`;
}

function wireGoogle(el, ctx) {
  const rerender = async (data) => {
    if (data) reviewsCache = { ...(reviewsCache ?? {}), google: data };
    await loadReviews(true);
    renderReviews(el, ctx);
  };
  const call = async (body, okMsg, btn) => {
    if (btn) btn.disabled = true;
    try {
      const data = await api('/api/google', { method: 'POST', body });
      if (okMsg) toast(typeof okMsg === 'function' ? okMsg(data) : okMsg);
      return data;
    } catch (err) {
      toast(err.message, 'error');
      if (btn) btn.disabled = false;
      return null;
    }
  };
  el.querySelector('[data-g-connect]')?.addEventListener('click', async (e) => {
    const data = await call({ connect: true }, null, e.target);
    if (data?.url) location.href = data.url;
  });
  el.querySelector('[data-g-sync]')?.addEventListener('click', async (e) => {
    e.target.textContent = 'Syncing…';
    if (await call({ sync: true }, (d) => `Synced ${d.synced} reviews`, e.target)) rerender();
    else rerender();
  });
  el.querySelector('[data-g-locs]')?.addEventListener('click', async (e) => {
    if (await call({ refreshLocations: true }, 'Locations updated', e.target)) rerender();
  });
  el.querySelector('[data-g-disconnect]')?.addEventListener('click', async (e) => {
    if (!confirm('Disconnect the Google account? Collected reviews stay in the CRM.')) return;
    if (await call({ disconnect: true }, 'Disconnected', e.target)) rerender();
  });
  el.querySelectorAll('[data-g-active]').forEach((cb) =>
    cb.addEventListener('change', async () => {
      if (await call({ location: { name: cb.dataset.gActive, active: cb.checked } }, cb.checked ? 'Following this location' : 'Stopped following')) rerender();
    })
  );
  el.querySelectorAll('[data-g-label]').forEach((sel) => sel.addEventListener('change', () => call({ location: { name: sel.dataset.gLabel, label: sel.value } }, 'Saved')));
  el.querySelectorAll('.reply-form').forEach((form) =>
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = form.closest('[data-review]').dataset.review;
      const btn = form.querySelector('button[type=submit]');
      btn.textContent = 'Posting…';
      if (await call({ reply: { review_id: id, comment: form.comment.value } }, 'Reply posted on Google ✓', btn)) rerender();
      else btn.textContent = 'Post reply on Google';
    })
  );
}
