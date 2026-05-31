import {
    db, collection, query, orderBy, onSnapshot,
    doc, updateDoc, addDoc, getDoc, deleteDoc, serverTimestamp
} from './firebase.js';

let bookingsUnsub = null;
let messagesUnsub = null;
let allBookings    = [];
let activeFilter   = 'all';
let activeBookingId = null;

const STATUS_LABELS = {
    pending:          'Pending',
    deposit_received: 'Reserved',
    paid:             'Confirmed',
    in_service:       'In Service',
    rejected:         'Declined',
    completed:        'Completed',
    confirmed:        'Confirmed'   // backward compat
};
const STATUS_COLORS = {
    pending:          'status-pending',
    deposit_received: 'status-deposit',
    paid:             'status-paid',
    in_service:       'status-in-service',
    rejected:         'status-rejected',
    completed:        'status-completed',
    confirmed:        'status-paid'  // backward compat
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
            const panel   = document.getElementById('adminBookingDetail');
            if (updated && panel && panel.style.display !== 'none') {
                renderDetail(updated, panel);
                loadAdminMessages(activeBookingId);
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
    document.querySelectorAll('.filter-chip').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    renderAdminBookings();
}

// ─── LIST ─────────────────────────────────────────────────
function renderAdminBookings() {
    const container = document.getElementById('adminBookingsList');
    if (!container) return;
    const ACTIVE_STATUSES = ['pending','deposit_received','paid','in_service','confirmed'];
    const filtered = activeFilter === 'all'
        ? allBookings.filter(b => ACTIVE_STATUSES.includes(b.status))
        : allBookings.filter(b => b.status === activeFilter);

    if (filtered.length === 0) {
        container.innerHTML = `<p class="empty-msg">No ${activeFilter === 'all' ? '' : activeFilter + ' '}bookings yet.</p>`;
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
    filtered.sort((a, b) => getFirstDate(a).localeCompare(getFirstDate(b)));

    // Build date groups
    const groups = {};
    const groupOrder = [];
    filtered.forEach(b => {
        const iso = getFirstDate(b);
        if (!groups[iso]) { groups[iso] = []; groupOrder.push(iso); }
        groups[iso].push(b);
    });

    container.innerHTML = '';
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
            const firstLine = b.datesText ? b.datesText.trim().split('\n')[0] : '—';
            const firstPet  = (b.pets || [])[0];
            const petPhoto  = firstPet?.photoUrl || '';
            const petName   = firstPet?.name || '';
            const petEmoji  = firstPet?.type === 'cat' ? '🐱' : '🐶';
            const avatarHtml = petPhoto
                ? `<img class="abc-pet-avatar" src="${escHtml(petPhoto)}" alt="${escHtml(petName)}">`
                : `<div class="abc-pet-avatar abc-pet-emoji">${petEmoji}</div>`;
            const card = document.createElement('div');
            card.className = 'admin-booking-card' + (b.id === activeBookingId ? ' active' : '');
            card.onclick = () => openDetail(b.id);
            card.innerHTML = `
                <div class="abc-layout">
                    <div class="abc-left">
                        ${avatarHtml}
                        <div class="abc-left-text">
                            <span class="abc-petname">${escHtml(petName || '—')}</span>
                            <span class="abc-ownername">${escHtml(b.clientName || '—')}</span>
                        </div>
                    </div>
                    <div class="abc-right">
                        <div class="abc-service">${escHtml(b.service || '')}</div>
                        <div class="abc-duration">${b.duration || 30} min</div>
                        <div style="margin-bottom:4px"><span class="status-badge ${STATUS_COLORS[b.status] || 'status-pending'}">${STATUS_LABELS[b.status] || 'Pending'}</span></div>
                        <div class="abc-dates">${escHtml(firstLine)}</div>
                        <div class="abc-price">$${b.total || 0} est.</div>
                    </div>
                </div>`;
            cardsEl.appendChild(card);
        });
    });
}

