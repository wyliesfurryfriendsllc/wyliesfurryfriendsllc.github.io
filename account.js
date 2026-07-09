import {
    db, auth,
    collection, addDoc, getDocs, doc, updateDoc, setDoc, getDoc,
    query, where, onSnapshot, orderBy, serverTimestamp,
    createUserWithEmailAndPassword, signInWithEmailAndPassword,
    signOut, onAuthStateChanged, updateProfile,
    GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail
} from './firebase.js';

const PET_ICON_DOG   = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.25 16.25h1.5L12 17z"/><path d="M16 14v.5"/><path d="M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444a11.702 11.702 0 0 0-.493-3.309"/><path d="M8 14v.5"/><path d="M8.5 8.5c-.384 1.05-1.083 2.028-2.344 2.5-1.931.722-3.576-.297-3.656-1-.113-.994 1.177-6.53 4-7 1.923-.321 3.651.845 3.651 2.235A7.497 7.497 0 0 1 14 5.277c0-1.39 1.844-2.598 3.767-2.277 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5"/></svg>`;
const PET_ICON_CAT   = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z"/><path d="M8 14v.5"/><path d="M16 14v.5"/><path d="M11.25 16.25h1.5L12 17l-.75-.75Z"/></svg>`;
const PET_ICON_OTHER = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 16a3 3 0 0 1 2.24 5"/><path d="M18 12h.01"/><path d="M18 21h-8a4 4 0 0 1-4-4 7 7 0 0 1 7-7h.2L9.6 6.4a1 1 0 1 1 2.8-2.8L15.8 7h.2c3.3 0 6 2.7 6 6v1a2 2 0 0 1-2 2h-1a3 3 0 0 0-3 3"/><path d="M20 8.54V4a2 2 0 1 0-4 0v3"/><path d="M7.612 12.524a3 3 0 1 0-1.6 4.3"/></svg>`;
const petIcon = t => t === 'cat' ? PET_ICON_CAT : t === 'other' ? PET_ICON_OTHER : PET_ICON_DOG;

let currentUser    = null;
let bookingsUnsub  = null;
let messagesUnsub  = null;
let activeBookingId = null;
let userPets       = [];
let _savedAddress  = '';
let allBookings    = [];
let acctFilter     = 'all';
let acctCalYear    = new Date().getFullYear();
let acctCalMonth   = new Date().getMonth();

// ─── AUTH STATE ──────────────────────────────────────────
onAuthStateChanged(auth, async user => {
    currentUser = user;
    if (user) {
        const userRef  = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        const profile  = userSnap.exists() ? userSnap.data() : {};
        if (!userSnap.exists()) {
            await setDoc(userRef, {
                name: user.displayName || '',
                email: user.email,
                phone: '',
                pets: [],
                createdAt: serverTimestamp()
            });
        }
        userPets = profile.pets || [];

        // Merge any admin-added pets from clients collection
        try {
            const clientSnap = await getDoc(doc(db, 'clients', user.uid));
            if (clientSnap.exists()) {
                const clientPets = clientSnap.data().pets || [];
                const known = new Set(userPets.map(p => (p.name || '').toLowerCase()));
                const extra = clientPets.filter(p => p.name && !known.has(p.name.toLowerCase()));
                if (extra.length > 0) {
                    userPets = [...userPets, ...extra];
                    await updateDoc(userRef, { pets: userPets });
                }
            }
        } catch (_) {}

        showAccountUI(user, profile);
        loadMyBookings(user);
        syncToClients(user, { ...profile, pets: userPets }).catch(() => {});
    } else {
        showAuthUI();
    }
});

// ─── AUTH PANEL ──────────────────────────────────────────
function showAuthUI() {
    document.getElementById('authSection').style.display    = '';
    document.getElementById('accountSection').style.display = 'none';
    if (bookingsUnsub) { bookingsUnsub(); bookingsUnsub = null; }
    if (messagesUnsub) { messagesUnsub(); messagesUnsub = null; }
    activeBookingId = null;
}

function showAccountUI(user, profile) {
    const params = new URLSearchParams(window.location.search);
    const ret = params.get('return');
    if (ret === 'booking') { window.location.href = 'booking.html'; return; }
    document.getElementById('authSection').style.display    = 'none';
    document.getElementById('accountSection').style.display = '';
    const name = profile.name || user.displayName || user.email.split('@')[0];
    document.getElementById('accountName').textContent   = name;
    document.getElementById('accountEmail').textContent  = user.email;
    document.getElementById('accountAvatar').textContent = name.charAt(0).toUpperCase();
    document.getElementById('profileName').value          = profile.name || user.displayName || '';
    document.getElementById('profilePhone').value         = profile.phone || '';
    document.getElementById('profileAddress').value       = profile.address || '';
    _savedAddress = profile.address || '';
    document.getElementById('profileEmailDisplay').textContent = user.email;
    renderPets();
}

function switchAuthMode(mode) {
    document.getElementById('loginForm').style.display    = mode === 'login'    ? '' : 'none';
    document.getElementById('registerForm').style.display = mode === 'register' ? '' : 'none';
    document.getElementById('authTabLogin').classList.toggle('active', mode === 'login');
    document.getElementById('authTabRegister').classList.toggle('active', mode === 'register');
    document.getElementById('authError').textContent = '';
}

function showForgotPassword(show = true) {
    document.getElementById('loginForm').style.display       = show ? 'none' : '';
    document.getElementById('forgotPasswordForm').style.display = show ? '' : 'none';
    document.getElementById('authError').textContent = '';
    const msg = document.getElementById('forgotMsg');
    if (msg) { msg.style.display = 'none'; msg.textContent = ''; }
}

async function doForgotPassword() {
    const email = document.getElementById('forgotEmail').value.trim();
    const msg   = document.getElementById('forgotMsg');
    if (!email) { msg.textContent = 'Please enter your email.'; msg.style.color = '#c0392b'; msg.style.display = ''; return; }
    try {
        await sendPasswordResetEmail(auth, email);
        msg.textContent = 'Reset email sent! Check your inbox.';
        msg.style.color = '#2e7d32';
        msg.style.display = '';
    } catch (err) {
        msg.textContent = getFriendlyError(err.code);
        msg.style.color = '#c0392b';
        msg.style.display = '';
    }
}

async function doLogin() {
    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn      = document.getElementById('loginBtn');
    if (!email || !password) return;
    btn.disabled    = true;
    btn.textContent = 'Signing in...';
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        document.getElementById('authError').textContent = getFriendlyError(err.code);
        btn.disabled    = false;
        btn.textContent = 'Sign In';
    }
}

async function doRegister() {
    const name     = document.getElementById('registerName').value.trim();
    const phone    = document.getElementById('registerPhone')?.value.trim() || '';
    const address  = document.getElementById('registerAddress')?.value.trim() || '';
    const email    = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const btn      = document.getElementById('registerBtn');
    if (!name || !email || !password) return;
    if (!phone)   { document.getElementById('authError').textContent = 'Phone number is required.'; return; }
    if (!address) { document.getElementById('authError').textContent = 'Home address is required.'; return; }
    btn.disabled    = true;
    btn.textContent = 'Creating account...';
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
        await setDoc(doc(db, 'users', cred.user.uid), {
            name, email, phone, address, pets: [], createdAt: serverTimestamp()
        });
        syncToClients(cred.user, { name, email, phone, address, pets: [] }).catch(() => {});
    } catch (err) {
        document.getElementById('authError').textContent = getFriendlyError(err.code);
        btn.disabled    = false;
        btn.textContent = 'Create Account';
    }
}

async function doGoogleLogin() {
    const btn = document.getElementById('googleLoginBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }
    try {
        const provider = new GoogleAuthProvider();
        const cred = await signInWithPopup(auth, provider);
        const userRef = doc(db, 'users', cred.user.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
            await setDoc(userRef, {
                name: cred.user.displayName || '',
                email: cred.user.email,
                phone: '', pets: [],
                createdAt: serverTimestamp()
            });
            syncToClients(cred.user, { name: cred.user.displayName || '', email: cred.user.email, phone: '', pets: [] }).catch(() => {});
        }
    } catch (err) {
        console.error('Google login error:', err.code, err.message);
        if (err.code !== 'auth/popup-closed-by-user') {
            document.getElementById('authError').textContent = `Google sign-in failed: ${err.code || err.message}`;
        }
        if (btn) { btn.disabled = false; btn.textContent = 'Continue with Google'; }
    }
}

async function doSignOut() {
    await signOut(auth);
}

function getFriendlyError(code) {
    const msgs = {
        'auth/user-not-found':       'No account found with this email.',
        'auth/wrong-password':       'Incorrect password.',
        'auth/invalid-email':        'Please enter a valid email address.',
        'auth/email-already-in-use': 'An account with this email already exists.',
        'auth/weak-password':        'Password must be at least 6 characters.',
        'auth/invalid-credential':   'Incorrect email or password.',
        'auth/too-many-requests':    'Too many attempts. Please try again later.'
    };
    return msgs[code] || 'Something went wrong. Please try again.';
}

// ─── TABS ─────────────────────────────────────────────────
function showTab(tab) {
    ['bookings', 'calendar', 'pets', 'profile'].forEach(t => {
        const tabEl = document.getElementById(`tab${cap(t)}`);
        const btnEl = document.getElementById(`navBtn${cap(t)}`);
        if (tabEl) tabEl.style.display = t === tab ? '' : 'none';
        if (btnEl) btnEl.classList.toggle('active', t === tab);
    });
    if (tab === 'calendar') renderAccountCal();
}

// ─── MY BOOKINGS ─────────────────────────────────────────
function loadMyBookings(user) {
    if (bookingsUnsub) bookingsUnsub();
    let byId = [], byEmail = [];
    const merge = () => {
        const map = new Map();
        [...byId, ...byEmail].forEach(b => map.set(b.id, b));
        allBookings = [...map.values()];
        renderBookingsList(allBookings);
        if (activeBookingId) {
            const updated = allBookings.find(b => b.id === activeBookingId);
            if (updated) {
                const panel = document.getElementById('bookingDetail');
                if (panel && panel.style.display !== 'none') renderBookingDetail(updated, panel);
            }
        }
        const dayPanel = document.getElementById('acctDayPanel');
        if (dayPanel && dayPanel.dataset.iso) showCalDay(dayPanel.dataset.iso);
        renderAccountCal();
    };
    const handleErr = err => {
        console.error('Bookings load error:', err);
        document.getElementById('bookingsList').innerHTML =
            '<p class="empty-msg">Unable to load bookings. Please try again later.</p>';
    };
    const unsubId = onSnapshot(
        query(collection(db, 'bookings'), where('clientId', '==', user.uid)),
        snap => { byId = snap.docs.map(d => ({ id: d.id, ...d.data() })); merge(); },
        handleErr
    );
    let unsubEmail = () => {};
    if (user.email) {
        unsubEmail = onSnapshot(
            query(collection(db, 'bookings'), where('clientEmail', '==', user.email)),
            snap => { byEmail = snap.docs.map(d => ({ id: d.id, ...d.data() })); merge(); },
            handleErr
        );
    }
    bookingsUnsub = () => { unsubId(); unsubEmail(); };
}

function setBookingFilter(f) {
    acctFilter = f;
    document.querySelectorAll('.acct-filter-chip').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === f);
    });
    renderBookingsList(allBookings);
}

