// Front-line affiliates: receptionists, concierges… with their own booking code. They earn a commission
// on bookings made with it – only once the rental has actually happened (not cancelled).
// Flow: Offered → Confirmed (print their business card) → Card given.
import { emptyBox } from '../components.js';
import { AFFILIATE_STATUSES, affiliateEarnings, affiliateStatusLabel, commissionLabel, shiftDate, today } from '../lib.js';
import { api, isAdmin, loadSales, state } from '../store.js';
import { copyText, esc, formData, money, openModal, options, shortDate, toast } from '../util.js';

const QR = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm';

export const affiliateStatusBadge = (s) => `<span class="astatus ${esc(s)}">${esc(affiliateStatusLabel(s))}</span>`;

// Sales needed for earnings: everything since the oldest person was added (minus a margin).
export async function salesForAffiliates(list) {
  if (!list.length) return [];
  const first = list.map((a) => a.created_at.slice(0, 10)).sort()[0];
  return loadSales(shiftDate(first, -30), shiftDate(today(), 400));
}

const suggestCode = (name, partner) => {
  const clean = (s) =>
    (s ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[þÞ]/g, 'TH')
      .replace(/[ðÐ]/g, 'D')
      .replace(/[æÆ]/g, 'AE')
      .replace(/[^A-Za-z0-9 ]/g, '')
      .trim()
      .split(/\s+/);
  const first = clean(name)[0]?.toUpperCase() ?? '';
  const hotel = clean(partner?.name)
    .filter((w) => !/^(hotel|guesthouse|hostel|reykjavik|the)$/i.test(w))[0]
    ?.toUpperCase();
  return [first, hotel].filter(Boolean).join('-').slice(0, 24);
};

// Suggest the person's link from the hotel's link by swapping the hotel code for theirs.
const suggestUrl = (partner, code) =>
  partner?.affiliate_url && partner?.affiliate_code && code ? partner.affiliate_url.replace(new RegExp(partner.affiliate_code, 'i'), code) : '';

