import {
    db, collection, query, orderBy, onSnapshot,
    addDoc, serverTimestamp
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

function showDayBookings(iso) {
    const panel = document.getElementById('calDayPanel');
    if (!panel) return;
    const bookings = buildDateMap().get(iso) || [];
    const label = new Date(iso + 'T12:00:00').toLocaleDateString('en-US',
        { weekday:'long', month:'long', day:'numeric', year:'numeric' });

    panel.style.display = '';
    panel.innerHTML = `
        <div class="cal-day-header">
            <span class="cal-day-title">${label}</span>
            <span class="cal-day-count">${bookings.length} booking${bookings.length !== 1 ? 's' : ''}</span>
        </div>
        ${bookings.length === 0
            ? '<p class="empty-msg" style="padding:16px 0">No bookings on this day.</p>'
            : `<div class="cal-day-list">${bookings.map(b => `
                <div class="cal-booking-row">
                    <div class="cal-booking-info">
                        <span class="cal-booking-name">${escHtml(b.clientName || '—')}</span>
                        <span class="cal-booking-svc">${escHtml(b.service || '')} · ${b.duration || 30} min</span>
                    </div>
                    <span class="status-badge ${STATUS_COLORS[b.status]||'status-pending'}">${STATUS_LABELS[b.status]||'Pending'}</span>
                </div>`).join('')}</div>`
        }
    `;
}

// ─── NEW BOOKING MODAL ────────────────────────────────────
const PRICING = {
    dropin:  { base: 23, addon60: 20, holiday: 31, extraDog: 9, cat: 23, extraCat: 9 },
    walking: { base: 26, addon60: 23, holiday: 34, extraDog: 9 }
};

let nbSelectedClientId = null;
let nbSelectedPets = new Set();
let nbDateTimes = new Map(); // Map<isoDate, string[]> — each date has its own time slots
let nbModalYear = new Date().getFullYear();
let nbModalMonth = new Date().getMonth();

function openNewBookingModal() {
    nbSelectedClientId = null;
    nbSelectedPets = new Set();
    nbDateTimes = new Map();
    if (calSelectedDate) nbDateTimes.set(calSelectedDate, ['']);
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
function parseSlot(t) {
    if (!t) return { h: '', m: '00' };
    const [hStr, mStr] = t.split(':');
    return { h: parseInt(hStr) || '', m: mStr || '00' };
}

// ─── VISIT TIMES (per-day) ────────────────────────────────
function renderNbVisitTimes() {
    const wrap = document.getElementById('nbVisitTimes');
    if (!wrap) return;
    if (nbDateTimes.size === 0) { wrap.style.display = 'none'; return; }

    wrap.style.display = '';
    const sortedDates = [...nbDateTimes.keys()].sort();
    wrap.innerHTML = '<div class="nb-visit-times-label">Pick visit times</div>' +
        sortedDates.map(iso => {
            const d = new Date(iso + 'T12:00:00');
            const dateLabel = d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
            const slots = nbDateTimes.get(iso);
            const visitCount = slots.filter(Boolean).length || 1;
            const slotsHtml = slots.map((t, idx) => {
                const { h, m } = parseSlot(t);
                return `
                <div class="nb-time-row">
                    <input type="number" class="nb-hour-input" min="1" max="24" placeholder="Hr"
                        value="${h}"
                        onchange="AdminCalendar.updateDatetimeHour('${iso}',${idx},this.value)"
                        oninput="AdminCalendar.updateDatetimeHour('${iso}',${idx},this.value)">
                    <span class="nb-time-colon">:</span>
                    <select class="nb-min-select" onchange="AdminCalendar.updateDatetimeMin('${iso}',${idx},this.value)">
                        <option value="00" ${m==='00'?'selected':''}>00</option>
                        <option value="15" ${m==='15'?'selected':''}>15</option>
                        <option value="30" ${m==='30'?'selected':''}>30</option>
                        <option value="45" ${m==='45'?'selected':''}>45</option>
                    </select>
                    ${slots.length > 1 ? `<button type="button" class="nb-remove-time" onclick="AdminCalendar.removeTimeFromDate('${iso}',${idx})">×</button>` : ''}
                </div>`;
            }).join('');
            return `
                <div class="nb-visit-date-block">
                    <div class="nb-visit-date-header">
                        <span class="nb-visit-date-name">${escHtml(dateLabel)}</span>
                        <span class="nb-visit-count">${visitCount} visit${visitCount !== 1 ? 's' : ''}</span>
                    </div>
                    ${slotsHtml}
                    <button type="button" class="nb-add-time-day" onclick="AdminCalendar.addTimeToDate('${iso}')">+ Add time</button>
                </div>`;
        }).join('');
}

function addTimeToDate(iso) {
    if (!nbDateTimes.has(iso)) return;
    nbDateTimes.get(iso).push('');
    renderNbVisitTimes();
    calcNbTotal();
}

function removeTimeFromDate(iso, idx) {
    if (!nbDateTimes.has(iso)) return;
    const slots = nbDateTimes.get(iso);
    slots.splice(idx, 1);
    renderNbVisitTimes();
    calcNbTotal();
}

function updateDatetimeHour(iso, idx, val) {
    if (!nbDateTimes.has(iso)) return;
    const slots = nbDateTimes.get(iso);
    const { m } = parseSlot(slots[idx]);
    const raw = parseInt(val);
    if (!val || isNaN(raw)) {
        slots[idx] = '';
    } else {
        const h = Math.max(1, Math.min(24, raw));
        slots[idx] = `${String(h).padStart(2,'0')}:${m}`;
    }
    calcNbTotal();
    _updateVisitCount(iso);
}

function updateDatetimeMin(iso, idx, val) {
    if (!nbDateTimes.has(iso)) return;
    const slots = nbDateTimes.get(iso);
    const { h } = parseSlot(slots[idx]);
    if (h !== '') {
        slots[idx] = `${String(h).padStart(2,'0')}:${val}`;
        calcNbTotal();
    }
}

function _updateVisitCount(iso) {
    const blocks = document.querySelectorAll('.nb-visit-date-block');
    const sortedDates = [...nbDateTimes.keys()].sort();
    const blockIdx = sortedDates.indexOf(iso);
    if (blocks[blockIdx]) {
        const countEl = blocks[blockIdx].querySelector('.nb-visit-count');
        const count = nbDateTimes.get(iso).filter(Boolean).length || 1;
        if (countEl) countEl.textContent = `${count} visit${count !== 1 ? 's' : ''}`;
    }
}

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
    else nbDateTimes.set(iso, ['']);
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
        numVisits += Math.max(1, slots.filter(Boolean).length);
    }
    if (numVisits === 0) numVisits = 1;

    const p = service === 'Dog Walking' ? PRICING.walking : PRICING.dropin;
    const is60 = duration === 60;

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
            const base = (service !== 'Dog Walking' && pet.type === 'cat') ? p.cat : p.base;
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
        document.getElementById('nbPetCheckboxes').innerHTML = pets.map((p, i) => `
            <label class="nb-pet-option">
                <input type="checkbox" value="${i}" onchange="AdminCalendar.togglePet(${i})">
                <span>${escHtml(p.name || '—')} <em style="color:var(--brown-mid);font-style:normal">${escHtml(p.type||'')}</em></span>
            </label>`).join('');
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
        const slots = nbDateTimes.get(iso).filter(Boolean);
        dateTimes[iso] = slots;
        const d = new Date(iso + 'T12:00:00');
        const label = d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
        const timesLabel = slots.length ? slots.map(fmt12).join(', ') : 'TBD';
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
        await addDoc(collection(db, 'bookings'), {
            clientName: name, clientPhone: phone, clientEmail: email,
            service, duration: parseInt(duration),
            datesText, dates: sortedDates, dateTimes,
            pets, notes, total,
            status: 'confirmed', source: 'manual',
            clientId: nbSelectedClientId || null,
            createdAt: serverTimestamp()
        });
        closeNewBookingModal();
    } catch(e) {
        errEl.textContent = 'Error: ' + e.message;
    } finally {
        btn.disabled = false; btn.textContent = 'Save Booking';
    }
}

function fmt12(t) {
    const [h, m] = t.split(':').map(Number);
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
    addTimeToDate, removeTimeFromDate, updateDatetimeHour, updateDatetimeMin
};
