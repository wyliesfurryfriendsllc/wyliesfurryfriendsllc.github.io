import {
    db, collection, query, orderBy, onSnapshot,
    addDoc, updateDoc, doc, serverTimestamp
} from './firebase.js';

let calUnsub = null;
let calBookings = [];
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calSelectedDate = null;
let calActiveFilter = 'all'; // 'all' | 'pending' | 'confirmed' | 'completed'

// ─── INIT ────────────────────────────────────────────────
function init() {
    renderCalendar(); // render shell immediately
    if (calUnsub) return;
    const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'));
    calUnsub = onSnapshot(q, snap => {
        calBookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderCalendar();
        if (calSelectedDate) showDayBookings(calSelectedDate);
    }, err => console.error('Calendar bookings error:', err));
}

// ─── DATE PARSING ────────────────────────────────────────
function parseDates(b) {
    if (b.dates && Array.isArray(b.dates)) return b.dates;
    const result = new Set();
    (b.datesText || '').split('\n').forEach(line => {
        const t = line.trim();
        if (!t) return;
        const range = t.match(/^([A-Za-z]+ \d+,\s*\d{4})\s*[–-]\s*([A-Za-z]+ \d+,\s*\d{4})/);
        if (range) {
            const s = new Date(range[1]), e = new Date(range[2]);
            if (!isNaN(s) && !isNaN(e)) {
                for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1))
                    result.add(toISO(d));
            }
            return;
        }
        const single = t.match(/^([A-Za-z]+ \d+,\s*\d{4})/);
        if (single) { const d = new Date(single[1]); if (!isNaN(d)) result.add(toISO(d)); }
    });
    return [...result];
}

function toISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function buildDateMap() {
    const map = new Map();
    calBookings.forEach(b => {
        if (b.status === 'rejected') return;
        if (calActiveFilter !== 'all' && b.status !== calActiveFilter) return;
        parseDates(b).forEach(iso => {
            if (!map.has(iso)) map.set(iso, []);
            map.get(iso).push(b);
        });
    });
    return map;
}

function setFilter(filter) {
    calActiveFilter = filter;
    document.querySelectorAll('.cal-filter-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.status === filter);
    });
    renderCalendar();
    if (calSelectedDate) showDayBookings(calSelectedDate);
}

// ─── CALENDAR RENDER ─────────────────────────────────────
function renderCalendar() {
    const grid = document.getElementById('calGrid');
    if (!grid) return;

    const dateMap = buildDateMap();
    const todayISO = toISO(new Date());
    const firstDay = new Date(calYear, calMonth, 1);
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

    document.getElementById('calMonthLabel').textContent =
        firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    grid.innerHTML = '';

    // Leading blank cells
    for (let i = 0; i < firstDay.getDay(); i++) {
        const blank = document.createElement('div');
        blank.className = 'cal-cell cal-empty';
        grid.appendChild(blank);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const iso = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const count = (dateMap.get(iso) || []).length;
        const cell = document.createElement('div');
        cell.className = 'cal-cell'
            + (iso === todayISO ? ' cal-today' : '')
            + (iso === calSelectedDate ? ' cal-selected' : '');
        cell.innerHTML = `<span class="cal-day-num">${day}</span>`
            + (count ? `<span class="cal-badge">${count}</span>` : '');
        cell.onclick = () => selectDay(iso);
        grid.appendChild(cell);
    }
}

function changeMonth(delta) {
    calMonth += delta;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    if (calMonth < 0)  { calMonth = 11; calYear--; }
    calSelectedDate = null;
    const panel = document.getElementById('calDayPanel');
    if (panel) panel.style.display = 'none';
    renderCalendar();
}

// ─── DAY PANEL ───────────────────────────────────────────
const STATUS_LABELS = { pending:'Pending', confirmed:'Confirmed', rejected:'Declined', completed:'Completed' };
const STATUS_COLORS = { pending:'status-pending', confirmed:'status-confirmed', rejected:'status-rejected', completed:'status-completed' };

function selectDay(iso) {
    calSelectedDate = iso;
    renderCalendar();
    showDayBookings(iso);
}

function getEndTime(t, durationMin) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const total = h * 60 + m + (durationMin || 30);
    const eh = Math.floor(total / 60) % 24;
    const em = total % 60;
    return fmt12(`${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`);
}

