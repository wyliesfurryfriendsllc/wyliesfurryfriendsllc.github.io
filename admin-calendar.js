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
let nbSelectedClientId = null;
let nbSelectedPets = new Set();

function openNewBookingModal() {
    nbSelectedClientId = null;
    nbSelectedPets = new Set();

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
    document.getElementById('nbDate').value = calSelectedDate || '';
    document.getElementById('nbTime').value = '';
    document.getElementById('nbError').textContent = '';

    document.getElementById('newBookingModal').style.display = 'flex';
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
}

async function saveNewBooking() {
    const name     = document.getElementById('nbName').value.trim();
    const phone    = document.getElementById('nbPhone').value.trim();
    const email    = document.getElementById('nbEmail').value.trim();
    const service  = document.getElementById('nbService').value;
    const duration = document.getElementById('nbDuration').value;
    const date     = document.getElementById('nbDate').value;
    const time     = document.getElementById('nbTime').value;
    const total    = parseFloat(document.getElementById('nbTotal').value) || 0;
    const notes    = document.getElementById('nbNotes').value.trim();
    const errEl    = document.getElementById('nbError');

    if (!name) { errEl.textContent = 'Client name is required.'; return; }
    if (!date) { errEl.textContent = 'Date is required.'; return; }
    errEl.textContent = '';

    const dateObj  = new Date(date + 'T12:00:00');
    const dateLabel = dateObj.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
    const timeLabel = time ? fmt12(time) : 'TBD';
    const datesText = `  ${dateLabel}: ${timeLabel}\n`;

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
            datesText, dates: [date],
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
    togglePet, saveNewBooking
};
