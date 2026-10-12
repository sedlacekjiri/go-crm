// Marketing → Report: one page per week (Monday–Sunday) for the marketing meeting.
// Built from data the CRM already has – followers, posts, Google reviews, collaborations and
// marketing tasks – plus free-text meeting notes saved per week. Can be printed or copied as text.
import { avatar, channelTags, kpi, pageHeader } from '../components.js';
import { compactNumber, mondayOf, POST_BRANDS, SOCIAL_BRANDS, shiftDate, today, weeklyReport } from '../lib.js';
import { api, isAdmin, state, taskPerson } from '../store.js';
import { copyText, esc, num, shortDate, toast } from '../util.js';

const SOCIAL_LABEL = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok' };
const BRAND_SHORT = { car: 'Car Rentals', camper: 'Campers', both: 'Both brands' };
const brandName = (b) => POST_BRANDS.find((x) => x.value === b)?.label ?? 'Both brands';

let reviews = null; // { at, data } – the reviews payload, reused for a few minutes
async function loadReviews() {
  if (!reviews || Date.now() - reviews.at > 5 * 60 * 1000) reviews = { at: Date.now(), data: await api('/api/reviews') };
  return reviews.data;
}

const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${num(Math.abs(n))}`;
// "▲ 3 vs last week" – how this week compares with the one before.
function vs(now, prev, unit = '') {
  if (now === null || prev === null || now === undefined || prev === undefined) return '';
  const d = now - prev;
  if (d === 0) return `same as last week${unit}`;
  return `<span class="${d > 0 ? 'up' : 'late'}">${d > 0 ? '▲' : '▼'} ${num(Math.abs(d))}</span> vs last week${unit}`;
}
const weekLabel = (w) => `Week ${w.number} · ${shortDate(w.start)} – ${shortDate(w.end)} ${w.end.slice(0, 4)}`;
const person = (x) => {
  const u = taskPerson(x);
  return u ? `<span class="who" title="${esc(u.name)}">${avatar(u, 20)}</span>` : '';
};
const stars = (n) => '★'.repeat(n || 0) + '☆'.repeat(5 - (n || 0));
const list = (items, row, empty) => (items.length ? `<ul class="rep-list">${items.map((x) => `<li>${row(x)}</li>`).join('')}</ul>` : `<p class="empty">${empty}</p>`);

export async function render(page, ctx) {
  const t = today();
  const week = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(ctx.query.get('week') ?? '') ? ctx.query.get('week') : t);
  const go = (w) => ctx.navigate(`#/report?week=${w}`);

  let rv = null;
  try {
    rv = await loadReviews();
  } catch {}
  if (!ctx.isCurrent()) return;
  const r = weeklyReport(state, rv, week, t);
  const w = r.week;
  const notes = (state.reportNotes ?? []).find((n) => n.week === w.start);
  const canEdit = isAdmin();
  const ft = r.followersTotal;

  page.innerHTML = `
    ${pageHeader(
      'Weekly report',
      `${esc(weekLabel(w))}${w.current ? ' · <b>this week, so far</b>' : ''}`,
      `<div class="no-print rep-nav">
        <button class="icon-btn" data-week="${shiftDate(w.start, -7)}" aria-label="Previous week">←</button>
        ${w.current ? '' : `<button class="btn secondary sm" data-week="${mondayOf(t)}">This week</button>`}
        <button class="icon-btn" data-week="${w.nextStart}" aria-label="Next week" ${w.nextStart > t ? 'disabled' : ''}>→</button>
      </div>
      <button class="btn secondary no-print" data-copy>Copy as text</button>
      <button class="btn no-print" data-print>Print / PDF</button>`
    )}
    <div class="kpis">
      ${kpi('Followers · all socials', ft.total === null ? '–' : compactNumber(ft.total), ft.week === null ? (ft.total === null ? 'type in counts on Marketing' : 'no count a week earlier') : `<span class="${ft.week > 0 ? 'up' : ft.week < 0 ? 'late' : ''}">${signed(ft.week)}</span> this week${ft.prevWeek !== null ? ` · ${signed(ft.prevWeek)} the week before` : ''}`)}
      ${kpi('Posts published', r.content.published.length, vs(r.content.published.length, r.content.prevPublished))}
      ${kpi('Google rating', r.google?.rating ? `<span class="star">★</span> ${r.google.rating.toFixed(1)}` : '–', r.google ? [r.google.total !== null ? `${num(r.google.total)} reviews` : '', r.google.countChange !== null ? `<span class="${r.google.countChange > 0 ? 'up' : ''}">${signed(r.google.countChange)}</span> this week` : ''].filter(Boolean).join(' · ') : 'not available')}
      ${kpi('Marketing tasks done', r.tasks.done.length, vs(r.tasks.done.length, r.tasks.prevDone))}
    </div>

    <div class="grid rep-grid">
      <section class="card">
        <div class="card-head"><h2>Followers</h2><span class="sub">end of week vs week before</span></div>
        <table class="rep-table">
          <thead><tr><th></th><th>Followers</th><th>This week</th><th>30 days</th></tr></thead>
          <tbody>${r.followers
            .map(
              (f) => `<tr><td><span class="soc-ch"><i class="cdot c-${f.channel}"></i>${SOCIAL_LABEL[f.channel]}</span>
                ${SOCIAL_BRANDS.some((b) => f.byBrand[b] !== null) ? `<div class="muted small">${SOCIAL_BRANDS.filter((b) => f.byBrand[b] !== null).map((b) => `${BRAND_SHORT[b]} ${esc(compactNumber(f.byBrand[b]))}`).join(' · ')}</div>` : ''}</td>
                <td class="num"><b>${f.total === null ? '–' : num(f.total)}</b></td>
                <td class="num">${f.week === null ? '–' : `<span class="${f.week > 0 ? 'up' : f.week < 0 ? 'late' : ''}">${signed(f.week)}</span>`}</td>
                <td class="num">${f.change30 === null ? '–' : signed(f.change30)}</td></tr>`
            )
            .join('')}</tbody>
        </table>
        ${ft.total === null ? '<p class="empty">No follower counts yet – use “Update followers” on the Marketing page.</p>' : ''}
      </section>

      <section class="card">
        <div class="card-head"><h2>Content published</h2><span class="sub">${r.content.published.length} post${r.content.published.length === 1 ? '' : 's'}</span></div>
        ${
          r.content.published.length
            ? `<p class="small muted rep-sum">${[
                ...Object.entries(r.content.byChannel).map(([c, n]) => `${esc(SOCIAL_LABEL[c] ?? c[0].toUpperCase() + c.slice(1))} ${n}`),
                ...Object.entries(r.content.byBrand).map(([b, n]) => `${esc(BRAND_SHORT[b] ?? b)} ${n}`),
              ].join(' · ')}</p>`
            : ''
        }
        ${list(r.content.published, (p) => `<span class="rep-date">${esc(shortDate(p.published_at ? today(new Date(p.published_at)) : p.publish_date))}</span><span class="rep-title">${esc(p.title)}</span><span class="rep-tags">${channelTags(p.channels)}</span>`, 'Nothing published this week.')}
        ${
          r.content.missed.length
            ? `<h3 class="rep-h late">Not published on time</h3>${list(r.content.missed, (p) => `<span class="rep-date">${esc(shortDate(p.publish_date))}</span><span class="rep-title">${esc(p.title)}</span><span class="pill">${p.status === 'scheduled' ? 'Scheduled' : 'In progress'}</span>`, '')}`
            : ''
        }
      </section>

      <section class="card">
        <div class="card-head"><h2>Google reviews</h2><span class="sub">${r.google ? `${r.google.newReviews.length} new this week` : ''}</span></div>
        ${
          !r.google
            ? '<p class="empty">Reviews couldn’t be loaded.</p>'
            : `${r.google.newAverage !== null ? `<p class="small muted rep-sum">Average of new reviews ${r.google.newAverage.toFixed(1)} ★ · ${vs(r.google.newReviews.length, r.google.prevCount)}</p>` : ''}
              ${list(
                r.google.newReviews.slice(0, 8),
                (x) => `<span class="rep-stars">${stars(x.rating)}</span><span class="rep-title"><b>${esc(x.author ?? 'Google user')}</b>${x.text ? ` <span class="muted">– ${esc(x.text.length > 140 ? `${x.text.slice(0, 140)}…` : x.text)}</span>` : ''}</span>`,
                'No new reviews this week.'
              )}
              ${r.google.complete ? '' : '<p class="muted small">Only the reviews Google’s Places API returns (5 at a time) – complete once the Business Profile connection is approved.</p>'}`
        }
      </section>

      <section class="card">
        <div class="card-head"><h2>Collaborators</h2><a class="link-btn no-print" href="#/collaborators">Open →</a></div>
        <div class="rep-stats">
          <div><b class="num">${r.collabs.tripsThisWeek.length}</b><span>trips started this week</span></div>
          <div><b class="num">${r.collabs.onTrip.length}</b><span>on a trip now</span></div>
          <div><b class="num ${r.collabs.contentOverdue.length ? 'late' : ''}">${r.collabs.contentOverdue.length}</b><span>content overdue</span></div>
          <div><b class="num">${r.collabs.toRefund.length}</b><span>refunds to pay${r.collabs.refundPending ? ` · €${num(r.collabs.refundPending)}` : ''}</span></div>
        </div>
        ${r.collabs.contentOverdue.length ? `<h3 class="rep-h late">Content overdue</h3>${list(r.collabs.contentOverdue, (c) => `<span class="rep-title">${esc(c.name)}</span><span class="muted small">trip ended ${esc(shortDate(c.dropoff_date))}</span>`, '')}` : ''}
        ${r.collabs.tripsNextWeek.length ? `<h3 class="rep-h">Trips next week</h3>${list(r.collabs.tripsNextWeek, (c) => `<span class="rep-date">${esc(shortDate(c.pickup_date))}</span><span class="rep-title">${esc(c.name)}</span><span class="muted small">${esc(BRAND_SHORT[c.brand] ?? '')}</span>`, '')}` : ''}
      </section>

      <section class="card">
        <div class="card-head"><h2>Tasks</h2><span class="sub">marketing</span></div>
        <h3 class="rep-h first">Done this week</h3>
        ${list(r.tasks.done, (x) => `${person(x)}<span class="rep-title">✓ ${esc(x.title)}</span>`, 'Nothing ticked off this week.')}
        ${r.tasks.overdue.length ? `<h3 class="rep-h late">Overdue</h3>${list(r.tasks.overdue, (x) => `${person(x)}<span class="rep-title">${esc(x.title)}</span><span class="pill overdue">${esc(shortDate(x.due_date))}</span>`, '')}` : ''}
      </section>

      <section class="card">
        <div class="card-head"><h2>Next week</h2><span class="sub">${esc(shortDate(w.nextStart))} – ${esc(shortDate(w.nextEnd))}</span></div>
        ${list(
          [
            ...r.content.nextPosts.map((p) => ({ d: p.publish_date, html: `<span class="rep-date">${esc(shortDate(p.publish_date))}</span><span class="rep-title">${esc(p.title)}</span><span class="rep-tags">${channelTags(p.channels)}</span>` })),
            ...r.content.nextDeadlines.map((p) => ({ d: p.deadline, html: `<span class="rep-date">${esc(shortDate(p.deadline))}</span><span class="rep-title">⏰ ${esc(p.title)} <span class="muted small">ready by</span></span>` })),
            ...r.tasks.next.map((x) => ({ d: x.due_date, html: `<span class="rep-date">${esc(shortDate(x.due_date))}</span><span class="rep-title">${esc(x.title)}</span>${person(x)}` })),
          ].sort((a, b) => a.d.localeCompare(b.d)),
          (x) => x.html,
          'Nothing planned yet.'
        )}
      </section>
    </div>

    <section class="card rep-notes">
      <div class="card-head"><h2>Meeting notes</h2><span class="sub" data-notes-status>${notes ? `saved ${esc(shortDate(notes.updated_at.slice(0, 10)))}` : ''}</span></div>
      ${
        canEdit
          ? `<textarea class="input no-print" rows="6" data-notes placeholder="Highlights, problems, focus for next week…">${esc(notes?.notes ?? '')}</textarea>
             <div class="print-only rep-notes-print">${esc(notes?.notes ?? '')}</div>`
          : `<div class="rep-notes-print">${notes?.notes ? esc(notes.notes) : '<span class="muted">No notes for this week.</span>'}</div>`
      }
    </section>`;

  page.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.week) go(b.dataset.week);
    else if ('print' in b.dataset) window.print();
    else if ('copy' in b.dataset) copyText(asText(r, page.querySelector('[data-notes]')?.value ?? notes?.notes ?? ''));
  };

  // Notes save by themselves when you leave the field (and every few seconds while typing).
  const area = page.querySelector('[data-notes]');
  if (area) {
    let saved = notes?.notes ?? '';
    let timer = null;
    const status = page.querySelector('[data-notes-status]');
    const save = async () => {
      clearTimeout(timer);
      const value = area.value;
      if (value.trim() === saved.trim()) return;
      try {
        const row = await api('/api/report-notes', { method: 'POST', body: { week: w.start, notes: value } });
        saved = value;
        const list = (state.reportNotes ??= []);
        const i = list.findIndex((n) => n.week === w.start);
        if (i >= 0) list[i] = row;
        else list.push(row);
        page.querySelector('.rep-notes-print').textContent = value;
        status.textContent = 'saved ✓';
      } catch (err) {
        toast(err.message, 'error');
      }
    };
    area.addEventListener('input', () => {
      status.textContent = 'typing…';
      clearTimeout(timer);
      timer = setTimeout(save, 1500);
    });
    area.addEventListener('blur', save);
  }
}

