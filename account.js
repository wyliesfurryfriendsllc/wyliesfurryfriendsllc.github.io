import {
    db, auth,
    collection, addDoc, doc, updateDoc, setDoc, getDoc,
    query, where, onSnapshot, orderBy, serverTimestamp,
    createUserWithEmailAndPassword, signInWithEmailAndPassword,
    signOut, onAuthStateChanged, updateProfile
} from './firebase.js';

let currentUser    = null;
let bookingsUnsub  = null;
let messagesUnsub  = null;
let activeBookingId = null;
let userPets       = [];

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
    } catch (err) {
        document.getElementById('authError').textContent = getFriendlyError(err.code);
        btn.disabled    = false;
        btn.textContent = 'Create Account';
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
    ['bookings', 'pets', 'profile'].forEach(t => {
        document.getElementById(`tab${cap(t)}`).style.display = t === tab ? '' : 'none';
        document.getElementById(`navBtn${cap(t)}`).classList.toggle('active', t === tab);
    });
}

// ─── MY BOOKINGS ─────────────────────────────────────────
function loadMyBookings(user) {
    if (bookingsUnsub) bookingsUnsub();
    const q = query(collection(db, 'bookings'), where('clientEmail', '==', user.email));
    bookingsUnsub = onSnapshot(q, snap => {
        const bookings = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        renderBookingsList(bookings);
    }, err => {
        console.error('Bookings load error:', err);
        document.getElementById('bookingsList').innerHTML =
            '<p class="empty-msg">Unable to load bookings. Please try again later.</p>';
    });
}

const STATUS_LABELS = {
    pending:   'Pending Review',
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

function renderBookingsList(bookings) {
    const container = document.getElementById('bookingsList');
    if (bookings.length === 0) {
        container.innerHTML = '<p class="empty-msg">No bookings yet. <a href="booking.html">Book a visit</a> to get started!</p>';
        return;
    }
    container.innerHTML = '';
    bookings.forEach(b => {
        const card = document.createElement('div');
        card.className   = 'booking-card' + (b.id === activeBookingId ? ' active' : '');
        card.dataset.bid = b.id;
        card.onclick     = () => openBookingDetail(b.id);
        const date      = b.createdAt?.toDate
            ? b.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '';
        const firstLine = b.datesText ? b.datesText.trim().split('\n')[0] : '—';
        card.innerHTML = `
            <div class="booking-card-top">
                <div class="booking-card-service">${escHtml(b.service || '—')} · ${b.duration || 30} min</div>
                <span class="status-badge ${STATUS_COLORS[b.status] || 'status-pending'}">${STATUS_LABELS[b.status] || 'Pending'}</span>
            </div>
            <div class="booking-card-dates">${escHtml(firstLine)}</div>
            <div class="booking-card-footer">
                <span class="booking-card-total">$${b.total || 0} est.</span>
                <span class="booking-card-date">${date}</span>
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
            <p>Please send a <strong>$${Math.round((b.total || 0) / 2)} deposit</strong> via Zelle to <strong>wyliesfurryfriendsllc@gmail.com</strong> to secure your spot.</p>
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

        const ageStr = [pet.ageYears ? `${pet.ageYears}yr` : '', pet.ageMonths ? `${pet.ageMonths}mo` : ''].filter(Boolean).join(' ');
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

function resetPetModal() {
    ['petModalName','petModalPhotoUrl','petModalWeight','petModalAgeYears',
     'petModalAgeMonths','petModalBreed','petModalAdoptionDate',
     'petModalAbout','petModalCareNotes','petModalVetInfo'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.querySelectorAll('#petModal .pet-pill, #petModal .pet-type-card').forEach(p => p.classList.remove('active'));
    // default: dog selected
    const dogBtn = document.querySelector('#petTypeGroup [data-value="dog"]');
    if (dogBtn) dogBtn.classList.add('active');
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

    document.getElementById('petModalName').value         = pet.name         || '';
    document.getElementById('petModalPhotoUrl').value     = pet.photoUrl     || '';
    document.getElementById('petModalWeight').value       = pet.weight       || '';
    document.getElementById('petModalAgeYears').value     = pet.ageYears     || '';
    document.getElementById('petModalAgeMonths').value    = pet.ageMonths    || '';
    document.getElementById('petModalBreed').value        = pet.breed        || '';
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
    const pet = {
        name:             document.getElementById('petModalName').value.trim(),
        photoUrl:         document.getElementById('petModalPhotoUrl').value.trim(),
        type:             getPillValue('petTypeGroup')             || 'dog',
        weight:           document.getElementById('petModalWeight').value.trim(),
        ageYears:         document.getElementById('petModalAgeYears').value.trim(),
        ageMonths:        document.getElementById('petModalAgeMonths').value.trim(),
        sex:              getPillValue('petSexGroup'),
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
    if (idx === -1) { userPets.push(pet); } else { userPets[idx] = pet; }
    await updateDoc(doc(db, 'users', currentUser.uid), { pets: userPets });
    closePetModal();
    renderPets();
}

async function deletePet(idx) {
    if (!confirm('Remove this pet?') || !currentUser) return;
    userPets.splice(idx, 1);
    await updateDoc(doc(db, 'users', currentUser.uid), { pets: userPets });
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
window.updatePhotoPreview= updatePhotoPreview;
