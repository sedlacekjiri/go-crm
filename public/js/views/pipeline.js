// Kanban for walking in: To visit → Visited → Interested → Partner / Declined.
// Cards move with ← → (works on phones). "To visit" is grouped by area to plan a route.
import { followUpPill, interestBadge, kpi, pageHeader } from '../components.js';
import { capacityText, nextPlannedVisit, PARTNER_TYPES, STAGES, today, visitStats } from '../lib.js';
import { api, isAdmin, state } from '../store.js';
import { esc, options, shortDate, toast } from '../util.js';

let typeFilter = '';

export function render(page, { refresh }) {
  const partners = state.partners.filter((p) => !typeFilter || p.type === typeFilter);
  const count = (s) => partners.filter((p) => p.stage === s).length;
  const decided = count('accepted') + count('declined');
  const reached = partners.length - count('new');
  const admin = isAdmin();
  const order = STAGES.map((s) => s.value);
  const visits = visitStats(state.activities);

  page.innerHTML = `
    ${pageHeader(
      'Pipeline',
      'From first visit to signed partner',
      `<select class="input" data-type aria-label="Partner type" style="width:auto">${options(PARTNER_TYPES, typeFilter, { empty: 'All types' })}</select>`
    )}
    <div class="kpis">
      ${kpi('On the list', partners.length, `${count('new')} still to visit`)}
      ${kpi('Visited', reached, partners.length ? `${Math.round((reached / partners.length) * 100)} % of the list` : '–')}
      ${kpi('Partners', count('accepted'), `${count('in_talks')} interested`)}
      ${kpi('Win rate', decided ? `${Math.round((count('accepted') / decided) * 100)} %` : '–', `${count('accepted')} partners / ${count('declined')} declined`)}
    </div>
    <div class="board">
      ${STAGES.map((s) => {
        const items = partners
          .filter((p) => p.stage === s.value)
          .sort((a, b) =>
            s.value === 'new'
              ? (a.area ?? '~').localeCompare(b.area ?? '~') || a.name.localeCompare(b.name)
              : (b.interest ?? 0) - (a.interest ?? 0) || (a.next_follow_up ?? '9999').localeCompare(b.next_follow_up ?? '9999')
          );
        return `<section class="col">
          <div class="col-head"><h3>${s.label}</h3><span class="muted small num">${items.length}</span></div>
          <div class="col-hint">${s.hint}</div>
          ${items
            .map(
              (p) => `<div class="kcard">
                <a href="#/partner/${p.id}">
                  <div class="name">${esc(p.name)}${p.chain ? ` <em class="chain-tag sm">${esc(p.chain)}</em>` : ''}</div>
                  <div class="meta">${esc([p.area?.replace(/\s*\(.*\)/, ''), capacityText(p)].filter(Boolean).join(' · ') || ' ')}</div>
                  ${visits.get(p.id) ? `<div class="meta">${visits.get(p.id).count}× visited · last ${shortDate(visits.get(p.id).last)}</div>` : ''}
                  <div class="tags">${interestBadge(p.interest)}${(() => {
                    const d = nextPlannedVisit(p.id, state.tasks);
                    return d ? `<span class="pill ${d < today() ? 'overdue' : d === today() ? 'today' : ''}">📅 ${d === today() ? 'Today' : shortDate(d)}</span>` : '';
                  })()}${['new', 'contacted', 'in_talks'].includes(s.value) && p.next_follow_up ? followUpPill(p.next_follow_up) : ''}</div>
                </a>
                ${
                  admin
                    ? `<div class="move"><button type="button" data-move="${p.id}" data-dir="-1" ${s.value === order[0] ? 'disabled' : ''} aria-label="Move back">←</button>
                       <button type="button" data-move="${p.id}" data-dir="1" ${s.value === order.at(-1) ? 'disabled' : ''} aria-label="Move forward">→</button></div>`
                    : ''
                }
              </div>`
            )
            .join('') || '<p class="muted small" style="text-align:center;padding:14px 0">Empty</p>'}
        </section>`;
      }).join('')}
    </div>`;

  page.querySelector('[data-type]').addEventListener('change', (e) => {
    typeFilter = e.target.value;
    render(page, { refresh });
  });
  page.querySelector('.board').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-move]');
    if (!b) return;
    const p = state.partners.find((x) => x.id === b.dataset.move);
    const next = order[order.indexOf(p.stage) + Number(b.dataset.dir)];
    if (!next) return;
    b.closest('.kcard').style.opacity = 0.5;
    try {
      await api('/api/partners', { method: 'POST', body: { id: p.id, stage: next } });
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
