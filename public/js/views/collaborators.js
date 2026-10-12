// Collaborators: influencers / content creators who get a camper or car deal in exchange for content.
// Flow: Request → Agreed (booking) → [upcoming / on the trip / content overdue – from the dates]
//       → Content delivered (refund to pay) → Refunded & done.
import { emptyBox, kpi, pageHeader } from '../components.js';
import { COLLAB_PHASE_LABELS, COLLAB_STATUSES, collabPhase, collabTotals, decodeText, parseCollabSheet, parseSocials, sheetInfo, today } from '../lib.js';

const PAPA = 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm';
const XLSX = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';
import { api, isAdmin, state } from '../store.js';
import { esc, formData, money, num, openModal, options, shortDate, toast } from '../util.js';

const v = { phase: '', q: '', brand: '', handler: '', year: '' };
const yearOf = (c) => (c.pickup_date ?? c.created_at ?? '').slice(0, 4);

const PHASE_FILTERS = ['request', 'upcoming', 'on_trip', 'overdue', 'delivered', 'done', 'declined'];
const phaseBadge = (phase) => `<span class="cphase ${phase}">${esc(COLLAB_PHASE_LABELS[phase] ?? phase)}</span>`;

const dates = (c) =>
  c.pickup_date || c.dropoff_date ? `${c.pickup_date ? shortDate(c.pickup_date) : '?'} – ${c.dropoff_date ? shortDate(c.dropoff_date) : '?'}` : '–';

const socialIcons = (c) =>
  parseSocials(c.socials)
    .map((s) => `<a class="soc soc-${s.platform}" href="${esc(s.url)}" target="_blank" rel="noreferrer" title="${esc(s.label)}">${esc(s.label)}</a>`)
    .join('');

const flags = (c) =>
  [
    [c.moodboard, 'Moodboard'],
    [c.content_delivered, 'Content'],
    [c.in_onedrive, 'OneDrive'],
  ]
    .map(([on, label]) => `<span class="flag ${on ? 'on' : ''}" title="${label}${on ? ' ✓' : ' – not yet'}">${on ? '✓' : '·'} ${label}</span>`)
    .join('');