// Plain-text version to paste into an e-mail or chat.
function asText(r, notes) {
  const w = r.week;
  const lines = [`GO – Marketing report, ${weekLabel(w)}`, ''];
  const ft = r.followersTotal;
  lines.push('FOLLOWERS');
  for (const f of r.followers) if (f.total !== null) lines.push(`• ${SOCIAL_LABEL[f.channel]}: ${num(f.total)}${f.week !== null ? ` (${signed(f.week)} this week)` : ''}`);
  if (ft.total !== null) lines.push(`• Total: ${num(ft.total)}${ft.week !== null ? ` (${signed(ft.week)} this week)` : ''}`);
  else lines.push('• no counts yet');
  lines.push('', `CONTENT – ${r.content.published.length} published (last week ${r.content.prevPublished})`);
  for (const p of r.content.published) lines.push(`• ${shortDate(p.published_at ? today(new Date(p.published_at)) : p.publish_date)} ${p.title} [${(p.channels ?? []).map((c) => SOCIAL_LABEL[c] ?? c).join(', ')}] – ${brandName(p.brand)}`);
  if (r.content.missed.length) lines.push(`Not published on time: ${r.content.missed.map((p) => p.title).join(', ')}`);
  if (r.google) {
    lines.push('', 'GOOGLE REVIEWS');
    if (r.google.rating) lines.push(`• Rating ${r.google.rating.toFixed(1)} ★${r.google.total !== null ? `, ${num(r.google.total)} reviews` : ''}${r.google.countChange !== null ? ` (${signed(r.google.countChange)} this week)` : ''}`);
    lines.push(`• New this week: ${r.google.newReviews.length}${r.google.newAverage !== null ? `, average ${r.google.newAverage.toFixed(1)} ★` : ''}`);
  }
  const c = r.collabs;
  lines.push('', 'COLLABORATORS', `• Trips this week: ${c.tripsThisWeek.length} · on a trip now: ${c.onTrip.length}`, `• Content overdue: ${c.contentOverdue.length}${c.contentOverdue.length ? ` (${c.contentOverdue.map((x) => x.name).join(', ')})` : ''}`, `• Refunds to pay: ${c.toRefund.length}${c.refundPending ? ` – €${num(c.refundPending)}` : ''}`);
  lines.push('', `TASKS DONE (${r.tasks.done.length})`);
  for (const x of r.tasks.done) lines.push(`• ${x.title}${taskPerson(x) ? ` – ${taskPerson(x).name.split(' ')[0]}` : ''}`);
  if (r.tasks.overdue.length) lines.push(`Overdue: ${r.tasks.overdue.map((x) => x.title).join(', ')}`);
  const next = [...r.content.nextPosts.map((p) => `${shortDate(p.publish_date)} post: ${p.title}`), ...r.tasks.next.map((x) => `${shortDate(x.due_date)} ${x.title}`)];
  if (next.length) lines.push('', 'NEXT WEEK', ...next.map((s) => `• ${s}`));
  if (notes?.trim()) lines.push('', 'NOTES', notes.trim());
  return lines.join('\n');
}
