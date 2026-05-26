import {
    db, auth,
    collection, addDoc, doc, updateDoc, setDoc, getDoc,
    query, where, onSnapshot, orderBy, serverTimestamp,
    createUserWithEmailAndPassword, signInWithEmailAndPassword,
    signOut, onAuthStateChanged, updateProfile,
    GoogleAuthProvider, signInWithPopup
} from './firebase.js';

let currentUser    = null;
let bookingsUnsub  = null;
let messagesUnsub  = null;
let activeBookingId = null;
let userPets       = [];
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
        showAccountUI(user, profile);
        loadMyBookings(user);
        syncToClients(user, profile).catch(() => {});
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
    document.getElementById('authSection').style.display    = 'none';
    document.getElementById('accountSection').style.display = '';
    const name = profile.name || user.displayName || user.email.split('@')[0];
    document.getElementById('accountName').textContent   = name;
    document.getElementById('accountEmail').textContent  = user.email;
    document.getElementById('accountAvatar').textContent = name.charAt(0).toUpperCase();
    document.getElementById('profileName').value          = profile.name || user.displayName || '';
    document.getElementById('profilePhone').value         = profile.phone || '';
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
    const email    = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const btn      = document.getElementById('registerBtn');
    if (!name || !email || !password) return;
    btn.disabled    = true;
    btn.textContent = 'Creating account...';
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
        await setDoc(doc(db, 'users', cred.user.uid), {
            name, email, phone: '', pets: [], createdAt: serverTimestamp()
        });
        await syncToClients(cred.user, { name, email, phone: '', pets: [] });
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
            await syncToClients(cred.user, { name: cred.user.displayName || '', email: cred.user.email, phone: '', pets: [] });
        }
    } catch (err) {
        if (err.code !== 'auth/popup-closed-by-user') {
            document.getElementById('authError').textContent = 'Google sign-in failed. Please try again.';
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
    const q = query(collection(db, 'bookings'), where('clientEmail', '==', user.email));
    bookingsUnsub = onSnapshot(q, snap => {
        allBookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
    }, err => {
        console.error('Bookings load error:', err);
        document.getElementById('bookingsList').innerHTML =
            '<p class="empty-msg">Unable to load bookings. Please try again later.</p>';
    });
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

const STATUS_LABELS = {
    pending:          'Pending Review',
    confirmed:        'Confirmed',
    deposit_received: 'Spot Reserved',
    paid:             'Paid in Full',
    rejected:         'Declined',
    completed:        'Completed'
};
const STATUS_COLORS = {
    pending:          'status-pending',
    confirmed:        'status-confirmed',
    deposit_received: 'status-deposit',
    paid:             'status-paid',
    rejected:         'status-rejected',
    completed:        'status-completed'
};

function renderBookingsList(bookings) {
    const container = document.getElementById('bookingsList');
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
    filtered.forEach(b => {
        const card = document.createElement('div');
        card.className   = 'booking-card' + (b.id === activeBookingId ? ' active' : '');
        card.dataset.bid = b.id;
        card.onclick     = () => openBookingDetail(b.id);
        const date      = b.createdAt?.toDate
            ? b.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '';
        const firstLine = b.datesText ? b.datesText.trim().split('\n')[0] : '—';

        const pets = b.pets || [];
        const avatarsHtml = pets.slice(0, 3).map((p, i) => {
            if (p.photoUrl) return `<img class="bc-pet-avatar" src="${escHtml(p.photoUrl)}" alt="${escHtml(p.name||'')}" style="z-index:${3-i}">`;
            const em = p.type === 'cat' ? '🐱' : '🐶';
            return `<div class="bc-pet-avatar bc-pet-emoji" style="z-index:${3-i}">${em}</div>`;
        }).join('');

        card.innerHTML = `
            <div class="booking-card-top">
                <div class="booking-card-service">${escHtml(b.service || '—')} · ${b.duration || 30} min</div>
                <span class="status-badge ${STATUS_COLORS[b.status] || 'status-pending'}">${STATUS_LABELS[b.status] || 'Pending'}</span>
            </div>
            <div class="booking-card-dates">${escHtml(firstLine)}</div>
            <div class="booking-card-footer">
                <span class="booking-card-total">$${b.total || 0} est.</span>
                ${avatarsHtml ? `<div class="bc-avatars">${avatarsHtml}</div>` : `<span class="booking-card-date">${date}</span>`}
            </div>
        `;
        container.appendChild(card);
    });
}

function openBookingDetail(bookingId) {
    activeBookingId = bookingId;
    document.querySelectorAll('.booking-card').forEach(c =>
        c.classList.toggle('active', c.dataset.bid === bookingId)
    );
    const panel = document.getElementById('bookingDetail');
    panel.style.display = '';
    panel.innerHTML     = '<div class="detail-loading">Loading...</div>';

    getDoc(doc(db, 'bookings', bookingId)).then(snap => {
        if (!snap.exists()) { panel.innerHTML = '<p>Booking not found.</p>'; return; }
        renderBookingDetail({ id: snap.id, ...snap.data() }, panel);
        loadMessages(bookingId);
    });
}

function closeBookingDetail() {
    activeBookingId = null;
    if (messagesUnsub) { messagesUnsub(); messagesUnsub = null; }
    document.getElementById('bookingDetail').style.display = 'none';
    document.querySelectorAll('.booking-card').forEach(c => c.classList.remove('active'));
}

function renderBookingDetail(b, panel) {
    let petsHtml = '';
    (b.pets || []).forEach(p => {
        petsHtml += `<div class="detail-row"><span>${escHtml(p.name || '—')}</span><span>${escHtml(p.type || '')}${p.breed ? ' · ' + escHtml(p.breed) : ''}${p.age ? ', ' + escHtml(p.age) : ''}</span></div>`;
    });
    if (!petsHtml) petsHtml = '<div class="detail-row"><span>—</span></div>';

    panel.innerHTML = `
        <div class="detail-header">
            <div>
                <h3 class="detail-title">${escHtml(b.service || '—')} · ${b.duration || 30} min</h3>
                <span class="status-badge ${STATUS_COLORS[b.status] || 'status-pending'}">${STATUS_LABELS[b.status] || 'Pending'}</span>
            </div>
            <button class="detail-close" onclick="closeBookingDetail()">×</button>
        </div>
        <div class="detail-section">
            <div class="detail-section-label">Dates &amp; Times</div>
            <pre class="detail-dates">${escHtml((b.datesText || '—').trim())}</pre>
        </div>
        <div class="detail-section">
            <div class="detail-section-label">Pets</div>
            ${petsHtml}
        </div>
        <div class="detail-section">
            <div class="detail-section-label">Estimated Total</div>
            <div class="detail-row"><span>Total</span><span>$${b.total || 0}</span></div>
        </div>
        ${b.notes ? `<div class="detail-section"><div class="detail-section-label">Notes</div><p class="detail-notes">${escHtml(b.notes)}</p></div>` : ''}
        ${b.status === 'confirmed' ? `
        <div class="detail-section detail-payment-notice">
            <div class="detail-section-label">Payment Required</div>
            <p>Please send a <strong>$${Math.round((b.total || 0) / 2)} deposit</strong> via Zelle to <strong>wyliesfurryfriendsllc@gmail.com</strong> to secure your spot. The remaining balance is due before the service begins.</p>
        </div>` : ''}
        ${b.status === 'deposit_received' ? `
        <div class="detail-section detail-payment-notice detail-payment-reserved">
            <div class="detail-section-label">Spot Reserved 🐾</div>
            <p>Your deposit has been received${b.depositDate ? ' on ' + new Date(b.depositDate + 'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : ''}. Your spot is reserved! The remaining balance of <strong>$${Math.round((b.total || 0) / 2)}</strong> is due before the service begins.</p>
        </div>` : ''}
        ${b.status === 'paid' ? `
        <div class="detail-section detail-payment-notice detail-payment-paid">
            <div class="detail-section-label">Payment Complete 💚</div>
            <p>Full payment received. Thank you! We look forward to caring for your pet 🐾</p>
        </div>` : ''}
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
        const emoji = pet.type === 'cat' ? '🐱' : '🐶';
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
    const placeholder = document.getElementById('petModalPhotoPlaceholder');
    if (placeholder) placeholder.textContent = 'Processing…';
    const base64 = await compressImage(file);
    document.getElementById('petModalPhotoUrl').value = base64;
    updatePhotoPreview();
    input.value = '';
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
    const birthday   = ageMode === 'exact' ? (document.getElementById('petModalBirthday').value || '') : '';
    const ageYear    = ageMode === 'yearmonth' ? (document.getElementById('petModalAgeYear').value.trim() || '') : '';
    const ageMonth   = ageMode === 'yearmonth' ? (document.getElementById('petModalAgeMonth').value || '') : '';
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

// ─── PROFILE ─────────────────────────────────────────────
async function saveProfile() {
    if (!currentUser) return;
    const name  = document.getElementById('profileName').value.trim();
    const phone = document.getElementById('profilePhone').value.trim();
    const btn   = document.getElementById('saveProfileBtn');
    btn.disabled    = true;
    btn.textContent = 'Saving...';
    try {
        await updateDoc(doc(db, 'users', currentUser.uid), { name, phone });
        if (name) await updateProfile(currentUser, { displayName: name });
        await syncToClients(currentUser, { name, phone, email: currentUser.email, pets: userPets });
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
    const pets = (profile.pets || []).map(p => ({
        name: p.name || '', type: p.type || 'dog', photoUrl: p.photoUrl || '',
        age: [p.ageYears && p.ageYears + 'yr', p.ageMonths && p.ageMonths + 'mo'].filter(Boolean).join(' ')
    }));
    await setDoc(doc(db, 'clients', user.uid), {
        name: profile.name || user.displayName || '',
        email: user.email,
        phone: profile.phone || '',
        pets, uid: user.uid, source: 'account',
        updatedAt: serverTimestamp()
    }, { merge: true });
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

    const items = bks.map(b => {
        const slots = b.dateTimes?.[iso] || [];
        const timeStr = slots.length ? slots.map(t => fmtSlotAcc(t)).join(', ') : (b.datesText ? extractTimeFromText(b.datesText, iso) : 'TBD');
        const pets = b.pets || [];
        const avatars = pets.slice(0,4).map((p, i) => {
            if (p.photoUrl) return `<img class="cday-pet-avatar" src="${escHtml(p.photoUrl)}" alt="${escHtml(p.name||'')}" style="z-index:${4-i}">`;
            return `<div class="cday-pet-avatar cday-pet-emoji" style="z-index:${4-i}">${p.type==='cat'?'🐱':'🐶'}</div>`;
        }).join('');
        const petNames = pets.map(p => escHtml(p.name||'?')).join(', ');
        return `<div class="acct-day-item" onclick="showTab('bookings');openBookingDetail('${b.id}')">
            <div class="acct-day-item-left">
                <div class="acct-day-item-service">${escHtml(b.service||'Visit')}${petNames ? ': ' + petNames : ''}</div>
                <div class="acct-day-item-time">${escHtml(timeStr)}</div>
            </div>
            <div class="cday-avatars">${avatars}</div>
        </div>`;
    }).join('');

    panel.innerHTML = `
        <div class="acct-day-header">
            <span class="acct-day-date">${escHtml(dateLabel)}</span>
            <span class="acct-day-count">${bks.length} visit${bks.length!==1?'s':''}</span>
        </div>
        ${items}`;
}

function fmtSlotAcc(t) {
    if (!t) return 'TBD';
    if (t.includes('~')) {
        const [s, e] = t.split('~');
        return `${fmt12Acc(s)} – ${fmt12Acc(e)}`;
    }
    return fmt12Acc(t);
}

function fmt12Acc(t) {
    if (!t) return 'TBD';
    const parts = t.split(':');
    const h = Number(parts[0]), m = Number(parts[1]);
    if (isNaN(h) || isNaN(m)) return t;
    return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;
}

function extractTimeFromText(datesText, iso) {
    const d = new Date(iso + 'T12:00:00');
    const label = d.toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });
    const line = (datesText || '').split('\n').find(l => l.includes(label));
    if (!line) return 'TBD';
    const m = line.match(/:\s*(.+)$/);
    return m ? m[1].trim() : 'TBD';
}

// ─── HELPERS ─────────────────────────────────────────────
function escHtml(s) {
    return String(s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

// ─── EXPOSE TO HTML ───────────────────────────────────────
window.switchAuthMode    = switchAuthMode;
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
