import {
    db, collection, query, orderBy, onSnapshot,
    doc, updateDoc, addDoc, getDoc, serverTimestamp
} from './firebase.js';

let bookingsUnsub = null;
let messagesUnsub = null;
let allBookings    = [];
let activeFilter   = 'all';
let activeBookingId = null;

const STATUS_LABELS = {
    pending:   'Pending',
    confirmed: 'Confirmed',
    rejected:  'Declined',
    completed: 'Completed'
};
const STATUS_COLORS = {
    pending:   'status-pending',
    confirmed: 'status-confirmed',
    rejected:  'status-rejected',
    completed: 'status-completed'
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
            if (updated) refreshDetailStatus(updated.status);
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
    const filtered = activeFilter === 'all'
        ? allBookings
        : allBookings.filter(b => b.status === activeFilter);

    if (filtered.length === 0) {
        container.innerHTML = `<p class="empty-msg">No ${activeFilter === 'all' ? '' : activeFilter + ' '}bookings yet.</p>`;
        return;
    }
    container.innerHTML = '';
    filtered.forEach(b => {
        const card = document.createElement('div');
        card.className = 'admin-booking-card' + (b.id === activeBookingId ? ' active' : '');
        card.onclick = () => openDetail(b.id);
        const firstLine = b.datesText ? b.datesText.trim().split('\n')[0] : '—';
        const firstPet  = (b.pets || [])[0];
        const petPhoto  = firstPet?.photoUrl || '';
        const petName   = firstPet?.name || '';
        const petEmoji  = firstPet?.type === 'cat' ? '🐱' : '🐶';
        const avatarHtml = petPhoto
            ? `<img class="abc-pet-avatar" src="${escHtml(petPhoto)}" alt="${escHtml(petName)}">`
            : `<div class="abc-pet-avatar abc-pet-emoji">${petEmoji}</div>`;

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
                    <div class="abc-right-top">
                        <span class="abc-service">${escHtml(b.service || '')} · ${b.duration || 30} min</span>
                        <span class="status-badge ${STATUS_COLORS[b.status] || 'status-pending'}">${STATUS_LABELS[b.status] || 'Pending'}</span>
                    </div>
                    <div class="abc-dates">${escHtml(firstLine)}</div>
                    <div class="abc-price">$${b.total || 0} est.</div>
                </div>
            </div>
        `;
        container.appendChild(card);
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

function renderDetail(b, panel) {
    let petsHtml = '';
    (b.pets || []).forEach(p => {
        petsHtml += `<div class="detail-row"><span>${escHtml(p.name || '—')}</span><span>${escHtml(p.type || '')}${p.breed ? ' · ' + escHtml(p.breed) : ''}${p.age ? ', ' + escHtml(p.age) : ''}</span></div>`;
    });
    if (!petsHtml) petsHtml = '<div class="detail-row"><span>—</span></div>';

    const isPending   = b.status === 'pending';
    const isConfirmed = b.status === 'confirmed';

    panel.innerHTML = `
        <div class="detail-header">
            <div>
                <h3 class="detail-title">${escHtml(b.clientName || '—')}</h3>
                <span class="status-badge ${STATUS_COLORS[b.status] || 'status-pending'}" id="detailStatusBadge">${STATUS_LABELS[b.status] || 'Pending'}</span>
            </div>
            <button class="detail-close" onclick="AdminBookings.closeDetail()">×</button>
        </div>

        <div class="detail-section">
            <div class="detail-section-label">Service</div>
            <div class="detail-row"><span>${escHtml(b.service || '')} · ${b.duration || 30} min</span><span>$${b.total || 0} est.</span></div>
        </div>
        <div class="detail-section">
            <div class="detail-section-label">Dates</div>
            <pre class="detail-dates">${escHtml((b.datesText || '—').trim())}</pre>
        </div>
        <div class="detail-section">
            <div class="detail-section-label">Pets</div>
            ${petsHtml}
        </div>
        <div class="detail-section">
            <div class="detail-section-label">Contact</div>
            <div class="detail-row"><span>Name</span><span>${escHtml(b.clientName || '—')}</span></div>
            <div class="detail-row"><span>Phone</span><span>${escHtml(b.clientPhone || '—')}</span></div>
            <div class="detail-row"><span>Email</span><span>${escHtml(b.clientEmail || '—')}</span></div>
            ${b.notes ? `<div class="detail-row"><span>Notes</span><span>${escHtml(b.notes)}</span></div>` : ''}
        </div>

        ${isPending ? `
        <div class="detail-actions">
            <button class="admin-btn-primary" onclick="AdminBookings.acceptBooking('${b.id}','${escHtml(b.clientName||'')}',${b.total||0})">
                ✓ Accept Booking
            </button>
            <button class="admin-btn-danger" onclick="AdminBookings.rejectBooking('${b.id}')">
                ✕ Decline
            </button>
        </div>` : ''}
        ${isConfirmed ? `
        <div class="detail-actions">
            <button class="admin-btn-secondary" onclick="AdminBookings.markCompleted('${b.id}')">Mark Completed</button>
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
    if (!confirm(`Accept booking for ${clientName}?`)) return;
    await updateDoc(doc(db, 'bookings', bookingId), { status: 'confirmed' });
    // Send auto-message
    const deposit = Math.round(total / 2);
    await addDoc(collection(db, 'bookings', bookingId, 'messages'), {
        sender:     'owner',
        senderName: 'Wylie',
        text: `Great news! Your booking has been confirmed. Please send a $${deposit} deposit via Zelle to wyliesfurryfriendsllc@gmail.com to secure your spot. The remaining balance is due before the service begins. Looking forward to caring for your pet!`,
        createdAt:  serverTimestamp()
    });
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

// ─── EXPOSE ───────────────────────────────────────────────
window.AdminBookings = {
    init, setFilter, openDetail, closeDetail,
    acceptBooking, rejectBooking, markCompleted,
    sendAdminMessage
};
