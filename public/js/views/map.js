// Map: every partner with a pin, coloured by stage, and a trip planner – pick places for a day, see
// what else is close by, open the route in Google Maps and plan the visits.
// Pins come from Google Places (/api/geocode); the map itself is Leaflet with OpenStreetMap tiles
// (darkened with a CSS filter in dark mode).
import { pageHeader } from '../components.js';
import { directionsUrl, distanceKm, distanceText, FLYERS, flyerKey, hasPin, nearbyPlaces, nextPlannedVisit, OFFICE, PARTNER_TYPES, routeKm, routeOrder, shiftDate, STAGES, today, typeLabel, visitStats } from '../lib.js';
import { api, isAdmin, state } from '../store.js';
import { esc, options, shortDate, storage, toast } from '../util.js';

const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4';
let leafletReady = null;
function loadLeaflet() {
  leafletReady ??= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `${LEAFLET}/leaflet.min.css`;
    document.head.append(css);
    const js = document.createElement('script');
    js.src = `${LEAFLET}/leaflet.min.js`;
    js.onload = () => resolve(window.L);
    js.onerror = () => {
      leafletReady = null;
      reject(new Error('The map could not be loaded – check the internet connection.'));
    };
    document.head.append(js);
  });
  return leafletReady;
}

// The office pin: looked up once (Google, via /api/geocode) and kept on this device.
let office = (() => {
  try {
    const o = JSON.parse(storage.get('go-crm-office', 'null'));
    return o?.address === OFFICE.address ? o : null;
  } catch {
    return null;
  }
})();
const OFFICE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14v-5l-2-5H7l-2 5z"/><path d="M5 12h14"/><circle cx="8" cy="17" r="1.6" fill="currentColor"/><circle cx="16" cy="17" r="1.6" fill="currentColor"/></svg>';

const STAGE_COLOR = { new: '--text-3', contacted: '--car', in_talks: '--warn', accepted: '--good', declined: '--bad', on_hold: '--warn' };
const RECENT_DAYS = 14;

// Filters and the trip stay while you move around the CRM (and are remembered on this device).
const saved = (() => {
  try {
    return JSON.parse(storage.get('go-crm-map', '{}')) ?? {};
  } catch {
    return {};
  }
})();
const view = { type: saved.type ?? '', stages: new Set(saved.stages ?? STAGES.filter((s) => s.value !== 'declined').map((s) => s.value)) };
const trip = { date: saved.date && saved.date >= today() ? saved.date : shiftDate(today(), 1), time: '', ids: saved.ids ?? [] };
const save = () => storage.set('go-crm-map', JSON.stringify({ type: view.type, stages: [...view.stages], date: trip.date, ids: trip.ids }));