export function render(page, ctx) {
  const t = today();
  const admin = isAdmin();
  const everything = state.collaborators ?? [];
  const years = [...new Set(everything.map(yearOf).filter(Boolean))].sort().reverse();
  if (v.year && !years.includes(v.year)) v.year = '';
  // The year filter scopes everything on the page (KPIs, chips, totals) – like one sheet per year.
  const all = everything.filter((c) => !v.year || yearOf(c) === v.year);
  const totals = collabTotals(all, t);
  const handlers = [...new Set(all.map((c) => c.handled_by).filter(Boolean))].sort();
  const count = (phase) => all.filter((c) => collabPhase(c, t) === phase).length;
  const q = v.q.trim().toLowerCase();
  const list = all.filter(
    (c) =>
      (!v.phase || collabPhase(c, t) === v.phase) &&
      (!v.brand || c.brand === v.brand) &&
      (!v.handler || c.handled_by === v.handler) &&
      (!q || [c.name, c.email, c.socials, c.vehicle, c.booking_ref, c.content, c.comment].some((x) => x && x.toLowerCase().includes(q)))
  );
  const lt = collabTotals(list, t);

  page.innerHTML = `
    ${pageHeader('Collaborators', 'Influencers & content creators – deals, trips, content and refunds', admin ? '<button class="btn secondary" data-import>Import spreadsheet</button><button class="btn" data-new>+ Collaborator</button>' : '')}
    ${
      totals.overdue
        ? `<button type="button" class="banner warn-banner" data-phase-jump="overdue">⚠ <b>${totals.overdue} trip${totals.overdue === 1 ? ' is' : 's are'} over</b> but the content hasn’t arrived yet – follow up →</button>`
        : ''
    }
    <div class="kpis">
      ${kpi('Collaborations', totals.count, `${totals.onTrip} on a trip now · ${count('upcoming')} upcoming`)}
      ${kpi('Total reach', num(totals.followers), 'followers')}
      ${kpi('Booking value', money(totals.price, 'EUR'), `${money(totals.net, 'EUR')} after refunds`)}
      ${kpi(
        'Refunds',
        money(totals.refundPaid, 'EUR'),
        totals.toRefund
          ? `paid · <b class="owed">${totals.refundPending ? `${money(totals.refundPending, 'EUR')} to pay` : 'refund amount not set'} (${totals.toRefund})</b>`
          : 'paid · nothing pending'
      )}
    </div>
    <div class="toolbar">
      <input class="input grow" type="search" placeholder="Search name, @handle, vehicle, booking…" value="${esc(v.q)}" data-q />
      <select class="input" data-f="brand" aria-label="Brand">${options(
        [
          { value: 'camper', label: 'Go Campers' },
          { value: 'car', label: 'Go Car Rentals' },
        ],
        v.brand,
        { empty: 'Both brands' }
      )}</select>
      ${years.length > 1 ? `<select class="input" data-f="year" aria-label="Year">${options(years, v.year, { empty: 'All years' })}</select>` : ''}
      ${handlers.length ? `<select class="input" data-f="handler" aria-label="Handled by">${options(handlers, v.handler, { empty: 'Anyone' })}</select>` : ''}
    </div>
    <div class="chips" style="margin-bottom:14px">${[{ value: '', label: 'All', n: all.length }, ...PHASE_FILTERS.map((p) => ({ value: p, label: COLLAB_PHASE_LABELS[p], n: count(p) }))]
      .map((f) => `<button type="button" data-phase="${f.value}" aria-pressed="${v.phase === f.value}" class="${f.value === 'overdue' && f.n ? 'alert' : ''}">${esc(f.label)}<span class="count">${f.n}</span></button>`)
      .join('')}</div>
    ${
      !all.length
        ? emptyBox('No collaborations yet', admin ? '<p>Import your collaboration spreadsheet, or add one with “+ Collaborator”.</p>' : '')
        : !list.length
          ? emptyBox('Nothing matches these filters')
          : `<section class="card collab-card">
        <div class="table-wrap"><table class="collab-table">
          <thead><tr><th>Creator</th><th class="r">Followers</th><th>Vehicle</th><th>Dates</th><th class="opt">By</th><th>Status</th><th class="r">Price</th><th class="r">Refund</th><th class="opt">Progress</th></tr></thead>
          <tbody>${list
            .map((c) => {
              const phase = collabPhase(c, t);
              return `<tr class="clickable ${phase === 'overdue' ? 'row-alert' : ''}" data-open="${c.id}">
                <td><b>${esc(c.name)}</b><div class="socs">${socialIcons(c)}</div></td>
                <td class="r num">${c.followers ? num(c.followers) : '–'}</td>
                <td>${esc(c.vehicle ?? '–')}${c.brand ? `<div class="muted small">${c.brand === 'camper' ? 'Go Campers' : 'Go Car Rentals'}</div>` : ''}</td>
                <td class="nowrap">${dates(c)}${c.booking_ref ? `<div class="muted small mono">${esc(c.booking_ref)}</div>` : ''}</td>
                <td class="opt">${esc(c.handled_by ?? '–')}</td>
                <td>${phaseBadge(phase)}</td>
                <td class="r num nowrap">${c.price_eur != null ? money(c.price_eur, 'EUR') : '–'}</td>
                <td class="r num nowrap">${c.refund_eur != null ? money(c.refund_eur, 'EUR') : '–'}</td>
                <td class="opt"><div class="flags">${flags(c)}</div></td>
              </tr>`;
            })
            .join('')}</tbody>
          <tfoot><tr><td><b>${lt.count} shown</b></td><td class="r num"><b>${num(lt.followers)}</b></td><td></td><td></td><td class="opt"></td><td class="muted small">net ${money(lt.net, 'EUR')}</td>
            <td class="r num nowrap"><b>${money(lt.price, 'EUR')}</b></td><td class="r num nowrap"><b>${money(lt.refund, 'EUR')}</b></td><td class="opt"></td></tr></tfoot>
        </table></div>
        <ul class="collab-cards">${list
          .map((c) => {
            const phase = collabPhase(c, t);
            return `<li class="${phase === 'overdue' ? 'row-alert' : ''}" data-open="${c.id}">
              <div class="cc-top"><b>${esc(c.name)}</b>${phaseBadge(phase)}</div>
              <div class="socs">${socialIcons(c)}</div>
              <div class="muted small">${[c.followers ? `${num(c.followers)} followers` : null, c.vehicle, c.pickup_date || c.dropoff_date ? dates(c) : null, c.handled_by].filter(Boolean).map(esc).join(' · ')}</div>
              <div class="cc-money num">${c.price_eur != null ? `<span>Price ${money(c.price_eur, 'EUR')}</span>` : ''}${c.refund_eur != null ? `<span>Refund ${money(c.refund_eur, 'EUR')}</span>` : ''}</div>
              <div class="flags">${flags(c)}</div>
            </li>`;
          })
          .join('')}</ul>
      </section>`
    }`;

  const rerender = () => render(page, ctx);
  page.querySelector('[data-q]').addEventListener('input', (e) => {
    v.q = e.target.value;
    clearTimeout(page._qTimer);
    page._qTimer = setTimeout(() => {
      rerender();
      const input = page.querySelector('[data-q]');
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }, 250);
  });
  page.querySelectorAll('select[data-f]').forEach((sel) =>
    sel.addEventListener('change', () => {
      v[sel.dataset.f] = sel.value;
      rerender();
    })
  );
  page.onclick = (e) => {
    if (e.target.closest('a')) return; // social links open normally
    const b = e.target.closest('[data-phase], [data-phase-jump], [data-new], [data-open], [data-import]');
    if (!b) return;
    const d = b.dataset;
    if (d.phase !== undefined || d.phaseJump) {
      v.phase = d.phaseJump ?? d.phase;
      rerender();
    } else if ('import' in d) importModal(ctx.refresh);
    else if ('new' in d) collabModal({ status: 'request', brand: 'camper' }, ctx.refresh);
    else if (d.open) collabModal(all.find((c) => c.id === d.open), ctx.refresh);
  };
}