function showDayBookings(iso) {
    const panel = document.getElementById('calDayPanel');
    if (!panel) return;
    const bookings = buildDateMap().get(iso) || [];
    const label = new Date(iso + 'T12:00:00').toLocaleDateString('en-US',
        { weekday:'long', month:'long', day:'numeric', year:'numeric' });

    // Expand each booking into one card per time slot
    const visits = [];
    bookings.forEach(b => {
        let times = [];
        if (b.dateTimes && b.dateTimes[iso]) {
            times = [...b.dateTimes[iso]].filter(Boolean).sort();
        } else if (b.times && Array.isArray(b.times)) {
            times = [...b.times].filter(Boolean).sort();
        }
        if (times.length === 0) times = [''];
        times.forEach(t => visits.push({ b, t }));
    });

    // Sort all visits chronologically
    visits.sort((a, b) => {
        if (!a.t && !b.t) return 0;
        if (!a.t) return 1;
        if (!b.t) return -1;
        return a.t.localeCompare(b.t);
    });

    panel.style.display = '';
    panel.innerHTML = `
        <div class="cal-day-header">
            <span class="cal-day-title">${label}</span>
            <span class="cal-day-count">${visits.length} visit${visits.length !== 1 ? 's' : ''}</span>
        </div>
        ${visits.length === 0
            ? '<p class="empty-msg" style="padding:16px 0">No bookings on this day.</p>'
            : '<div class="cal-day-list" id="calDayList"></div>'
        }
    `;

    if (visits.length === 0) return;
    const list = document.getElementById('calDayList');

    visits.forEach(({ b, t }) => {
        const pets = b.pets || [];
        const petNames = pets.map(p => p.name).filter(Boolean).join(', ');
        const svcLabel = `${b.service || 'Visit'}${petNames ? ': ' + petNames : ''}`;
        let timeStr;
        if (!t) {
            timeStr = 'TBD';
        } else if (t.includes('~')) {
            const [ts, te] = t.split('~');
            timeStr = `${fmt12(ts)} – ${fmt12(te)}`;
        } else {
            const startLabel = fmt12(t);
            const endLabel   = getEndTime(t, b.duration || 30);
            timeStr = `${startLabel} – ${endLabel}`;
        }

        const card = document.createElement('div');
        card.className = 'cal-visit-card';
        card.innerHTML = `
            <div class="cal-visit-info">
                <div class="cal-visit-svc">${escHtml(svcLabel)}</div>
                <div class="cal-visit-time">${escHtml(timeStr)}</div>
            </div>
            <div class="cal-visit-avatars"></div>
        `;

        // Pet avatars via DOM (avoids base64 in innerHTML)
        const avatarWrap = card.querySelector('.cal-visit-avatars');
        const shown = pets.slice(0, 3);
        if (shown.length === 0) {
            const d = document.createElement('div');
            d.className = 'cal-visit-avatar cal-visit-avatar-emoji';
            d.textContent = '🐾';
            avatarWrap.appendChild(d);
        } else {
            shown.forEach((p, idx) => {
                const emoji = p.type === 'cat' ? '🐱' : '🐶';
                let el;
                if (p.photoUrl) {
                    el = document.createElement('img');
                    el.className = 'cal-visit-avatar';
                    el.src = p.photoUrl;
                    el.alt = p.name || '';
                } else {
                    el = document.createElement('div');
                    el.className = 'cal-visit-avatar cal-visit-avatar-emoji';
                    el.textContent = emoji;
                }
                if (idx > 0) el.style.marginLeft = '-10px';
                el.style.zIndex = 3 - idx;
                avatarWrap.appendChild(el);
            });
        }

        list.appendChild(card);
    });
}

// ─── NEW BOOKING MODAL ────────────────────────────────────
const PRICING = {
    dropin:  { base: 23, addon60: 20, holiday: 31, extraDog: 9, cat: 23, extraCat: 9 },
    walking: { base: 26, addon60: 23, holiday: 34, extraDog: 9 }
};

const HOLIDAY_RANGES = [
    ['2026-05-22', '2026-05-25'],
    ['2026-06-19', '2026-06-21'],
    ['2026-07-03', '2026-07-05'],
    ['2026-09-04', '2026-09-07'],
    ['2026-11-26', '2026-11-29'],
    ['2026-12-24', '2027-01-03'],
];

function isHolidayBooking(dates) {
    return (dates || []).some(iso =>
        HOLIDAY_RANGES.some(([s, e]) => iso >= s && iso <= e)
    );
}

