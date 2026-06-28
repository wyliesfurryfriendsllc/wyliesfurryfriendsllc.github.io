import {
    db, collection, query, orderBy, onSnapshot,
    doc, updateDoc, addDoc, getDoc, deleteDoc, serverTimestamp, setDoc
} from './firebase.js';

let bookingsUnsub = null;
let messagesUnsub = null;
let allBookings    = [];
let activeFilter   = 'all';
let activeBookingId = null;
let hideRover      = false;
let completedSortDesc = true;
let bookingSearch  = '';
let clientFilter   = null; // { id, name } when viewing a specific client's bookings
// admin-only visit schedule times (localStorage only, never sent to Firestore)

const STATUS_LABELS = {
    pending:          'Pending',
    deposit_received: 'Reserved',
    paid:             'Confirmed',
    in_service:       'In Service',
    rejected:         'Declined',
    completed:        'Completed',
    confirmed:        'Confirmed',  // backward compat
    deleted:          'Deleted'
};
const STATUS_COLORS = {
    pending:          'status-pending',
    deposit_received: 'status-deposit',
    paid:             'status-paid',
    in_service:       'status-in-service',
    rejected:         'status-rejected',
    completed:        'status-completed',
    confirmed:        'status-paid',  // backward compat
    deleted:          'status-rejected'
};

// ─── INIT ─────────────────────────────────────────────────
function init() {
    if (bookingsUnsub) return; // already running
    const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'));
    bookingsUnsub = onSnapshot(q, snap => {
        allBookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAdminBookings();
        if (activeBookingId) {
            const updated = allBookings.find(b => b.id === activeBookingId);
            if (updated) {
                let panel = document.getElementById('adminInlineDetail');
                if (!panel) {
                    // list rebuild removed the panel — re-insert it
                    const card = document.querySelector(`.admin-booking-card[data-booking-id="${activeBookingId}"]`);
                    if (card) {
                        panel = document.createElement('div');
                        panel.id = 'adminInlineDetail';
                        panel.className = 'admin-booking-inline-detail';
                        card.parentNode.insertBefore(panel, card.nextSibling);
                    }
                }
                if (panel) {
                    renderDetail(updated, panel);
                    loadAdminMessages(activeBookingId);
                }
            }
        }
    }, err => {
        document.getElementById('adminBookingsList').innerHTML =
            '<p class="empty-msg">Unable to load bookings. Check Firestore rules.</p>';
        console.error(err);
    });
}

// ─── FILTER ──────────────────────────────────────────────
function setFilter(filter) {
    activeFilter = filter;
    document.querySelectorAll('.filter-chip[data-filter]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    renderAdminBookings();
}

function setBookingSearch(val) {
    bookingSearch = val.trim().toLowerCase();
    renderAdminBookings();
}

function filterByClient(clientId, clientName) {
    clientFilter = { id: clientId, name: clientName };
    bookingSearch = '';
    const searchEl = document.querySelector('#adminTabBookings .client-search-input');
    if (searchEl) searchEl.value = '';
    renderAdminBookings();
}

function clearClientFilter() {
    clientFilter = null;
    renderAdminBookings();
}

function toggleHideRover() {
    hideRover = !hideRover;
    const btn = document.getElementById('hideRoverBtn');
    if (btn) btn.classList.toggle('active', hideRover);
    renderAdminBookings();
}

function toggleCompletedSort() {
    completedSortDesc = !completedSortDesc;
    const btn = document.getElementById('completedSortBtn');
    if (btn) btn.textContent = completedSortDesc ? '↓ Newest first' : '↑ Oldest first';
    renderAdminBookings();
}

// ─── TODAY'S VISITS ───────────────────────────────────────
function getTodayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function getSlotStartTime(slotStr) {
    if (!slotStr || slotStr === 'anytime') return '';
    const clean = slotStr.replace(/\|\d+$/, '');
    const start = clean.split('~')[0];
    return start && start.match(/^\d{2}:\d{2}$/) ? start : '';
}

function getEffectiveEndTime(adminTime, slotStart, slotStr) {
    const start = adminTime || slotStart;
    if (!start) return '';
    const durMatch = slotStr?.match(/\|(\d+)$/);
    const dur = durMatch ? parseInt(durMatch[1]) : 30;
    const [h, m] = start.split(':').map(Number);
    const totalMin = h * 60 + m + dur;
    return `${String(Math.floor(totalMin / 60) % 24).padStart(2,'0')}:${String(totalMin % 60).padStart(2,'0')}`;
}

let _dragKey = null;

function onTvcDragStart(e, key) {
    _dragKey = key;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
        const el = document.querySelector(`.tvc-row[data-key="${CSS.escape(key)}"]`);
        if (el) el.classList.add('tvc-dragging');
    }, 0);
}

function onTvcDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function onTvcDragEnter(e, rowEl) {
    if (rowEl.dataset.key === _dragKey) return;
    document.querySelectorAll('.tvc-row').forEach(r => r.classList.remove('tvc-drop-target'));
    rowEl.classList.add('tvc-drop-target');
}

function onTvcDrop(e, endTime, targetKey) {
    e.preventDefault();
    document.querySelectorAll('.tvc-row').forEach(r => r.classList.remove('tvc-drop-target', 'tvc-dragging'));
    if (!_dragKey || _dragKey === targetKey || !endTime) { _dragKey = null; return; }
    setVisitTime(_dragKey, endTime);
    _dragKey = null;
}

function onTvcDragEnd() {
    document.querySelectorAll('.tvc-row').forEach(r => r.classList.remove('tvc-drop-target', 'tvc-dragging'));
    _dragKey = null;
}