export async function render(page, { query, refresh, isCurrent }) {
  const admin = isAdmin();
  const byId = new Map(state.partners.map((p) => [p.id, p]));
  trip.ids = trip.ids.filter((id) => byId.has(id));
  const visits = visitStats(state.activities);
  const pinned = state.partners.filter(hasPin);
  const missing = state.partners.filter((p) => !hasPin(p) && !p.geo_status);
  const notFound = state.partners.filter((p) => !hasPin(p) && p.geo_status === 'notfound');
  let pinFor = null; // partner waiting for a hand-placed pin

  page.innerHTML = `
    ${pageHeader(
      'Map',
      `${pinned.length} of ${state.partners.length} partners on the map${missing.length ? ` · ${missing.length} not looked up yet` : ''}`,
      admin && missing.length ? `<button class="btn secondary" data-locate>Find ${missing.length} on the map</button>` : ''
    )}
    <div class="filters">
      <select class="input" data-type aria-label="Type">${options(
        PARTNER_TYPES.filter((t) => state.partners.some((p) => p.type === t.value)).map((t) => ({ value: t.value, label: t.label })),
        view.type,
        { empty: 'All types' }
      )}</select>
      <div class="chips wrap-chips" data-stages>${STAGES.map(
        (s) => `<button type="button" data-s="${s.value}" aria-pressed="${view.stages.has(s.value)}"><i class="dot" style="background:var(${STAGE_COLOR[s.value]})"></i>${s.label}</button>`
      ).join('')}</div>
    </div>
    <div class="map-layout">
      <div class="map-box" id="map"><p class="empty">Loading the map…</p></div>
      <aside class="card trip" data-trip></aside>
    </div>`;

  let L;
  try {
    L = await loadLeaflet();
  } catch (e) {
    page.querySelector('#map').innerHTML = `<p class="empty">${esc(e.message)}</p>`;
    return;
  }
  if (!isCurrent()) return;

  const css = getComputedStyle(document.documentElement);
  const color = (stage) => css.getPropertyValue(STAGE_COLOR[stage] ?? '--text-3').trim();
  const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.hasAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
  const box = page.querySelector('#map');
  box.innerHTML = '';
  const map = L.map(box, { zoomControl: true }).setView([64.1466, -21.9426], 13);
  box.classList.toggle('dark', dark);
  // OpenStreetMap needs to know which site asks for tiles (our pages send no referrer by default).
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    referrerPolicy: 'strict-origin-when-cross-origin',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  const markers = new Map();

  const plannedOn = (date) => state.tasks.filter((t) => t.type === 'visit' && !t.done && t.due_date === date).map((t) => byId.get(t.partner_id)).filter(Boolean);
  // The day's stops: visits already planned that day plus the places picked here, in route order.
  const stops = () => {
    const planned = plannedOn(trip.date);
    const ids = new Set(planned.map((p) => p.id));
    const all = [...planned, ...trip.ids.filter((id) => !ids.has(id)).map((id) => byId.get(id))];
    return { planned: ids, route: routeOrder(all, office), unpinned: all.filter((p) => !hasPin(p)) };
  };
  const shown = (p) => hasPin(p) && (!view.type || p.type === view.type) && view.stages.has(p.stage);

  const popup = (p) => {
    const v = visits.get(p.id);
    const planned = nextPlannedVisit(p.id, state.tasks);
    const inTrip = trip.ids.includes(p.id) || stops().planned.has(p.id);
    const flyers = FLYERS.filter((size) => p[flyerKey(size)]);
    return `<div class="map-pop">
      <b>${esc(p.name)}</b>
      <div class="muted small">${esc([typeLabel(p.type), STAGES.find((s) => s.value === p.stage)?.label, p.area].filter(Boolean).join(' · '))}</div>
      <div class="small">${v ? `${v.count}× visited, last ${shortDate(v.last)}` : 'Not visited yet'}${planned ? ` · planned ${shortDate(planned)}` : ''}${flyers.length ? ` · 📄 ${flyers.join('+')}` : ''}</div>
      <div class="acts"><a class="btn secondary sm" href="#/partner/${p.id}">Open</a>${
        admin ? (inTrip ? (trip.ids.includes(p.id) ? `<button class="btn secondary sm" data-trip-remove="${p.id}">Remove from trip</button>` : '<span class="pill">Planned that day</span>') : `<button class="btn sm" data-trip-add="${p.id}">+ Add to trip</button>`) : ''
      }</div></div>`;
  };

  const drawMarkers = () => {
    layer.clearLayers();
    markers.clear();
    if (office) {
      L.marker([office.lat, office.lng], { icon: L.divIcon({ className: 'office-pin', html: `<span>${OFFICE_ICON}</span>`, iconSize: [36, 44], iconAnchor: [18, 42], popupAnchor: [0, -38] }), zIndexOffset: 2000 })
        .bindPopup(`<div class="map-pop"><b>Go Car Rentals · Go Campers</b><div class="muted small">Our office · ${esc(OFFICE.address)}</div><div class="small">Trips start here.</div></div>`)
        .bindTooltip('Our office', { direction: 'top', offset: [0, -38] })
        .addTo(layer);
    }
    const { route } = stops();
    const order = new Map(route.map((p, i) => [p.id, i + 1]));
    const near = new Set(nearbyPlaces(state.partners, route, { visits, day: trip.date, freshDays: RECENT_DAYS }).map((x) => x.partner.id));
    for (const p of state.partners) {
      if (!hasPin(p) || (!shown(p) && !order.has(p.id))) continue;
      const n = order.get(p.id);
      const m = n
        ? L.marker([p.lat, p.lng], { icon: L.divIcon({ className: 'trip-pin', html: `<span style="background:${color(p.stage)}">${n}</span>`, iconSize: [26, 26] }), zIndexOffset: 1000 })
        : L.circleMarker([p.lat, p.lng], {
            radius: near.has(p.id) ? 9 : 7,
            color: near.has(p.id) ? css.getPropertyValue('--accent').trim() : dark ? '#111' : '#fff',
            weight: near.has(p.id) ? 3 : 2,
            dashArray: near.has(p.id) ? '3 3' : null,
            fillColor: p.stage === 'on_hold' ? (dark ? '#111' : '#fff') : color(p.stage),
            fillOpacity: 1,
          });
      if (!n && p.stage === 'on_hold') m.setStyle({ color: color('on_hold'), weight: 3 });
      m.bindPopup(() => popup(p), { minWidth: 220 });
      m.bindTooltip(esc(p.name), { direction: 'top', offset: [0, -6] });
      m.addTo(layer);
      markers.set(p.id, m);
    }
  };

  const drawTrip = () => {
    const { route, planned, unpinned } = stops();
    const fresh = trip.ids.filter((id) => !planned.has(id));
    const near = nearbyPlaces(state.partners, route, { visits, day: trip.date, freshDays: RECENT_DAYS });
    const url = directionsUrl(route, office ? OFFICE.address : null);
    const legs = office ? [office, ...route] : route;
    page.querySelector('[data-trip]').innerHTML = `
      <div class="card-head"><h2>Trip</h2>${trip.ids.length ? '<button class="link-btn muted" data-trip-clear>Clear</button>' : ''}</div>
      <div class="form-grid">
        <label class="field"><span>Day</span><input class="input" type="date" data-trip-date value="${esc(trip.date)}" min="${today()}" /></label>
        <label class="field"><span>Time (optional)</span><input class="input" type="time" data-trip-time value="${esc(trip.time)}" /></label>
      </div>
      ${
        route.length
          ? `<ol class="trip-stops">${route
              .map(
                (p, i) => `<li><span class="n" style="background:${color(p.stage)}">${i + 1}</span>
                  <span class="body"><a href="#/partner/${p.id}">${esc(p.name)}</a><small class="muted">${i ? `${distanceText(distanceKm(route[i - 1], p))} from ${i}` : office ? `${distanceText(distanceKm(office, p))} from the office` : 'Start'}${planned.has(p.id) ? ' · already planned' : ''}</small></span>
                  ${planned.has(p.id) ? '' : `<button class="icon-btn sm" data-trip-remove="${p.id}" aria-label="Remove ${esc(p.name)}">✕</button>`}</li>`
              )
              .join('')}</ol>
            ${legs.length > 1 ? `<p class="muted small">About ${distanceText(routeKm(legs))} ${office ? 'from the office' : 'between the stops'} (straight line).</p>` : ''}`
          : `<p class="empty">Click places on the map and choose <b>Add to trip</b>. Places close by are then suggested here.${plannedOn(trip.date).length ? '' : ' Visits already planned for the day show up too.'}</p>`
      }
      ${unpinned.length ? `<p class="muted small">Not on the map: ${esc(unpinned.map((p) => p.name).join(', '))}</p>` : ''}
      ${
        near.length
          ? `<h3 class="trip-sub">Close by <span class="muted small">(not visited in ${RECENT_DAYS} days)</span></h3>
            <ul class="trip-near">${near
              .map(
                ({ partner: p, km }) => `<li><i class="dot" style="background:${color(p.stage)}"></i><span class="body"><button type="button" class="link-btn" data-focus="${p.id}">${esc(p.name)}</button>
                  <small class="muted">${distanceText(km)} · ${esc(STAGES.find((s) => s.value === p.stage)?.label ?? '')}</small></span>
                  ${admin ? `<button class="btn secondary sm" data-trip-add="${p.id}">+ Add</button>` : ''}</li>`
              )
              .join('')}</ul>`
          : ''
      }
      <div class="trip-acts">
        ${url ? `<a class="btn secondary block" href="${url}" target="_blank" rel="noreferrer">Open route in Google Maps ↗</a>` : ''}
        ${admin && fresh.length ? `<button class="btn block" data-trip-plan>Plan ${fresh.length} visit${fresh.length === 1 ? '' : 's'} for ${shortDate(trip.date)}</button>` : ''}
      </div>
      ${
        admin && notFound.length
          ? `<details class="trip-missing"><summary>${notFound.length} not found on Google</summary>
              <p class="muted small">Pick one, then click the map where it is.</p>
              <ul>${notFound.map((p) => `<li><button type="button" class="link-btn" data-pin="${p.id}">${esc(p.name)}</button></li>`).join('')}</ul></details>`
          : ''
      }`;
    const dateInput = page.querySelector('[data-trip-date]');
    dateInput.onchange = () => {
      if (!dateInput.value) return;
      trip.date = dateInput.value;
      save();
      redraw();
    };
    page.querySelector('[data-trip-time]').onchange = (e) => (trip.time = e.target.value);
  };

  const redraw = () => {
    drawMarkers();
    drawTrip();
  };
  const focus = (id) => {
    const p = byId.get(id);
    if (!hasPin(p)) return;
    map.setView([p.lat, p.lng], Math.max(map.getZoom(), 16));
    markers.get(id)?.openPopup();
  };

  redraw();
  if (!office) {
    api('/api/geocode')
      .then((o) => {
        office = { ...o, address: OFFICE.address };
        storage.set('go-crm-office', JSON.stringify(office));
        if (isCurrent()) redraw();
      })
      .catch(() => {});
  }
  const startAt = query.get('focus');
  if (startAt && hasPin(byId.get(startAt))) focus(startAt);
  else {
    const { route } = stops();
    const fit = route.length ? [office, ...route].filter(Boolean) : pinned.filter(shown);
    if (fit.length > 1) map.fitBounds(fit.map((p) => [p.lat, p.lng]), { padding: [30, 30], maxZoom: 15 });
    else if (fit.length) map.setView([fit[0].lat, fit[0].lng], 15);
  }

  map.on('click', async (e) => {
    if (!pinFor) return;
    const p = pinFor;
    pinFor = null;
    box.classList.remove('placing');
    try {
      await api('/api/geocode', { method: 'POST', body: { id: p.id, lat: e.latlng.lat, lng: e.latlng.lng } });
      toast(`${p.name} is on the map`);
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  page.querySelector('[data-type]').onchange = (e) => {
    view.type = e.target.value;
    save();
    drawMarkers();
  };
  page.querySelector('[data-stages]').onclick = (e) => {
    const b = e.target.closest('[data-s]');
    if (!b) return;
    view.stages.has(b.dataset.s) ? view.stages.delete(b.dataset.s) : view.stages.add(b.dataset.s);
    b.setAttribute('aria-pressed', String(view.stages.has(b.dataset.s)));
    save();
    drawMarkers();
  };

  page.onclick = async (e) => {
    const el = e.target.closest('button');
    if (!el) return;
    const d = el.dataset;
    if (d.tripAdd) {
      if (!trip.ids.includes(d.tripAdd)) trip.ids.push(d.tripAdd);
      map.closePopup();
      save();
      redraw();
    } else if (d.tripRemove) {
      trip.ids = trip.ids.filter((id) => id !== d.tripRemove);
      map.closePopup();
      save();
      redraw();
    } else if ('tripClear' in d) {
      trip.ids = [];
      save();
      redraw();
    } else if (d.focus) focus(d.focus);
    else if (d.pin) {
      pinFor = byId.get(d.pin);
      box.classList.add('placing');
      toast(`Click the map where ${pinFor.name} is`);
    } else if ('tripPlan' in d) {
      const ids = trip.ids.filter((id) => !stops().planned.has(id));
      try {
        const r = await api('/api/tasks', { method: 'POST', body: { plan: { date: trip.date, time: trip.time || null, partner_ids: ids } } });
        toast(`${r.planned} visit${r.planned === 1 ? '' : 's'} planned for ${shortDate(trip.date)}`);
        trip.ids = [];
        save();
        refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    } else if ('locate' in d) locateAll(el, refresh);
  };
}

// Looks up pins in batches (the server does a dozen per call) until none are left.
async function locateAll(button, refresh) {
  button.disabled = true;
  let located = 0;
  const notFound = [];
  try {
    for (;;) {
      const r = await api('/api/geocode', { method: 'POST', body: {} });
      located += r.located;
      notFound.push(...r.not_found);
      button.textContent = `Finding… ${r.remaining} left`;
      if (!r.remaining || r.located + r.not_found.length === 0) break;
    }
    toast(`${located} placed on the map${notFound.length ? ` · ${notFound.length} not found – place those by hand` : ''}`);
  } catch (err) {
    toast(err.message, 'error');
  }
  refresh();
}