function parseBDates(b) {
    if (b.dates && Array.isArray(b.dates)) return b.dates;
    const result = new Set();
    (b.datesText || '').split('\n').forEach(line => {
        const t = line.trim();
        if (!t) return;
        const range = t.match(/^([A-Za-z]+ \d+,\s*\d{4})\s*[–-]\s*([A-Za-z]+ \d+,\s*\d{4})/);
        if (range) {
            const s = new Date(range[1]), e = new Date(range[2]);
            for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1))
                result.add(isoDate(d));
            return;
        }
        const single = t.match(/^([A-Za-z]+ \d+,\s*\d{4})/);
        if (single) { const d = new Date(single[1]); if (!isNaN(d)) result.add(isoDate(d)); }
    });
    return [...result];
}

function isoDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getDaysUntil(b) {
    const dates = parseBDates(b).sort();
    if (!dates.length) return null;
    const first = new Date(dates[0] + 'T12:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.ceil((first - today) / 86400000);
}

const STATUS_LABELS = {
    pending:          'Pending',
    deposit_received: 'Reserved',
    paid:             'Confirmed',
    in_service:       'In Service',
    confirmed:        'Confirmed',
    rejected:         'Declined',
    completed:        'Completed'
};
const STATUS_COLORS = {
    pending:          'status-pending',
    deposit_received: 'status-deposit',
    paid:             'status-paid',
    in_service:       'status-in-service',
    confirmed:        'status-paid',
    rejected:         'status-rejected',
    completed:        'status-completed'
};

function renderBookingsList(bookings) {
    const container = document.getElementById('bookingsList');

    // Rescue detail panel before clearing the list — on mobile it gets moved
    // inside the list container, so innerHTML='' would delete it from the DOM.
    const detailPanel  = document.getElementById('bookingDetail');
    const bookingsPanel = document.querySelector('.bookings-panel');
    if (detailPanel && bookingsPanel && container.contains(detailPanel)) {
        bookingsPanel.appendChild(detailPanel);
    }

    const todayISO = isoDate(new Date());

    let filtered = acctFilter === 'all' ? bookings : bookings.filter(b => b.status === acctFilter);

    // Sort: upcoming first (by earliest date), then past (most recent first)
    filtered = [...filtered].sort((a, b) => {
        const aDates = parseBDates(a).sort();
        const bDates = parseBDates(b).sort();
        const aFirst = aDates[0] || '';
        const bFirst = bDates[0] || '';
        const aFuture = aFirst >= todayISO;
        const bFuture = bFirst >= todayISO;
        if (aFuture && bFuture) return aFirst < bFirst ? -1 : 1;
        if (!aFuture && !bFuture) return aFirst > bFirst ? -1 : 1;
        return aFuture ? -1 : 1;
    });

    if (filtered.length === 0) {
        container.innerHTML = '<p class="empty-msg">No bookings yet. <a href="booking.html">Book a visit</a> to get started!</p>';
        return;
    }
    container.innerHTML = '';

    // Upcoming banner
    const ACTIVE_STATUSES = new Set(['pending', 'deposit_received', 'paid', 'confirmed', 'in_service']);
    const upcoming = filtered.filter(b => {
        const d = getDaysUntil(b);
        return d !== null && d >= 0 && d <= 3 && ACTIVE_STATUSES.has(b.status);
    });
    upcoming.forEach(b => {
        const d = getDaysUntil(b);
        const label = d === 0 ? 'Today!' : `In ${d} day${d !== 1 ? 's' : ''}`;
        const dateRange = fmtDateRangeStr(b);
        const needsPayment = b.status === 'deposit_received';
        const card = document.createElement('div');
        card.className = 'upcoming-card';
        card.onclick = () => openBookingDetail(b.id);
        card.innerHTML = `
            <div class="upcoming-card-row">
                <span class="upcoming-banner-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6"/><path d="m22 6-3-3"/><path d="M6.38 18.7 4 21"/><path d="M17.64 18.67 20 21"/></svg></span>
                <div>
                    <strong>${escHtml(b.service || 'Booking')} · ${label}</strong>
                    <span>${escHtml(dateRange)}</span>
                    ${needsPayment ? `<span class="upcoming-payment-due">Final payment due before service starts</span>` : ''}
                </div>
            </div>`;
        container.appendChild(card);
    });

    filtered.forEach(b => {
        const card = document.createElement('div');
        card.className   = 'booking-card' + (b.id === activeBookingId ? ' active' : '');
        card.dataset.bid = b.id;
        card.onclick     = () => openBookingDetail(b.id);
        const dateRange = fmtDateRangeStr(b);

        const pets = b.pets || [];
        const firstPet = pets[0] || {};
        const emoji = petIcon(firstPet.type);
        const petNamesStr = pets.length === 0 ? '—' : pets.map(p => p.name || '?').join(', ');

        const daysUntil = getDaysUntil(b);
        const showChip = daysUntil !== null && daysUntil >= 0 && daysUntil <= 3 && ACTIVE_STATUSES.has(b.status);
        const chipLabel = daysUntil === 0 ? 'Today!' : `Starts in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`;
        const needsDeposit = (b.status === 'pending' && b.adminAccepted) || b.status === 'confirmed';
        const needsReview  = b.status === 'completed' && !b.hasReview;

        card.innerHTML = `
            <div class="bc-card-inner">
                <div class="bc-left">
                    <div class="bc-avatar-wrap-lg">
                        ${firstPet.photoUrl ? `<img class="bc-avatar-lg" src="${escHtml(firstPet.photoUrl)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : ''}
                        <div class="bc-emoji-lg"${firstPet.photoUrl ? ' style="display:none"' : ''}>${emoji}</div>
                    </div>
                    <div class="bc-pet-names">${escHtml(petNamesStr)}</div>
                </div>
                <div class="bc-right">
                    <div class="bc-svc-name">${escHtml(b.service || '—')}</div>
                    <div class="bc-duration">${fmtDuration(b.duration)}</div>
                    <span class="status-badge ${STATUS_COLORS[b.status] || 'status-pending'}">${STATUS_LABELS[b.status] || 'Pending'}</span>
                    ${needsDeposit ? `<div class="bc-deposit-chip">Deposit Required</div>` : ''}
                    ${needsReview  ? `<div class="bc-review-chip">Leave a Review</div>` : ''}
                    ${showChip ? `<div class="bc-upcoming-chip"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6"/><path d="m22 6-3-3"/><path d="M6.38 18.7 4 21"/><path d="M17.64 18.67 20 21"/></svg> ${chipLabel}</div>` : ''}
                    <div class="bc-date-line">${escHtml(dateRange)}</div>
                    <div class="bc-total-line">$${b.finalTotal != null ? b.finalTotal : (b.total || 0)} est.</div>
                </div>
            </div>
        `;
        container.appendChild(card);
    });

    // Re-position detail panel after the active card on mobile
    if (window.innerWidth <= 1100 && activeBookingId && detailPanel && detailPanel.style.display !== 'none') {
        const activeCard = container.querySelector(`.booking-card[data-bid="${activeBookingId}"]`);
        if (activeCard) activeCard.after(detailPanel);
    }
}

function openBookingDetail(bookingId) {
    activeBookingId = bookingId;
    document.querySelectorAll('.booking-card').forEach(c =>
        c.classList.toggle('active', c.dataset.bid === bookingId)
    );
    const panel = document.getElementById('bookingDetail');
    panel.style.display = '';
    panel.innerHTML     = '<div class="detail-loading">Loading...</div>';

    // On narrow screens, move panel to appear right after the clicked card
    if (window.innerWidth <= 1100) {
        const clickedCard = document.querySelector(`.booking-card[data-bid="${bookingId}"]`);
        if (clickedCard) clickedCard.after(panel);
    }

    getDoc(doc(db, 'bookings', bookingId)).then(snap => {
        if (!snap.exists()) { panel.innerHTML = '<p>Booking not found.</p>'; return; }
        const b = { id: snap.id, ...snap.data() };
        renderBookingDetail(b, panel);
        loadMessages(bookingId);
        if (b.status === 'completed') loadReviewStatus(bookingId);
    });
}

function closeBookingDetail() {
    activeBookingId = null;
    if (messagesUnsub) { messagesUnsub(); messagesUnsub = null; }
    const panel = document.getElementById('bookingDetail');
    panel.style.display = 'none';
    // Restore panel to its original position in .bookings-panel
    const bookingsPanel = document.querySelector('.bookings-panel');
    if (bookingsPanel && panel.parentElement !== bookingsPanel) {
        bookingsPanel.appendChild(panel);
    }
    document.querySelectorAll('.booking-card').forEach(c => c.classList.remove('active'));
}

function buildDatesText(b) {
    if (b.dateTimes && typeof b.dateTimes === 'object') {
        const sorted = Object.keys(b.dateTimes).sort();
        return sorted.map(dateStr => {
            const d = new Date(dateStr + 'T12:00:00');
            const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const times = (b.dateTimes[dateStr] || []).map(t => fmtSlotAcc(t)).join(', ') || '—';
            return `${label}: ${times}`;
        }).join('\n');
    }
    // Fallback: resolve "Same as Day 1" in datesText
    const lines = (b.datesText || '').split('\n').map(l => l.trim()).filter(Boolean);
    let day1Times = null;
    return lines.map(line => {
        if (line.includes('Same as Day 1')) {
            const datePart = line.split(':')[0];
            return `${datePart}: ${day1Times || '—'}`;
        }
        const m = line.match(/:\s*(.+)$/);
        if (m && day1Times === null) day1Times = m[1].trim();
        return line;
    }).join('\n');
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
    return (dates || []).some(iso => HOLIDAY_RANGES.some(([s, e]) => iso >= s && iso <= e));
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
        for (const slots of Object.values(b.dateTimes))
            for (const slot of (slots || []).filter(Boolean))
                if (/\|60$/.test(slot)) num60++; else num30++;
    } else {
        num30 = b.priceBreakdown?.num30 || 0;
        num60 = b.priceBreakdown?.num60 || 0;
    }
    return { num30, num60 };
}

function buildChargesHtml(b) {
    const pets    = b.pets || [];
    const adjs    = b.adjustments || [];
    const service = b.service || 'Drop-In Visit';
    const durStr  = String(b.duration || '30');
    const isCombo = durStr.includes('&') || durStr.toLowerCase().includes('combo');
    const p       = service === 'Dog Walking' ? PRICING.walking : PRICING.dropin;
    const is60    = !isCombo && parseInt(durStr) === 60;
    const bookingDates = b.dates || Object.keys(b.dateTimes || {});
    const isHoliday    = isHolidayBooking(bookingDates);
    const numVisits    = getNumVisitsFromBooking(b);
    const { num30, num60 } = isCombo ? _getComboSlotCounts(b) : { num30: 0, num60: 0 };

    let petHtml = '';
    let calcBase = 0;

    pets.forEach((pet, idx) => {
        if (idx === 0) {
            const baseRate = b.customBasePrice != null
                ? b.customBasePrice
                : (isHoliday ? p.holiday : (service !== 'Dog Walking' && pet.type === 'cat' ? p.cat : p.base));
            const rateLabel = service + (b.customBasePrice != null ? ' · Custom Rate' : isHoliday ? ' · Holiday Rate' : '');
            petHtml += `<div class="charge-pet-label">${escHtml(pet.name || '—')}</div>`;
            if (isCombo) {
                const totalVisits = num30 + num60;
                const petTotal = baseRate * totalVisits + p.addon60 * num60;
                calcBase += petTotal;
                petHtml += `<div class="detail-row charge-item"><span>${escHtml(rateLabel)} · $${baseRate} × ${totalVisits} visit${totalVisits !== 1 ? 's' : ''}</span><span>$${baseRate * totalVisits}</span></div>`;
                if (num60 > 0) {
                    petHtml += `<div class="detail-row charge-item"><span>60-min rate · $${p.addon60} × ${num60} visit${num60 !== 1 ? 's' : ''}</span><span>$${p.addon60 * num60}</span></div>`;
                }
            } else {
                const rate = baseRate + (is60 ? p.addon60 : 0);
                const petTotal = rate * numVisits;
                calcBase += petTotal;
                petHtml += `<div class="detail-row charge-item"><span>${escHtml(rateLabel)} · $${rate} × ${numVisits} visit${numVisits !== 1 ? 's' : ''}</span><span>$${petTotal}</span></div>`;
            }
        } else {
            const totalV = isCombo ? (num30 + num60) : numVisits;
            const rate = pet.type === 'cat' ? (PRICING.dropin.extraCat || PRICING.dropin.extraDog) : PRICING.dropin.extraDog;
            const petTotal = rate * totalV;
            calcBase += petTotal;
            petHtml += `<div class="charge-pet-label">${escHtml(pet.name || '—')}</div>`;
            petHtml += `<div class="detail-row charge-item"><span>Additional ${escHtml(pet.type || 'pet')} · $${rate} × ${totalV} visit${totalV !== 1 ? 's' : ''}</span><span>$${petTotal}</span></div>`;
        }
    });

    const baseTotal = pets.length > 0 ? calcBase : (b.total || 0);

    let adjHtml = '';
    let adjTotal = 0;
    adjs.forEach(a => {
        const v      = a.type === 'per_visit' ? (a.visits || numVisits) : 1;
        const adjAmt = a.amount * v;
        adjTotal += adjAmt;
        const sign   = adjAmt >= 0 ? `+$${adjAmt}` : `-$${Math.abs(adjAmt)}`;
        const vLabel = a.type === 'per_visit' ? ` · $${a.amount} × ${v} visit${v !== 1 ? 's' : ''}` : '';
        const cls    = adjAmt >= 0 ? 'charge-adj-pos' : 'charge-adj-neg';
        adjHtml += `<div class="detail-row charge-adj-item"><span>${escHtml(a.name)}${vLabel}</span><span class="${cls}">${sign}</span></div>`;
    });

    const hasAdj     = adjs.length > 0;
    const finalTotal = pets.length > 0
        ? baseTotal + adjTotal
        : (b.finalTotal != null ? b.finalTotal : (b.total || 0));

    let html = petHtml;
    if (hasAdj) {
        html += `<div class="detail-row charge-sub-total"><span>Base Total</span><span>$${baseTotal}</span></div>`;
        html += adjHtml;
    }
    html += `<div class="detail-row charge-total"><span>${hasAdj ? 'Final Total' : 'Total'}</span><span>$${finalTotal}</span></div>`;
    return html;
}

function renderBookingDetail(b, panel) {

    panel.innerHTML = `
        <div class="detail-header">
            <div>
                <h3 class="detail-title">${escHtml(b.service || '—')} · ${fmtDuration(b.duration)}</h3>
                <span class="status-badge ${STATUS_COLORS[b.status] || 'status-pending'}">${STATUS_LABELS[b.status] || 'Pending'}</span>
            </div>
            <button class="detail-close" onclick="closeBookingDetail()">×</button>
        </div>
        <div class="detail-section">
            <div class="detail-section-label">Dates &amp; Times</div>
            ${buildScheduleHtml(b)}
        </div>
        <div class="detail-section">
            <div class="detail-section-label">Services &amp; Charges</div>
            ${buildChargesHtml(b)}
        </div>
        ${b.notes ? `<div class="detail-section"><div class="detail-section-label">Notes</div><p class="detail-notes">${escHtml(b.notes)}</p></div>` : ''}
        ${(b.status === 'pending' && b.adminAccepted) || b.status === 'confirmed' ? `
        <div class="detail-section detail-payment-notice">
            <div class="detail-section-label">Deposit Required</div>
            <p>Your booking has been accepted!</p>
            <p>Please send a <strong>$${Math.round((b.finalTotal || b.total || 0) / 2)} deposit</strong> via Zelle to <strong>wyliesfurryfriendsllc@gmail.com</strong> to secure your spot.</p>
            <p>The remaining balance is due before the service begins.</p>
            <details class="detail-deposit-policy">
                <summary>Deposit Policy</summary>
                <div class="detail-deposit-policy-body">
                    <p>50% of the booking total is required as a deposit to reserve your time slot.</p>
                    <ul>
                        <li>Cancel <strong>within 3 days</strong>: deposit is non-refundable</li>
                        <li>Cancel <strong>within 7 days</strong>: 50% of deposit refunded</li>
                        <li>Cancel <strong>more than 7 days</strong> out: full deposit refunded</li>
                    </ul>
                </div>
            </details>
        </div>` : ''}
        ${b.status === 'deposit_received' ? `
        <div class="detail-section detail-payment-notice detail-payment-reserved">
            <div class="detail-section-label">Spot Reserved 🐾</div>
            <p>Your deposit has been received${b.depositDate ? ' on ' + new Date(b.depositDate + 'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : ''}.</p>
            <p>Your spot is reserved!</p>
            <p>The remaining balance of <strong>$${Math.round((b.finalTotal || b.total || 0) / 2)}</strong> is due before the service begins.</p>
            <details class="detail-deposit-policy">
                <summary>Deposit Policy</summary>
                <div class="detail-deposit-policy-body">
                    <p>50% of the booking total is required as a deposit to reserve your time slot.</p>
                    <ul>
                        <li>Cancel <strong>within 3 days</strong>: deposit is non-refundable</li>
                        <li>Cancel <strong>within 7 days</strong>: 50% of deposit refunded</li>
                        <li>Cancel <strong>more than 7 days</strong> out: full deposit refunded</li>
                    </ul>
                </div>
            </details>
        </div>` : ''}
        ${b.status === 'paid' ? `
        <div class="detail-section detail-payment-notice detail-payment-paid">
            <div class="detail-section-label">Payment Complete 💚</div>
            <p>Full payment received. Thank you! We look forward to caring for your pet 🐾</p>
            <details class="detail-deposit-policy">
                <summary>Deposit Policy</summary>
                <div class="detail-deposit-policy-body">
                    <p>50% of the booking total is required as a deposit to reserve your time slot.</p>
                    <ul>
                        <li>Cancel <strong>within 3 days</strong>: deposit is non-refundable</li>
                        <li>Cancel <strong>within 7 days</strong>: 50% of deposit refunded</li>
                        <li>Cancel <strong>more than 7 days</strong> out: full deposit refunded</li>
                    </ul>
                </div>
            </details>
        </div>` : ''}
        ${b.status === 'completed' ? (() => {
            const bTotal = b.finalTotal != null ? b.finalTotal : (b.total || 0);
            const tipPcts = [10, 15, 20];
            const tipPillsHtml = tipPcts.map(pct => {
                const amt = Math.round(bTotal * pct / 100 * 100) / 100;
                return `<button class="tip-pill" data-val="${amt}" data-pct="${pct}" onclick="selectTip('${b.id}',${amt},this)"><span class="tip-pill-amt">$${amt}</span><span class="tip-pill-pct">${pct}%</span></button>`;
            }).join('') +
            `<button class="tip-pill" data-val="custom" onclick="selectTip('${b.id}','custom',this)">Custom</button>` +
            `<button class="tip-pill tip-pill-skip" data-val="0" onclick="selectTip('${b.id}',0,this)">No tip</button>`;
            const alreadyDone = b.hasReview && b.tip != null && b.privateFeedback;
            if (alreadyDone) return `
        <div class="detail-section feedback-section">
            <p class="tip-thanks">Thank you for your review, tip, and feedback! 🐾</p>
        </div>`;
            return `
        <div class="detail-section feedback-wrap" id="feedbackWrap_${b.id}">
            <div class="detail-section-label">Leave a Review</div>
            <div id="reviewFormWrap_${b.id}">
                ${b.hasReview ? `<p class="tip-thanks" style="margin-bottom:12px">Review submitted!</p>` : `
                <div class="review-star-picker" id="reviewStars_${b.id}" data-rating="0">
                    ${[1,2,3,4,5].map(n=>`<span class="review-star" data-val="${n}" onclick="setReviewStar('${b.id}',${n})">★</span>`).join('')}
                </div>
                <textarea class="review-textarea" id="reviewText_${b.id}" placeholder="Share your experience..."></textarea>`}
            </div>
            <div class="detail-section-label tip-section-label">Leave a Tip</div>
            <div id="tipSection_${b.id}">
                ${b.tip ? `<p class="tip-thanks" style="margin-bottom:12px">Tip: $${b.tip} — Thank you! 🐾<br><span class="tip-zelle-hint">We truly appreciate your generosity.<br>All tips are sent via Zelle to our account —<br><span class="tip-zelle-email" onclick="copyZelleEmail(this)" title="Tap to copy">wyliesfurryfriendsllc@gmail.com</span></span></p>` : `
                <p class="tip-note">100% goes to your pet's caregiver.</p>
                <div class="tip-pills" id="tipPills_${b.id}">${tipPillsHtml}</div>
                <div id="tipCustomWrap_${b.id}" style="display:none;margin-top:10px">
                    <input type="number" class="tip-custom-input" id="tipCustomAmt_${b.id}" placeholder="Enter amount ($)" min="1" step="1">
                </div>
                <div id="tipZelle_${b.id}" class="tip-zelle-notice" style="display:none">
                    We truly appreciate your generosity! ❤️<br>All tips are sent via Zelle to our account —<br>
                    <span class="tip-zelle-email" onclick="copyZelleEmail(this)" title="Tap to copy">wyliesfurryfriendsllc@gmail.com</span>
                    <button class="tip-sent-btn" id="tipSentBtn_${b.id}" onclick="markTipSent('${b.id}',this)">I've sent the tip</button>
                </div>`}
            </div>
            ${!(b.hasReview && b.tip != null) ? `<button class="review-submit-btn feedback-submit-btn" id="submitAllBtn_${b.id}" onclick="submitAll('${b.id}')">Submit</button>` : ''}
        </div>`;
        })() : ''}
        <div class="detail-section">
            <div class="detail-section-label">Messages with Wylie</div>
            <div class="messages-thread" id="messagesThread"></div>
            <div class="message-input-wrap">
                <input type="text" class="message-input" id="messageInput" placeholder="Type a message..." onkeydown="if(event.key==='Enter')sendClientMessage()">
                <button class="message-send-btn" onclick="sendClientMessage()">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
            </div>
        </div>
    `;
}

// ─── MESSAGES ─────────────────────────────────────────────
function loadMessages(bookingId) {
    if (messagesUnsub) messagesUnsub();
    const q = query(
        collection(db, 'bookings', bookingId, 'messages'),
        orderBy('createdAt', 'asc')
    );
    messagesUnsub = onSnapshot(q, snap => {
        renderMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
}

function renderMessages(messages) {
    const thread = document.getElementById('messagesThread');
    if (!thread) return;
    if (messages.length === 0) {
        thread.innerHTML = '<p class="msg-empty">No messages yet. Send a message to Wylie!</p>';
        return;
    }
    thread.innerHTML = '';
    messages.forEach(msg => {
        const isOwn = msg.sender === 'client';
        const time  = msg.createdAt?.toDate
            ? msg.createdAt.toDate().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
            : '';
        const div = document.createElement('div');
        div.className = 'msg-bubble-wrap' + (isOwn ? ' msg-own' : '');
        div.innerHTML = `
            <div class="msg-bubble">${escHtml(msg.text)}</div>
            <div class="msg-meta">${isOwn ? 'You' : escHtml(msg.senderName || 'Wylie')} · ${time}</div>
        `;
        thread.appendChild(div);
    });
    thread.scrollTop = thread.scrollHeight;
}

async function sendClientMessage() {
    if (!activeBookingId || !currentUser) return;
    const input = document.getElementById('messageInput');
    const text  = input.value.trim();
    if (!text) return;
    input.value = '';
    const name = currentUser.displayName || currentUser.email.split('@')[0];
    await addDoc(collection(db, 'bookings', activeBookingId, 'messages'), {
        sender:     'client',
        senderName: name,
        text,
        createdAt:  serverTimestamp()
    });
}

// ─── PETS ─────────────────────────────────────────────────
function renderPets() {
    const grid = document.getElementById('petsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    if (userPets.length === 0) {
        grid.innerHTML = '<p class="empty-msg">No pets added yet.</p>';
        return;
    }
    userPets.forEach((pet, i) => {
        const emoji = petIcon(pet.type);
        const card  = document.createElement('div');
        card.className = 'pet-card';

        const ageStr = petAgeStr(pet);
        const metaParts = [cap(pet.sex || ''), ageStr, pet.weight ? `${pet.weight} lbs` : ''].filter(Boolean);

        const friendly = [];
        if (pet.friendlyDogs === 'yes')      friendly.push('🐶 Dogs');
        if (pet.friendlyCats === 'yes')      friendly.push('🐱 Cats');
        if (pet.friendlyChildren === 'yes')  friendly.push('👶 Children');

        card.innerHTML = `
            <div class="pet-card-photo-wrap">
                ${pet.photoUrl
                    ? `<img src="${escHtml(pet.photoUrl)}" alt="${escHtml(pet.name)}" class="pet-card-photo-img" onerror="this.style.display='none';document.getElementById('pfe${i}').style.display='flex'">`
                    : ''}
                <div id="pfe${i}" class="pet-card-emoji-big" style="${pet.photoUrl ? 'display:none' : ''}">${emoji}</div>
            </div>
            <div class="pet-card-body">
                <div class="pet-card-name">${escHtml(pet.name || '—')}</div>
                ${pet.breed ? `<div class="pet-card-breed">${escHtml(pet.breed)}</div>` : ''}
                ${metaParts.length ? `<div class="pet-card-meta">${metaParts.join(' · ')}</div>` : ''}
                ${pet.spayedNeutered === 'yes' ? `<span class="pet-card-tag">Spayed/Neutered</span>` : ''}
                ${friendly.length ? `<div class="pet-card-friendly">${friendly.map(f=>`<span>${f}</span>`).join('')}</div>` : ''}
                <div class="pet-card-actions">
                    <button class="pet-edit-btn" onclick="editPet(${i})">Edit</button>
                    <button class="pet-remove-btn" onclick="deletePet(${i})">Remove</button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// ─── PILL HELPERS ─────────────────────────────────────────
function togglePill(btn, mode) {
    if (mode === 'single') {
        btn.closest('.pet-pills, .pet-type-cards').querySelectorAll('.pet-pill, .pet-type-card').forEach(p => p.classList.remove('active'));
    }
    btn.classList.toggle('active');
}

function getPillValue(groupId) {
    const el = document.querySelector(`#${groupId} .pet-pill.active, #${groupId} .pet-type-card.active`);
    return el ? el.dataset.value : '';
}

function getPillValues(groupId) {
    return [...document.querySelectorAll(`#${groupId} .pet-pill.active`)].map(p => p.dataset.value);
}

function setPill(groupId, value) {
    document.querySelectorAll(`#${groupId} .pet-pill, #${groupId} .pet-type-card`).forEach(p => {
        p.classList.toggle('active', p.dataset.value === value);
    });
}

function setPills(groupId, values) {
    document.querySelectorAll(`#${groupId} .pet-pill`).forEach(p => {
        p.classList.toggle('active', (values || []).includes(p.dataset.value));
    });
}

function compressImage(file, maxW = 500, q = 0.85) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                const s = Math.min(1, maxW / img.width);
                const c = document.createElement('canvas');
                c.width = img.width * s; c.height = img.height * s;
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                resolve(c.toDataURL('image/jpeg', q));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

async function handlePetPhotoUpload(input) {
    const file = input.files[0];
    if (!file) return;
    input.value = '';
    const base64 = await window.openCropModal(file);
    if (!base64) return;
    document.getElementById('petModalPhotoUrl').value = base64;
    updatePhotoPreview();
}

function updatePhotoPreview() {
    const url     = document.getElementById('petModalPhotoUrl').value.trim();
    const preview = document.getElementById('petModalPhotoPreview');
    const holder  = document.getElementById('petModalPhotoPlaceholder');
    if (url) {
        preview.src            = url;
        preview.style.display  = '';
        holder.style.display   = 'none';
    } else {
        preview.style.display  = 'none';
        holder.style.display   = '';
    }
}

// ─── PET BIRTHDAY CALENDAR ───────────────────────────────
let petBdayCalYear, petBdayCalMonth;

function switchPetAgeMode(mode) {
    document.getElementById('petAgeBirthdayWrap').style.display = mode === 'exact' ? '' : 'none';
    document.getElementById('petAgeYMWrap').style.display       = mode === 'yearmonth' ? '' : 'none';
}

function populatePetBdayYears() {
    const sel = document.getElementById('petBdayYearSel');
    if (sel.options.length > 0) return;
    const now = new Date().getFullYear();
    for (let y = now; y >= 1980; y--) sel.add(new Option(y, y));
}

function onPetBdayYearChange() {
    petBdayCalYear = parseInt(document.getElementById('petBdayYearSel').value);
    renderPetBdayCal();
}

function onPetBdayMonthChange() {
    petBdayCalMonth = parseInt(document.getElementById('petBdayMonthSel').value);
    renderPetBdayCal();
}

function openPetBdayCal() {
    const now = new Date();
    if (petBdayCalYear === undefined) {
        petBdayCalYear  = now.getFullYear();
        petBdayCalMonth = now.getMonth();
    }
    populatePetBdayYears();
    renderPetBdayCal();
    document.getElementById('petBdayCalWrap').style.display = 'block';
}

function closePetBdayCal() {
    document.getElementById('petBdayCalWrap').style.display = 'none';
    const val = document.getElementById('petModalBirthday').value;
    document.getElementById('petBdayText').textContent = val ? fmtPetDate(val) : 'Choose birthday...';
}

function changePetBdayMonth(dir) {
    petBdayCalMonth += dir;
    if (petBdayCalMonth < 0)  { petBdayCalMonth = 11; petBdayCalYear--; }
    if (petBdayCalMonth > 11) { petBdayCalMonth = 0;  petBdayCalYear++; }
    renderPetBdayCal();
}

function renderPetBdayCal() {
    document.getElementById('petBdayYearSel').value  = petBdayCalYear;
    document.getElementById('petBdayMonthSel').value = petBdayCalMonth;
    const today    = new Date(); today.setHours(0,0,0,0);
    const firstDay = new Date(petBdayCalYear, petBdayCalMonth, 1).getDay();
    const daysIn   = new Date(petBdayCalYear, petBdayCalMonth + 1, 0).getDate();
    const grid     = document.getElementById('petBdayDays');
    const selVal   = document.getElementById('petModalBirthday').value;
    grid.innerHTML = '';
    for (let i = 0; i < firstDay; i++) {
        const blank = document.createElement('div'); blank.className = 'cal-day cal-blank'; grid.appendChild(blank);
    }
    for (let d = 1; d <= daysIn; d++) {
        const dateStr = `${petBdayCalYear}-${String(petBdayCalMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isFuture = new Date(petBdayCalYear, petBdayCalMonth, d) > today;
        const cell = document.createElement('div');
        cell.className = 'cal-day' + (isFuture ? ' cal-past' : '') + (dateStr === selVal ? ' cal-selected' : '');
        cell.textContent = d;
        if (!isFuture) cell.onclick = () => {
            document.getElementById('petModalBirthday').value = dateStr;
            renderPetBdayCal();
        };
        grid.appendChild(cell);
    }
}

function fmtPetDate(d) {
    if (!d) return '—';
    const [y, mo, day] = d.split('-');
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${m[parseInt(mo)-1]} ${parseInt(day)}, ${y}`;
}

function petAgeStr(pet) {
    if (pet.birthday) {
        const bd = new Date(pet.birthday + 'T00:00:00');
        const days = (new Date() - bd) / 86400000;
        const yr = Math.floor(days / 365.25);
        const mo = Math.floor((days % 365.25) / 30.44);
        if (yr === 0) return mo + 'mo';
        return mo ? `${yr}yr ${mo}mo` : `${yr}yr`;
    }
    if (pet.ageYear) {
        const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return pet.ageMonth ? `b. ${MO[pet.ageMonth-1]} ${pet.ageYear}` : `b. ${pet.ageYear}`;
    }
    return [pet.ageYears ? pet.ageYears+'yr' : '', pet.ageMonths ? pet.ageMonths+'mo' : ''].filter(Boolean).join(' ');
}

function resetPetModal() {
    ['petModalName','petModalPhotoUrl','petModalWeight','petModalBirthday',
     'petModalAgeYear','petModalBreed','petModalAdoptionDate',
     'petModalAbout','petModalCareNotes','petModalVetInfo'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const monthEl = document.getElementById('petModalAgeMonth');
    if (monthEl) monthEl.value = '';
    document.querySelectorAll('#petModal .pet-pill, #petModal .pet-type-card').forEach(p => p.classList.remove('active'));
    const dogBtn = document.querySelector('#petTypeGroup [data-value="dog"]');
    if (dogBtn) dogBtn.classList.add('active');
    // reset age mode to exact
    const exactRadio = document.querySelector('input[name="petAgeMode"][value="exact"]');
    if (exactRadio) { exactRadio.checked = true; switchPetAgeMode('exact'); }
    document.getElementById('petBdayText').textContent = 'Choose birthday...';
    petBdayCalYear = undefined;
    updatePhotoPreview();
}

function openAddPetModal() {
    document.getElementById('petModalTitle').textContent = 'Add a Pet';
    document.getElementById('petModalIdx').value = '-1';
    resetPetModal();
    document.getElementById('petModal').style.display = '';
}

function editPet(idx) {
    const pet = userPets[idx];
    if (!pet) return;
    document.getElementById('petModalTitle').textContent = 'Edit Pet';
    document.getElementById('petModalIdx').value = idx;

    document.getElementById('petModalName').value         = pet.name     || '';
    document.getElementById('petModalPhotoUrl').value     = pet.photoUrl || '';
    document.getElementById('petModalWeight').value       = pet.weight   || '';
    document.getElementById('petModalBreed').value        = pet.breed    || '';

    // Age — populate based on stored format
    if (pet.birthday) {
        document.querySelector('input[name="petAgeMode"][value="exact"]').checked = true;
        switchPetAgeMode('exact');
        document.getElementById('petModalBirthday').value = pet.birthday;
        document.getElementById('petBdayText').textContent = fmtPetDate(pet.birthday);
        const bd = new Date(pet.birthday + 'T00:00:00');
        petBdayCalYear  = bd.getFullYear();
        petBdayCalMonth = bd.getMonth();
    } else if (pet.ageYear) {
        document.querySelector('input[name="petAgeMode"][value="yearmonth"]').checked = true;
        switchPetAgeMode('yearmonth');
        document.getElementById('petModalAgeYear').value  = pet.ageYear  || '';
        document.getElementById('petModalAgeMonth').value = pet.ageMonth || '';
    } else {
        // backward compat: old ageYears/ageMonths → show in yearmonth mode
        document.querySelector('input[name="petAgeMode"][value="yearmonth"]').checked = true;
        switchPetAgeMode('yearmonth');
        document.getElementById('petModalAgeYear').value  = pet.ageYears  || '';
        document.getElementById('petModalAgeMonth').value = '';
    }
    document.getElementById('petModalAdoptionDate').value = pet.adoptionDate || '';
    document.getElementById('petModalAbout').value        = pet.about        || '';
    document.getElementById('petModalCareNotes').value    = pet.careNotes    || '';
    document.getElementById('petModalVetInfo').value      = pet.vetInfo      || '';

    setPill('petTypeGroup',             pet.type             || 'dog');
    setPill('petSexGroup',              pet.sex              || '');
    setPill('petSpayedGroup',           pet.spayedNeutered   || '');
    setPill('petMicrochipGroup',        pet.microchipped     || '');
    setPill('petHouseTrainedGroup',     pet.houseTrained     || '');
    setPill('petFriendlyChildrenGroup', pet.friendlyChildren || '');
    setPill('petFriendlyDogsGroup',     pet.friendlyDogs     || '');
    setPill('petFriendlyCatsGroup',     pet.friendlyCats     || '');
    setPill('petPottyGroup',            pet.pottyBreak       || '');
    setPill('petEnergyGroup',           pet.energyLevel      || '');
    setPill('petFeedingGroup',          pet.feedingSchedule  || '');
    setPill('petAloneGroup',            pet.aloneTime        || '');
    setPills('petMedGroup',             pet.medication       || []);

    updatePhotoPreview();
    document.getElementById('petModal').style.display = '';
}

async function savePetModal() {
    if (!currentUser) return;
    const idx = parseInt(document.getElementById('petModalIdx').value);
    const ageMode    = document.querySelector('input[name="petAgeMode"]:checked')?.value || 'exact';
    let birthday     = ageMode === 'exact' ? (document.getElementById('petModalBirthday').value || '') : '';
    const ageYear    = ageMode === 'yearmonth' ? (document.getElementById('petModalAgeYear').value.trim() || '') : '';
    const ageMonth   = ageMode === 'yearmonth' ? (document.getElementById('petModalAgeMonth').value || '') : '';
    if (!birthday && (ageYear || ageMonth)) {
        const d = new Date();
        d.setFullYear(d.getFullYear() - (parseInt(ageYear) || 0));
        d.setMonth(d.getMonth() - (parseInt(ageMonth) || 0));
        birthday = d.toISOString().slice(0, 10);
    }
    const sex        = getPillValue('petSexGroup');
    const type       = getPillValue('petTypeGroup') || 'dog';

    const pet = {
        name:             document.getElementById('petModalName').value.trim(),
        photoUrl:         document.getElementById('petModalPhotoUrl').value.trim(),
        type,
        weight:           document.getElementById('petModalWeight').value.trim(),
        birthday, ageYear, ageMonth,
        sex,
        breed:            document.getElementById('petModalBreed').value.trim(),
        spayedNeutered:   getPillValue('petSpayedGroup'),
        microchipped:     getPillValue('petMicrochipGroup'),
        houseTrained:     getPillValue('petHouseTrainedGroup'),
        friendlyChildren: getPillValue('petFriendlyChildrenGroup'),
        friendlyDogs:     getPillValue('petFriendlyDogsGroup'),
        friendlyCats:     getPillValue('petFriendlyCatsGroup'),
        adoptionDate:     document.getElementById('petModalAdoptionDate').value,
        about:            document.getElementById('petModalAbout').value.trim(),
        pottyBreak:       getPillValue('petPottyGroup'),
        energyLevel:      getPillValue('petEnergyGroup'),
        feedingSchedule:  getPillValue('petFeedingGroup'),
        aloneTime:        getPillValue('petAloneGroup'),
        medication:       getPillValues('petMedGroup'),
        careNotes:        document.getElementById('petModalCareNotes').value.trim(),
        vetInfo:          document.getElementById('petModalVetInfo').value.trim(),
    };
    if (!pet.name) { alert("Please enter your pet's name."); return; }
    if (!birthday && !ageYear) { alert('Please enter your pet\'s birthday or birth year.'); return; }
    if (!sex) { alert('Please select your pet\'s sex.'); return; }
    if (!pet.spayedNeutered) { alert('Please indicate if your pet is spayed/neutered.'); return; }
    if (idx === -1) { userPets.push(pet); } else { userPets[idx] = pet; }
    await updateDoc(doc(db, 'users', currentUser.uid), { pets: userPets });
    await syncToClients(currentUser, { name: currentUser.displayName || '', email: currentUser.email, phone: '', pets: userPets });
    closePetModal();
    renderPets();
}

async function deletePet(idx) {
    if (!confirm('Remove this pet?') || !currentUser) return;
    userPets.splice(idx, 1);
    await updateDoc(doc(db, 'users', currentUser.uid), { pets: userPets });
    await syncToClients(currentUser, { name: currentUser.displayName || '', email: currentUser.email, phone: '', pets: userPets });
    renderPets();
}

function closePetModal() {
    document.getElementById('petModal').style.display = 'none';
}

// ─── ADDRESS AUTOCOMPLETE ────────────────────────────────
let _profileAddrTimer = null;
function _localAddrMatch(q, saved) {
    if (!saved) return false;
    const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const words  = saved.toLowerCase().split(/[\s,]+/).filter(Boolean);
    return tokens.every(tok => words.some(w => w.startsWith(tok)));
}
function _renderAddrDropdown(dropdown, items) {
    if (!items.length) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = '';
    items.forEach(addr => {
        const div = document.createElement('div');
        div.className = 'addr-option';
        div.textContent = addr;
        div.addEventListener('mousedown', e => { e.preventDefault(); pickProfileAddress(addr); });
        dropdown.appendChild(div);
    });
    dropdown.style.display = '';
}
function searchProfileAddress(q) {
    clearTimeout(_profileAddrTimer);
    const dropdown = document.getElementById('profileAddrDropdown');
    if (!q) { dropdown.style.display = 'none'; return; }

    const localMatches = _localAddrMatch(q, _savedAddress) ? [_savedAddress] : [];

    if (q.length < 3) {
        _renderAddrDropdown(dropdown, localMatches);
        return;
    }

    _profileAddrTimer = setTimeout(async () => {
        try {
            const viewbox = '-88.4,41.6,-87.9,41.7';
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=us&limit=7&viewbox=${viewbox}&bounded=0&q=${encodeURIComponent(q)}`,
                { headers: { 'Accept-Language': 'en' } }
            );
            const data = await res.json();
            data.sort((a, b) => {
                const aIL = (a.address?.state || '').toLowerCase().includes('illinois') ? 0 : 1;
                const bIL = (b.address?.state || '').toLowerCase().includes('illinois') ? 0 : 1;
                return aIL - bIL;
            });
            const remote = data.map(_fmtProfileAddr).filter(Boolean);
            const all = [...localMatches, ...remote.filter(r => r !== _savedAddress)];
            _renderAddrDropdown(dropdown, all);
        } catch { _renderAddrDropdown(dropdown, localMatches); }
    }, 350);
}
function _fmtProfileAddr(r) {
    const a = r.address || {};
    const street = [a.house_number, a.road].filter(Boolean).join(' ');
    const city   = a.city || a.town || a.village || a.suburb || '';
    const state  = a.state || '';
    const zip    = a.postcode || '';
    return [street, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}
function pickProfileAddress(addr) {
    document.getElementById('profileAddress').value = addr;
    document.getElementById('profileAddrDropdown').style.display = 'none';
}
document.addEventListener('click', e => {
    if (!e.target.closest('.addr-wrap')) {
        const d = document.getElementById('profileAddrDropdown');
        if (d) d.style.display = 'none';
    }
});

// ─── PROFILE ─────────────────────────────────────────────
async function saveProfile() {
    if (!currentUser) return;
    const name    = document.getElementById('profileName').value.trim();
    const phone   = document.getElementById('profilePhone').value.trim();
    const address = document.getElementById('profileAddress').value.trim();
    const btn   = document.getElementById('saveProfileBtn');
    btn.disabled    = true;
    btn.textContent = 'Saving...';
    try {
        await updateDoc(doc(db, 'users', currentUser.uid), { name, phone, address });
        _savedAddress = address;
        if (name) await updateProfile(currentUser, { displayName: name });
        await syncToClients(currentUser, { name, phone, address, email: currentUser.email, pets: userPets });
        document.getElementById('accountName').textContent   = name || currentUser.email.split('@')[0];
        document.getElementById('accountAvatar').textContent = (name || currentUser.email).charAt(0).toUpperCase();
        const statusEl = document.getElementById('profileSaveStatus');
        statusEl.style.display = '';
        setTimeout(() => statusEl.style.display = 'none', 3000);
    } catch {
        alert('Failed to save. Please try again.');
    }
    btn.disabled    = false;
    btn.textContent = 'Save Changes';
}

// ─── SYNC TO ADMIN CLIENTS ───────────────────────────────
async function syncToClients(user, profile) {
    const updateData = {
        name:      profile.name || user.displayName || '',
        email:     user.email,
        phone:     profile.phone   || '',
        address:   profile.address || '',
        uid:       user.uid,
        source:    'account',
        updatedAt: serverTimestamp()
    };
    const profilePets = profile.pets || [];
    if (profilePets.length > 0) {
        updateData.pets = profilePets.map(p => ({
            name:           p.name           || '',
            type:           p.type           || 'dog',
            photoUrl:       p.photoUrl       || '',
            breed:          p.breed          || '',
            weight:         p.weight         || '',
            sex:            p.sex            || '',
            spayedNeutered: p.spayedNeutered || '',
            microchipped:   p.microchipped   || '',
            notes:          p.careNotes      || p.notes || '',
            birthDate:      p.birthday       || p.birthDate  || '',
            ageYears:       p.ageYear        || p.ageYears   || '',
            ageMonths:      p.ageMonth       || p.ageMonths  || '',
        }));
    }
    await setDoc(doc(db, 'clients', user.uid), updateData, { merge: true });
}

// ─── ACCOUNT CALENDAR ─────────────────────────────────────
function renderAccountCal() {
    const grid = document.getElementById('acctCalGrid');
    const label = document.getElementById('acctCalMonthLabel');
    if (!grid || !label) return;

    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    label.textContent = `${months[acctCalMonth]} ${acctCalYear}`;

    // build date→bookings map
    const dateMap = new Map();
    allBookings.forEach(b => {
        if (b.status === 'rejected') return;
        parseBDates(b).forEach(iso => {
            if (!dateMap.has(iso)) dateMap.set(iso, []);
            dateMap.get(iso).push(b);
        });
    });

    const todayISO = isoDate(new Date());
    const firstDay = new Date(acctCalYear, acctCalMonth, 1).getDay();
    const daysInMonth = new Date(acctCalYear, acctCalMonth + 1, 0).getDate();

    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    let html = dayNames.map(d => `<div class="acct-cal-dow">${d}</div>`).join('');
    for (let i = 0; i < firstDay; i++) html += `<div class="acct-cal-cell acct-cal-empty"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
        const iso = `${acctCalYear}-${String(acctCalMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const bks = dateMap.get(iso) || [];
        const isToday = iso === todayISO;
        html += `<div class="acct-cal-cell${isToday ? ' acct-cal-today' : ''}${bks.length ? ' acct-cal-has-bk' : ''}" onclick="showCalDay('${iso}')">
            <span class="acct-cal-day${isToday ? ' acct-cal-today-num' : ''}">${d}</span>
            ${bks.length ? `<span class="acct-cal-dot">${bks.length}</span>` : ''}
        </div>`;
    }
    grid.innerHTML = html;
}

function acctCalPrev() {
    acctCalMonth--;
    if (acctCalMonth < 0) { acctCalMonth = 11; acctCalYear--; }
    renderAccountCal();
}

function acctCalNext() {
    acctCalMonth++;
    if (acctCalMonth > 11) { acctCalMonth = 0; acctCalYear++; }
    renderAccountCal();
}

function showCalDay(iso) {
    const panel = document.getElementById('acctDayPanel');
    if (!panel) return;
    panel.dataset.iso = iso;

    const d = new Date(iso + 'T12:00:00');
    const dateLabel = d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });

    const bks = allBookings.filter(b => {
        if (b.status === 'rejected') return false;
        return parseBDates(b).includes(iso);
    });

    if (bks.length === 0) {
        panel.innerHTML = `<div class="acct-day-header"><span class="acct-day-date">${escHtml(dateLabel)}</span></div><p class="empty-msg" style="padding:16px 0">No bookings this day.</p>`;
        return;
    }

    // Build flat list: one entry per time slot
    const entries = [];
    bks.forEach(b => {
        const pets = b.pets || [];
        const avatars = pets.slice(0,4).map((p, i) =>
            p.photoUrl
                ? `<img class="cday-pet-avatar" src="${escHtml(p.photoUrl)}" alt="${escHtml(p.name||'')}" style="z-index:${4-i}">`
                : `<div class="cday-pet-avatar cday-pet-emoji" style="z-index:${4-i}">${petIcon(p.type)}</div>`
        ).join('');
        const petNames = pets.map(p => escHtml(p.name||'?')).join(', ');
        const svcLabel = escHtml(b.service||'Visit') + (petNames ? ': ' + petNames : '');

        const rawSlots = (b.dateTimes?.[iso] || []).slice().sort();
        if (rawSlots.length) {
            rawSlots.forEach(t => {
                const [hh, mm] = t.split('~')[0].split(':').map(Number);
                entries.push({ sortKey: hh * 60 + (mm||0), timeLabel: fmtSlotAcc(t), svcLabel, avatars, id: b.id });
            });
        } else {
            const fallback = extractTimesFromText(b.datesText, iso);
            fallback.forEach(t => {
                const sortKey = parse12hMin(t);
                entries.push({ sortKey, timeLabel: t, svcLabel, avatars, id: b.id });
            });
        }
    });

    entries.sort((a, b) => a.sortKey - b.sortKey);

    const items = entries.map(e => `
        <div class="acct-day-item" onclick="showTab('bookings');openBookingDetail('${e.id}')">
            <div class="acct-day-item-left">
                <div class="acct-day-item-time">${e.timeLabel}</div>
                <div class="acct-day-item-service">${e.svcLabel}</div>
            </div>
            <div class="cday-avatars">${e.avatars}</div>
        </div>`).join('');

    panel.innerHTML = `
        <div class="acct-day-header">
            <span class="acct-day-date">${escHtml(dateLabel)}</span>
            <span class="acct-day-count">${entries.length} visit${entries.length!==1?'s':''}</span>
        </div>
        ${items || '<p class="empty-msg" style="padding:16px 0">No visits this day.</p>'}`;
}

function fmtSlotAcc(t) {
    if (!t) return 'TBD';
    const durMatch = t.match(/\|(\d+)$/);
    const durLabel = durMatch ? ` (${durMatch[1]} min)` : '';
    const clean = t.replace(/\|\d+$/, '');
    if (clean.includes('~')) {
        const [s, e] = clean.split('~');
        if (!e) return `Arrive ${fmt12Acc(s)}${durLabel}`;
        const sH = Number(s.split(':')[0]);
        const eH = Number(e.split(':')[0]);
        const sMin = String(Number(s.split(':')[1])).padStart(2, '0');
        const sAmPm = sH >= 12 ? 'PM' : 'AM';
        const eFmt = fmt12Acc(e);
        const sFmt = `${sH % 12 || 12}:${sMin}`;
        return (sAmPm === (eH >= 12 ? 'PM' : 'AM')
            ? `Arrive ${sFmt} – ${eFmt}`
            : `Arrive ${sFmt} ${sAmPm} – ${eFmt}`) + durLabel;
    }
    return fmt12Acc(clean) + durLabel;
}

function fmt12Acc(t) {
    if (!t) return 'TBD';
    const parts = t.split(':');
    const h = Number(parts[0]), m = Number(parts[1]);
    if (isNaN(h) || isNaN(m)) return t;
    return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;
}

function buildScheduleHtml(b) {
    if (b.dateTimes && Object.keys(b.dateTimes).length > 0) {
        return Object.keys(b.dateTimes).sort().map(iso => {
            const d = new Date(iso + 'T12:00:00');
            const dateLabel = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
            const slots = [...(b.dateTimes[iso] || [])].filter(Boolean).sort();
            const timesHtml = slots.length
                ? `<div class="detail-sched-times-row">${slots.map(t => `<span class="detail-sched-time">${escHtml(fmtSlotAcc(t))}</span>`).join('')}</div>`
                : '<div class="detail-sched-times-row"><span class="detail-sched-time">TBD</span></div>';
            return `<div class="detail-sched-block"><div class="detail-sched-date">${escHtml(dateLabel)}</div>${timesHtml}</div>`;
        }).join('');
    }
    return `<pre class="detail-dates">${escHtml(buildDatesText(b).split('\n').map(l => l.trim()).filter(Boolean).join('\n'))}</pre>`;
}

function fmtDateRangeStr(b) {
    const dates = parseBDates(b).sort();
    if (!dates.length) return '—';
    const first = new Date(dates[0] + 'T12:00:00');
    const last  = new Date(dates[dates.length - 1] + 'T12:00:00');
    const opts  = { month: 'short', day: 'numeric' };
    if (dates.length === 1) return first.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
    const fStr = first.toLocaleDateString('en-US', opts);
    const lStr = last.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
    return `${fStr} – ${lStr}`;
}

function parse12hMin(t) {
    const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!m) return 0;
    let h = parseInt(m[1]), min = parseInt(m[2]);
    const isPM = m[3].toUpperCase() === 'PM';
    if (isPM && h !== 12) h += 12;
    if (!isPM && h === 12) h = 0;
    return h * 60 + min;
}

function extractTimesFromText(datesText, iso) {
    const lines = (datesText || '').split('\n').map(l => l.trim()).filter(Boolean);
    const d = new Date(iso + 'T12:00:00');
    const label = d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
    const line = lines.find(l => l.includes(label));
    if (!line) return ['TBD'];
    const m = line.match(/:\s*(.+)$/);
    if (!m) return ['TBD'];
    const val = m[1].trim();
    if (val === 'Same as Day 1') {
        const first = lines[0];
        const fm = first?.match(/:\s*(.+)$/);
        if (!fm) return ['TBD'];
        return fm[1].trim().split(',').map(s => s.trim()).filter(Boolean);
    }
    return val.split(',').map(s => s.trim()).filter(Boolean);
}

// ─── HELPERS ─────────────────────────────────────────────
function fmtDuration(d) {
    const s = String(d || 30);
    return s.includes('min') ? s : s + ' min';
}
function escHtml(s) {
    return String(s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

// ─── REVIEWS ─────────────────────────────────────────────
function setReviewStar(bookingId, val) {
    const container = document.getElementById(`reviewStars_${bookingId}`);
    if (!container) return;
    container.dataset.rating = val;
    container.querySelectorAll('.review-star').forEach(s => {
        s.classList.toggle('active', Number(s.dataset.val) <= val);
    });
}

async function submitReview(bookingId) {
    const container = document.getElementById(`reviewStars_${bookingId}`);
    const textarea  = document.getElementById(`reviewText_${bookingId}`);
    const wrap      = document.getElementById(`reviewFormWrap_${bookingId}`);
    const rating    = Number(container?.dataset.rating || 0);
    const text      = textarea?.value.trim();

    if (!rating) { alert('Please select a star rating.'); return; }
    if (!text)   { alert('Please write a short review.'); return; }

    const btn = wrap?.querySelector('.review-submit-btn');
    if (btn) btn.disabled = true;

    const booking = allBookings.find(b => b.id === bookingId);
    const serviceMap = { 'drop-in': 'Drop-In Visit', 'walking': 'Dog Walking' };
    const service = serviceMap[booking?.serviceType] || booking?.serviceType || '';
    const name = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Client';
    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const authorName = name.split(' ')[0] + (name.split(' ')[1] ? ' ' + name.split(' ')[1][0] + '.' : '');
    const now = new Date();
    const dateLabel = now.toLocaleString('en-US', { month: 'short', year: 'numeric' });

    try {
        await addDoc(collection(db, 'reviews'), {
            text,
            rating,
            authorName,
            service,
            dateLabel,
            createdAt: serverTimestamp(),
            status: 'pending',
            source: 'client',
            bookingId,
            userId: currentUser?.uid || null,
            featuredOnHome: false,
            colorVariant: 'rc-pink',
            tags: []
        });
        await updateDoc(doc(db, 'bookings', bookingId), { hasReview: true });
        if (wrap) wrap.innerHTML = '<p class="review-thanks">Thank you! We\'ve received your feedback.</p>';
    } catch (e) {
        console.error('submitReview:', e);
        if (btn) btn.disabled = false;
        alert('Failed to submit review. Please try again.');
    }
}

async function loadReviewStatus(bookingId) {
    const q = query(collection(db, 'reviews'), where('bookingId', '==', bookingId));
    const snap = await getDocs(q);
    if (!snap.empty) {
        const wrap = document.getElementById(`reviewFormWrap_${bookingId}`);
        if (wrap) wrap.innerHTML = '<p class="review-thanks">Thank you! We\'ve received your feedback.</p>';
    }
}

function selectTip(bookingId, val, btn) {
    document.querySelectorAll(`#tipPills_${bookingId} .tip-pill`).forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const customWrap = document.getElementById(`tipCustomWrap_${bookingId}`);
    const zelleDiv   = document.getElementById(`tipZelle_${bookingId}`);
    if (val === 'custom') {
        customWrap.style.display = '';
        zelleDiv.style.display = '';
    } else if (val === 0) {
        customWrap.style.display = 'none';
        zelleDiv.style.display = 'none';
    } else {
        customWrap.style.display = 'none';
        zelleDiv.style.display = '';
        zelleDiv.dataset.amount = val;
    }
}

async function submitAll(bookingId) {
    const booking = allBookings.find(x => x.id === bookingId);
    // Require star rating
    if (!booking?.hasReview) {
        const rating = Number(document.getElementById(`reviewStars_${bookingId}`)?.dataset.rating || 0);
        if (!rating) {
            const stars = document.getElementById(`reviewStars_${bookingId}`);
            if (stars) { stars.style.outline = '2px solid var(--pink)'; stars.style.borderRadius = '6px'; stars.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => { stars.style.outline = ''; }, 1800); }
            return;
        }
    }
    // Require tip selection
    if (booking?.tip == null) {
        const activePill = document.querySelector(`#tipPills_${bookingId} .tip-pill.active`);
        if (!activePill) {
            const notice = document.getElementById(`tipZelle_${bookingId}`);
            if (notice) { notice.style.display = ''; notice.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
            const pills = document.getElementById(`tipPills_${bookingId}`);
            if (pills) { pills.style.outline = '2px solid var(--pink)'; pills.style.borderRadius = '10px'; setTimeout(() => { pills.style.outline = ''; }, 1800); }
            return;
        }
    }
    const btn = document.getElementById(`submitAllBtn_${bookingId}`);
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }
    const updates = {};
    try {
        // Review
        if (!booking?.hasReview) {
            const rating = Number(document.getElementById(`reviewStars_${bookingId}`)?.dataset.rating || 0);
            const text   = document.getElementById(`reviewText_${bookingId}`)?.value.trim();
            if (rating && text) {
                const name = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Client';
                const authorName = name.split(' ')[0] + (name.split(' ')[1] ? ' ' + name.split(' ')[1][0] + '.' : '');
                const serviceMap = { 'drop-in': 'Drop-In Visit', 'walking': 'Dog Walking' };
                const service = serviceMap[booking?.serviceType] || booking?.service || '';
                const dateLabel = new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' });
                await addDoc(collection(db, 'reviews'), {
                    text, rating, authorName, service, dateLabel,
                    createdAt: serverTimestamp(), status: 'pending', source: 'client',
                    bookingId, userId: currentUser?.uid || null,
                    featuredOnHome: false, colorVariant: 'rc-pink', tags: []
                });
                updates.hasReview = true;
            }
        }
        // Tip
        if (booking?.tip == null) {
            const activePill = document.querySelector(`#tipPills_${bookingId} .tip-pill.active`);
            if (activePill) {
                const val = activePill.dataset.val === 'custom'
                    ? parseFloat(document.getElementById(`tipCustomAmt_${bookingId}`)?.value)
                    : parseFloat(activePill.dataset.val);
                if (val && val > 0) updates.tip = val;
                else if (activePill.dataset.val === '0') updates.tip = 0;
            }
        }
        // Private feedback
        if (!booking?.privateFeedback) {
            const fbText = document.getElementById(`feedbackText_${bookingId}`)?.value.trim();
            if (fbText) updates.privateFeedback = fbText;
        }
        if (Object.keys(updates).length > 0) {
            await updateDoc(doc(db, 'bookings', bookingId), updates);
        }
        // Show tip Zelle notice if tip was set
        const wrap = document.getElementById(`feedbackWrap_${bookingId}`);
        if (wrap) {
            const tipAmt = updates.tip || booking?.tip;
            wrap.innerHTML = `<div class="detail-section-label">Thank You!</div>
                <p class="tip-thanks">Your review, tip, and feedback have been submitted.<br>${tipAmt > 0 ? `We truly appreciate your tip of $${tipAmt}! ❤️` : 'We truly appreciate your support! ❤️'}</p>`;
        }
    } catch(e) {
        console.error('submitAll:', e);
        if (btn) { btn.disabled = false; btn.textContent = 'Submit Feedback'; }
        alert('Something went wrong. Please try again.');
    }
}

async function confirmTip(bookingId) {
    const zelleDiv   = document.getElementById(`tipZelle_${bookingId}`);
    const customInput = document.getElementById(`tipCustomAmt_${bookingId}`);
    const activePill  = document.querySelector(`#tipPills_${bookingId} .tip-pill.active`);
    let amount = activePill?.dataset.val === 'custom'
        ? parseFloat(customInput?.value)
        : parseFloat(activePill?.dataset.val || 0);
    if (!amount || amount <= 0) { alert('Please enter a valid tip amount.'); return; }

    const btn = zelleDiv?.querySelector('.tip-confirm-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
    try {
        await updateDoc(doc(db, 'bookings', bookingId), { tip: amount });
        const tipSection = document.getElementById(`tipSection_${bookingId}`);
        if (tipSection) {
            tipSection.innerHTML = `<div class="detail-section-label">Leave a Tip</div>
                <p class="tip-thanks">Thank you for your $${amount} tip! 🐾<br>
                <span style="font-size:12px">Please send via Zelle to <strong>wyliesfurryfriendsllc@gmail.com</strong></span></p>`;
        }
    } catch(e) {
        console.error('confirmTip:', e);
        if (btn) { btn.disabled = false; btn.textContent = 'I\'ve sent the tip'; }
        alert('Failed to save. Please try again.');
    }
}

// ─── EXPOSE TO HTML ───────────────────────────────────────
window.switchAuthMode    = switchAuthMode;
window.showForgotPassword = showForgotPassword;
window.doForgotPassword  = doForgotPassword;
window.doLogin           = doLogin;
window.doRegister        = doRegister;
window.doGoogleLogin     = doGoogleLogin;
window.doSignOut         = doSignOut;
window.showTab           = showTab;
window.openBookingDetail = openBookingDetail;
window.closeBookingDetail= closeBookingDetail;
window.sendClientMessage = sendClientMessage;
window.openAddPetModal   = openAddPetModal;
window.editPet           = editPet;
window.deletePet         = deletePet;
window.savePetModal      = savePetModal;
window.closePetModal     = closePetModal;
window.saveProfile       = saveProfile;
window.togglePill        = togglePill;
window.updatePhotoPreview   = updatePhotoPreview;
window.handlePetPhotoUpload = handlePetPhotoUpload;
window.setBookingFilter  = setBookingFilter;
window.acctCalPrev       = acctCalPrev;
window.acctCalNext       = acctCalNext;
window.showCalDay        = showCalDay;
window.switchPetAgeMode  = switchPetAgeMode;
window.openPetBdayCal    = openPetBdayCal;
window.closePetBdayCal   = closePetBdayCal;
window.changePetBdayMonth   = changePetBdayMonth;
window.onPetBdayYearChange  = onPetBdayYearChange;
window.onPetBdayMonthChange = onPetBdayMonthChange;
window.setReviewStar        = setReviewStar;
window.submitReview         = submitReview;
window.selectTip            = selectTip;
window.confirmTip           = confirmTip;
window.searchProfileAddress = searchProfileAddress;
window.submitAll            = submitAll;
window.markTipSent = function(bookingId, btn) {
    btn.textContent = 'Tip sent ✓';
    btn.classList.add('tip-sent-confirmed');
    btn.disabled = true;
};
window.copyZelleEmail       = function(el) {
    navigator.clipboard.writeText('wyliesfurryfriendsllc@gmail.com').then(() => {
        const orig = el.textContent;
        el.textContent = 'Copied!';
        el.style.color = '#2d6a2d';
        setTimeout(() => { el.textContent = orig; el.style.color = ''; }, 2000);
    }).catch(() => {});
};

// Handle ?tab= URL param to pre-select login/register tab
(function() {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab === 'register') switchAuthMode('register');
})();

// On resize to wide screen, restore booking detail panel to its original grid position
window.addEventListener('resize', () => {
    if (window.innerWidth > 1100) {
        const panel = document.getElementById('bookingDetail');
        const bookingsPanel = document.querySelector('.bookings-panel');
        if (panel && bookingsPanel && panel.parentElement !== bookingsPanel) {
            bookingsPanel.appendChild(panel);
        }
    }
});