// ─── DETAIL ───────────────────────────────────────────────
function openDetail(bookingId) {
    activeBookingId = bookingId;
    document.querySelectorAll('.admin-booking-card').forEach(c => c.classList.remove('active'));
    const card = [...document.querySelectorAll('.admin-booking-card')]
        .find(c => c.querySelector('.abc-name') && c.onclick);
    renderAdminBookings(); // re-render to update active class

    const panel = document.getElementById('adminBookingDetail');
    panel.style.display = '';
    panel.innerHTML = '<div class="detail-loading">Loading...</div>';

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
    document.getElementById('adminBookingDetail').style.display = 'none';
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
    if (t.includes('~')) {
        const [s, e] = t.split('~');
        if (!e) return `Arrive ${fmt12(s)}`;
        const sH = Number(s.split(':')[0]);
        const eH = Number(e.split(':')[0]);
        const sMin = String(Number(s.split(':')[1])).padStart(2, '0');
        const sAmPm = sH >= 12 ? 'PM' : 'AM';
        const eFmt = fmt12(e);
        const sFmt = `${sH % 12 || 12}:${sMin}`;
        return sAmPm === (eH >= 12 ? 'PM' : 'AM')
            ? `Arrive ${sFmt} – ${eFmt}`
            : `Arrive ${sFmt} ${sAmPm} – ${eFmt}`;
    }
    return fmt12(t);
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

function renderPetsHtml(pets) {
    if (!pets || pets.length === 0) return '<p style="color:var(--brown-mid);padding:8px 0">No pets listed.</p>';
    const items = pets.map(p => {
        const emoji = p.type === 'cat' ? '🐱' : '🐶';
        const avatar = p.photoUrl
            ? `<img class="detail-pet-avatar" src="${escHtml(p.photoUrl)}" alt="${escHtml(p.name || '')}">`
            : `<div class="detail-pet-emoji">${emoji}</div>`;
        const metaParts = [
            p.gender,
            p.weight ? p.weight + ' lbs' : ''
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

function renderChargesHtml(b) {
    const pets = b.pets || [];
    const service = b.service || 'Drop-In Visit';
    const duration = parseInt(b.duration) || 30;
    const p = service === 'Dog Walking' ? PRICING.walking : PRICING.dropin;
    const is60 = duration === 60;
    const bookingDates = b.dates || Object.keys(b.dateTimes || {});
    const isHoliday = isHolidayBooking(bookingDates);
    const numVisits = getNumVisitsFromBooking(b);
    const adjs = b.adjustments || [];

    let petRows = '';
    let calcBase = 0;
    pets.forEach((pet, idx) => {
        let rate, label;
        if (idx === 0) {
            const baseRate = isHoliday ? p.holiday : ((service !== 'Dog Walking' && pet.type === 'cat') ? p.cat : p.base);
            rate = baseRate + (is60 ? p.addon60 : 0);
            label = service + (isHoliday ? ' · Holiday Rate' : '');
        } else {
            rate = pet.type === 'cat' ? (p.extraCat || p.extraDog) : p.extraDog;
            label = 'Additional ' + (pet.type || 'pet');
        }
        calcBase += rate * numVisits;
        petRows += `
            <div class="detail-charge-row">
                <div>
                    <div class="detail-charge-label">${escHtml(pet.name || '—')}</div>
                    <div class="detail-charge-sub">${escHtml(label)} · $${rate} × ${numVisits} visit${numVisits !== 1 ? 's' : ''}</div>
                </div>
                <div class="detail-charge-amount">$${rate * numVisits}</div>
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

function renderDetail(b, panel) {
    const isPending         = b.status === 'pending';
    const isAccepted        = isPending && !!b.adminAccepted;
    const isDepositReceived = b.status === 'deposit_received';
    const isPaid            = b.status === 'paid';
    const isInService       = b.status === 'in_service';
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
                <button class="detail-edit-btn" onclick="AdminCalendar.openEditBookingModal('${b.id}')" title="Edit booking">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="detail-export-btn" onclick="AdminBookings.exportImage('${b.id}')" title="Save as image">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
                <button class="detail-delete-btn" onclick="AdminBookings.deleteBooking('${b.id}','${escHtml(b.clientName||'this booking')}')" title="Delete booking">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                </button>
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
                ${numVisits} visit${numVisits !== 1 ? 's' : ''} · ${b.duration || 30} min each${petNames ? ' · ' + escHtml(petNames) : ''}
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

        <div class="detail-section">
            <div class="detail-section-label">Price Adjustments</div>
            ${renderAdjustmentsHtml(b)}
            <div class="adj-add-form">
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
            </div>
        </div>

        <div class="detail-section">
            <div class="detail-section-label">Contact</div>
            <div class="detail-row"><span>Name</span><span>${escHtml(b.clientName || '—')}</span></div>
            <div class="detail-row"><span>Phone</span><span>${escHtml(b.clientPhone || '—')}</span></div>
            <div class="detail-row"><span>Email</span><span>${escHtml(b.clientEmail || '—')}</span></div>
            ${b.notes ? `<div class="detail-row"><span>Notes</span><span>${escHtml(b.notes)}</span></div>` : ''}
        </div>

        </div>

        ${isPending && !isAccepted ? `
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
            <div class="deposit-action-wrap">
                <div class="deposit-action-label">Record deposit payment:</div>
                <div class="deposit-action-row">
                    <input type="date" id="depositDateInput" value="${todayISO}">
                    <input type="number" id="depositAmountInput" class="deposit-amount-input" placeholder="$ Amount" step="0.01" min="0">
                    <button class="admin-btn-deposit" onclick="AdminBookings.markDepositReceived('${b.id}')">
                        ✓ Deposit Received
                    </button>
                </div>
            </div>
            <button class="admin-btn-danger" onclick="AdminBookings.rejectBooking('${b.id}')">✕ Decline</button>
        </div>` : ''}
        ${isDepositReceived ? `
        <div class="detail-actions">
            <div class="payment-record">
                <div class="payment-record-row">
                    <span class="payment-record-label">Deposit received</span>
                    <span class="payment-record-val">${b.depositAmount != null ? '$' + b.depositAmount : '—'} · ${b.depositDate || '—'}</span>
                </div>
            </div>
            <div class="deposit-action-wrap">
                <div class="deposit-action-label">Record final payment:</div>
                <div class="deposit-action-row">
                    <input type="date" id="finalPayDateInput" value="${todayISO}">
                    <input type="number" id="finalPayAmountInput" class="deposit-amount-input" placeholder="$ Amount" step="0.01" min="0">
                    <button class="admin-btn-paid" onclick="AdminBookings.markPaidInFull('${b.id}')">
                        💚 Paid in Full
                    </button>
                </div>
            </div>
            <button class="admin-btn-in-service" onclick="AdminBookings.markInService('${b.id}')">▶ Mark In Service</button>
            <button class="admin-btn-secondary" onclick="AdminBookings.markCompleted('${b.id}')">Mark Completed</button>
            <button class="admin-btn-danger" onclick="AdminBookings.rejectBooking('${b.id}')">✕ Decline</button>
        </div>` : ''}
        ${isPaid ? `
        <div class="detail-actions">
            <div class="payment-record">
                <div class="payment-record-row">
                    <span class="payment-record-label">Deposit</span>
                    <span class="payment-record-val">${b.depositAmount != null ? '$' + b.depositAmount : '—'} · ${b.depositDate || '—'}</span>
                </div>
                <div class="payment-record-row">
                    <span class="payment-record-label">Final payment</span>
                    <span class="payment-record-val">${b.finalPaymentAmount != null ? '$' + b.finalPaymentAmount : '—'} · ${b.finalPaymentDate || '—'}</span>
                </div>
            </div>
            <div class="paid-full-notice">💚 Paid in Full</div>
            <button class="admin-btn-in-service" onclick="AdminBookings.markInService('${b.id}')">▶ Mark In Service</button>
            <button class="admin-btn-secondary" onclick="AdminBookings.markCompleted('${b.id}')">Mark Completed</button>
        </div>` : ''}
        ${isInService ? `
        <div class="detail-actions">
            <div class="paid-full-notice" style="color:#8e44ad">⚡ In Service</div>
            <button class="admin-btn-secondary" onclick="AdminBookings.markCompleted('${b.id}')">✓ Mark Completed</button>
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

function calcBaseTotal(b) {
    const pets = b.pets || [];
    if (pets.length === 0) return b.total || 0;
    const service = b.service || 'Drop-In Visit';
    const duration = parseInt(b.duration) || 30;
    const p = service === 'Dog Walking' ? PRICING.walking : PRICING.dropin;
    const is60 = duration === 60;
    const bookingDates = b.dates || Object.keys(b.dateTimes || {});
    const isHoliday = isHolidayBooking(bookingDates);
    const numVisits = getNumVisitsFromBooking(b);
    let total = 0;
    pets.forEach((pet, idx) => {
        let rate;
        if (idx === 0) {
            const baseRate = isHoliday ? p.holiday : ((service !== 'Dog Walking' && pet.type === 'cat') ? p.cat : p.base);
            rate = baseRate + (is60 ? p.addon60 : 0);
        } else {
            rate = pet.type === 'cat' ? (p.extraCat || p.extraDog) : p.extraDog;
        }
        total += rate * numVisits;
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
    if (!confirm(`Delete booking for ${clientName}?\n\nThis cannot be undone.`)) return;
    if (!confirm(`Are you sure? This booking will be permanently deleted.`)) return;
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

// ─── HELPERS ─────────────────────────────────────────────
function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── EXPORT IMAGE ─────────────────────────────────────────
async function exportImage(bookingId) {
    const target = document.getElementById('detail-export-content');
    if (!target || typeof html2canvas === 'undefined') return;
    const btn = document.querySelector('.detail-export-btn');
    const svgIcon = btn?.innerHTML;
    if (btn) { btn.textContent = '…'; btn.disabled = true; }
    // Temporarily pin badge styles so html2canvas renders text centered
    const badges = target.querySelectorAll('.status-badge');
    badges.forEach(badge => {
        const BADGE_H = 24;
        badge.style.cssText += `;display:inline-block!important;height:${BADGE_H}px!important;` +
            `line-height:${BADGE_H}px!important;padding:0 10px!important;` +
            `font-size:11px!important;box-sizing:border-box!important;`;
    });
    try {
        const w = target.scrollWidth;
        const canvas = await html2canvas(target, {
            backgroundColor: '#fffaf7',
            scale: window.devicePixelRatio || 2,
            width: w,
            windowWidth: w,
            useCORS: true,
            logging: false
        });
        const b = allBookings.find(x => x.id === bookingId);
        const name = (b?.clientName || 'booking').replace(/\s+/g, '-').toLowerCase();
        const filename = `${name}-${new Date().toISOString().slice(0,10)}.png`;

        canvas.toBlob(async blob => {
            const file = new File([blob], filename, { type: 'image/png' });
            if (navigator.canShare?.({ files: [file] })) {
                // iOS/Android: share sheet → user can save to Photos
                await navigator.share({ files: [file], title: filename });
            } else {
                // Desktop fallback: download link
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = filename;
                link.href = url;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
        }, 'image/png');
    } catch(e) {
        if (e.name !== 'AbortError') alert('Export failed: ' + e.message);
    } finally {
        // Restore badge styles
        badges.forEach(badge => { badge.style.cssText = badge.style.cssText
            .replace(/display:[^;]+!important;/g,'')
            .replace(/height:[^;]+!important;/g,'')
            .replace(/line-height:[^;]+!important;/g,'')
            .replace(/padding:[^;]+!important;/g,'')
            .replace(/font-size:[^;]+!important;/g,'')
            .replace(/box-sizing:[^;]+!important;/g,''); });
        if (btn) { btn.disabled = false; btn.innerHTML = svgIcon; }
    }
}

// ─── EXPOSE ───────────────────────────────────────────────
window.AdminBookings = {
    init, setFilter, openDetail, closeDetail,
    acceptBooking, rejectBooking, markCompleted,
    markDepositReceived, markPaidInFull, markInService,
    addAdjustment, removeAdjustment, toggleAdjVisits,
    deleteBooking, sendAdminMessage, exportImage
};
