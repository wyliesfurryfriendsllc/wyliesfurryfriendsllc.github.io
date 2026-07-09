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
        if (b.status === 'rejected' || b.status === 'cancelled' || b.status === 'deleted') return;
        if (calActiveFilter !== 'all' && b.status !== calActiveFilter) return;
        parseDates(b).forEach(iso => {
            if (!map.has(iso)) map.set(iso, []);
            map.get(iso).push(b);
        });
    });
    return map;
}

function countVisitsForDate(bookings, iso) {
    let total = 0;
    bookings.forEach(b => {
        let times = [];
        if (b.dateTimes && b.dateTimes[iso]) {
            times = [...b.dateTimes[iso]].filter(Boolean);
        } else if (b.times && Array.isArray(b.times)) {
            times = [...b.times].filter(Boolean);
        }
        total += times.length > 0 ? times.length : 1;
    });
    return total;
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
        const count = countVisitsForDate(dateMap.get(iso) || [], iso);
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
        card.className = 'cal-visit-card' + (b.isRover ? ' cal-visit-card-rover' : '');
        card.style.cursor = 'pointer';
        card.onclick = () => {
            showAdminTab('bookings');
            setTimeout(() => window.AdminBookings?.openDetail(b.id), 50);
        };
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
let nbManualPets = [];
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
    const roverEl = document.getElementById('nbIsRover');
    if (roverEl) roverEl.checked = false;
    const customFields = document.getElementById('nbCustomFields');
    if (customFields) customFields.style.display = 'none';
    const customNameEl = document.getElementById('nbCustomName');
    if (customNameEl) customNameEl.value = '';
    const customBaseEl = document.getElementById('nbCustomBase');
    if (customBaseEl) customBaseEl.value = '';
    document.getElementById('nbClientSearch').value = '';
    document.getElementById('nbClientSearchResults').style.display = 'none';
    document.getElementById('nbSelectedClient').style.display = 'none';
    document.getElementById('nbPetSection').style.display = 'none';
    nbManualPets = [];
    renderManualPets();
    document.getElementById('nbService').value = 'Drop-In Visit';
    document.getElementById('nbDuration').value = '30';
    document.getElementById('nbError').textContent = '';

    renderNbCal();
    renderNbVisitTimes();
    calcNbTotal();

    document.getElementById('newBookingModal').style.display = 'flex';
}

// ─── TIME HELPERS ────────────────────────────────────────
function emptySlot() {
    return { type: 'window', period: '', specHr: '', specMin: '00', fromHr: '', fromMin: '00', toHr: '', toMin: '00', dur: 30 };
}

function parseSlotObj(t) {
    if (!t) return emptySlot();
    if (typeof t === 'object') return t;
    const durMatch = t.match(/\|(\d+)$/);
    const dur = durMatch ? parseInt(durMatch[1]) : 30;
    const clean = t.replace(/\|\d+$/, '');
    if (clean.includes('~')) {
        const [start, end] = clean.split('~');
        return { mode: 'range', start, end, dur };
    }
    return { mode: 'time', start: clean, end: '', dur };
}

function parseSlotToUiFormat(t) {
    if (!t) return emptySlot();
    if (typeof t === 'object' && t.type) return t;
    const str = (typeof t === 'object') ? (t.mode === 'range' ? `${t.start}~${t.end}` : t.start) + (t.dur ? `|${t.dur}` : '') : t;
    const durMatch = str.match(/\|(\d+)$/);
    const dur = durMatch ? parseInt(durMatch[1]) : 30;
    const clean = str.replace(/\|\d+$/, '');
    if (clean.includes('~')) {
        const [start, end] = clean.split('~');
        const [fromHr, fromMin] = start.split(':');
        const [toHr, toMin] = (end || '').split(':');
        return { type: 'window', period: '', fromHr: fromHr || '', fromMin: fromMin || '00', toHr: toHr || '', toMin: toMin || '00', specHr: '', specMin: '00', dur };
    }
    if (clean === 'anytime') {
        return { type: 'window', period: 'Anytime', fromHr: '', fromMin: '00', toHr: '', toMin: '00', specHr: '', specMin: '00', dur };
    }
    const [specHr, specMin] = clean.split(':');
    return { type: 'specific', specHr: specHr || '', specMin: specMin || '00', period: '', fromHr: '', fromMin: '00', toHr: '', toMin: '00', dur };
}