export function affiliateModal(aff, partner, refresh) {
  const isNew = !aff.id;
  const m = openModal(
    isNew ? `New front-line affiliate${partner ? ` – ${partner.name}` : ''}` : aff.name,
    `<form>
      <div class="form-grid">
        <label class="field"><span>Name *</span><input class="input" name="name" required value="${esc(aff.name ?? '')}" placeholder="Anna Jónsdóttir" /></label>
        <label class="field"><span>Role</span><input class="input" name="role" value="${esc(aff.role ?? '')}" placeholder="Receptionist, concierge…" /></label>
        <label class="field"><span>Phone</span><input class="input" type="tel" name="phone" value="${esc(aff.phone ?? '')}" /></label>
        <label class="field"><span>E-mail</span><input class="input" type="email" name="email" value="${esc(aff.email ?? '')}" /></label>
      </div>
      <div class="form-grid">
        <label class="field"><span>Personal code *</span><input class="input mono" name="code" required value="${esc(aff.code ?? '')}" placeholder="ANNA-BORG" /><small>Must match the affiliate / promo code in the Caren export.</small></label>
        <label class="field"><span>Booking link</span><input class="input" type="url" name="url" value="${esc(aff.url ?? '')}" placeholder="https://…" /><small>Used for the QR code on the card.</small></label>
      </div>
      <div class="field"><span>Commission</span>
        <div class="commission">
          <div class="seg" data-ctype>${[
            { value: 'percent', label: '% of booking' },
            { value: 'fixed', label: '€ per booking' },
          ]
            .map((o) => `<button type="button" data-v="${o.value}" aria-pressed="${(aff.commission_type ?? 'percent') === o.value}">${o.label}</button>`)
            .join('')}</div>
          <input class="input num" type="number" step="0.5" min="0" name="commission_value" value="${esc(aff.commission_value ?? '')}" placeholder="5" required />
        </div>
        <small>Paid only for bookings that weren’t cancelled and whose rental has ended.</small>
      </div>
      <div class="field"><span>Status</span><div class="chips wrap-chips" data-astatus>${AFFILIATE_STATUSES.map(
        (s) => `<button type="button" data-v="${s.value}" title="${esc(s.hint)}" aria-pressed="${(aff.status ?? 'offered') === s.value}">${s.label}</button>`
      ).join('')}</div></div>
      <label class="field"><span>Notes</span><textarea class="input" name="notes" rows="2">${esc(aff.notes ?? '')}</textarea></label>
      <button class="btn block" type="submit">${isNew ? 'Add person' : 'Save'}</button>
      ${!isNew ? '<button class="btn danger block" type="button" data-remove>Remove person</button>' : ''}
    </form>`
  );
  const form = m.el.querySelector('form');
  let ctype = aff.commission_type ?? 'percent';
  let status = aff.status ?? 'offered';
  const pick = (sel, set) =>
    m.el.querySelector(sel).addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      set(b.dataset.v);
      m.el.querySelectorAll(`${sel} button`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
  pick('[data-ctype]', (val) => (ctype = val));
  pick('[data-astatus]', (val) => (status = val));
  // Suggest a code and link from the name while they're empty.
  let codeTouched = !!aff.code;
  let urlTouched = !!aff.url;
  form.code.addEventListener('input', () => (codeTouched = true));
  form.url.addEventListener('input', () => (urlTouched = true));
  const suggest = () => {
    if (!codeTouched) form.code.value = suggestCode(form.name.value, partner);
    if (!urlTouched) form.url.value = suggestUrl(partner, form.code.value);
  };
  form.name.addEventListener('input', suggest);
  form.code.addEventListener('input', () => !urlTouched && (form.url.value = suggestUrl(partner, form.code.value)));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const saved = await api('/api/affiliates', {
        method: 'POST',
        body: { ...formData(form), id: aff.id, partner_id: aff.partner_id ?? partner?.id ?? null, commission_type: ctype, status },
      });
      m.close();
      toast(isNew ? 'Added' : 'Saved');
      await refresh();
      if (status === 'confirmed' && aff.status !== 'confirmed' && aff.status !== 'card_given') cardModal(saved, partner, refresh);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  m.el.querySelector('[data-remove]')?.addEventListener('click', async () => {
    if (!confirm(`Remove ${aff.name} and their payout history?`)) return;
    try {
      await api(`/api/affiliates?id=${aff.id}`, { method: 'DELETE' });
      m.close();
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

export function payoutModal(aff, earnings, refresh) {
  const history = state.payouts.filter((p) => p.affiliate_id === aff.id);
  const m = openModal(
    `Payout – ${aff.name}`,
    `<form>
      <div class="mini-kpis three">
        <div class="mini-kpi"><div class="label">Earned</div><div class="value num">${money(earnings.earned, 'EUR')}</div></div>
        <div class="mini-kpi"><div class="label">Paid</div><div class="value num">${money(earnings.paid, 'EUR')}</div></div>
        <div class="mini-kpi"><div class="label">To pay</div><div class="value num">${money(Math.max(0, earnings.owed), 'EUR')}</div></div>
      </div>
      <div class="form-grid">
        <label class="field"><span>Amount (EUR)</span><input class="input num" type="number" step="0.01" min="0.01" name="amount_eur" required value="${earnings.owed > 0 ? earnings.owed : ''}" /></label>
        <label class="field"><span>Paid on</span><input class="input" type="date" name="paid_at" value="${today()}" required /></label>
      </div>
      <label class="field"><span>Note</span><input class="input" name="note" placeholder="Cash, bank transfer, gift card…" /></label>
      <button class="btn block" type="submit">Record payout</button>
      ${
        history.length
          ? `<h3 class="sec">History</h3><ul class="tasks">${history
              .map(
                (p) => `<li class="task"><div class="body"><span class="title num">${money(p.amount_eur, 'EUR')}</span><div class="meta">${shortDate(p.paid_at)}${p.note ? ` · ${esc(p.note)}` : ''}</div></div>
                <div class="acts"><button type="button" class="link-btn muted" data-del-payout="${p.id}">Delete</button></div></li>`
              )
              .join('')}</ul>`
          : ''
      }
    </form>`
  );
  const form = m.el.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/affiliates', { method: 'POST', body: { payout: { ...formData(form), affiliate_id: aff.id } } });
      m.close();
      toast('Payout recorded');
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  m.el.querySelectorAll('[data-del-payout]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('Delete this payout?')) return;
      await api(`/api/affiliates?payout_id=${b.dataset.delPayout}`, { method: 'DELETE' });
      m.close();
      refresh();
    })
  );
}

// Business card (85 × 55 mm) – shown as a preview, printed / saved as PDF through the browser.
async function cardHtml(aff, partner) {
  let qr = '';
  if (aff.url) {
    try {
      const { toString } = await import(QR);
      qr = await toString(aff.url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#0b0b0b', light: '#ffffff' } });
    } catch {
      qr = '';
    }
  }
  return `<div class="bcard">
      <div class="bc-left">
        <img src="/logo.png" alt="GO" class="bc-logo" />
        <div class="bc-tag">Car &amp; camper rental · Iceland</div>
        <div class="bc-name">${esc(aff.name)}</div>
        <div class="bc-sub">${esc([aff.role, partner?.name].filter(Boolean).join(' · '))}</div>
        <div class="bc-code-label">Book with my code</div>
        <div class="bc-code">${esc(aff.code)}</div>
      </div>
      ${qr ? `<div class="bc-right"><div class="bc-qr">${qr}</div><div class="bc-scan">Scan to book</div></div>` : ''}
    </div>`;
}

export async function cardModal(aff, partner, refresh) {
  const ready = aff.status === 'confirmed' || aff.status === 'card_given';
  const m = openModal(
    `Business card – ${aff.name}`,
    `<div class="stack">
      ${!ready ? '<div class="banner">The card is printed once they’ve <b>confirmed</b> they’re in. Set their status to Confirmed first.</div>' : ''}
      <div class="bcard-preview" data-preview><p class="empty">Preparing…</p></div>
      ${!aff.url ? '<p class="muted small">Add their booking link to put a QR code on the card.</p>' : ''}
      ${
        ready
          ? `<div class="controls"><button class="btn" data-print>Print / save PDF</button>${aff.url ? '<button class="btn secondary" data-copy-link>Copy link</button>' : ''}
             ${aff.status === 'confirmed' && isAdmin() ? '<button class="btn secondary" data-given>Mark card as given</button>' : ''}</div>
             <p class="muted small">Tip: in the print dialog choose “Save as PDF” and send it to a print shop, or print on A4 – the page fits 8 cards.</p>`
          : ''
      }
    </div>`
  );
  const html = await cardHtml(aff, partner);
  m.el.querySelector('[data-preview]').innerHTML = html;
  m.el.querySelector('[data-copy-link]')?.addEventListener('click', () => copyText(aff.url));
  m.el.querySelector('[data-print]')?.addEventListener('click', () => {
    const area = document.getElementById('printArea') ?? Object.assign(document.createElement('div'), { id: 'printArea' });
    area.innerHTML = `<div class="print-sheet">${html.repeat(8)}</div>`;
    document.body.appendChild(area);
    document.documentElement.classList.add('printing');
    setTimeout(() => {
      window.print();
      document.documentElement.classList.remove('printing');
    }, 300);
  });
  m.el.querySelector('[data-given]')?.addEventListener('click', async () => {
    try {
      await api('/api/affiliates', { method: 'POST', body: { id: aff.id, status: 'card_given' } });
      m.close();
      toast('Card given ✓');
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// The block shown on a partner page and in the Affiliates overview.
export function affiliateRows(list, sales, { showHotel = false } = {}) {
  const admin = isAdmin();
  return list
    .map((a) => {
      const e = affiliateEarnings(a, sales, state.payouts);
      const partner = state.partners.find((p) => p.id === a.partner_id);
      const canCard = a.status === 'confirmed' || a.status === 'card_given';
      return `<li class="aff">
        <div class="aff-main">
          <div class="aff-name"><b>${esc(a.name)}</b>${affiliateStatusBadge(a.status)}</div>
          <div class="muted small">${esc([a.role, showHotel ? partner?.name ?? 'No hotel' : null].filter(Boolean).join(' · '))}${a.role || showHotel ? ' · ' : ''}<span class="code">${esc(a.code)}</span> · ${esc(commissionLabel(a))}</div>
        </div>
        <div class="aff-nums num">
          <span><b>${e.bookings}</b><small>bookings</small></span>
          <span><b>${money(e.earned, 'EUR')}</b><small>earned${e.pending ? ` · +${money(e.pending, 'EUR')} pending` : ''}</small></span>
          <span class="${e.owed > 0 ? 'owed' : ''}"><b>${money(Math.max(0, e.owed), 'EUR')}</b><small>to pay</small></span>
        </div>
        <div class="aff-acts">
          ${admin && a.status === 'offered' ? `<button class="btn sm" data-aff-confirm="${a.id}">Confirm</button>` : ''}
          <button class="btn ${a.status === 'confirmed' ? '' : 'secondary'} sm" data-aff-card="${a.id}" ${canCard ? '' : 'disabled title="Confirm them first"'}>Card</button>
          ${admin ? `<button class="btn secondary sm" data-aff-pay="${a.id}">Pay</button><button class="icon-btn round sm" data-aff-edit="${a.id}" aria-label="Edit">✎</button>` : ''}
        </div>
      </li>`;
    })
    .join('');
}

// Wire the buttons rendered by affiliateRows inside `root`.
export function wireAffiliateRows(root, sales, refresh) {
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    const id = d.affCard || d.affPay || d.affEdit || d.affConfirm;
    if (!id) return;
    const a = state.affiliates.find((x) => x.id === id);
    const partner = state.partners.find((p) => p.id === a.partner_id);
    if (d.affCard) cardModal(a, partner, refresh);
    else if (d.affPay) payoutModal(a, affiliateEarnings(a, sales, state.payouts), refresh);
    else if (d.affEdit) affiliateModal(a, partner, refresh);
    else if (d.affConfirm) {
      try {
        const saved = await api('/api/affiliates', { method: 'POST', body: { id: a.id, status: 'confirmed' } });
        toast(`${a.name} confirmed ✓`);
        await refresh();
        cardModal(saved, partner, refresh);
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  });
}

// Partners → Affiliates tab: everyone across all hotels, what they earned and what is still to pay.
export async function renderOverview(el, refresh, isCurrent) {
  const list = [...state.affiliates].sort((a, b) => AFFILIATE_STATUSES.findIndex((s) => s.value === a.status) - AFFILIATE_STATUSES.findIndex((s) => s.value === b.status) || a.name.localeCompare(b.name));
  if (!list.length) {
    el.innerHTML = emptyBox('No front-line affiliates yet', '<p>Open a partner hotel and add the receptionists or concierges who want their own code.</p>');
    return;
  }
  el.innerHTML = '<div class="loading">Loading…</div>';
  const sales = await salesForAffiliates(list);
  if (!isCurrent()) return;
  const sum = (k) => list.reduce((s, a) => s + affiliateEarnings(a, sales, state.payouts)[k], 0);
  const count = (st) => list.filter((a) => a.status === st).length;
  el.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="label">People</div><div class="value">${list.length - count('inactive')}</div><div class="delta">${count('offered')} offered · ${count('confirmed')} waiting for card</div></div>
      <div class="kpi"><div class="label">Bookings via people</div><div class="value num">${sum('bookings')}</div><div class="delta">${money(sum('revenue_eur'), 'EUR')} booked</div></div>
      <div class="kpi"><div class="label">Commission earned</div><div class="value num">${money(sum('earned'), 'EUR')}</div><div class="delta">+ ${money(sum('pending'), 'EUR')} pending (rental not over yet)</div></div>
      <div class="kpi"><div class="label">To pay out</div><div class="value num">${money(Math.max(0, sum('owed')), 'EUR')}</div><div class="delta">${money(sum('paid'), 'EUR')} paid so far</div></div>
    </div>
    <section class="card"><ul class="aff-list">${affiliateRows(list, sales, { showHotel: true })}</ul></section>`;
  wireAffiliateRows(el, sales, refresh);
}