function loadTodayTimes() {
    try { return JSON.parse(localStorage.getItem('wylie_visit_times') || '{}'); } catch { return {}; }
}
function saveTodayTimes(obj) {
    localStorage.setItem('wylie_visit_times', JSON.stringify(obj));
}
function setVisitTime(key, val) {
    const obj = loadTodayTimes();
    if (val) obj[key] = val; else delete obj[key];
    saveTodayTimes(obj);
    renderAdminBookings();
}
function parseAdminTime(str) {
    if (!str) return '';
    const m1 = str.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
    if (m1) {
        let h = parseInt(m1[1]);
        const min = m1[2];
        const ap = (m1[3] || '').toLowerCase();
        if (ap === 'pm' && h < 12) h += 12;
        if (ap === 'am' && h === 12) h = 0;
        return `${String(h).padStart(2,'0')}:${min}`;
    }
    const m2 = str.match(/^(\d{3,4})$/);
    if (m2) {
        const s = m2[1].padStart(4,'0');
        return `${s.slice(0,2)}:${s.slice(2)}`;
    }
    return '';
}
function fmt12h(hhmm) {
    if (!hhmm) return '—';
    const [h, m] = hhmm.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function editVisitTime(key, current) {
    const val = prompt('Set your visit time (e.g. 7:30 or 730):', current ? fmt12h(current) : '');
    if (val === null) return;
    const parsed = parseAdminTime(val.trim());
    setVisitTime(key, parsed);
}

function renderTodaySection(outerContainer) {
    const today = getTodayISO();
    const todayLabel = new Date(today + 'T12:00:00').toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
    const ACTIVE_STATUSES = ['pending','deposit_received','paid','in_service','confirmed'];
    const times = loadTodayTimes();

    const bookings = allBookings.filter(b => {
        if (!ACTIVE_STATUSES.includes(b.status)) return false;
        if (hideRover && b.isRover) return false;
        if (b.dateTimes) return Object.keys(b.dateTimes).includes(today);
        if (b.dates) return b.dates.includes(today);
        return false;
    });

    // Expand each booking's slots into individual visit items
    const items = [];
    bookings.forEach(b => {
        const slots = (b.dateTimes?.[today] || []).filter(Boolean);
        if (slots.length === 0) {
            const key = `${today}|${b.id}|0`;
            items.push({ b, slotIdx: 0, slotStr: '', key, adminTime: times[key] || '', slotStart: '' });
        } else {
            slots.forEach((slotStr, slotIdx) => {
                const key = `${today}|${b.id}|${slotIdx}`;
                items.push({ b, slotIdx, slotStr, key, adminTime: times[key] || '', slotStart: getSlotStartTime(slotStr) });
            });
        }
    });

    // Sort by effective time (admin override → slot start → unset last)
    items.sort((a, b) => {
        const ta = a.adminTime || a.slotStart || '99:99';
        const tb = b.adminTime || b.slotStart || '99:99';
        return ta.localeCompare(tb);
    });

    const sec = document.createElement('div');
    sec.className = 'today-visits-section';
    sec.innerHTML = `
        <div class="today-visits-header">
            <div>
                <div class="today-visits-title">Today's Visits</div>
                <div class="today-visits-date">${escHtml(todayLabel)}</div>
            </div>
        </div>
        <div class="today-visits-list" id="todayVisitsList"></div>`;
    outerContainer.appendChild(sec);

    const list = sec.querySelector('#todayVisitsList');
    if (items.length === 0) {
        list.innerHTML = '<p class="today-empty">No visits scheduled for today.</p>';
        return;
    }

    items.forEach(({ b, slotStr, key, adminTime, slotStart }) => {
        const allPets = b.pets || [];
        const petNames = allPets.map(p => p.name).filter(Boolean).join(', ') || '—';
        const avatarHtml = allPets.length
            ? allPets.map(p => p.photoUrl
                ? `<img class="abc-pet-avatar" src="${escHtml(p.photoUrl)}" alt="${escHtml(p.name||'')}">`
                : `<div class="abc-pet-avatar abc-pet-emoji">${p.type==='cat'?'🐱':'🐶'}</div>`
              ).join('')
            : `<div class="abc-pet-avatar abc-pet-emoji">🐶</div>`;

        const effectiveTime = adminTime || slotStart;
        const isOverridden = !!adminTime;
        const endTime = getEffectiveEndTime(adminTime, slotStart, slotStr);
        const slotTimeLabel = slotStr ? fmtSlot(slotStr) : '—';
        const pencil = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
        const dragHandle = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="19" r="1" fill="currentColor"/><circle cx="15" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/></svg>`;

        const row = document.createElement('div');
        row.className = 'tvc-row';
        row.draggable = true;
        row.dataset.key = key;
        row.dataset.endTime = endTime;
        row.ondragstart = (e) => AdminBookings.onTvcDragStart(e, key);
        row.ondragover  = (e) => AdminBookings.onTvcDragOver(e);
        row.ondragenter = (e) => AdminBookings.onTvcDragEnter(e, row);
        row.ondrop      = (e) => AdminBookings.onTvcDrop(e, endTime, key);
        row.ondragend   = ()  => AdminBookings.onTvcDragEnd();
        row.innerHTML = `
            <div class="tvc-admin-time" onclick="AdminBookings.editVisitTime('${escHtml(key)}','${escHtml(adminTime)}')">
                <span class="tvc-admin-time-label${isOverridden ? ' overridden' : ''}">${effectiveTime ? escHtml(fmt12h(effectiveTime)) : '—'}</span>
                ${pencil}
            </div>
            <div class="today-visit-card${b.id === activeBookingId ? ' active' : ''}" data-booking-id="${b.id}">
                <div class="tvc-body">
                    <div class="abc-avatar-stack">${avatarHtml}</div>
                    <div class="tvc-info">
                        <span class="tvc-pet">${escHtml(petNames)}</span>
                        <span class="tvc-client">${escHtml(b.clientName||'—')}</span>
                        <span class="tvc-service">${escHtml(b.service||'')} · ${String(b.duration||30).includes('&')?b.duration:(b.duration||30)+' min'}</span>
                        <span class="tvc-slot-time">${escHtml(slotTimeLabel)}</span>
                    </div>
                    <span class="status-badge ${STATUS_COLORS[b.status]||'status-pending'}">${STATUS_LABELS[b.status]||'Pending'}</span>
                    <span class="tvc-drag-handle">${dragHandle}</span>
                </div>
            </div>`;

        // Card click opens detail (exclude click on admin-time area)
        row.querySelector('.today-visit-card').onclick = () => openDetail(b.id);
        list.appendChild(row);
    });
}

// ─── LIST ─────────────────────────────────────────────────
function renderAdminBookings() {
    const container = document.getElementById('adminBookingsList');
    if (!container) return;

    container.innerHTML = '';
    renderTodaySection(container);

    // Client filter banner
    const bannerEl = document.getElementById('clientFilterBanner');
    if (bannerEl) {
        if (clientFilter) {
            bannerEl.style.display = '';
            const nameEl = bannerEl.querySelector('.cfb-name');
            if (nameEl) nameEl.textContent = clientFilter.name;
        } else {
            bannerEl.style.display = 'none';
        }
    }

    const ACTIVE_STATUSES = ['pending','deposit_received','paid','in_service','confirmed'];
    let filtered;
    if (clientFilter) {
        // Show ALL statuses for this client
        filtered = allBookings.filter(b =>
            (b.clientId === clientFilter.id) ||
            (b.clientName || '').toLowerCase() === clientFilter.name.toLowerCase()
        );
    } else {
        filtered = activeFilter === 'all'
            ? allBookings.filter(b => ACTIVE_STATUSES.includes(b.status))
            : allBookings.filter(b => b.status === activeFilter);
    }
    if (hideRover) filtered = filtered.filter(b => !b.isRover);
    if (bookingSearch) {
        filtered = filtered.filter(b => {
            const nameMatch = (b.clientName || '').toLowerCase().includes(bookingSearch);
            const petMatch  = (b.pets || []).some(p => (p.name || '').toLowerCase().includes(bookingSearch));
            return nameMatch || petMatch;
        });
    }

    if (filtered.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty-msg';
        empty.textContent = `No ${activeFilter === 'all' ? '' : activeFilter + ' '}bookings yet.`;
        container.appendChild(empty);
        return;
    }
    // Group by first service date
    function getFirstDate(b) {
        if (b.dateTimes && Object.keys(b.dateTimes).length) return Object.keys(b.dateTimes).sort()[0];
        if (b.dates && b.dates.length) return b.dates[0];
        if (b.datesText) {
            const m = b.datesText.trim().match(/(\w+ \d+,?\s*\d+)/);
            return m ? m[1] : '9999-12-31';
        }
        return '9999-12-31';
    }
    const isCompleted = activeFilter === 'completed';
    filtered.sort((a, b) => {
        const cmp = getFirstDate(a).localeCompare(getFirstDate(b));
        return isCompleted && completedSortDesc ? -cmp : cmp;
    });

    // Sort toggle button for completed
    const existing = document.getElementById('completedSortBtn');
    if (isCompleted) {
        if (!existing) {
            const btn = document.createElement('button');
            btn.id = 'completedSortBtn';
            btn.className = 'filter-chip active';
            btn.style.marginBottom = '8px';
            btn.textContent = completedSortDesc ? '↓ Newest first' : '↑ Oldest first';
            btn.onclick = () => AdminBookings.toggleCompletedSort();
            container.parentNode.insertBefore(btn, container);
        } else {
            existing.textContent = completedSortDesc ? '↓ Newest first' : '↑ Oldest first';
        }
    } else {
        if (existing) existing.remove();
    }

    // Build date groups
    const groups = {};
    const groupOrder = [];
    filtered.forEach(b => {
        const iso = getFirstDate(b);
        if (!groups[iso]) { groups[iso] = []; groupOrder.push(iso); }
        groups[iso].push(b);
    });

    groupOrder.forEach(iso => {
        // Date label
        let dateLabel = iso;
        try {
            const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
            dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } catch(e) {}

        const group = document.createElement('div');
        group.className = 'abc-timeline-group';
        group.innerHTML = `
            <div class="abc-timeline-date">
                <div class="abc-timeline-dot"></div>
                <span>${dateLabel}</span>
            </div>
            <div class="abc-timeline-cards" id="tg_${iso.replace(/\W/g,'_')}"></div>`;
        container.appendChild(group);

        const cardsEl = group.querySelector('.abc-timeline-cards');
        groups[iso].forEach(b => {
            // Build date display: bold date, normal time
            let cardDate = '';
            if (b.dateTimes && Object.keys(b.dateTimes).length) {
                const firstIso = Object.keys(b.dateTimes).sort()[0];
                const d = new Date(firstIso + 'T12:00:00');
                const dl = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                const slots = (b.dateTimes[firstIso] || []).filter(Boolean).sort();
                const times = slots.map(t => fmtSlot(t)).join(', ');
                cardDate = `<strong>${escHtml(dl)}</strong>${times ? ' · ' + escHtml(times) : ''}`;
            } else if (b.datesText) {
                const fl = b.datesText.trim().split('\n')[0];
                const ci = fl.indexOf(':');
                cardDate = ci > 0
                    ? `<strong>${escHtml(fl.slice(0, ci))}</strong>${escHtml(fl.slice(ci))}`
                    : `<strong>${escHtml(fl)}</strong>`;
            } else {
                cardDate = '—';
            }
            const allPets = b.pets || [];
            const avatarStackHtml = allPets.length
                ? allPets.map(p => p.photoUrl
                    ? `<img class="abc-pet-avatar" src="${escHtml(p.photoUrl)}" alt="${escHtml(p.name || '')}">`
                    : `<div class="abc-pet-avatar abc-pet-emoji">${p.type === 'cat' ? '🐱' : '🐶'}</div>`
                  ).join('')
                : `<div class="abc-pet-avatar abc-pet-emoji">🐶</div>`;
            const petNames = allPets.map(p => p.name).filter(Boolean).join(', ') || '—';
            const card = document.createElement('div');
            card.className = 'admin-booking-card' + (b.id === activeBookingId ? ' active' : '') + (b.isRover ? ' rover-card' : '');
            card.dataset.bookingId = b.id;
            card.onclick = () => openDetail(b.id);
            card.innerHTML = `
                <div class="abc-layout">
                    <div class="abc-left">
                        <div class="abc-avatar-stack">${avatarStackHtml}</div>
                        <div class="abc-left-text">
                            <span class="abc-petname">${escHtml(petNames)}</span>
                            <span class="abc-ownername">${escHtml(b.clientName || '—')}</span>
                        </div>
                    </div>
                    <div class="abc-right">
                        <div class="abc-service">${escHtml(b.service || '')} · ${String(b.duration || 30).includes('&') ? b.duration : (b.duration || 30) + ' min'}</div>
                        <div style="margin-bottom:4px"><span class="status-badge ${STATUS_COLORS[b.status] || 'status-pending'}">${STATUS_LABELS[b.status] || 'Pending'}</span>${b.isRover ? '<span class="rover-badge">Rover</span>' : ''}</div>
                        <div class="abc-dates">${cardDate}</div>
                        <div class="abc-price">$${calcBaseTotal(b) || b.total || 0} est.</div>
                    </div>
                </div>`;
            cardsEl.appendChild(card);
        });
    });
}

// ─── DETAIL ───────────────────────────────────────────────
function openDetail(bookingId) {
    // If same card clicked again, close it
    if (activeBookingId === bookingId) { closeDetail(); return; }

    // Remove any existing inline detail
    const existing = document.getElementById('adminInlineDetail');
    if (existing) existing.remove();

    activeBookingId = bookingId;
    renderAdminBookings(); // re-render to mark active card

    // Find the card and insert detail below it
    const card = document.querySelector(`.admin-booking-card[data-booking-id="${bookingId}"]`);
    if (!card) return;

    const panel = document.createElement('div');
    panel.id = 'adminInlineDetail';
    panel.className = 'admin-booking-inline-detail';
    panel.innerHTML = '<div class="detail-loading">Loading...</div>';
    card.parentNode.insertBefore(panel, card.nextSibling);
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });

    getDoc(doc(db, 'bookings', bookingId)).then(snap => {
        if (!snap.exists()) { panel.innerHTML = '<p>Booking not found.</p>'; return; }
        const b = { id: snap.id, ...snap.data() };
        renderDetail(b, panel);
        loadAdminMessages(bookingId);
    });
}

function closeDetail() {
    activeBookingId = null;
    if (messagesUnsub) { messagesUnsub(); messagesUnsub = null; }
    const panel = document.getElementById('adminInlineDetail');
    if (panel) panel.remove();
    renderAdminBookings();
}

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

function fmt12(t) {
    if (!t) return 'TBD';
    const parts = t.split(':');
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (isNaN(h) || isNaN(m)) return t;
    return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function fmtSlot(t) {
    if (!t) return 'TBD';
    // strip combo duration tag (e.g. "14:00|60" or "09:00~11:00|30")
    const durMatch = t.match(/\|(\d+)$/);
    const durLabel = durMatch ? ` (${durMatch[1]} min)` : '';
    const clean = t.replace(/\|\d+$/, '');
    if (clean.includes('~')) {
        const [s, e] = clean.split('~');
        if (!e) return `Arrive ${fmt12(s)}${durLabel}`;
        const sH = Number(s.split(':')[0]);
        const eH = Number(e.split(':')[0]);
        const sMin = String(Number(s.split(':')[1])).padStart(2, '0');
        const sAmPm = sH >= 12 ? 'PM' : 'AM';
        const eFmt = fmt12(e);
        const sFmt = `${sH % 12 || 12}:${sMin}`;
        return (sAmPm === (eH >= 12 ? 'PM' : 'AM')
            ? `Arrive ${sFmt} – ${eFmt}`
            : `Arrive ${sFmt} ${sAmPm} – ${eFmt}`) + durLabel;
    }
    return fmt12(clean) + durLabel;
}

function renderScheduleHtml(b) {
    // Newest format: dateTimes object {iso: [time, ...]}
    if (b.dateTimes && Object.keys(b.dateTimes).length > 0) {
        return Object.keys(b.dateTimes).sort().map(iso => {
            const d = new Date(iso + 'T12:00:00');
            const dateLabel = d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
            const slots = [...(b.dateTimes[iso] || [])].filter(Boolean).sort();
            const timesHtml = slots.length
                ? `<div class="detail-sched-times-row">${slots.map(t => `<span class="detail-sched-time">${fmtSlot(t)}</span>`).join('')}</div>`
                : '<div class="detail-sched-times-row"><span class="detail-sched-time">TBD</span></div>';
            return `<div class="detail-sched-block"><div class="detail-sched-date">${escHtml(dateLabel)}</div>${timesHtml}</div>`;
        }).join('');
    }
    // Legacy: dates[] + times[]
    if (b.dates && b.dates.length > 0) {
        const times = b.times && b.times.length ? b.times : [];
        return b.dates.map(iso => {
            const d = new Date(iso + 'T12:00:00');
            const dateLabel = d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
            const timesHtml = times.length
                ? times.map(t => `<div class="detail-sched-time">${fmt12(t)}</div>`).join('')
                : '<div class="detail-sched-time">TBD</div>';
            return `<div class="detail-sched-block"><div class="detail-sched-date">${escHtml(dateLabel)}</div>${timesHtml}</div>`;
        }).join('');
    }
    // Oldest format: datesText
    return `<pre class="detail-dates">${escHtml((b.datesText || '—').trim())}</pre>`;
}

function _calcAgeFromDate(iso) {
    if (!iso) return '';
    const now = new Date(), bd = new Date(iso + 'T00:00:00');
    let m = (now.getFullYear() - bd.getFullYear()) * 12 + (now.getMonth() - bd.getMonth());
    if (now.getDate() < bd.getDate()) m--;
    if (m < 0) return '';
    const y = Math.floor(m / 12), mo = m % 12;
    if (y === 0) return `${mo}mo`;
    return mo ? `${y}yr ${mo}mo` : `${y}yr`;
}

function renderPetsHtml(pets) {
    if (!pets || pets.length === 0) return '<p style="color:var(--brown-mid);padding:8px 0">No pets listed.</p>';
    const items = pets.map(p => {
        const emoji = p.type === 'cat' ? '🐱' : '🐶';
        const avatar = p.photoUrl
            ? `<img class="detail-pet-avatar" src="${escHtml(p.photoUrl)}" alt="${escHtml(p.name || '')}">`
            : `<div class="detail-pet-emoji">${emoji}</div>`;
        const ageStr = _calcAgeFromDate(p.birthDate || p.birthday)
            || (p.age || [p.ageYears ? p.ageYears + 'yr' : '', p.ageMonths ? p.ageMonths + 'mo' : ''].filter(Boolean).join(' '));
        const metaParts = [
            p.gender,
            p.weight ? p.weight + ' lbs' : '',
            ageStr
        ].filter(Boolean);
        return `
            <div class="detail-pet-row">
                ${avatar}
                <div class="detail-pet-name">${escHtml(p.name || '—')}</div>
                ${p.breed ? `<div class="detail-pet-breed">${escHtml(p.breed)}</div>` : ''}
                ${metaParts.length ? `<div class="detail-pet-meta">${escHtml(metaParts.join(' · '))}</div>` : ''}
            </div>`;
    }).join('');
    return `<div class="detail-pets-wrap">${items}</div>`;
}

function getNumVisitsFromBooking(b) {
    let n = 0;
    if (b.dateTimes) {
        for (const slots of Object.values(b.dateTimes)) n += Math.max(1, (slots || []).filter(Boolean).length);
    } else if (b.dates) {
        n = (b.dates.length || 1) * Math.max(1, b.times?.length || 1);
    }
    return n || 1;
}

function _getComboSlotCounts(b) {
    let num30 = 0, num60 = 0;
    if (b.dateTimes) {
        for (const slots of Object.values(b.dateTimes)) {
            for (const slot of (slots || []).filter(Boolean)) {
                if (/\|60$/.test(slot)) num60++; else num30++;
            }
        }
    } else {
        num30 = b.priceBreakdown?.num30 || 0;
        num60 = b.priceBreakdown?.num60 || 0;
    }
    return { num30, num60 };
}

function renderChargesHtml(b) {
    const pets = b.pets || [];
    const service = b.service || 'Drop-In Visit';
    const durationStr = String(b.duration || '30');
    const isCombo = durationStr.includes('&') || durationStr.toLowerCase().includes('combo');
    const p = service === 'Dog Walking' ? PRICING.walking : PRICING.dropin;
    const is60 = !isCombo && parseInt(durationStr) === 60;
    const bookingDates = b.dates || Object.keys(b.dateTimes || {});
    const isHoliday = isHolidayBooking(bookingDates);
    const numVisits = getNumVisitsFromBooking(b);
    const adjs = b.adjustments || [];
    const { num30, num60 } = isCombo ? _getComboSlotCounts(b) : { num30: 0, num60: 0 };

    let petRows = '';
    let calcBase = 0;
    pets.forEach((pet, idx) => {
        let petTotal, subHtml;
        if (idx === 0) {
            const baseRate = b.customBasePrice != null
                ? b.customBasePrice
                : (isHoliday ? p.holiday : ((service !== 'Dog Walking' && pet.type === 'cat') ? p.cat : p.base));
            const rateLabel = service + (b.customBasePrice != null ? ' · Custom Rate' : (isHoliday ? ' · Holiday Rate' : ''));
            if (isCombo) {
                const rate30 = baseRate;
                const rate60 = baseRate + p.addon60;
                petTotal = rate30 * num30 + rate60 * num60;
                subHtml = num30 > 0
                    ? `<div class="detail-charge-sub">${escHtml(rateLabel)} (30 min) · $${rate30} × ${num30} visit${num30 !== 1 ? 's' : ''}</div>`
                    : '';
                subHtml += num60 > 0
                    ? `<div class="detail-charge-sub">${escHtml(rateLabel)} (60 min) · $${rate60} × ${num60} visit${num60 !== 1 ? 's' : ''}</div>`
                    : '';
            } else {
                const rate = baseRate + (is60 ? p.addon60 : 0);
                petTotal = rate * numVisits;
                subHtml = `<div class="detail-charge-sub">${escHtml(rateLabel)} · $${rate} × ${numVisits} visit${numVisits !== 1 ? 's' : ''}</div>`;
            }
        } else {
            const rate = pet.type === 'cat' ? (PRICING.dropin.extraCat || PRICING.dropin.extraDog) : PRICING.dropin.extraDog;
            petTotal = rate * numVisits;
            subHtml = `<div class="detail-charge-sub">Additional ${escHtml(pet.type || 'pet')} · $${rate} × ${numVisits} visit${numVisits !== 1 ? 's' : ''}</div>`;
        }
        calcBase += petTotal;
        petRows += `
            <div class="detail-charge-row">
                <div>
                    <div class="detail-charge-label">${escHtml(pet.name || '—')}</div>
                    ${subHtml}
                </div>
                <div class="detail-charge-amount">$${petTotal}</div>
            </div>`;
    });

    // Use calculated base when pets exist; fall back to stored b.total when no pets
    const baseTotal = pets.length > 0 ? calcBase : (b.total || 0);

    let adjRows = '';
    let adjTotal = 0;
    adjs.forEach(a => {
        const v = a.type === 'per_visit' ? (a.visits || numVisits) : 1;
        const adjAmt = a.amount * v;
        adjTotal += adjAmt;
        const displayAmt = adjAmt >= 0 ? `+$${adjAmt}` : `-$${Math.abs(adjAmt)}`;
        adjRows += `
            <div class="detail-charge-row detail-adj-row">
                <div>
                    <div class="detail-charge-label">${escHtml(a.name)}</div>
                    <div class="detail-charge-sub">${a.type === 'per_visit' ? `$${a.amount} × ${v} visit${v !== 1 ? 's' : ''}` : 'One-time'}</div>
                </div>
                <div class="detail-charge-amount ${adjAmt >= 0 ? 'adj-charge' : 'adj-discount'}">${displayAmt}</div>
            </div>`;
    });

    const finalTotal = baseTotal + adjTotal;
    const totalLabel = adjs.length > 0 ? 'Final Total' : 'Total';

    if (pets.length === 0 && adjs.length === 0) {
        return `<div class="detail-charge-total"><span>Total</span><span>$${baseTotal}</span></div>`;
    }

    return petRows +
        (adjs.length > 0 ? `<div class="detail-charge-sub-total"><span>Base Total</span><span>$${baseTotal}</span></div>${adjRows}` : '') +
        `<div class="detail-charge-total"><span>${totalLabel}</span><span>$${finalTotal}</span></div>`;
}

function paymentRecordsHtml(b) {
    if (b.isRover) return '';
    const hasDeposit = b.depositDate || b.depositAmount != null;
    const hasFinal   = b.finalPaymentDate || b.finalPaymentAmount != null;
    const c          = b.cancellation;
    const hasCancel  = c && (c.refundAmount > 0 || c.tipAmount > 0);
    if (!hasDeposit && !hasFinal && !hasCancel) return '';
    return `<div class="payment-record">
        ${hasDeposit ? `<div class="payment-record-row">
            <span class="payment-record-label">Deposit</span>
            <div class="payment-record-right">
                <span class="payment-record-val">${b.depositAmount != null ? '$' + b.depositAmount : '—'} · ${b.depositDate || '—'}</span>
                <button class="payment-edit-btn" onclick="AdminBookings.openEditPaymentModal('${b.id}','deposit')" title="Edit deposit">✎</button>
            </div>
        </div>` : ''}
        ${hasFinal ? `<div class="payment-record-row">
            <span class="payment-record-label">Final payment</span>
            <div class="payment-record-right">
                <span class="payment-record-val">${b.finalPaymentAmount != null ? '$' + b.finalPaymentAmount : '—'} · ${b.finalPaymentDate || '—'}</span>
                <button class="payment-edit-btn" onclick="AdminBookings.openEditPaymentModal('${b.id}','final')" title="Edit final payment">✎</button>
            </div>
        </div>` : ''}
        ${hasCancel ? `<div class="payment-record-row" style="border-top:1px dashed var(--border);margin-top:4px;padding-top:6px">
            <span class="payment-record-label" style="color:${c.convertToTip ? '#b08060' : '#c0392b'}">${c.convertToTip ? 'Refund to Tip' : 'Refund'}</span>
            <div class="payment-record-right">
                <span class="payment-record-val" style="color:${c.convertToTip ? '#b08060' : '#c0392b'}">$${(c.convertToTip ? c.tipAmount : c.refundAmount).toFixed(2)}</span>
            </div>
        </div>` : ''}
    </div>`;
}

function renderDetail(b, panel) {
    if (b.isRover) panel.classList.add('rover-detail');
    else panel.classList.remove('rover-detail');
    const isPending         = b.status === 'pending';
    const isAccepted        = isPending && !!b.adminAccepted;
    const isDepositReceived = b.status === 'deposit_received';
    const isPaid            = b.status === 'paid';
    const isInService       = b.status === 'in_service';
    const isCompleted       = b.status === 'completed';
    const todayISO = new Date().toISOString().slice(0, 10);
    const pets = b.pets || [];
    let numVisits = 0;
    if (b.dateTimes) {
        for (const slots of Object.values(b.dateTimes)) {
            numVisits += Math.max(1, (slots || []).filter(Boolean).length);
        }
    } else if (b.dates) {
        numVisits = (b.dates.length || 1) * Math.max(1, b.times?.length || 1);
    }
    if (numVisits === 0) numVisits = 1;
    const petNames = pets.map(p => p.name).filter(Boolean).join(', ');

    panel.innerHTML = `
        <div class="detail-top-bar">
            <div class="detail-header-actions">
                ${b.status !== 'deleted' ? `
                <button class="detail-edit-btn" onclick="AdminCalendar.openEditBookingModal('${b.id}')" title="Edit booking">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="detail-edit-btn" onclick="AdminBookings.openCloneModal('${b.id}')" title="Clone booking to new dates">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                </button>
                <button class="detail-export-btn" onclick="AdminBookings.exportImage('${b.id}')" title="Save as image">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
                <button class="detail-delete-btn" onclick="AdminBookings.deleteBooking('${b.id}','${escHtml(b.clientName||'this booking')}')" title="Delete booking">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                </button>` : `
                <button class="admin-btn-secondary" style="font-size:12px;padding:4px 10px" onclick="AdminBookings.restoreBooking('${b.id}')">↩ Restore</button>
                <button class="detail-delete-btn" onclick="AdminBookings.permanentlyDeleteBooking('${b.id}','${escHtml(b.clientName||'this booking')}')" title="Permanently delete" style="color:#c0392b">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                </button>`}
                <button class="detail-close" onclick="AdminBookings.closeDetail()">×</button>
            </div>
        </div>
        <div id="detail-export-content">
        <div class="detail-header">
            <h3 class="detail-title">${escHtml(b.clientName || '—')}</h3>
            <span class="status-badge ${STATUS_COLORS[b.status] || 'status-pending'}" id="detailStatusBadge">${STATUS_LABELS[b.status] || 'Pending'}</span>
        </div>

        <div class="detail-section">
            <div class="detail-section-label">Service</div>
            <div class="detail-service-summary">
                <strong>${escHtml(b.service || '')}</strong><br>
                ${numVisits} visit${numVisits !== 1 ? 's' : ''} · ${String(b.duration || 30).includes('&') ? b.duration : (b.duration || 30) + ' min'} each${petNames ? ' · ' + escHtml(petNames) : ''}
            </div>
        </div>

        <div class="detail-section">
            <div class="detail-section-label">Service schedule</div>
            ${renderScheduleHtml(b)}
        </div>

        <div class="detail-section">
            <div class="detail-section-label">Pets (${pets.length})</div>
            ${renderPetsHtml(pets)}
        </div>

        <div class="detail-section">
            <div class="detail-section-label">Services &amp; Charges</div>
            ${renderChargesHtml(b)}
        </div>

        </div>

        <div class="detail-section">
            <div class="detail-section-label cancel-section-header" onclick="var bd=this.nextElementSibling;bd.classList.toggle('cancel-collapsed');this.querySelector('.cancel-chevron').classList.toggle('cancel-chevron-open')">
                Price Adjustments
                <span class="cancel-chevron">▾</span>
            </div>
            <div class="cancel-body cancel-collapsed">
            ${renderAdjustmentsHtml(b)}
            ${!isCompleted ? `<div class="adj-add-form">
                <input type="text" id="adjName" class="adj-input-name" placeholder="Reason (e.g. Special care fee)">
                <div class="adj-add-row">
                    <input type="number" id="adjAmount" class="adj-input-amt" placeholder="$ amount" step="0.01">
                    <select id="adjType" class="adj-select" onchange="AdminBookings.toggleAdjVisits()">
                        <option value="per_visit">Per visit</option>
                        <option value="one_time">One-time</option>
                    </select>
                    <button class="adj-add-btn" onclick="AdminBookings.addAdjustment('${b.id}')">+ Add</button>
                </div>
                <div id="adjVisitsWrap" class="adj-visits-wrap">
                    <span class="adj-visits-label">×</span>
                    <input type="number" id="adjVisits" class="adj-input-visits" placeholder="${getNumVisitsFromBooking(b)}" min="1" step="1" value="${getNumVisitsFromBooking(b)}">
                    <span class="adj-visits-label">visits</span>
                </div>
            </div>` : ''}
            </div>
        </div>

        ${b.status === 'completed' ? `
        <div class="detail-section">
            <div class="detail-section-label cancel-section-header" onclick="var bd=this.nextElementSibling;bd.classList.toggle('cancel-collapsed');this.querySelector('.cancel-chevron').classList.toggle('cancel-chevron-open')">
                Client Feedback
                <span class="cancel-chevron">▾</span>
            </div>
            <div class="cancel-body">
                ${b.hasReview ? `<div class="detail-row"><span>Review</span><span style="color:#2e7d32">✓ Submitted (pending approval)</span></div>` : '<div class="detail-row"><span>Review</span><span style="color:#999">Not yet submitted</span></div>'}
                <div class="detail-row" style="align-items:center">
                    <span>Tip</span>
                    <span style="display:flex;gap:6px;align-items:center">
                        ${b.tip != null ? `<span style="color:#2e7d32">$${b.tip > 0 ? b.tip : '0 (no tip)'}</span>` : ''}
                        <input type="number" id="adminTipInput_${b.id}" min="0" step="0.01"
                            placeholder="${b.tip != null ? 'Edit amount' : 'Enter tip ($)'}"
                            value="${b.tip != null ? b.tip : ''}"
                            style="width:110px;padding:4px 8px;border:1px solid #ddd;border-radius:6px;font-size:13px">
                        <button class="admin-btn-secondary" style="padding:4px 10px;font-size:12px"
                            onclick="AdminBookings.saveAdminTip('${b.id}')">Save</button>
                    </span>
                </div>
            </div>
        </div>` : ''}

        <div class="detail-section">
            <div class="detail-section-label cancel-section-header" onclick="var bd=this.nextElementSibling;bd.classList.toggle('cancel-collapsed');this.querySelector('.cancel-chevron').classList.toggle('cancel-chevron-open')">
                Contact
                <span class="cancel-chevron">▾</span>
            </div>
            <div class="cancel-body cancel-collapsed">
                <div class="detail-row"><span>Name</span><span>${escHtml(b.clientName || '—')}</span></div>
                <div class="detail-row"><span>Phone</span><span>${escHtml(b.clientPhone || '—')}</span></div>
                <div class="detail-row"><span>Email</span><span>${escHtml(b.clientEmail || '—')}</span></div>
                ${b.notes ? `<div class="detail-row"><span>Notes</span><span>${escHtml(b.notes)}</span></div>` : ''}
            </div>
        </div>

        ${(() => {
            const allC = window.AdminClients?.getAllClients?.() || [];
            const alreadyLinked = allC.find(c => c.id === b.clientId || (b.clientEmail && c.email === b.clientEmail));
            const addBtn = !alreadyLinked
                ? `<button class="admin-btn-secondary" style="margin-top:6px" onclick="AdminBookings.addToClients('${b.id}')">+ Add to Clients</button>`
                : '';
            const clientsWithUid = allC.filter(c => c.uid || c.id?.length >= 20);
            const linkSection = !b.clientId ? `
            <div style="margin-top:8px">
                <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Link to Account</div>
                <div class="link-account-row">
                    <select id="linkClientSelect_${b.id}" class="admin-select">
                        <option value="">— Select account to link —</option>
                        ${clientsWithUid.map(c => `<option value="${c.id}">${escHtml(c.name || '')} (${escHtml(c.email || '')})</option>`).join('')}
                    </select>
                    <button class="admin-btn-secondary" onclick="AdminBookings.linkToAccount('${b.id}')">Link</button>
                </div>
            </div>` : '';
            return (addBtn || linkSection) ? `
        <div class="detail-section" style="padding:10px 0 4px">
            ${addBtn}
            ${linkSection}
        </div>` : '';
        })()}

        <div class="detail-section">
            <div class="detail-section-label cancel-section-header" onclick="var bd=this.nextElementSibling;bd.classList.toggle('cancel-collapsed');this.querySelector('.cancel-chevron').classList.toggle('cancel-chevron-open')">
                Cancellation
                <span class="cancel-chevron">▾</span>
            </div>
            <div class="cancel-body cancel-collapsed">
                ${renderCancellationHtml(b)}
            </div>
        </div>

        ${isPending && !isAccepted && b.isRover ? `
        <div class="detail-actions">
            <button class="admin-btn-primary" onclick="AdminBookings.markRoverConfirmed('${b.id}')">
                ✓ Confirm Booking
            </button>
            <button class="admin-btn-danger" onclick="AdminBookings.rejectBooking('${b.id}')">
                ✕ Decline
            </button>
        </div>` : ''}
        ${isPending && !isAccepted && !b.isRover ? `
        <div class="detail-actions">
            <button class="admin-btn-primary" onclick="AdminBookings.acceptBooking('${b.id}','${escHtml(b.clientName||'')}',${b.total||0})">
                ✓ Accept Booking
            </button>
            <button class="admin-btn-danger" onclick="AdminBookings.rejectBooking('${b.id}')">
                ✕ Decline
            </button>
        </div>` : ''}
        ${isAccepted ? `
        <div class="detail-actions">
            ${!b.isRover ? `<div class="deposit-action-wrap">
                <div class="deposit-action-label">Record deposit payment:</div>
                <div class="deposit-action-row">
                    <input type="date" id="depositDateInput" value="${todayISO}">
                    <input type="number" id="depositAmountInput" class="deposit-amount-input" placeholder="$ Amount" step="0.01" min="0">
                    <button class="admin-btn-deposit" onclick="AdminBookings.markDepositReceived('${b.id}')">
                        ✓ Deposit Received
                    </button>
                </div>
            </div>` : ''}
            ${b.isRover ? `<button class="admin-btn-primary" onclick="AdminBookings.markRoverConfirmed('${b.id}')">✓ Confirm Booking</button>` : ''}
            <button class="admin-btn-danger" onclick="AdminBookings.rejectBooking('${b.id}')">✕ Decline</button>
        </div>` : ''}
        ${isDepositReceived ? `
        <div class="detail-actions">
            ${paymentRecordsHtml(b)}
            ${!b.isRover ? `<div class="deposit-action-wrap">
                <div class="deposit-action-label">Record final payment:</div>
                <div class="deposit-action-row">
                    <input type="date" id="finalPayDateInput" value="${todayISO}">
                    <input type="number" id="finalPayAmountInput" class="deposit-amount-input" placeholder="$ Amount" step="0.01" min="0">
                    <button class="admin-btn-paid" onclick="AdminBookings.markPaidInFull('${b.id}')">
                        💚 Paid in Full
                    </button>
                </div>
            </div>` : ''}
            <button class="admin-btn-in-service" onclick="AdminBookings.markInService('${b.id}')">▶ Mark In Service</button>
            <button class="admin-btn-secondary" onclick="AdminBookings.markCompleted('${b.id}')">Mark Completed</button>
            <button class="admin-btn-danger" onclick="AdminBookings.rejectBooking('${b.id}')">✕ Decline</button>
        </div>` : ''}
        ${isPaid ? `
        <div class="detail-actions">
            ${paymentRecordsHtml(b)}
            <div class="paid-full-notice">💚 Paid in Full</div>
            <button class="admin-btn-in-service" onclick="AdminBookings.markInService('${b.id}')">▶ Mark In Service</button>
            <button class="admin-btn-secondary" onclick="AdminBookings.markCompleted('${b.id}')">Mark Completed</button>
        </div>` : ''}
        ${isInService ? `
        <div class="detail-actions">
            ${paymentRecordsHtml(b)}
            <div class="paid-full-notice" style="color:#8e44ad">⚡ In Service</div>
            <button class="admin-btn-secondary" onclick="AdminBookings.markCompleted('${b.id}')">✓ Mark Completed</button>
        </div>` : ''}
        ${isCompleted ? `
        <div class="detail-actions">
            ${paymentRecordsHtml(b)}
            <div class="paid-full-notice" style="color:#2d6a4f">✓ Completed</div>
        </div>` : ''}

        <div class="detail-section">
            <div class="detail-section-label">Messages</div>
            <div class="messages-thread" id="adminMessagesThread"></div>
            <div class="message-input-wrap">
                <input type="text" class="message-input" id="adminMessageInput" placeholder="Message to client..." onkeydown="if(event.key==='Enter')AdminBookings.sendAdminMessage()">
                <button class="message-send-btn" onclick="AdminBookings.sendAdminMessage()">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
            </div>
        </div>
    `;
}

function refreshDetailStatus(status) {
    const badge = document.getElementById('detailStatusBadge');
    if (badge) {
        badge.className = `status-badge ${STATUS_COLORS[status] || 'status-pending'}`;
        badge.textContent = STATUS_LABELS[status] || status;
    }
}

// ─── ACTIONS ─────────────────────────────────────────────
async function acceptBooking(bookingId, clientName, total) {
    if (!confirm(`Accept booking for ${clientName}?\nStatus will stay Pending until deposit is received.`)) return;
    await updateDoc(doc(db, 'bookings', bookingId), { adminAccepted: true });
}

async function rejectBooking(bookingId) {
    if (!confirm('Decline this booking?')) return;
    await updateDoc(doc(db, 'bookings', bookingId), { status: 'rejected' });
    await addDoc(collection(db, 'bookings', bookingId, 'messages'), {
        sender:     'owner',
        senderName: 'Wylie',
        text: "Thank you for reaching out! Unfortunately I'm unable to accommodate your request at this time. Please feel free to submit another request for different dates.",
        createdAt:  serverTimestamp()
    });
}

async function markCompleted(bookingId) {
    if (!confirm('Mark this booking as completed?')) return;
    await updateDoc(doc(db, 'bookings', bookingId), { status: 'completed' });
}

async function markDepositReceived(bookingId) {
    const dateInput = document.getElementById('depositDateInput');
    const amtInput  = document.getElementById('depositAmountInput');
    const depositDate   = dateInput ? dateInput.value : new Date().toISOString().slice(0, 10);
    const depositAmount = amtInput && amtInput.value !== '' ? parseFloat(amtInput.value) : null;
    if (!confirm(`Mark deposit received${depositAmount != null ? ' ($' + depositAmount + ')' : ''} on ${depositDate}?`)) return;
    const data = { status: 'deposit_received', depositDate };
    if (depositAmount != null) data.depositAmount = depositAmount;
    await updateDoc(doc(db, 'bookings', bookingId), data);
}

async function markPaidInFull(bookingId) {
    const dateInput = document.getElementById('finalPayDateInput');
    const amtInput  = document.getElementById('finalPayAmountInput');
    const finalPaymentDate   = dateInput ? dateInput.value : new Date().toISOString().slice(0, 10);
    const finalPaymentAmount = amtInput && amtInput.value !== '' ? parseFloat(amtInput.value) : null;
    if (!confirm(`Mark paid in full${finalPaymentAmount != null ? ' ($' + finalPaymentAmount + ')' : ''} on ${finalPaymentDate}?`)) return;
    const data = { status: 'paid', finalPaymentDate };
    if (finalPaymentAmount != null) data.finalPaymentAmount = finalPaymentAmount;
    await updateDoc(doc(db, 'bookings', bookingId), data);
}

async function markInService(bookingId) {
    if (!confirm('Mark this booking as In Service?')) return;
    await updateDoc(doc(db, 'bookings', bookingId), { status: 'in_service' });
}

async function markRoverConfirmed(bookingId) {
    if (!confirm('Confirm this Rover booking?')) return;
    await updateDoc(doc(db, 'bookings', bookingId), { status: 'paid' });
}

function calcBaseTotal(b) {
    const pets = b.pets || [];
    if (pets.length === 0) return b.total || 0;
    const service = b.service || 'Drop-In Visit';
    const durationStr = String(b.duration || '30');
    const isCombo = durationStr.includes('&') || durationStr.toLowerCase().includes('combo');
    const p = service === 'Dog Walking' ? PRICING.walking : PRICING.dropin;
    const is60 = !isCombo && parseInt(durationStr) === 60;
    const bookingDates = b.dates || Object.keys(b.dateTimes || {});
    const isHoliday = isHolidayBooking(bookingDates);
    const numVisits = getNumVisitsFromBooking(b);
    const { num30, num60 } = isCombo ? _getComboSlotCounts(b) : { num30: 0, num60: 0 };
    let total = 0;
    pets.forEach((pet, idx) => {
        if (idx === 0) {
            const baseRate = b.customBasePrice != null
                ? b.customBasePrice
                : (isHoliday ? p.holiday : ((service !== 'Dog Walking' && pet.type === 'cat') ? p.cat : p.base));
            if (isCombo) {
                total += baseRate * num30 + (baseRate + p.addon60) * num60;
            } else {
                total += (baseRate + (is60 ? p.addon60 : 0)) * numVisits;
            }
        } else {
            const rate = pet.type === 'cat' ? (PRICING.dropin.extraCat || PRICING.dropin.extraDog) : PRICING.dropin.extraDog;
            total += rate * numVisits;
        }
    });
    return total;
}

function toggleAdjVisits() {
    const type = document.getElementById('adjType')?.value;
    const wrap = document.getElementById('adjVisitsWrap');
    if (wrap) wrap.style.display = type === 'per_visit' ? 'flex' : 'none';
}

async function addAdjustment(bookingId) {
    const name   = document.getElementById('adjName')?.value.trim();
    const amount = parseFloat(document.getElementById('adjAmount')?.value);
    const type   = document.getElementById('adjType')?.value || 'one_time';
    if (!name)       { alert('Please enter a reason for the adjustment.'); return; }
    if (isNaN(amount)) { alert('Please enter a valid amount (e.g. 5 or -10).'); return; }
    const b = allBookings.find(x => x.id === bookingId);
    if (!b) return;
    const bookingVisits = getNumVisitsFromBooking(b);
    const visitsVal = document.getElementById('adjVisits')?.value;
    const visits = type === 'per_visit' ? (visitsVal ? parseInt(visitsVal) || bookingVisits : bookingVisits) : null;
    const adj = { name, amount, type };
    if (visits !== null) adj.visits = visits;
    const adjustments = [...(b.adjustments || []), adj];
    const adjTotal = adjustments.reduce((s, a) => {
        const v = a.type === 'per_visit' ? (a.visits || getNumVisitsFromBooking(b)) : 1;
        return s + a.amount * v;
    }, 0);
    await updateDoc(doc(db, 'bookings', bookingId), { adjustments, finalTotal: calcBaseTotal(b) + adjTotal });
}

async function removeAdjustment(bookingId, idx) {
    const b = allBookings.find(x => x.id === bookingId);
    if (!b) return;
    const adjustments = (b.adjustments || []).filter((_, i) => i !== idx);
    const bookingVisits = getNumVisitsFromBooking(b);
    const adjTotal = adjustments.reduce((s, a) => {
        const v = a.type === 'per_visit' ? (a.visits || bookingVisits) : 1;
        return s + a.amount * v;
    }, 0);
    await updateDoc(doc(db, 'bookings', bookingId), { adjustments, finalTotal: calcBaseTotal(b) + adjTotal });
}

function renderAdjustmentsHtml(b) {
    const adjs = b.adjustments || [];
    const numVisits = getNumVisitsFromBooking(b);
    if (adjs.length === 0) return '<p class="adj-empty">No adjustments yet.</p>';
    return adjs.map((a, idx) => {
        const v = a.type === 'per_visit' ? (a.visits || numVisits) : 1;
        const adjAmt = a.amount * v;
        const displayAmt = adjAmt >= 0 ? `+$${adjAmt}` : `-$${Math.abs(adjAmt)}`;
        return `<div class="detail-adj-item">
            <div>
                <div class="detail-charge-label">${escHtml(a.name)}</div>
                <div class="detail-charge-sub">${a.type === 'per_visit' ? `$${a.amount} × ${v} visit${v !== 1 ? 's' : ''}` : 'One-time'}</div>
            </div>
            <div class="adj-right">
                <span class="${adjAmt >= 0 ? 'adj-charge' : 'adj-discount'}">${displayAmt}</span>
                <button class="adj-remove-btn" onclick="AdminBookings.removeAdjustment('${b.id}', ${idx})">×</button>
            </div>
        </div>`;
    }).join('');
}

async function deleteBooking(bookingId, clientName) {
    if (!confirm(`Move booking for ${clientName} to Deleted?`)) return;
    await updateDoc(doc(db, 'bookings', bookingId), { status: 'deleted' });
    closeDetail();
}

async function permanentlyDeleteBooking(bookingId, clientName) {
    if (!confirm(`Permanently delete booking for ${clientName}?\n\nThis cannot be undone.`)) return;
    await deleteDoc(doc(db, 'bookings', bookingId));
    closeDetail();
}

// ─── MESSAGES ─────────────────────────────────────────────
function loadAdminMessages(bookingId) {
    if (messagesUnsub) messagesUnsub();
    const msgQ = query(collection(db, 'bookings', bookingId, 'messages'), orderBy('createdAt', 'asc'));
    messagesUnsub = onSnapshot(msgQ, snap => {
        const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAdminMessages(msgs);
    });
}

function renderAdminMessages(messages) {
    const thread = document.getElementById('adminMessagesThread');
    if (!thread) return;
    if (messages.length === 0) {
        thread.innerHTML = '<p class="msg-empty">No messages yet.</p>';
        return;
    }
    thread.innerHTML = '';
    messages.forEach(msg => {
        const isOwn = msg.sender === 'owner';
        const time  = msg.createdAt?.toDate
            ? msg.createdAt.toDate().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
            : '';
        const div = document.createElement('div');
        div.className = 'msg-bubble-wrap' + (isOwn ? ' msg-own' : '');
        div.innerHTML = `
            <div class="msg-bubble">${escHtml(msg.text)}</div>
            <div class="msg-meta">${isOwn ? 'You' : escHtml(msg.senderName || 'Client')} · ${time}</div>
        `;
        thread.appendChild(div);
    });
    thread.scrollTop = thread.scrollHeight;
}

async function sendAdminMessage() {
    if (!activeBookingId) return;
    const input = document.getElementById('adminMessageInput');
    const text  = input.value.trim();
    if (!text) return;
    input.value = '';
    await addDoc(collection(db, 'bookings', activeBookingId, 'messages'), {
        sender:     'owner',
        senderName: 'Wylie',
        text,
        createdAt:  serverTimestamp()
    });
}

// ─── CANCELLATION ────────────────────────────────────────
function renderCancellationHtml(b) {
    const c   = b.cancellation || {};
    const tot = parseFloat(b.finalTotal || b.total || 0);
    const savedVisits = c.cancelledVisits ?? '';
    const savedPPV    = c.pricePerVisit   ?? '';
    const savedOption = c.refundOption    || 'full';
    const savedTip    = c.convertToTip    || false;
    const hasSaved    = c.cancelledVisits != null;
    const cv = hasSaved ? (c.cancelledVisits * c.pricePerVisit) : 0;
    const rbFromCv = (opt) => opt === 'full' ? cv : opt === 'deposit' ? cv * 0.5 : cv * 0.25;
    const refundBase = hasSaved ? rbFromCv(savedOption) : 0;
    const dispRefund = hasSaved ? (savedTip ? '0.00' : refundBase.toFixed(2)) : '—';
    const dispTip    = hasSaved ? (savedTip ? refundBase.toFixed(2) : '0.00') : '—';
    const labels = { full: 'Full Refund', deposit: 'Deposit Refund', half_deposit: 'Half Deposit Refund' };

    return `
        <div class="cancel-input-row">
            <div class="cancel-field">
                <label class="cancel-label">Cancelled Visits</label>
                <input type="number" id="cancelVisits" class="cancel-input" value="${savedVisits}" min="0" placeholder="0" oninput="calcCancellation()">
            </div>
            <div class="cancel-field">
                <label class="cancel-label">Price Per Visit ($)</label>
                <input type="number" id="cancelPPV" class="cancel-input" value="${savedPPV}" min="0" step="0.01" placeholder="0.00" oninput="calcCancellation()">
            </div>
        </div>
        <div class="cancel-calc-row">
            <span class="cancel-calc-label">Cancelled Value:</span>
            <span class="cancel-calc-val">$<span id="cancelledValueNum">${hasSaved ? cv.toFixed(2) : '0.00'}</span></span>
        </div>
        <div class="cancel-refund-options">
            <div class="cancel-label" style="margin-bottom:6px">Refund Option</div>
            <label class="cancel-radio-row">
                <input type="radio" name="cancelRefund" value="full" ${savedOption === 'full' ? 'checked' : ''} onchange="calcCancellation()">
                <span>Full Refund <span class="cancel-pct">(100% · $<span id="cancelAmtFull">${hasSaved ? cv.toFixed(2) : '0.00'}</span>)</span></span>
            </label>
            <label class="cancel-radio-row">
                <input type="radio" name="cancelRefund" value="deposit" ${savedOption === 'deposit' ? 'checked' : ''} onchange="calcCancellation()">
                <span>Deposit Refund <span class="cancel-pct">(50% · $<span id="cancelAmtDeposit">${hasSaved ? (cv * 0.5).toFixed(2) : '0.00'}</span>)</span></span>
            </label>
            <label class="cancel-radio-row">
                <input type="radio" name="cancelRefund" value="half_deposit" ${savedOption === 'half_deposit' ? 'checked' : ''} onchange="calcCancellation()">
                <span>Half Deposit Refund <span class="cancel-pct">(25% · $<span id="cancelAmtHalf">${hasSaved ? (cv * 0.25).toFixed(2) : '0.00'}</span>)</span></span>
            </label>
        </div>
        <label class="cancel-tip-row">
            <input type="checkbox" id="cancelConvertTip" ${savedTip ? 'checked' : ''} onchange="calcCancellation()">
            <span>Convert Refund to Tip</span>
        </label>
        <div class="cancel-summary">
            <div class="cancel-summary-row"><span>Cancelled Visits</span><span id="sumVisits">${hasSaved ? c.cancelledVisits : '—'}</span></div>
            <div class="cancel-summary-row"><span>Price Per Visit</span><span id="sumPPV">${hasSaved ? '$' + parseFloat(c.pricePerVisit).toFixed(2) : '—'}</span></div>
            <div class="cancel-summary-row"><span>Cancelled Value</span><span id="sumCancelledValue">${hasSaved ? '$' + cv.toFixed(2) : '—'}</span></div>
            <div class="cancel-summary-row"><span>Refund Option</span><span id="sumRefundOption">${labels[savedOption]}</span></div>
            <div class="cancel-summary-row cancel-summary-total"><span>Refund Amount</span><span id="sumRefundAmount">${hasSaved ? '$' + dispRefund : '—'}</span></div>
            <div class="cancel-summary-row cancel-summary-total"><span>Tip Amount</span><span id="sumTipAmount">${hasSaved ? '$' + dispTip : '—'}</span></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:14px">
            <button class="adj-add-btn" onclick="saveCancellation('${b.id}')">Save</button>
            ${hasSaved ? `<button class="cancel-clear-btn" onclick="clearCancellation('${b.id}')">Clear</button>` : ''}
        </div>`;
}

window.calcCancellation = function() {
    const visits = parseFloat(document.getElementById('cancelVisits')?.value) || 0;
    const ppv    = parseFloat(document.getElementById('cancelPPV')?.value)    || 0;
    const cv     = visits * ppv;
    const set    = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('cancelledValueNum', cv.toFixed(2));
    // Update refund option labels
    set('cancelAmtFull',    cv.toFixed(2));
    set('cancelAmtDeposit', (cv * 0.5).toFixed(2));
    set('cancelAmtHalf',    (cv * 0.25).toFixed(2));
    const option = document.querySelector('input[name="cancelRefund"]:checked')?.value || 'full';
    const toTip  = document.getElementById('cancelConvertTip')?.checked || false;
    const rb     = option === 'full' ? cv : option === 'deposit' ? cv * 0.5 : cv * 0.25;
    const labels = { full: 'Full Refund', deposit: 'Deposit Refund', half_deposit: 'Half Deposit Refund' };
    set('sumVisits',         visits || '—');
    set('sumPPV',            ppv    ? '$' + ppv.toFixed(2) : '—');
    set('sumCancelledValue', cv     ? '$' + cv.toFixed(2)  : '—');
    set('sumRefundOption',   labels[option]);
    set('sumRefundAmount',   '$' + (toTip ? 0 : rb).toFixed(2));
    set('sumTipAmount',      '$' + (toTip ? rb : 0).toFixed(2));
};

window.saveCancellation = async function(bookingId) {
    const visits = parseFloat(document.getElementById('cancelVisits')?.value) || 0;
    const ppv    = parseFloat(document.getElementById('cancelPPV')?.value)    || 0;
    const cv     = visits * ppv;
    const option = document.querySelector('input[name="cancelRefund"]:checked')?.value || 'full';
    const toTip  = document.getElementById('cancelConvertTip')?.checked || false;
    const rb     = option === 'full' ? cv : option === 'deposit' ? cv * 0.5 : cv * 0.25;
    const cancellation = {
        cancelledVisits: visits,
        pricePerVisit:   ppv,
        cancelledValue:  cv,
        refundOption:    option,
        convertToTip:    toTip,
        refundAmount:    toTip ? 0 : rb,
        tipAmount:       toTip ? rb : 0,
        savedAt:         new Date().toISOString()
    };
    try {
        await updateDoc(doc(db, 'bookings', bookingId), { cancellation });
    } catch(e) {
        alert('Save failed: ' + e.message);
    }
};

window.clearCancellation = async function(bookingId) {
    if (!confirm('Clear this cancellation record?')) return;
    try {
        await updateDoc(doc(db, 'bookings', bookingId), { cancellation: null });
    } catch(e) {
        alert('Clear failed: ' + e.message);
    }
};

// ─── HELPERS ─────────────────────────────────────────────
function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── EXPORT IMAGE ─────────────────────────────────────────
async function exportImage(bookingId) {
    const target = document.getElementById('detail-export-content');
    if (!target || typeof html2canvas === 'undefined') {
        alert('Export not available.'); return;
    }
    const btn = document.querySelector('.detail-export-btn');
    const svgIcon = btn?.innerHTML;
    if (btn) { btn.textContent = '…'; btn.disabled = true; }

    const badges = target.querySelectorAll('.status-badge');
    badges.forEach(badge => { badge.style.display = 'none'; });

    try {
        const canvas = await html2canvas(target, {
            backgroundColor: '#fffaf7',
            scale: 2,
            width: 680,
            windowWidth: 680,
            useCORS: true,
            logging: false
        });

        const b = allBookings.find(x => x.id === bookingId);
        const name = (b?.clientName || 'booking').replace(/\s+/g, '-').toLowerCase();
        const filename = `${name}-${new Date().toISOString().slice(0,10)}.png`;
        const dataUrl = canvas.toDataURL('image/png');

        // Try Web Share API with file (iOS 15+ / Android)
        const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
        const file = new File([blob], filename, { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
            try {
                await navigator.share({ files: [file], title: filename });
                return;
            } catch(e) {
                if (e.name === 'AbortError') return;
                // share failed — fall through to next method
            }
        }

        // iOS fallback: show image in inline modal, user long-presses to save
        if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;gap:16px';
            overlay.innerHTML =
                `<p style="color:#fff;font-size:14px;text-align:center;margin:0">长按图片 → 存储到照片</p>` +
                `<img src="${dataUrl}" style="max-width:100%;max-height:75vh;border-radius:8px;display:block">` +
                `<button style="background:#fff;border:none;border-radius:10px;padding:10px 28px;font-size:15px;font-weight:600;cursor:pointer" onclick="this.closest('div').remove()">关闭</button>`;
            document.body.appendChild(overlay);
            return;
        }

        // Desktop: download
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        link.click();

    } catch(e) {
        if (e.name !== 'AbortError') alert('Export failed: ' + e.message);
    } finally {
        badges.forEach(badge => { badge.style.display = ''; });
        if (btn) { btn.disabled = false; btn.innerHTML = svgIcon; }
    }
}

// ─── EDIT DATES MODAL ────────────────────────────────────
function openEditDatesModal(bookingId) {
    const b = allBookings.find(x => x.id === bookingId);
    if (!b) return;

    const dateTimes = b.dateTimes ? JSON.parse(JSON.stringify(b.dateTimes)) : {};
    if (!Object.keys(dateTimes).length && b.dates) {
        b.dates.forEach(iso => { dateTimes[iso] = b.times ? [...b.times] : []; });
    }

    const existing = document.getElementById('editDatesOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'editDatesOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center';

    const sortedDates = Object.keys(dateTimes).sort();
    overlay.innerHTML = `
        <div style="background:#fffaf7;border-radius:16px;padding:32px;width:90%;max-width:540px;max-height:80vh;overflow-y:auto">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
                <h3 style="margin:0;font-size:18px;color:#3d2b1f">Edit Service Dates</h3>
                <button onclick="document.getElementById('editDatesOverlay').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#888;line-height:1">×</button>
            </div>
            <p style="font-size:12px;color:#888;margin:0 0 12px">Times format: HH:MM or HH:MM~HH:MM. Comma-separate multiple times per day.</p>
            <div id="edDatesList">
                ${sortedDates.map(iso => edBuildDateRow(iso, dateTimes[iso])).join('')}
            </div>
            <div style="margin-top:16px;padding-top:16px;border-top:1px solid #ede0d4">
                <div style="display:flex;gap:8px;align-items:center">
                    <input type="date" id="edNewDateInput" style="flex:1;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px">
                    <button onclick="edAddDate()" style="padding:8px 16px;background:#c8905c;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;white-space:nowrap">+ Add Date</button>
                </div>
            </div>
            <div id="edError" style="color:#e53e3e;font-size:13px;margin-top:8px;display:none"></div>
            <div style="display:flex;gap:12px;margin-top:24px;justify-content:flex-end">
                <button onclick="document.getElementById('editDatesOverlay').remove()" style="padding:10px 20px;border:1px solid #ddd;background:#fff;border-radius:8px;cursor:pointer;font-size:14px">Cancel</button>
                <button id="edSaveBtn" onclick="edSaveDates('${bookingId}')" style="padding:10px 20px;background:#2d6a4f;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px">Save Changes</button>
            </div>
        </div>`;

    document.body.appendChild(overlay);
}

function edBuildDateRow(iso, slots) {
    const d = new Date(iso + 'T12:00:00');
    const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const slotsStr = (slots || []).join(', ');
    return `<div class="ed-date-row" data-iso="${iso}" style="display:flex;align-items:flex-start;gap:8px;padding:10px 0;border-bottom:1px solid #f0e8e0">
        <div style="flex:1">
            <div style="font-weight:600;font-size:14px;color:#3d2b1f;margin-bottom:4px">${escHtml(label)}</div>
            <input class="ed-slots-input" type="text" value="${escHtml(slotsStr)}" placeholder="e.g. 08:00~09:00, 14:00~15:00" style="width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box">
        </div>
        <button onclick="this.closest('.ed-date-row').remove()" style="background:none;border:none;color:#e53e3e;font-size:20px;cursor:pointer;padding:2px 4px;margin-top:2px;line-height:1">×</button>
    </div>`;
}

window.edAddDate = function() {
    const input = document.getElementById('edNewDateInput');
    const iso = input.value;
    if (!iso) { alert('Please select a date.'); return; }
    if (document.querySelector(`.ed-date-row[data-iso="${iso}"]`)) { alert('That date is already in the list.'); return; }
    document.getElementById('edDatesList').insertAdjacentHTML('beforeend', edBuildDateRow(iso, []));
    input.value = '';
};

window.edSaveDates = async function(bookingId) {
    const btn = document.getElementById('edSaveBtn');
    const errEl = document.getElementById('edError');
    errEl.style.display = 'none';
    btn.textContent = 'Saving…'; btn.disabled = true;
    const rows = document.querySelectorAll('.ed-date-row');
    const dateTimes = {};
    rows.forEach(row => {
        const iso = row.dataset.iso;
        const raw = row.querySelector('.ed-slots-input').value.trim();
        dateTimes[iso] = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
    });
    try {
        await updateDoc(doc(db, 'bookings', bookingId), { dateTimes });
        document.getElementById('editDatesOverlay').remove();
    } catch(e) {
        errEl.textContent = 'Save failed: ' + e.message;
        errEl.style.display = '';
        btn.textContent = 'Save Changes'; btn.disabled = false;
    }
};

// ─── EDIT PAYMENT RECORDS ────────────────────────────────
function openEditPaymentModal(bookingId, type) {
    const b = allBookings.find(x => x.id === bookingId);
    if (!b) return;

    const isDeposit = type === 'deposit';
    const title   = isDeposit ? 'Edit Deposit Record' : 'Edit Final Payment';
    const dateVal  = isDeposit ? (b.depositDate || '') : (b.finalPaymentDate || '');
    const amtVal   = isDeposit ? (b.depositAmount ?? '') : (b.finalPaymentAmount ?? '');
    const saveKey  = isDeposit ? 'epSaveDeposit' : 'epSaveFinal';

    const existing = document.getElementById('editPaymentOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'editPaymentOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = `
        <div style="background:#fffaf7;border-radius:16px;padding:32px;width:90%;max-width:400px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
                <h3 style="margin:0;font-size:18px;color:#3d2b1f">${title}</h3>
                <button onclick="document.getElementById('editPaymentOverlay').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#888;line-height:1">×</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:12px">
                <div>
                    <label style="display:block;font-size:13px;font-weight:600;color:#666;margin-bottom:4px">Date</label>
                    <input type="date" id="epDateInput" value="${escHtml(dateVal)}" style="width:100%;padding:9px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box">
                </div>
                <div>
                    <label style="display:block;font-size:13px;font-weight:600;color:#666;margin-bottom:4px">Amount ($)</label>
                    <input type="number" id="epAmountInput" value="${amtVal}" step="0.01" min="0" placeholder="0.00" style="width:100%;padding:9px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box">
                </div>
            </div>
            <div id="epError" style="color:#e53e3e;font-size:13px;margin-top:8px;display:none"></div>
            <div style="display:flex;gap:12px;margin-top:24px;justify-content:flex-end">
                <button onclick="document.getElementById('editPaymentOverlay').remove()" style="padding:10px 20px;border:1px solid #ddd;background:#fff;border-radius:8px;cursor:pointer;font-size:14px">Cancel</button>
                <button id="${saveKey}" onclick="epSave('${bookingId}','${type}')" style="padding:10px 20px;background:#2d6a4f;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px">Save</button>
            </div>
        </div>`;

    document.body.appendChild(overlay);
}

window.epSave = async function(bookingId, type) {
    const isDeposit = type === 'deposit';
    const btn = document.getElementById(isDeposit ? 'epSaveDeposit' : 'epSaveFinal');
    const errEl = document.getElementById('epError');
    errEl.style.display = 'none';
    const dateVal = document.getElementById('epDateInput').value;
    const amtRaw  = document.getElementById('epAmountInput').value;
    const amount  = amtRaw !== '' ? parseFloat(amtRaw) : null;
    btn.textContent = 'Saving…'; btn.disabled = true;
    try {
        const data = isDeposit
            ? { depositDate: dateVal, ...(amount != null ? { depositAmount: amount } : {}) }
            : { finalPaymentDate: dateVal, ...(amount != null ? { finalPaymentAmount: amount } : {}) };
        await updateDoc(doc(db, 'bookings', bookingId), data);
        document.getElementById('editPaymentOverlay').remove();
    } catch(e) {
        errEl.textContent = 'Save failed: ' + e.message;
        errEl.style.display = '';
        btn.textContent = 'Save'; btn.disabled = false;
    }
};

// ─── RESTORE ──────────────────────────────────────────────
async function restoreBooking(bookingId) {
    await updateDoc(doc(db, 'bookings', bookingId), { status: 'pending' });
    openDetail(bookingId);
}

// ─── ADMIN TIP ────────────────────────────────────────────
async function saveAdminTip(bookingId) {
    const input = document.getElementById(`adminTipInput_${bookingId}`);
    const raw = input?.value;
    if (raw === '' || raw == null) return;
    const val = parseFloat(raw);
    if (isNaN(val) || val < 0) return;
    await updateDoc(doc(db, 'bookings', bookingId), { tip: val });
    openDetail(bookingId);
}

// ─── CLIENT LINKING ───────────────────────────────────────
async function addToClients(bookingId) {
    const b = allBookings.find(x => x.id === bookingId);
    if (!b) return;

    // Start with pets from the booking
    let pets = (b.pets || []).map(p => ({
        name: p.name || '', type: p.type || 'dog',
        photoUrl: p.photoUrl || '', breed: p.breed || '',
        gender: p.gender || '', weight: p.weight || '',
        birthDate: p.birthDate || '', spayedNeutered: p.spayedNeutered || '',
        careNotes: p.careNotes || ''
    }));

    // If booking has a linked uid, fetch the user's profile for the most up-to-date pet info
    if (b.clientId) {
        try {
            const userSnap = await getDoc(doc(db, 'users', b.clientId));
            if (userSnap.exists()) {
                const userPets = userSnap.data().pets || [];
                if (userPets.length > 0) pets = userPets;
            }
        } catch(e) { /* ignore — fall back to booking pets */ }
    }

    const data = {
        name: b.clientName || '',
        email: b.clientEmail || '',
        phone: b.clientPhone || '',
        pets,
        source: 'booking',
        updatedAt: serverTimestamp()
    };
    if (b.clientId) {
        data.uid = b.clientId;
        await setDoc(doc(db, 'clients', b.clientId), data, { merge: true });
    } else {
        await addDoc(collection(db, 'clients'), data);
    }
    openDetail(bookingId);
}

async function linkToAccount(bookingId) {
    const sel = document.getElementById(`linkClientSelect_${bookingId}`);
    const clientDocId = sel?.value;
    if (!clientDocId) return;
    await updateDoc(doc(db, 'bookings', bookingId), { clientId: clientDocId });
    openDetail(bookingId);
}

// ─── CLONE BOOKING ────────────────────────────────────────
function openCloneModal(bookingId) {
    const b = allBookings.find(x => x.id === bookingId);
    if (!b) return;

    const existing = document.getElementById('cloneBookingOverlay');
    if (existing) existing.remove();

    // Collect sorted original dates
    const origDates = b.dateTimes
        ? Object.keys(b.dateTimes).sort()
        : (b.dates || []).slice().sort();
    if (!origDates.length) { alert('No dates found on this booking.'); return; }

    const firstIso = origDates[0];
    // Default new start date: next week same weekday
    const firstDate = new Date(firstIso + 'T12:00:00');
    const nextStart = new Date(firstDate);
    nextStart.setDate(nextStart.getDate() + 7);
    const defaultStart = nextStart.toISOString().slice(0, 10);

    const overlay = document.createElement('div');
    overlay.id = 'cloneBookingOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = `
        <div style="background:#fffaf7;border-radius:16px;padding:32px;width:90%;max-width:460px;max-height:80vh;overflow-y:auto">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
                <h3 style="margin:0;font-size:18px;color:#3d2b1f">Clone Booking</h3>
                <button onclick="document.getElementById('cloneBookingOverlay').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#888;line-height:1">×</button>
            </div>
            <p style="font-size:13px;color:#7a4a38;margin:0 0 16px">Same service, same times — pick a new start date. All ${origDates.length} day${origDates.length>1?'s':''} will shift by the same number of days.</p>

            <div style="margin-bottom:20px">
                <label style="display:block;font-size:13px;font-weight:600;color:#3d2b1f;margin-bottom:6px">New start date <span style="font-weight:400;color:#7a4a38">(replaces ${fmtDateLabel(firstIso)})</span></label>
                <input type="date" id="cloneStartDate" value="${defaultStart}"
                    oninput="AdminBookings.previewCloneDates('${bookingId}')"
                    style="width:100%;padding:9px 12px;border:1.5px solid #edd5c8;border-radius:10px;font-size:14px;box-sizing:border-box">
            </div>

            <div id="cloneDatePreview" style="margin-bottom:20px"></div>

            <div id="cloneError" style="color:#e53e3e;font-size:13px;margin-bottom:8px;display:none"></div>
            <div style="display:flex;gap:12px;justify-content:flex-end">
                <button onclick="document.getElementById('cloneBookingOverlay').remove()" style="padding:10px 20px;border:1px solid #ddd;background:#fff;border-radius:8px;cursor:pointer;font-size:14px">Cancel</button>
                <button id="cloneSaveBtn" onclick="AdminBookings.saveCloneBooking('${bookingId}')" style="padding:10px 20px;background:#c4788a;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600">Create Copy</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    previewCloneDates(bookingId);
}

function fmtDateLabel(iso) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
}

function _shiftedDateTimes(b, offsetDays) {
    const result = {};
    const src = b.dateTimes || {};
    const origDates = Object.keys(src).sort();
    origDates.forEach(iso => {
        const d = new Date(iso + 'T12:00:00');
        d.setDate(d.getDate() + offsetDays);
        const newIso = d.toISOString().slice(0, 10);
        result[newIso] = src[iso] ? [...src[iso]] : [];
    });
    return result;
}

function _cloneOffset(bookingId) {
    const b = allBookings.find(x => x.id === bookingId);
    if (!b) return null;
    const origDates = b.dateTimes ? Object.keys(b.dateTimes).sort() : (b.dates||[]).slice().sort();
    if (!origDates.length) return null;
    const newStartVal = document.getElementById('cloneStartDate')?.value;
    if (!newStartVal) return null;
    const origFirst = new Date(origDates[0] + 'T12:00:00');
    const newFirst  = new Date(newStartVal + 'T12:00:00');
    return Math.round((newFirst - origFirst) / 86400000);
}

function previewCloneDates(bookingId) {
    const b = allBookings.find(x => x.id === bookingId);
    const preview = document.getElementById('cloneDatePreview');
    if (!b || !preview) return;
    const offset = _cloneOffset(bookingId);
    if (offset === null) { preview.innerHTML = ''; return; }

    const newDT = _shiftedDateTimes(b, offset);
    const sorted = Object.keys(newDT).sort();
    const rows = sorted.map(iso => {
        const slots = (newDT[iso] || []).filter(Boolean);
        const timesStr = slots.length ? slots.map(t => fmtSlot(t)).join(' · ') : 'TBD';
        return `<div style="padding:7px 0;border-bottom:1px solid #f0e8e0;font-size:13px">
            <span style="font-weight:600;color:#3d2b1f">${fmtDateLabel(iso)}</span>
            <span style="color:#7a4a38;margin-left:8px">${escHtml(timesStr)}</span>
        </div>`;
    }).join('');
    preview.innerHTML = `<div style="border:1.5px solid #edd5c8;border-radius:10px;padding:12px 14px;background:#fffdf8">
        <div style="font-size:12px;font-weight:700;color:#c4788a;letter-spacing:.05em;margin-bottom:8px">NEW DATES PREVIEW</div>
        ${rows}
    </div>`;
}

async function saveCloneBooking(bookingId) {
    const b = allBookings.find(x => x.id === bookingId);
    const errEl = document.getElementById('cloneError');
    const btn   = document.getElementById('cloneSaveBtn');
    if (!b) return;

    const offset = _cloneOffset(bookingId);
    if (offset === null || offset === 0) {
        errEl.textContent = 'Please pick a different start date.';
        errEl.style.display = '';
        return;
    }
    errEl.style.display = 'none';
    btn.disabled = true; btn.textContent = 'Creating…';

    try {
        const newDT = _shiftedDateTimes(b, offset);
        const sortedDates = Object.keys(newDT).sort();
        let datesText = '';
        sortedDates.forEach(iso => {
            const d = new Date(iso + 'T12:00:00');
            const label = d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
            const slots = (newDT[iso] || []).filter(Boolean);
            const timesLabel = slots.length ? slots.map(t => {
                const clean = t.replace(/\|\d+$/, '');
                if (clean.includes('~')) { const [s, e] = clean.split('~'); return `${fmt12(s)} – ${fmt12(e)}`; }
                return fmt12(clean);
            }).join(', ') : 'TBD';
            datesText += `  ${label}: ${timesLabel}\n`;
        });

        await addDoc(collection(db, 'bookings'), {
            clientName:  b.clientName  || '',
            clientPhone: b.clientPhone || '',
            clientEmail: b.clientEmail || '',
            clientId:    b.clientId    || null,
            service:     b.service     || 'Drop-In Visit',
            duration:    b.duration    || 30,
            dateTimes:   newDT,
            dates:       sortedDates,
            datesText,
            pets:        b.pets        || [],
            notes:       b.notes       || '',
            total:       b.total       || 0,
            isRover:     false,
            status:      'pending',
            adminAccepted: true,
            source:      'manual',
            ...(b.customBasePrice != null ? { customBasePrice: b.customBasePrice } : {}),
            ...(b.priceBreakdown  != null ? { priceBreakdown:  b.priceBreakdown  } : {}),
            createdAt: serverTimestamp()
        });
        document.getElementById('cloneBookingOverlay').remove();
    } catch(e) {
        errEl.textContent = 'Error: ' + e.message;
        errEl.style.display = '';
        btn.disabled = false; btn.textContent = 'Create Copy';
    }
}

// ─── EXPOSE ───────────────────────────────────────────────
window.AdminBookings = {
    init, setFilter, toggleHideRover, toggleCompletedSort, editVisitTime,
    onTvcDragStart, onTvcDragOver, onTvcDragEnter, onTvcDrop, onTvcDragEnd,
    openDetail, closeDetail,
    acceptBooking, rejectBooking, markCompleted,
    markDepositReceived, markPaidInFull, markInService, markRoverConfirmed,
    addAdjustment, removeAdjustment, toggleAdjVisits,
    deleteBooking, permanentlyDeleteBooking, sendAdminMessage, exportImage,
    openEditDatesModal, openEditPaymentModal,
    addToClients, linkToAccount, saveAdminTip,
    restoreBooking, setBookingSearch, filterByClient, clearClientFilter,
    openCloneModal, previewCloneDates, saveCloneBooking
};

window.openEditDatesModal = openEditDatesModal;