let nbSelectedClientId = null;
let nbSelectedPets = new Set();
let nbDateTimes = new Map(); // Map<isoDate, slot[]> — slot: { mode, start, end }
let nbSameTimeAll = false;
let editingBookingId = null;
let nbModalYear = new Date().getFullYear();
let nbModalMonth = new Date().getMonth();

function openNewBookingModal() {
    nbSelectedClientId = null;
    nbSelectedPets = new Set();
    nbDateTimes = new Map();
    nbSameTimeAll = false;
    editingBookingId = null;
    if (calSelectedDate) nbDateTimes.set(calSelectedDate, [emptySlot()]);
    const titleEl = document.getElementById('nbModalTitle');
    const saveBtn = document.getElementById('nbSaveBtn');
    if (titleEl) titleEl.textContent = 'New Booking';
    if (saveBtn) saveBtn.textContent = 'Save Booking';
    nbModalYear = new Date().getFullYear();
    nbModalMonth = new Date().getMonth();

    ['nbName','nbPhone','nbEmail','nbTotal','nbNotes'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('nbClientSearch').value = '';
    document.getElementById('nbClientSearchResults').style.display = 'none';
    document.getElementById('nbSelectedClient').style.display = 'none';
    document.getElementById('nbPetSection').style.display = 'none';
    document.getElementById('nbService').value = 'Drop-In Visit';
    document.getElementById('nbDuration').value = '30';
    document.getElementById('nbError').textContent = '';

    renderNbCal();
    renderNbVisitTimes();
    calcNbTotal();

    document.getElementById('newBookingModal').style.display = 'flex';
}

// ─── TIME HELPERS ────────────────────────────────────────
function emptySlot() { return { mode: 'time', start: '', end: '' }; }

function parseSlotObj(t) {
    if (!t) return emptySlot();
    if (typeof t === 'object') return t;
    if (t.includes('~')) {
        const [start, end] = t.split('~');
        return { mode: 'range', start, end };
    }
    return { mode: 'time', start: t, end: '' };
}

function serializeSlot(s) {
    if (!s || !s.start) return '';
    if (s.mode === 'range' && s.end) return `${s.start}~${s.end}`;
    return s.start;
}

function parseHrMin(hhmm) {
    if (!hhmm) return { h: '', m: '00' };
    const [hStr, mStr] = hhmm.split(':');
    return { h: parseInt(hStr) || '', m: mStr || '00' };
}

function buildHHMM(h, m) {
    const raw = parseInt(h);
    if (!h || isNaN(raw)) return '';
    return `${String(Math.max(1, Math.min(24, raw))).padStart(2,'0')}:${m || '00'}`;
}

// ─── VISIT TIMES (per-day) ────────────────────────────────
function renderNbVisitTimes() {
    const wrap = document.getElementById('nbVisitTimes');
    if (!wrap) return;
    if (nbDateTimes.size === 0) { wrap.style.display = 'none'; return; }

    wrap.style.display = '';
    const sortedDates = [...nbDateTimes.keys()].sort();
    const firstIso = sortedDates[0];

    const toggleChecked = nbSameTimeAll ? 'checked' : '';
    let html = `
        <div class="nb-visit-times-label">Pick visit times</div>
        <div class="nb-same-time-row">
            <span class="nb-same-time-label">Same time for all days</span>
            <label class="nb-toggle-switch">
                <input type="checkbox" ${toggleChecked} onchange="AdminCalendar.toggleSameTime(this.checked)">
                <span class="nb-toggle-track"><span class="nb-toggle-thumb"></span></span>
            </label>
        </div>
    `;

    sortedDates.forEach((iso, dateIdx) => {
        const d = new Date(iso + 'T12:00:00');
        const dateLabel = d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
        const slots = nbDateTimes.get(iso);
        const isFirst = dateIdx === 0;

        if (nbSameTimeAll && !isFirst) {
            html += `
                <div class="nb-visit-date-block">
                    <div class="nb-visit-date-header">
                        <span class="nb-visit-date-name">${escHtml(dateLabel)}</span>
                    </div>
                    <div class="nb-same-time-note">Same time as above</div>
                </div>`;
            return;
        }

        const visitCount = slots.filter(s => s.start).length || 1;
        const slotsHtml = slots.map((s, idx) => {
            const slot = parseSlotObj(s);
            const sh = parseHrMin(slot.start);
            const eh = parseHrMin(slot.end);
            const isRange = slot.mode === 'range';
            const minOpts = cur => ['00','15','30','45'].map(v =>
                `<option value="${v}" ${cur===v?'selected':''}>${v}</option>`).join('');

            const removeBtn = slots.length > 1 ? `<button type="button" class="nb-remove-time" onclick="AdminCalendar.removeTimeFromDate('${iso}',${idx})">×</button>` : '';
            return `
            <div class="nb-time-row">
                <div class="nb-time-line">
                    <div class="nb-mode-pills">
                        <button type="button" class="nb-mode-pill ${!isRange?'active':''}"
                            onclick="AdminCalendar.setSlotMode('${iso}',${idx},'time')">Time</button>
                        <button type="button" class="nb-mode-pill ${isRange?'active':''}"
                            onclick="AdminCalendar.setSlotMode('${iso}',${idx},'range')">Range</button>
                    </div>
                    ${!isRange ? `
                    <input type="number" class="nb-hour-input" min="1" max="24" placeholder="Hr" value="${sh.h}"
                        onchange="AdminCalendar.updateSlotStartHour('${iso}',${idx},this.value)"
                        oninput="AdminCalendar.updateSlotStartHour('${iso}',${idx},this.value)">
                    <span class="nb-time-colon">:</span>
                    <select class="nb-min-select" onchange="AdminCalendar.updateSlotStartMin('${iso}',${idx},this.value)">
                        ${minOpts(sh.m)}
                    </select>
                    ${removeBtn}` : ''}
                </div>
                ${isRange ? `
                <div class="nb-time-line">
                    <input type="number" class="nb-hour-input" min="1" max="24" placeholder="Hr" value="${sh.h}"
                        onchange="AdminCalendar.updateSlotStartHour('${iso}',${idx},this.value)"
                        oninput="AdminCalendar.updateSlotStartHour('${iso}',${idx},this.value)">
                    <span class="nb-time-colon">:</span>
                    <select class="nb-min-select" onchange="AdminCalendar.updateSlotStartMin('${iso}',${idx},this.value)">
                        ${minOpts(sh.m)}
                    </select>
                    <span class="nb-range-arrow">→</span>
                    <input type="number" class="nb-hour-input" min="1" max="24" placeholder="Hr" value="${eh.h}"
                        onchange="AdminCalendar.updateSlotEndHour('${iso}',${idx},this.value)"
                        oninput="AdminCalendar.updateSlotEndHour('${iso}',${idx},this.value)">
                    <span class="nb-time-colon">:</span>
                    <select class="nb-min-select" onchange="AdminCalendar.updateSlotEndMin('${iso}',${idx},this.value)">
                        ${minOpts(eh.m)}
                    </select>
                    ${removeBtn}
                </div>` : ''}
            </div>`;
        }).join('');

        html += `
            <div class="nb-visit-date-block">
                <div class="nb-visit-date-header">
                    <span class="nb-visit-date-name">${escHtml(dateLabel)}</span>
                    <span class="nb-visit-count">${visitCount} visit${visitCount !== 1 ? 's' : ''}</span>
                </div>
                ${slotsHtml}
                <button type="button" class="nb-add-time-day" onclick="AdminCalendar.addTimeToDate('${iso}')">+ Add time</button>
            </div>`;
    });

    wrap.innerHTML = html;
}

function addTimeToDate(iso) {
    if (!nbDateTimes.has(iso)) return;
    nbDateTimes.get(iso).push(emptySlot());
    if (nbSameTimeAll) _syncSameTime();
    renderNbVisitTimes();
    calcNbTotal();
}

function removeTimeFromDate(iso, idx) {
    if (!nbDateTimes.has(iso)) return;
    const slots = nbDateTimes.get(iso);
    slots.splice(idx, 1);
    if (nbSameTimeAll) _syncSameTime();
    renderNbVisitTimes();
    calcNbTotal();
}

function toggleSameTime(on) {
    nbSameTimeAll = on;
    if (on) _syncSameTime();
    renderNbVisitTimes();
}

function _syncSameTime() {
    const sortedDates = [...nbDateTimes.keys()].sort();
    if (sortedDates.length < 2) return;
    const firstSlots = nbDateTimes.get(sortedDates[0]);
    for (let i = 1; i < sortedDates.length; i++) {
        nbDateTimes.set(sortedDates[i], firstSlots.map(s => ({ ...s })));
    }
}

function setSlotMode(iso, idx, mode) {
    if (!nbDateTimes.has(iso)) return;
    const slot = parseSlotObj(nbDateTimes.get(iso)[idx]);
    slot.mode = mode;
    nbDateTimes.get(iso)[idx] = slot;
    if (nbSameTimeAll) _syncSameTime();
    renderNbVisitTimes();
}

function _updateSlotField(iso, idx, field, val) {
    if (!nbDateTimes.has(iso)) return;
    const slot = parseSlotObj(nbDateTimes.get(iso)[idx]);
    slot[field] = val;
    nbDateTimes.get(iso)[idx] = slot;
    if (nbSameTimeAll) _syncSameTime();
    calcNbTotal();
}

function updateSlotStartHour(iso, idx, val) {
    if (!nbDateTimes.has(iso)) return;
    const slot = parseSlotObj(nbDateTimes.get(iso)[idx]);
    const m = parseHrMin(slot.start).m;
    slot.start = buildHHMM(val, m);
    nbDateTimes.get(iso)[idx] = slot;
    if (nbSameTimeAll) _syncSameTime();
    calcNbTotal();
}

function updateSlotStartMin(iso, idx, val) {
    if (!nbDateTimes.has(iso)) return;
    const slot = parseSlotObj(nbDateTimes.get(iso)[idx]);
    const h = parseHrMin(slot.start).h;
    if (h !== '') slot.start = buildHHMM(h, val);
    nbDateTimes.get(iso)[idx] = slot;
    if (nbSameTimeAll) _syncSameTime();
    calcNbTotal();
}

function updateSlotEndHour(iso, idx, val) {
    if (!nbDateTimes.has(iso)) return;
    const slot = parseSlotObj(nbDateTimes.get(iso)[idx]);
    const m = parseHrMin(slot.end).m;
    slot.end = buildHHMM(val, m);
    nbDateTimes.get(iso)[idx] = slot;
    if (nbSameTimeAll) _syncSameTime();
}

function updateSlotEndMin(iso, idx, val) {
    if (!nbDateTimes.has(iso)) return;
    const slot = parseSlotObj(nbDateTimes.get(iso)[idx]);
    const h = parseHrMin(slot.end).h;
    if (h !== '') slot.end = buildHHMM(h, val);
    nbDateTimes.get(iso)[idx] = slot;
    if (nbSameTimeAll) _syncSameTime();
}

// Keep old names as aliases for backwards compat with any existing HTML
function updateDatetimeHour(iso, idx, val) { updateSlotStartHour(iso, idx, val); }
function updateDatetimeMin(iso, idx, val)  { updateSlotStartMin(iso, idx, val); }

// ─── MINI CALENDAR FOR NEW BOOKING ───────────────────────
function renderNbCal() {
    const grid = document.getElementById('nbCalGrid');
    const label = document.getElementById('nbCalLabel');
    const countEl = document.getElementById('nbDateCount');
    if (!grid) return;

    const first = new Date(nbModalYear, nbModalMonth, 1);
    const days  = new Date(nbModalYear, nbModalMonth + 1, 0).getDate();
    const today = toISO(new Date());

    label.textContent = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const n = nbDateTimes.size;
    if (countEl) countEl.textContent = n ? `(${n} day${n > 1 ? 's' : ''} selected)` : '';

    grid.innerHTML = '';
    for (let i = 0; i < first.getDay(); i++) {
        const b = document.createElement('div'); b.className = 'nb-cal-blank'; grid.appendChild(b);
    }
    for (let d = 1; d <= days; d++) {
        const iso = `${nbModalYear}-${String(nbModalMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const cell = document.createElement('div');
        cell.className = 'nb-cal-day'
            + (iso === today ? ' nb-cal-today' : '')
            + (nbDateTimes.has(iso) ? ' nb-cal-selected' : '')
            + (iso < today ? ' nb-cal-past' : '');
        cell.textContent = d;
        if (iso >= today) cell.onclick = () => { nbToggleDate(iso); };
        grid.appendChild(cell);
    }
}

function nbToggleDate(iso) {
    if (nbDateTimes.has(iso)) nbDateTimes.delete(iso);
    else {
        if (nbSameTimeAll && nbDateTimes.size > 0) {
            const firstSlots = [...nbDateTimes.values()][0];
            nbDateTimes.set(iso, firstSlots.map(s => ({ ...s })));
        } else {
            nbDateTimes.set(iso, [emptySlot()]);
        }
    }
    renderNbCal();
    renderNbVisitTimes();
    calcNbTotal();
}

function nbPrevMonth() {
    nbModalMonth--;
    if (nbModalMonth < 0) { nbModalMonth = 11; nbModalYear--; }
    renderNbCal();
}
function nbNextMonth() {
    nbModalMonth++;
    if (nbModalMonth > 11) { nbModalMonth = 0; nbModalYear++; }
    renderNbCal();
}

// ─── PRICE CALCULATION ───────────────────────────────────
function calcNbTotal() {
    const service  = document.getElementById('nbService')?.value || 'Drop-In Visit';
    const duration = parseInt(document.getElementById('nbDuration')?.value || '30');

    let numVisits = 0;
    for (const slots of nbDateTimes.values()) {
        numVisits += Math.max(1, slots.filter(s => s && s.start).length);
    }
    if (numVisits === 0) numVisits = 1;

    const p = service === 'Dog Walking' ? PRICING.walking : PRICING.dropin;
    const is60 = duration === 60;
    const sortedDates = [...nbDateTimes.keys()].sort();
    const isHoliday = isHolidayBooking(sortedDates);

    let pets = [];
    if (nbSelectedClientId) {
        const clients = window.AdminClients?.getAllClients() || [];
        const c = clients.find(x => x.id === nbSelectedClientId);
        if (c && c.pets) pets = [...nbSelectedPets].map(i => c.pets[i]).filter(Boolean);
    }
    if (!pets.length) pets = [{ type: 'dog' }];

    let perVisit = 0;
    pets.forEach((pet, idx) => {
        if (idx === 0) {
            const base = isHoliday ? p.holiday : ((service !== 'Dog Walking' && pet.type === 'cat') ? p.cat : p.base);
            perVisit += base + (is60 ? p.addon60 : 0);
        } else {
            perVisit += pet.type === 'cat' ? (p.extraCat || p.extraDog) : p.extraDog;
        }
    });

    const el = document.getElementById('nbTotal');
    if (el) el.value = perVisit * numVisits;
}

function closeNewBookingModal() {
    document.getElementById('newBookingModal').style.display = 'none';
}

function searchClients() {
    const q = document.getElementById('nbClientSearch').value.toLowerCase().trim();
    const resultsEl = document.getElementById('nbClientSearchResults');
    const clients = window.AdminClients?.getAllClients() || [];

    if (!q) { resultsEl.style.display = 'none'; return; }

    const matches = clients.filter(c =>
        (c.name||'').toLowerCase().includes(q) ||
        (c.email||'').toLowerCase().includes(q) ||
        (c.phone||'').includes(q)
    ).slice(0, 6);

    resultsEl.innerHTML = matches.length === 0
        ? '<div class="nb-result-item nb-no-result">No clients found</div>'
        : matches.map(c => `
            <div class="nb-result-item" onclick="AdminCalendar.selectClient('${c.id}')">
                <span class="nb-result-name">${escHtml(c.name)}</span>
                <span class="nb-result-meta">${escHtml(c.phone || c.email || '')}</span>
            </div>`).join('');
    resultsEl.style.display = '';
}

function selectClient(clientId) {
    const clients = window.AdminClients?.getAllClients() || [];
    const c = clients.find(x => x.id === clientId);
    if (!c) return;

    nbSelectedClientId = clientId;
    nbSelectedPets = new Set();

    document.getElementById('nbName').value  = c.name  || '';
    document.getElementById('nbPhone').value = c.phone || '';
    document.getElementById('nbEmail').value = c.email || '';
    document.getElementById('nbClientSearch').value = '';
    document.getElementById('nbClientSearchResults').style.display = 'none';
    document.getElementById('nbSelectedClientName').textContent = c.name;
    document.getElementById('nbSelectedClient').style.display = 'flex';

    const pets = c.pets || [];
    if (pets.length > 0) {
        pets.forEach((_, i) => nbSelectedPets.add(i));
        document.getElementById('nbPetCheckboxes').innerHTML = pets.map((p, i) => {
            const emoji = p.type === 'cat' ? '🐱' : '🐶';
            const avatarHtml = p.photoUrl
                ? `<img class="nb-pet-avatar" src="${escHtml(p.photoUrl)}" alt="${escHtml(p.name||'')}">`
                : `<div class="nb-pet-avatar nb-pet-emoji">${emoji}</div>`;
            return `
            <label class="nb-pet-option">
                <input type="checkbox" value="${i}" checked onchange="AdminCalendar.togglePet(${i})">
                ${avatarHtml}
                <span>${escHtml(p.name || '—')} <em style="color:var(--brown-mid);font-style:normal">${escHtml(p.type||'')}</em></span>
            </label>`;
        }).join('');
        document.getElementById('nbPetSection').style.display = '';
    } else {
        document.getElementById('nbPetSection').style.display = 'none';
    }
}

function clearSelectedClient() {
    nbSelectedClientId = null;
    nbSelectedPets = new Set();
    document.getElementById('nbSelectedClient').style.display = 'none';
    document.getElementById('nbPetSection').style.display = 'none';
    document.getElementById('nbName').value = '';
    document.getElementById('nbPhone').value = '';
    document.getElementById('nbEmail').value = '';
}

function togglePet(i) {
    if (nbSelectedPets.has(i)) nbSelectedPets.delete(i);
    else nbSelectedPets.add(i);
    calcNbTotal();
}

async function saveNewBooking() {
    const name     = document.getElementById('nbName').value.trim();
    const phone    = document.getElementById('nbPhone').value.trim();
    const email    = document.getElementById('nbEmail').value.trim();
    const service  = document.getElementById('nbService').value;
    const duration = document.getElementById('nbDuration').value;
    const total    = parseFloat(document.getElementById('nbTotal').value) || 0;
    const notes    = document.getElementById('nbNotes').value.trim();
    const errEl    = document.getElementById('nbError');

    if (!name) { errEl.textContent = 'Client name is required.'; return; }
    if (nbDateTimes.size === 0) { errEl.textContent = 'Please select at least one date.'; return; }
    errEl.textContent = '';

    const sortedDates = [...nbDateTimes.keys()].sort();

    // Build datesText and dateTimes object
    const dateTimes = {};
    let datesText = '';
    sortedDates.forEach(iso => {
        const serialized = nbDateTimes.get(iso)
            .map(s => serializeSlot(parseSlotObj(s)))
            .filter(Boolean)
            .sort();
        dateTimes[iso] = serialized;
        const d = new Date(iso + 'T12:00:00');
        const label = d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
        const timesLabel = serialized.length ? serialized.map(t => {
            if (t.includes('~')) {
                const [s, e] = t.split('~');
                return `${fmt12(s)} – ${fmt12(e)}`;
            }
            return fmt12(t);
        }).join(', ') : 'TBD';
        datesText += `  ${label}: ${timesLabel}\n`;
    });

    let pets = [];
    if (nbSelectedClientId) {
        const clients = window.AdminClients?.getAllClients() || [];
        const c = clients.find(x => x.id === nbSelectedClientId);
        if (c && c.pets) pets = [...nbSelectedPets].map(i => c.pets[i]).filter(Boolean);
    }

    const btn = document.getElementById('nbSaveBtn');
    btn.disabled = true; btn.textContent = 'Saving…';

    try {
        if (editingBookingId) {
            await updateDoc(doc(db, 'bookings', editingBookingId), {
                clientName: name, clientPhone: phone, clientEmail: email,
                service, duration: parseInt(duration),
                datesText, dates: sortedDates, dateTimes,
                pets, notes, total,
                clientId: nbSelectedClientId || null,
                updatedAt: serverTimestamp()
            });
            const bid = editingBookingId;
            closeNewBookingModal();
            window.AdminBookings?.openDetail(bid);
        } else {
            await addDoc(collection(db, 'bookings'), {
                clientName: name, clientPhone: phone, clientEmail: email,
                service, duration: parseInt(duration),
                datesText, dates: sortedDates, dateTimes,
                pets, notes, total,
                status: 'pending', adminAccepted: true, source: 'manual',
                clientId: nbSelectedClientId || null,
                createdAt: serverTimestamp()
            });
            closeNewBookingModal();
        }
    } catch(e) {
        errEl.textContent = 'Error: ' + e.message;
    } finally {
        btn.disabled = false; btn.textContent = 'Save Booking';
    }
}

// ─── EDIT EXISTING BOOKING ───────────────────────────────
function openEditBookingModal(bookingId) {
    const b = calBookings.find(x => x.id === bookingId);
    if (!b) return;

    // Open modal with clean state first
    openNewBookingModal();
    editingBookingId = bookingId;

    // Change title and button
    const titleEl = document.getElementById('nbModalTitle');
    const saveBtn = document.getElementById('nbSaveBtn');
    if (titleEl) titleEl.textContent = 'Edit Booking';
    if (saveBtn) saveBtn.textContent = 'Update Booking';

    // Pre-fill basic fields
    document.getElementById('nbService').value  = b.service  || 'Drop-In Visit';
    document.getElementById('nbDuration').value = String(b.duration || 30);
    document.getElementById('nbTotal').value    = b.total != null ? b.total : '';
    document.getElementById('nbNotes').value    = b.notes || '';

    // Pre-fill client
    if (b.clientId) {
        selectClient(b.clientId);
        // Re-check pet checkboxes matching saved pets
        const clients = window.AdminClients?.getAllClients() || [];
        const c = clients.find(x => x.id === b.clientId);
        if (c && c.pets && b.pets) {
            const savedNames = (b.pets).map(p => p.name);
            nbSelectedPets = new Set();
            c.pets.forEach((cp, i) => {
                if (savedNames.includes(cp.name)) nbSelectedPets.add(i);
            });
            // Check corresponding checkboxes in DOM
            document.querySelectorAll('#nbPetCheckboxes input[type=checkbox]').forEach((cb, i) => {
                cb.checked = nbSelectedPets.has(i);
            });
        }
    } else {
        document.getElementById('nbName').value  = b.clientName  || '';
        document.getElementById('nbPhone').value = b.clientPhone || '';
        document.getElementById('nbEmail').value = b.clientEmail || '';
    }

    // Pre-fill dates/times
    nbDateTimes = new Map();
    if (b.dateTimes && Object.keys(b.dateTimes).length > 0) {
        Object.entries(b.dateTimes).sort().forEach(([iso, slots]) => {
            nbDateTimes.set(iso, (slots || []).map(t => parseSlotObj(t)));
        });
    } else if (b.dates && b.dates.length > 0) {
        b.dates.forEach(iso => nbDateTimes.set(iso, [emptySlot()]));
    }
    renderNbCal();
    renderNbVisitTimes();
    calcNbTotal();
}

function fmt12(t) {
    if (!t) return 'TBD';
    const parts = t.split(':');
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (isNaN(h) || isNaN(m)) return t;
    return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── ICS EXPORT ──────────────────────────────────────────
function exportICS() {
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Wylie Furry Friends//Admin//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH'
    ];

    calBookings.filter(b => b.status !== 'rejected').forEach(b => {
        parseDates(b).forEach(iso => {
            const uid = `${b.id}-${iso}@wyliefurryfriends`;
            const dtStamp = new Date().toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';
            const dtStart = iso.replace(/-/g,'');
            const dtEnd   = iso.replace(/-/g,'');
            const summary = escHtml(`${b.service || 'Visit'} – ${b.clientName || ''}`)
                .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"');
            const pets    = (b.pets || []).map(p => p.name).filter(Boolean).join(', ');
            const desc    = [
                b.clientName ? `Client: ${b.clientName}` : '',
                b.clientPhone ? `Phone: ${b.clientPhone}` : '',
                pets ? `Pets: ${pets}` : '',
                b.total ? `Total: $${b.total}` : '',
                `Status: ${b.status || 'pending'}`
            ].filter(Boolean).join('\\n');

            lines.push('BEGIN:VEVENT');
            lines.push(`UID:${uid}`);
            lines.push(`DTSTAMP:${dtStamp}`);
            lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
            lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
            lines.push(`SUMMARY:${summary}`);
            lines.push(`DESCRIPTION:${desc}`);
            lines.push('END:VEVENT');
        });
    });

    lines.push('END:VCALENDAR');

    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `wylie-bookings-${new Date().toISOString().slice(0,10)}.ics`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

// ─── EXPOSE ──────────────────────────────────────────────
window.AdminCalendar = {
    init, changeMonth, selectDay, setFilter, exportICS,
    openNewBookingModal, closeNewBookingModal,
    searchClients, selectClient, clearSelectedClient,
    togglePet, saveNewBooking,
    nbPrevMonth, nbNextMonth, calcNbTotal,
    addTimeToDate, removeTimeFromDate, updateDatetimeHour, updateDatetimeMin,
    toggleSameTime, setSlotMode,
    updateSlotStartHour, updateSlotStartMin,
    updateSlotEndHour, updateSlotEndMin,
    openEditBookingModal
};