function serializeSlot(s, isCombo) {
    if (!s || !s.start) return '';
    let base;
    if (s.mode === 'range' && s.end) base = `${s.start}~${s.end}`;
    else base = s.start;
    if (isCombo) base += `|${s.dur || 30}`;
    return base;
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

// ─── SCROLL-WHEEL PICKER (admin new-booking) ────────────────
const NB_TP_H = 44;
const _nbTpTimers = {};
let _nbTpDrag = null;

document.addEventListener('mousemove', e => {
    if (!_nbTpDrag) return;
    _nbTpDrag.col.scrollTop = _nbTpDrag.startScrollTop - (e.clientY - _nbTpDrag.startY);
});
document.addEventListener('mouseup', () => {
    if (!_nbTpDrag) return;
    const { col, uid } = _nbTpDrag;
    _nbTpDrag = null;
    col.style.cursor = '';
    const snapped = Math.round(col.scrollTop / NB_TP_H) * NB_TP_H;
    col.scrollTo({ top: snapped, behavior: 'smooth' });
    setTimeout(() => nbSyncPickerToInputs(uid), 200);
});

const NB_PERIODS = {
    Anytime:   null,
    Morning:   { fromHr: 6,  fromMin: '00', toHr: 12, toMin: '00' },
    Afternoon: { fromHr: 12, fromMin: '00', toHr: 18, toMin: '00' },
    Evening:   { fromHr: 16, fromMin: '00', toHr: 21, toMin: '00' },
};

function _nbTpFmt(hr24, min) {
    return `${hr24 % 12 || 12}:${min} ${hr24 >= 12 ? 'PM' : 'AM'}`;
}

function buildNbPickerHtml(uid, initHr, initMin) {
    const hr24 = (initHr !== '' && initHr != null) ? parseInt(initHr) : -1;
    const minVal = initMin || '00';
    const label = hr24 >= 0 ? _nbTpFmt(hr24, minVal) : '—';
    const hrItems = [1,2,3,4,5,6,7,8,9,10,11,12]
        .map(h => `<div class="tp-item" data-val="${h}">${h}</div>`).join('');
    const minItems = ['00','15','30','45']
        .map(m => `<div class="tp-item" data-val="${m}">${m}</div>`).join('');
    return `<div class="tp-wrap" id="tpWrap_${uid}">
        <button type="button" class="tp-trigger" onclick="AdminCalendar.nbOpenPicker('${uid}')">
            <span id="tpLabel_${uid}">${label}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <input type="hidden" value="${hr24 >= 0 ? hr24 : ''}">
        <input type="hidden" value="${minVal}">
        <div class="tp-popup" id="tpPop_${uid}" style="display:none">
            <div class="tp-picker-body">
                <div class="tp-sel-bar"></div>
                <div class="tp-cols">
                    <div class="tp-col" id="tpAmpm_${uid}" onscroll="AdminCalendar.nbOnPickerScroll('${uid}')">
                        <div class="tp-item" data-val="AM">AM</div>
                        <div class="tp-item" data-val="PM">PM</div>
                    </div>
                    <div class="tp-col" id="tpHr_${uid}" onscroll="AdminCalendar.nbOnPickerScroll('${uid}')">${hrItems}</div>
                    <div class="tp-col" id="tpMin_${uid}" onscroll="AdminCalendar.nbOnPickerScroll('${uid}')">${minItems}</div>
                </div>
                <div class="tp-fade-t"></div>
                <div class="tp-fade-b"></div>
            </div>
        </div>
    </div>`;
}

function nbSetPickerVal(uid, hr24, min) {
    const wrap = document.getElementById(`tpWrap_${uid}`);
    if (!wrap) return;
    const [hrInput, minInput] = wrap.querySelectorAll('input[type="hidden"]');
    if (hrInput) hrInput.value = hr24;
    if (minInput) minInput.value = min;
    const lbl = document.getElementById(`tpLabel_${uid}`);
    if (lbl) lbl.textContent = _nbTpFmt(hr24, min);
    const ampm = hr24 >= 12 ? 'PM' : 'AM';
    const hr12 = hr24 % 12 || 12;
    const ampmCol = document.getElementById(`tpAmpm_${uid}`);
    const hrCol   = document.getElementById(`tpHr_${uid}`);
    const minCol  = document.getElementById(`tpMin_${uid}`);
    if (ampmCol) ampmCol.scrollTop = (ampm === 'PM' ? 1 : 0) * NB_TP_H;
    if (hrCol)   hrCol.scrollTop   = (hr12 - 1) * NB_TP_H;
    if (minCol)  minCol.scrollTop  = ['00','15','30','45'].indexOf(min) * NB_TP_H;
}

function nbClearPickerVal(uid) {
    const wrap = document.getElementById(`tpWrap_${uid}`);
    if (!wrap) return;
    const [hrInput, minInput] = wrap.querySelectorAll('input[type="hidden"]');
    if (hrInput) hrInput.value = '';
    if (minInput) minInput.value = '00';
    const lbl = document.getElementById(`tpLabel_${uid}`);
    if (lbl) lbl.textContent = '—';
}

function _nbTpScrollTo(colId, val) {
    const col = document.getElementById(colId);
    if (!col) return;
    const items = col.querySelectorAll('.tp-item');
    for (let i = 0; i < items.length; i++) {
        if (items[i].dataset.val === val) { col.scrollTop = i * NB_TP_H; return; }
    }
}

function nbOpenPicker(uid) {
    document.querySelectorAll('.tp-popup').forEach(p => {
        if (p.id !== `tpPop_${uid}`) p.style.display = 'none';
    });
    const popup = document.getElementById(`tpPop_${uid}`);
    if (!popup) return;
    popup.style.display = 'block';

    const wrap = document.getElementById(`tpWrap_${uid}`);
    const [hrInput, minInput] = wrap.querySelectorAll('input[type="hidden"]');
    const hr24 = (hrInput && hrInput.value !== '') ? parseInt(hrInput.value) : 9;
    const minVal = (minInput && minInput.value) || '00';

    _nbTpScrollTo(`tpAmpm_${uid}`, hr24 >= 12 ? 'PM' : 'AM');
    _nbTpScrollTo(`tpHr_${uid}`, String(hr24 % 12 || 12));
    _nbTpScrollTo(`tpMin_${uid}`, minVal);

    wrap.querySelectorAll('.tp-col').forEach(col => {
        if (col._tpDragInit) return;
        col._tpDragInit = true;
        col.addEventListener('mousedown', e => {
            _nbTpDrag = { col, uid, startY: e.clientY, startScrollTop: col.scrollTop };
            col.style.cursor = 'grabbing';
            e.preventDefault();
        });
    });

    setTimeout(() => {
        const handler = (e) => {
            if (!wrap.contains(e.target)) {
                nbClosePicker(uid);
                document.removeEventListener('click', handler);
            }
        };
        document.addEventListener('click', handler);
    }, 0);
}

function nbClosePicker(uid) {
    const p = document.getElementById(`tpPop_${uid}`);
    if (p) p.style.display = 'none';
}

function nbOnPickerScroll(uid) {
    clearTimeout(_nbTpTimers[uid]);
    _nbTpTimers[uid] = setTimeout(() => nbSyncPickerToInputs(uid), 150);
}

function nbSyncPickerToInputs(uid) {
    const wrap = document.getElementById(`tpWrap_${uid}`);
    if (!wrap) return;
    const getVal = id => {
        const col = document.getElementById(id);
        if (!col) return null;
        return col.querySelectorAll('.tp-item')[Math.round(col.scrollTop / NB_TP_H)]?.dataset.val;
    };
    const ampm = getVal(`tpAmpm_${uid}`) || 'AM';
    const hr12 = parseInt(getVal(`tpHr_${uid}`) || '12');
    const min  = getVal(`tpMin_${uid}`) || '00';
    let hr24 = hr12 % 12;
    if (ampm === 'PM') hr24 += 12;

    const [hrInput, minInput] = wrap.querySelectorAll('input[type="hidden"]');
    if (hrInput) hrInput.value = hr24;
    if (minInput) minInput.value = min;

    const lbl = document.getElementById(`tpLabel_${uid}`);
    if (lbl) lbl.textContent = _nbTpFmt(hr24, min);
    calcNbTotal();
}

function selectNbPeriod(iso, idx, period) {
    const periodInput = document.getElementById(`nbSlotPeriod_${iso}_${idx}`);
    const current = periodInput?.value || '';
    const isToggleOff = current === period;
    const newPeriod = isToggleOff ? '' : period;

    const windowWrap = document.getElementById(`nbSlotWindowWrap_${iso}_${idx}`);
    if (windowWrap) windowWrap.querySelectorAll('.time-period-pill').forEach(el => {
        el.classList.toggle('active', !isToggleOff && el.textContent.trim() === period);
    });
    if (periodInput) periodInput.value = newPeriod;

    const pickerWrap = document.getElementById(`nbSlotPickerWrap_${iso}_${idx}`);
    if (pickerWrap) pickerWrap.style.display = newPeriod === 'Anytime' ? 'none' : '';

    const fromUid = `nbFrom_${iso}_${idx}`;
    const toUid   = `nbTo_${iso}_${idx}`;
    if (isToggleOff) {
        nbClearPickerVal(fromUid);
        nbClearPickerVal(toUid);
    } else {
        const t = NB_PERIODS[period];
        if (t) {
            nbSetPickerVal(fromUid, t.fromHr, t.fromMin);
            nbSetPickerVal(toUid,   t.toHr,   t.toMin);
        } else {
            nbClearPickerVal(fromUid);
            nbClearPickerVal(toUid);
        }
    }
    calcNbTotal();
}

function setNbSlotType(iso, idx, type) {
    saveNbDateState();
    if (!nbDateTimes.has(iso)) return;
    const slots = nbDateTimes.get(iso);
    if (!slots[idx]) return;
    slots[idx].type = type;
    if (nbSameTimeAll) _syncSameTime();
    renderNbVisitTimes();
}

function saveNbDateState() {
    if (nbSameTimeAll) {
        const first = [...nbDateTimes.keys()].sort()[0];
        if (first) _readNbSlots(first);
    } else {
        nbDateTimes.forEach((_, iso) => _readNbSlots(iso));
    }
}

function _readNbSlots(iso) {
    const slots = nbDateTimes.get(iso);
    if (!slots) return;
    slots.forEach((slot, idx) => {
        const typeRadio = document.querySelector(`input[name="nbSlotType_${iso}_${idx}"]:checked`);
        if (!typeRadio) return;
        slot.type = typeRadio.value;
        const periodEl = document.getElementById(`nbSlotPeriod_${iso}_${idx}`);
        if (periodEl) slot.period = periodEl.value;
        const readPicker = (uid, hrKey, minKey) => {
            const wrap = document.getElementById(`tpWrap_${uid}`);
            if (!wrap) return;
            const [hr, min] = wrap.querySelectorAll('input[type="hidden"]');
            if (hr) slot[hrKey] = hr.value;
            if (min) slot[minKey] = min.value;
        };
        readPicker(`nbSpec_${iso}_${idx}`, 'specHr', 'specMin');
        readPicker(`nbFrom_${iso}_${idx}`, 'fromHr', 'fromMin');
        readPicker(`nbTo_${iso}_${idx}`,   'toHr',   'toMin');
    });
}

function serializeNbSlot(slot, isCombo) {
    if (!slot) return '';
    if (typeof slot === 'string') return slot;
    if (slot.mode) return serializeSlot(slot, isCombo);
    let base;
    if (slot.type === 'specific') {
        const hhmm = buildHHMM(slot.specHr, slot.specMin || '00');
        if (!hhmm) return '';
        base = hhmm;
    } else {
        if (slot.period === 'Anytime') return 'anytime';
        const from = buildHHMM(slot.fromHr, slot.fromMin || '00');
        const to   = buildHHMM(slot.toHr,   slot.toMin   || '00');
        if (from && to) base = `${from}~${to}`;
        else if (from) base = from;
        else if (to)   base = to;
        else return '';
    }
    if (isCombo && base) base += `|${slot.dur || 30}`;
    return base;
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

        const isCombo = document.getElementById('nbDuration')?.value === 'combo';
        const visitCount = slots.length || 1;

        const slotsHtml = slots.map((s, idx) => {
            const slot = (s && s.type) ? s : emptySlot();
            const isSpec = slot.type === 'specific';

            const removeBtn = slots.length > 1
                ? `<button type="button" class="nb-slot-remove-btn" onclick="AdminCalendar.removeTimeFromDate('${iso}',${idx})" title="Remove">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                   </button>`
                : '';

            const comboDurPills = isCombo ? `
                <div class="nb-mode-pills" style="margin-top:10px">
                    <button type="button" class="nb-mode-pill ${(slot.dur||30)===30?'active':''}"
                        onclick="AdminCalendar.updateSlotDur('${iso}',${idx},30)">30 min</button>
                    <button type="button" class="nb-mode-pill ${(slot.dur||30)===60?'active':''}"
                        onclick="AdminCalendar.updateSlotDur('${iso}',${idx},60)">60 min</button>
                </div>` : '';

            return `
            <div class="nb-time-row" id="nbSlot_${iso}_${idx}">
                <div class="nb-slot-header">
                    <div class="slot-type-seg" id="nbSlotSeg_${iso}_${idx}">
                        <input type="radio" name="nbSlotType_${iso}_${idx}" value="window" ${!isSpec?'checked':''} style="display:none">
                        <input type="radio" name="nbSlotType_${iso}_${idx}" value="specific" ${isSpec?'checked':''} style="display:none">
                        <div class="slot-type-seg-knob${isSpec?' right':''}" id="nbSlotSegKnob_${iso}_${idx}"></div>
                        <span class="slot-type-seg-label${!isSpec?' active':''}" onclick="AdminCalendar.setNbSlotType('${iso}',${idx},'window')">Range</span>
                        <span class="slot-type-seg-label${isSpec?' active':''}" onclick="AdminCalendar.setNbSlotType('${iso}',${idx},'specific')">Exact Time</span>
                    </div>
                    ${removeBtn}
                </div>
                <div id="nbSlotSpecWrap_${iso}_${idx}" style="${isSpec?'':'display:none'}">
                    ${buildNbPickerHtml(`nbSpec_${iso}_${idx}`, slot.specHr, slot.specMin)}
                </div>
                <div id="nbSlotWindowWrap_${iso}_${idx}" style="${isSpec?'display:none':''}">
                    <input type="hidden" id="nbSlotPeriod_${iso}_${idx}" value="${slot.period||''}">
                    <div class="time-period-quick-label">Quick select</div>
                    <div class="time-period-pills">
                        ${['Anytime','Morning','Afternoon','Evening'].map(p =>
                            `<button type="button" class="time-period-pill${(slot.period||'')=== p?' active':''}" onclick="AdminCalendar.selectNbPeriod('${iso}',${idx},'${p}')">${p}</button>`
                        ).join('')}
                    </div>
                    <div id="nbSlotPickerWrap_${iso}_${idx}" class="slot-picker-wrap" style="${slot.period==='Anytime'?'display:none':''}">
                        <div class="time-range-inline">
                            <span class="time-range-label">From</span>
                            ${buildNbPickerHtml(`nbFrom_${iso}_${idx}`, slot.fromHr, slot.fromMin)}
                            <span class="time-range-label">To</span>
                            ${buildNbPickerHtml(`nbTo_${iso}_${idx}`, slot.toHr, slot.toMin)}
                        </div>
                    </div>
                </div>
                ${comboDurPills}
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
    saveNbDateState();
    nbDateTimes.get(iso).push(emptySlot());
    if (nbSameTimeAll) _syncSameTime();
    renderNbVisitTimes();
    calcNbTotal();
}

function removeTimeFromDate(iso, idx) {
    if (!nbDateTimes.has(iso)) return;
    saveNbDateState();
    const slots = nbDateTimes.get(iso);
    slots.splice(idx, 1);
    if (nbSameTimeAll) _syncSameTime();
    renderNbVisitTimes();
    calcNbTotal();
}

function updateSlotDur(iso, idx, dur) {
    if (!nbDateTimes.has(iso)) return;
    saveNbDateState();
    const slots = nbDateTimes.get(iso);
    const s = slots[idx] || emptySlot();
    s.dur = parseInt(dur);
    slots[idx] = s;
    if (nbSameTimeAll) _syncSameTime();
    renderNbVisitTimes();
    calcNbTotal();
}

function onDurationChange() {
    saveNbDateState();
    renderNbVisitTimes();
    calcNbTotal();
}


function toggleSameTime(on) {
    nbSameTimeAll = on;
    if (on) {
        saveNbDateState();
        _syncSameTime();
    }
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
        cell.onclick = () => { nbToggleDate(iso); };
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
function onServiceChange() {
    const service = document.getElementById('nbService')?.value;
    const customFields = document.getElementById('nbCustomFields');
    if (customFields) customFields.style.display = service === 'Custom' ? '' : 'none';
    calcNbTotal();
}

function calcNbTotal() {
    const service     = document.getElementById('nbService')?.value || 'Drop-In Visit';
    const durationVal = document.getElementById('nbDuration')?.value || '30';
    const isCombo     = durationVal === 'combo';
    const isCustom    = service === 'Custom';
    const p = service === 'Dog Walking' ? PRICING.walking : PRICING.dropin;
    const is60 = !isCombo && parseInt(durationVal) === 60;
    const sortedDates = [...nbDateTimes.keys()].sort();
    const isHoliday = isHolidayBooking(sortedDates);

    let numVisits = 0, num30 = 0, num60 = 0;
    for (const slots of nbDateTimes.values()) {
        const active = slots.filter(s => {
            if (!s) return false;
            if (s.type) return s.type === 'specific'
                ? (s.specHr !== '' && s.specHr != null)
                : (s.period !== '' || (s.fromHr !== '' && s.fromHr != null));
            if (typeof s === 'string') return !!s;
            return !!(s.start);
        });
        if (isCombo) {
            const parsed = active.map(s => (typeof s === 'object' && s.type) ? s : parseSlotObj(s));
            num30 += parsed.filter(s => (s.dur || 30) === 30).length;
            num60 += parsed.filter(s => (s.dur || 30) === 60).length;
            numVisits += Math.max(1, active.length);
        } else {
            numVisits += Math.max(1, active.length);
        }
    }
    if (numVisits === 0) numVisits = 1;

    let pets = [];
    if (nbSelectedClientId) {
        const clients = window.AdminClients?.getAllClients() || [];
        const c = clients.find(x => x.id === nbSelectedClientId);
        if (c && c.pets) pets = [...nbSelectedPets].map(i => c.pets[i]).filter(Boolean);
    }
    if (editingBookingId && pets.length === 0) {
        const orig = calBookings.find(x => x.id === editingBookingId);
        if (orig?.pets?.length) pets = orig.pets;
    }
    if (!pets.length) pets = [{ type: 'dog' }];

    let total = 0;
    pets.forEach((pet, idx) => {
        if (idx === 0) {
            let base;
            if (isCustom) {
                base = parseFloat(document.getElementById('nbCustomBase')?.value) || 0;
            } else {
                base = isHoliday ? p.holiday : ((service !== 'Dog Walking' && pet.type === 'cat') ? p.cat : p.base);
            }
            if (isCombo) {
                total += base * num30 + (base + p.addon60) * num60;
            } else {
                total += (base + (is60 ? p.addon60 : 0)) * numVisits;
            }
        } else {
            const extraRate = pet.type === 'cat' ? (p.extraCat || p.extraDog) : p.extraDog;
            total += extraRate * (isCombo ? (num30 + num60) : numVisits);
        }
    });

    const el = document.getElementById('nbTotal');
    if (el) el.value = total;
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

    document.getElementById('nbName').value  = c.name  || '';
    document.getElementById('nbPhone').value = c.phone || '';
    document.getElementById('nbEmail').value = c.email || '';
    document.getElementById('nbClientSearch').value = '';
    document.getElementById('nbClientSearchResults').style.display = 'none';
    document.getElementById('nbSelectedClientName').textContent = c.name;
    document.getElementById('nbSelectedClient').style.display = 'flex';

    // When editing an existing booking, only update client info — preserve original pets
    if (editingBookingId) return;

    nbSelectedPets = new Set();
    const pets = c.pets || [];
    nbManualPets = [];
    document.getElementById('nbPetSection').style.display = '';
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
        document.getElementById('nbAddManualPetBtn').style.display = 'none';
    } else {
        document.getElementById('nbPetCheckboxes').innerHTML = '';
        document.getElementById('nbAddManualPetBtn').style.display = '';
    }
    renderManualPets();
}

function clearSelectedClient() {
    nbSelectedClientId = null;
    nbSelectedPets = new Set();
    document.getElementById('nbSelectedClient').style.display = 'none';
    document.getElementById('nbPetSection').style.display = 'none';
    document.getElementById('nbPetCheckboxes').innerHTML = '';
    nbManualPets = [];
    renderManualPets();
    document.getElementById('nbName').value = '';
    document.getElementById('nbPhone').value = '';
    document.getElementById('nbEmail').value = '';
}

function renderManualPets() {
    const el = document.getElementById('nbManualPetList');
    const btn = document.getElementById('nbAddManualPetBtn');
    if (!el) return;
    el.innerHTML = nbManualPets.map((p, i) => `
        <div class="nb-manual-pet-row">
            <input type="text" value="${escHtml(p.name)}" placeholder="Pet name"
                oninput="AdminCalendar.updateManualPet(${i},'name',this.value)" class="nb-manual-pet-name">
            <select onchange="AdminCalendar.updateManualPet(${i},'type',this.value)" class="nb-manual-pet-type">
                <option value="dog"${p.type==='dog'?' selected':''}>Dog</option>
                <option value="cat"${p.type==='cat'?' selected':''}>Cat</option>
            </select>
            <button type="button" onclick="AdminCalendar.removeManualPet(${i})" class="nb-remove-pet-btn">✕</button>
        </div>`).join('');
    if (btn) btn.style.display = '';
}

function addManualPet() {
    nbManualPets.push({ name: '', type: 'dog' });
    renderManualPets();
    const section = document.getElementById('nbPetSection');
    if (section) section.style.display = '';
}

function updateManualPet(i, field, val) {
    if (nbManualPets[i]) nbManualPets[i][field] = val;
}

function removeManualPet(i) {
    nbManualPets.splice(i, 1);
    renderManualPets();
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
    const isRover  = document.getElementById('nbIsRover')?.checked || false;
    const isCustom = service === 'Custom';
    const customServiceName = isCustom ? (document.getElementById('nbCustomName')?.value.trim() || 'Custom Service') : null;
    const customBasePrice   = isCustom ? (parseFloat(document.getElementById('nbCustomBase')?.value) || 0) : null;
    const effectiveService  = isCustom ? (customServiceName || 'Custom Service') : service;
    const errEl    = document.getElementById('nbError');

    if (!name) { errEl.textContent = 'Client name is required.'; return; }
    if (nbDateTimes.size === 0) { errEl.textContent = 'Please select at least one date.'; return; }
    errEl.textContent = '';

    saveNbDateState();

    const isCombo = duration === 'combo';
    const sortedDates = [...nbDateTimes.keys()].sort();

    // Build datesText and dateTimes object
    const dateTimes = {};
    let datesText = '';
    sortedDates.forEach(iso => {
        const slotsForIso = nbSameTimeAll && iso !== sortedDates[0]
            ? nbDateTimes.get(sortedDates[0])
            : nbDateTimes.get(iso);
        const serialized = slotsForIso
            .map(s => serializeNbSlot(s, isCombo))
            .filter(Boolean)
            .sort();
        dateTimes[iso] = serialized;
        const d = new Date(iso + 'T12:00:00');
        const label = d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
        const timesLabel = serialized.length ? serialized.map(t => {
            if (t === 'anytime') return 'Anytime';
            const clean = t.replace(/\|\d+$/, '');
            if (clean.includes('~')) {
                const [s, e] = clean.split('~');
                return `${fmt12(s)} – ${fmt12(e)}`;
            }
            return fmt12(clean);
        }).join(', ') : 'TBD';
        datesText += `  ${label}: ${timesLabel}\n`;
    });

    let pets = [];
    let resolvedClientId = nbSelectedClientId || null;
    if (nbSelectedClientId) {
        const clients = window.AdminClients?.getAllClients() || [];
        const c = clients.find(x => x.id === nbSelectedClientId);
        if (c && c.pets) pets = [...nbSelectedPets].map(i => c.pets[i]).filter(Boolean);
        if (c?.uid) resolvedClientId = c.uid;
    }
    if (nbManualPets.length > 0) {
        pets = [...pets, ...nbManualPets.filter(p => p.name.trim())];
    }
    if (editingBookingId && pets.length === 0) {
        const orig = calBookings.find(x => x.id === editingBookingId);
        if (orig?.pets?.length) pets = orig.pets;
    }

    const btn = document.getElementById('nbSaveBtn');
    btn.disabled = true; btn.textContent = 'Saving…';

    try {
        const durationSaved = isCombo ? '30 & 60 min' : parseInt(duration);
        if (editingBookingId) {
            await updateDoc(doc(db, 'bookings', editingBookingId), {
                clientName: name, clientPhone: phone, clientEmail: email,
                service: effectiveService, duration: durationSaved,
                datesText, dates: sortedDates, dateTimes,
                pets, notes, total, isRover,
                ...(isCustom ? { customBasePrice } : {}),
                clientId: resolvedClientId,
                updatedAt: serverTimestamp()
            });
            const bid = editingBookingId;
            closeNewBookingModal();
            window.AdminBookings?.openDetail(bid);
        } else {
            await addDoc(collection(db, 'bookings'), {
                clientName: name, clientPhone: phone, clientEmail: email,
                service: effectiveService, duration: durationSaved,
                datesText, dates: sortedDates, dateTimes,
                pets, notes, total, isRover,
                ...(isCustom ? { customBasePrice } : {}),
                status: 'pending', adminAccepted: true, source: 'manual',
                clientId: resolvedClientId,
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
    const dStr = String(b.duration || '30');
    document.getElementById('nbDuration').value = (dStr.includes('&') || dStr.toLowerCase().includes('combo')) ? 'combo' : dStr;
    // total pre-filled below, after calcNbTotal() runs
    document.getElementById('nbNotes').value    = b.notes || '';
    const roverChk = document.getElementById('nbIsRover');
    if (roverChk) roverChk.checked = !!b.isRover;
    if (b.customBasePrice != null) {
        document.getElementById('nbService').value = 'Custom';
        document.getElementById('nbCustomName').value = b.service || '';
        document.getElementById('nbCustomBase').value = b.customBasePrice;
        const cf = document.getElementById('nbCustomFields');
        if (cf) cf.style.display = '';
    }

    // Pre-fill client
    if (b.clientId) {
        selectClient(b.clientId);
        // selectClient() early-returns when editingBookingId is set, so manually render pets
        const clients = window.AdminClients?.getAllClients() || [];
        const c = clients.find(x => x.id === b.clientId);
        if (c && c.pets) {
            const savedNames = (b.pets || []).map(p => p.name);
            nbSelectedPets = new Set();
            c.pets.forEach((cp, i) => {
                if (savedNames.includes(cp.name)) nbSelectedPets.add(i);
            });
            document.getElementById('nbPetSection').style.display = '';
            document.getElementById('nbPetCheckboxes').innerHTML = c.pets.map((p, i) => {
                const emoji = p.type === 'cat' ? '🐱' : '🐶';
                const avatarHtml = p.photoUrl
                    ? `<img class="nb-pet-avatar" src="${escHtml(p.photoUrl)}" alt="${escHtml(p.name||'')}">`
                    : `<div class="nb-pet-avatar nb-pet-emoji">${emoji}</div>`;
                return `
                <label class="nb-pet-option">
                    <input type="checkbox" value="${i}" ${nbSelectedPets.has(i) ? 'checked' : ''} onchange="AdminCalendar.togglePet(${i})">
                    ${avatarHtml}
                    <span>${escHtml(p.name || '—')} <em style="color:var(--brown-mid);font-style:normal">${escHtml(p.type||'')}</em></span>
                </label>`;
            }).join('');
            document.getElementById('nbAddManualPetBtn').style.display = 'none';
        }
    } else {
        document.getElementById('nbName').value  = b.clientName  || '';
        document.getElementById('nbPhone').value = b.clientPhone || '';
        document.getElementById('nbEmail').value = b.clientEmail || '';
        // Load existing pets for no-client bookings
        if (b.pets && b.pets.length > 0) {
            nbManualPets = b.pets.map(p => ({ name: p.name || '', type: p.type || 'dog' }));
        } else {
            nbManualPets = [];
        }
        document.getElementById('nbPetSection').style.display = '';
        document.getElementById('nbPetCheckboxes').innerHTML = '';
        document.getElementById('nbAddManualPetBtn').style.display = '';
        renderManualPets();
    }

    // Pre-fill dates/times
    nbDateTimes = new Map();
    if (b.dateTimes && Object.keys(b.dateTimes).length > 0) {
        Object.entries(b.dateTimes).sort().forEach(([iso, slots]) => {
            nbDateTimes.set(iso, (slots || []).map(t => parseSlotToUiFormat(t)));
        });
    } else if (b.dates && b.dates.length > 0) {
        b.dates.forEach(iso => nbDateTimes.set(iso, [emptySlot()]));
    }
    // Set calendar to the month of the first booking date
    if (nbDateTimes.size > 0) {
        const firstIso = [...nbDateTimes.keys()].sort()[0];
        const firstDate = new Date(firstIso + 'T12:00:00');
        nbModalYear  = firstDate.getFullYear();
        nbModalMonth = firstDate.getMonth();
    }
    renderNbCal();
    renderNbVisitTimes();
    calcNbTotal();
    // Restore stored total (finalTotal includes adjustments; override auto-calc)
    const storedTotal = b.finalTotal != null ? b.finalTotal : b.total;
    if (storedTotal != null) {
        const totalEl = document.getElementById('nbTotal');
        if (totalEl) totalEl.value = storedTotal;
    }
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
    openNewBookingModal, closeNewBookingModal, onServiceChange,
    searchClients, selectClient, clearSelectedClient,
    togglePet, saveNewBooking,
    addManualPet, removeManualPet, updateManualPet,
    nbPrevMonth, nbNextMonth, calcNbTotal,
    addTimeToDate, removeTimeFromDate, updateDatetimeHour, updateDatetimeMin,
    toggleSameTime, setSlotMode,
    updateSlotStartHour, updateSlotStartMin,
    updateSlotEndHour, updateSlotEndMin,
    updateSlotDur, onDurationChange,
    openEditBookingModal,
    nbOpenPicker, nbOnPickerScroll, nbClosePicker,
    selectNbPeriod, setNbSlotType,
};
