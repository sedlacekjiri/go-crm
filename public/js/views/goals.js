// Monthly targets vs. what actually happened, with an "on pace" check.
import { pageHeader } from '../components.js';
import { actuals, GOAL_METRICS, monthElapsed, monthOf, monthRange, shiftMonth, today } from '../lib.js';
import { api, isAdmin, loadSales, state } from '../store.js';
import { esc, money, monthLabel, num, toast } from '../util.js';

const HISTORY = 6;
let month = monthOf(today());

const fmt = (metric, v) => (metric === 'revenue_eur' ? money(v, 'EUR') : num(v));

export async function render(page, { refresh, isCurrent }) {
  const months = Array.from({ length: HISTORY }, (_, i) => shiftMonth(month, i - HISTORY + 1));
  page.innerHTML = '<div class="loading">Loading…</div>';
  const sales = await loadSales(monthRange(months[0]).from, monthRange(month).to);
  if (!isCurrent()) return;

  const rows = months.map((m) => ({
    month: m,
    actual: actuals(m, { ...state, sales }),
    target: Object.fromEntries(state.goals.filter((g) => g.month === m).map((g) => [g.metric, g.target])),
  }));
  const current = rows.at(-1);
  const elapsed = monthElapsed(month);
  const admin = isAdmin();

  page.innerHTML = `
    ${pageHeader(
      'Goals',
      'Monthly targets – what we promise, what we deliver',
      `<button class="icon-btn" data-month="-1" aria-label="Previous month">←</button>
       <b style="min-width:130px;text-align:center">${esc(monthLabel(month))}</b>
       <button class="icon-btn" data-month="1" aria-label="Next month">→</button>`
    )}
    <form id="goalForm">
      <div class="goal-cards">
        ${GOAL_METRICS.map((g) => {
          const target = current.target[g.value];
          const actual = current.actual[g.value];
          const expected = target !== undefined ? target * elapsed : undefined;
          let status = '';
          if (target !== undefined && elapsed > 0 && elapsed < 1) status = actual >= expected ? '<span class="status ok">✓ On pace</span>' : '<span class="status behind">△ Behind pace</span>';
          if (target !== undefined && elapsed === 1) status = actual >= target ? '<span class="status ok">✓ Achieved</span>' : '<span class="status miss">✕ Missed</span>';
          return `<section class="card goal-card">
            <div class="head"><span class="small" style="color:var(--text-2);font-weight:500">${g.label}</span>${status}</div>
            <div class="value num">${fmt(g.value, actual)}${target !== undefined ? ` <small>/ ${fmt(g.value, target)}</small>` : ''}</div>
            ${
              target !== undefined
                ? `<div class="progress ${actual >= target ? 'done' : ''}"><i style="width:${Math.min(100, (actual / (target || 1)) * 100)}%"></i>${
                    elapsed > 0 && elapsed < 1 ? `<b style="left:calc(${elapsed * 100}% - 1px)" title="Expected by today"></b>` : ''
                  }</div>`
                : '<p class="muted small">No target set</p>'
            }
            ${admin ? `<label class="target">Target <input class="input num" type="number" inputmode="decimal" min="0" step="any" name="${g.value}" value="${target ?? ''}" placeholder="–" />${g.unit}</label>` : ''}
          </section>`;
        }).join('')}
      </div>
      ${admin ? `<div class="controls" style="margin-top:12px"><button class="btn" type="submit">Save targets</button><button class="btn secondary" type="button" data-copy>Copy last month’s targets</button></div>` : ''}
    </form>

    <section class="card" style="margin-top:12px">
      <div class="card-head"><h2>Last ${HISTORY} months</h2></div>
      <div class="table-wrap"><table class="num">
        <thead><tr><th>Month</th>${GOAL_METRICS.map((g) => `<th class="r">${g.label}</th>`).join('')}</tr></thead>
        <tbody>${rows
          .slice()
          .reverse()
          .map(
            (r) => `<tr><td class="nowrap">${esc(monthLabel(r.month))}</td>${GOAL_METRICS.map((g) => {
              const t = r.target[g.value];
              const hit = t !== undefined && r.actual[g.value] >= t;
              return `<td class="r nowrap">${fmt(g.value, r.actual[g.value])}${t !== undefined ? `<span style="color:${hit ? 'var(--good)' : 'var(--text-3)'}"> / ${fmt(g.value, t)}${hit ? ' ✓' : ''}</span>` : ''}</td>`;
            }).join('')}</tr>`
          )
          .join('')}</tbody>
      </table></div>
      <p class="muted small" style="margin-top:10px">Visits = visits + meetings logged. New partners = moved to Accepted that month. Bookings &amp; revenue = bookings whose affiliate code belongs to a CRM partner, by booking date.</p>
    </section>`;

  page.querySelectorAll('[data-month]').forEach((b) =>
    b.addEventListener('click', () => {
      month = shiftMonth(month, Number(b.dataset.month));
      render(page, { refresh, isCurrent });
    })
  );
  const form = page.querySelector('#goalForm');
  page.querySelector('[data-copy]')?.addEventListener('click', () => {
    const prev = rows.at(-2).target;
    GOAL_METRICS.forEach((g) => (form[g.value].value = prev[g.value] ?? ''));
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const targets = Object.fromEntries(GOAL_METRICS.map((g) => [g.value, form[g.value].value]));
    try {
      await api('/api/goals', { method: 'POST', body: { month, targets } });
      toast('Targets saved');
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