function collabModal(c, refresh) {
  const admin = isAdmin();
  const t = today();
  let status = c.status ?? 'request';
  const handlers = [...new Set((state.collaborators ?? []).map((x) => x.handled_by).filter(Boolean))];
  const m = openModal(
    c.id ? c.name : 'New collaborator',
    `<form>
      ${c.id ? `<div class="line" style="margin:-6px 0 4px">${phaseBadge(collabPhase(c, t))}<span class="muted small">updated ${esc(shortDate(c.updated_at?.slice(0, 10)))}</span></div>` : ''}
      <div class="field"><span>Status</span><div class="chips wrap-chips" data-status>${COLLAB_STATUSES.map(
        (s) => `<button type="button" data-v="${s.value}" title="${esc(s.hint)}" aria-pressed="${status === s.value}">${s.label}</button>`
      ).join('')}</div></div>

      <h3 class="sec">Creator</h3>
      <div class="form-grid">
        <label class="field"><span>Name *</span><input class="input" name="name" required value="${esc(c.name ?? '')}" /></label>
        <label class="field"><span>E-mail</span><input class="input" name="email" value="${esc(c.email ?? '')}" placeholder="one or more" /></label>
        <label class="field full"><span>Social media</span><textarea class="input" name="socials" rows="2" placeholder="Instagram / TikTok / YouTube links or @handles – one per line">${esc(c.socials ?? '')}</textarea></label>
        <label class="field"><span>Followers</span><input class="input num" type="number" min="0" name="followers" value="${esc(c.followers ?? '')}" placeholder="e.g. 12200" /></label>
      </div>

      <h3 class="sec">What they’ll create</h3>
      <label class="field"><textarea class="input" name="content" rows="4" placeholder="e.g. 2 reels, 1 TikTok, 20 edited photos, stories during the trip…">${esc(c.content ?? '')}</textarea></label>

      <h3 class="sec">Booking</h3>
      <div class="form-grid">
        <label class="field"><span>Brand</span><select class="input" name="brand">${options(
          [
            { value: 'camper', label: 'Go Campers' },
            { value: 'car', label: 'Go Car Rentals' },
          ],
          c.brand,
          { empty: '–' }
        )}</select></label>
        <label class="field"><span>Vehicle</span><input class="input" name="vehicle" value="${esc(c.vehicle ?? '')}" placeholder="e.g. Go Lite Auto" /></label>
        <label class="field"><span>Pick-up</span><input class="input" type="date" name="pickup_date" value="${esc(c.pickup_date ?? '')}" /></label>
        <label class="field"><span>Drop-off</span><input class="input" type="date" name="dropoff_date" value="${esc(c.dropoff_date ?? '')}" /></label>
        <label class="field"><span>Booking number</span><input class="input mono" name="booking_ref" value="${esc(c.booking_ref ?? '')}" /></label>
        <label class="field"><span>Handled by</span><input class="input" name="handled_by" list="collabHandlers" value="${esc(c.handled_by ?? '')}" placeholder="who deals with them" />
          <datalist id="collabHandlers">${handlers.map((h) => `<option value="${esc(h)}"></option>`).join('')}</datalist></label>
        <label class="field full"><span>Deal / terms</span><input class="input" name="terms" value="${esc(c.terms ?? '')}" placeholder="e.g. 35% discount + 150 € extras" /></label>
      </div>

      <h3 class="sec">Money</h3>
      <div class="form-grid">
        <label class="field"><span>Price (EUR)</span><input class="input num" type="number" step="0.01" min="0" name="price_eur" value="${esc(c.price_eur ?? '')}" /><small>What the booking costs them</small></label>
        <label class="field"><span>Refund (EUR)</span><input class="input num" type="number" step="0.01" min="0" name="refund_eur" value="${esc(c.refund_eur ?? '')}" /><small>Paid back once the content is delivered</small></label>
      </div>

      <h3 class="sec">Content & files</h3>
      <label class="check"><input type="checkbox" name="moodboard" ${c.moodboard ? 'checked' : ''} /> Moodboard received</label>
      <label class="check"><input type="checkbox" name="content_delivered" ${c.content_delivered ? 'checked' : ''} /> Content delivered</label>
      <label class="check"><input type="checkbox" name="in_onedrive" ${c.in_onedrive ? 'checked' : ''} /> Saved to OneDrive</label>
      <label class="field"><span>Link to content / folder</span><input class="input" name="content_link" value="${esc(c.content_link ?? '')}" placeholder="OneDrive, Google Drive, WeTransfer…" /></label>
      ${c.content_link ? `<a class="link-btn" href="${esc(c.content_link)}" target="_blank" rel="noreferrer">Open content ↗</a>` : ''}

      <label class="field"><span>Comment</span><textarea class="input" name="comment" rows="2">${esc(c.comment ?? '')}</textarea></label>
      ${admin ? `<button class="btn block" type="submit">${c.id ? 'Save' : 'Add collaborator'}</button>` : ''}
      ${admin && c.id ? '<button class="btn danger block" type="button" data-remove>Delete</button>' : ''}
    </form>`
  );
  const form = m.el.querySelector('form');
  m.el.querySelector('[data-status]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    status = b.dataset.v;
    m.el.querySelectorAll('[data-status] button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (status === 'delivered' || status === 'done') form.content_delivered.checked = true;
  });
  // Ticking "content delivered" on an agreed deal moves it on to "Content delivered".
  form.content_delivered.addEventListener('change', () => {
    if (form.content_delivered.checked && (status === 'agreed' || status === 'request')) m.el.querySelector('[data-status] [data-v="delivered"]').click();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(form);
    if (f.pickup_date && f.dropoff_date && f.dropoff_date < f.pickup_date) return toast('Drop-off is before pick-up', 'error');
    try {
      await api('/api/collaborators', { method: 'POST', body: { ...f, id: c.id, status } });
      m.close();
      toast(c.id ? 'Saved' : 'Collaborator added');
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  m.el.querySelector('[data-remove]')?.addEventListener('click', async () => {
    if (!confirm(`Delete ${c.name}?`)) return;
    try {
      await api(`/api/collaborators?id=${c.id}`, { method: 'DELETE' });
      m.close();
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// ── Import from the collaboration spreadsheet (Excel workbook with one sheet per brand & year, or CSV) ──
async function readSheets(file) {
  if (/\.(xlsx|xls|ods)$/i.test(file.name)) {
    const X = await import(XLSX);
    const wb = X.read(await file.arrayBuffer());
    return wb.SheetNames.map((name) => ({ name, rows: X.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false }) }));
  }
  const { default: Papa } = await import(PAPA);
  const text = decodeText(new Uint8Array(await file.arrayBuffer()));
  // "Social Media collaboration 2022(Campers 26).csv" → use the part in brackets as the sheet name
  const name = (file.name.match(/\(([^)]+)\)/)?.[1] ?? file.name).replace(/\.csv$/i, '');
  return [{ name, rows: Papa.parse(text, { header: true, skipEmptyLines: 'greedy' }).data }];
}

function importModal(refresh) {
  let sheets = []; // { name, rows, brand, year, include }
  const m = openModal(
    'Import collaboration spreadsheet',
    `<div class="stack">
      <p class="muted">Upload the Excel file – every sheet (e.g. <i>Car Rental 26</i>, <i>Campers 25</i>) is read, the brand and year come from the sheet name.
      CSV exports work too (one sheet per file). Importing the same sheet again updates the rows instead of duplicating them.</p>
      <label class="drop"><b data-file-label>Choose the Excel / CSV file(s)</b><span>.xlsx, .xls, .csv – several CSV files at once are fine</span>
        <input type="file" accept=".xlsx,.xls,.ods,.csv" multiple hidden data-file /></label>
      <div data-sheets></div>
      <button class="btn block" data-run disabled>Import</button>
    </div>`
  );
  const box = m.el.querySelector('[data-sheets]');
  const runBtn = m.el.querySelector('[data-run]');

  const parsed = (sh) => parseCollabSheet(sh.rows, { brand: sh.brand, year: sh.year });
  const draw = () => {
    const chosen = sheets.filter((sh) => sh.include && sh.brand && sh.year);
    const total = chosen.reduce((n, sh) => n + parsed(sh).items.length, 0);
    box.innerHTML = sheets.length
      ? `<table class="import-sheets"><thead><tr><th></th><th>Sheet</th><th>Brand</th><th>Year</th><th class="r">Rows</th></tr></thead><tbody>${sheets
          .map((sh, i) => {
            const n = parsed(sh).items.length;
            return `<tr class="${n ? '' : 'muted'}"><td><input type="checkbox" data-inc="${i}" ${sh.include ? 'checked' : ''} ${n ? '' : 'disabled'} /></td>
              <td>${esc(sh.name)}</td>
              <td><select class="input sm-input" data-brand="${i}">${options(
                [
                  { value: 'car', label: 'Go Car Rentals' },
                  { value: 'camper', label: 'Go Campers' },
                ],
                sh.brand,
                { empty: '–' }
              )}</select></td>
              <td><input class="input sm-input num" type="number" min="2015" max="2100" data-year="${i}" value="${sh.year ?? ''}" style="width:90px" /></td>
              <td class="r num">${n}</td></tr>`;
          })
          .join('')}</tbody></table>
          ${
            chosen.length
              ? `<p class="muted small" style="margin-top:8px">Preview: ${chosen
                  .flatMap((sh) => parsed(sh).items.slice(0, 2).map((x) => `${esc(x.name)} (${esc(x.vehicle ?? '?')}, ${x.pickup_date ? esc(shortDate(x.pickup_date)) : 'no date'})`))
                  .slice(0, 6)
                  .join(' · ')}</p>`
              : ''
          }`
      : '';
    runBtn.disabled = !total;
    runBtn.textContent = total ? `Import ${total} collaboration${total === 1 ? '' : 's'}` : 'Import';
  };

  m.el.querySelector('[data-file]').addEventListener('change', async (e) => {
    try {
      sheets = [];
      for (const file of e.target.files) {
        for (const sh of await readSheets(file)) {
          const info = sheetInfo(sh.name);
          // Only sheets that look like collaboration lists are pre-selected.
          const looksRight = parseCollabSheet(sh.rows, { brand: info.brand ?? 'car', year: info.year ?? 2026 }).items.length > 0;
          sheets.push({ ...sh, ...info, include: !!(info.brand && info.year && looksRight) });
        }
      }
      m.el.querySelector('[data-file-label]').textContent = [...e.target.files].map((f) => f.name).join(', ');
      draw();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  box.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.inc !== undefined) sheets[t.dataset.inc].include = t.checked;
    if (t.dataset.brand !== undefined) sheets[t.dataset.brand].brand = t.value || null;
    if (t.dataset.year !== undefined) sheets[t.dataset.year].year = Number(t.value) || null;
    draw();
  });
  runBtn.addEventListener('click', async () => {
    const items = sheets.filter((sh) => sh.include && sh.brand && sh.year).flatMap((sh) => parsed(sh).items);
    runBtn.disabled = true;
    try {
      let done = 0;
      for (let i = 0; i < items.length; i += 200) {
        runBtn.textContent = `Importing… ${Math.min(i + 200, items.length)} / ${items.length}`;
        done += (await api('/api/collaborators', { method: 'POST', body: { import: items.slice(i, i + 200) } })).imported;
      }
      m.close();
      toast(`Imported ${done} collaborations`);
      refresh();
    } catch (err) {
      toast(err.message, 'error');
      runBtn.disabled = false;
      draw();
    }
  });
}
