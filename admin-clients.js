import {
    db, collection, query, orderBy, onSnapshot,
    doc, updateDoc, addDoc, deleteDoc, serverTimestamp
} from './firebase.js';

let clientsUnsub = null;
let allClients = [];
let editingClientId = null;
let petEntries = [];

// ─── INIT ────────────────────────────────────────────────
function init() {
    renderClients();
    if (!window._addrClickListenerAdded) {
        window._addrClickListenerAdded = true;
        document.addEventListener('click', e => {
            if (!e.target.closest('.addr-wrap')) {
                const d = document.getElementById('addrDropdown');
                if (d) d.style.display = 'none';
            }
        });
    }
    if (clientsUnsub) return;
    clientsUnsub = onSnapshot(collection(db, 'clients'), snap => {
        allClients = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        allClients.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        renderClients();
    }, err => console.error('Clients error:', err));
}

// ─── LIST ────────────────────────────────────────────────
function renderClients() {
    const container = document.getElementById('adminClientsList');
    if (!container) return;
    if (allClients.length === 0) {
        container.innerHTML = '<p class="empty-msg">No clients yet. Add your first client.</p>';
        return;
    }
    container.innerHTML = '';
    allClients.forEach(c => {
        const card = document.createElement('div');
        card.className = 'client-card';
        const pets = c.pets || [];
        const petsHtml = pets.slice(0, 3).map(p => {
            const emoji = p.type === 'cat' ? '🐱' : '🐶';
            // Use placeholder; set src via JS to avoid base64-in-innerHTML issues
            const avatarSlot = p.photoUrl
                ? `<img class="cc-pet-avatar cc-pet-avatar-img" alt="${escHtml(p.name || '')}">`
                : `<div class="cc-pet-avatar cc-pet-emoji">${emoji}</div>`;
            return `<div class="cc-pet-item" data-photo="${p.photoUrl ? '1' : ''}">${avatarSlot}<span class="cc-pet-name">${escHtml(p.name || '—')}</span></div>`;
        }).join('');

        card.innerHTML = `
            <div class="client-card-layout">
                <div class="client-card-left">
                    ${petsHtml || '<span class="cc-no-pets">No pets</span>'}
                </div>
                <div class="client-card-right">
                    <div class="client-name">${escHtml(c.name || '—')}</div>
                    ${c.email  ? `<div class="client-detail">${escHtml(c.email)}</div>`  : ''}
                    ${c.phone  ? `<div class="client-detail">${escHtml(c.phone)}</div>`  : ''}
                    ${c.address? `<div class="client-detail client-address">${escHtml(c.address)}</div>` : ''}
                </div>
                <div class="client-card-actions">
                    <button class="admin-btn-primary" onclick="AdminClients.bookClient('${c.id}')">+ Book</button>
                    <button class="admin-btn-secondary" onclick="AdminClients.openModal('${c.id}')">Edit</button>
                </div>
            </div>
        `;
        // Set pet avatar src via DOM to avoid base64 in innerHTML
        pets.slice(0, 3).forEach((p, idx) => {
            if (p.photoUrl) {
                const imgEl = card.querySelectorAll('.cc-pet-avatar-img')[idx];
                if (imgEl) imgEl.src = p.photoUrl;
            }
        });
        container.appendChild(card);
    });
}

// ─── MODAL ───────────────────────────────────────────────
function openModal(clientId = null) {
    editingClientId = clientId;
    petEntries = [];

    document.getElementById('clientModalTitle').textContent = clientId ? 'Edit Client' : 'Add Client';
    document.getElementById('cModalName').value    = '';
    document.getElementById('cModalPhone').value   = '';
    document.getElementById('cModalEmail').value   = '';
    document.getElementById('cModalAddress').value = '';
    document.getElementById('cModalError').textContent = '';

    if (clientId) {
        const c = allClients.find(x => x.id === clientId);
        if (c) {
            document.getElementById('cModalName').value    = c.name    || '';
            document.getElementById('cModalPhone').value   = c.phone   || '';
            document.getElementById('cModalEmail').value   = c.email   || '';
            document.getElementById('cModalAddress').value = c.address || '';
            petEntries = (c.pets || []).map(p => ({ ...p }));
        }
    }
    renderModalPets();
    document.getElementById('addrDropdown').style.display = 'none';
    document.getElementById('clientModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('clientModal').style.display = 'none';
}

function calcAge(birthDate) {
    if (!birthDate) return '';
    const now = new Date(), birth = new Date(birthDate);
    let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
    if (now.getDate() < birth.getDate()) months--;
    if (months < 0) return '';
    const y = Math.floor(months / 12), m = months % 12;
    if (y === 0) return `${m} mo`;
    if (m === 0) return `${y} yr${y > 1 ? 's' : ''}`;
    return `${y} yr${y > 1 ? 's' : ''} ${m} mo`;
}

function renderModalPets() {
    const list = document.getElementById('cModalPetList');
    list.innerHTML = '';
    petEntries.forEach((p, i) => {
        // Determine mode: 'date' or 'age'
        const mode = p.birthMode || (p.birthDate ? 'date' : ((p.ageYears || p.ageMonths) ? 'age' : 'date'));

        // Age display
        let ageDisplay = '';
        if (mode === 'date' && p.birthDate) {
            ageDisplay = calcAge(p.birthDate);
        } else if (mode === 'age') {
            const parts = [];
            if (p.ageYears) parts.push(p.ageYears + ' yr');
            if (p.ageMonths) parts.push(p.ageMonths + ' mo');
            ageDisplay = parts.join(' ');
        }

        const bdayContent = mode === 'date'
            ? `<div class="cpet-bday-input-wrap">
                <input class="cpet-input" type="date" value="${escHtml(p.birthDate || '')}"
                    onchange="AdminClients.updatePet(${i},'birthDate',this.value)">
                ${ageDisplay ? `<span class="cpet-age-chip">${ageDisplay}</span>` : ''}
               </div>`
            : `<div class="cpet-age-input-wrap">
                <input class="cpet-input cpet-age-num" type="number" min="0" max="30" placeholder="Yrs"
                    value="${escHtml(String(p.ageYears || ''))}" onchange="AdminClients.updatePet(${i},'ageYears',+this.value)">
                <input class="cpet-input cpet-age-num" type="number" min="0" max="11" placeholder="Mo"
                    value="${escHtml(String(p.ageMonths || ''))}" onchange="AdminClients.updatePet(${i},'ageMonths',+this.value)">
                ${ageDisplay ? `<span class="cpet-age-chip-inline">${ageDisplay}</span>` : ''}
               </div>`;

        const emoji = p.type === 'cat' ? '🐱' : '🐶';
        const row = document.createElement('div');
        row.className = 'cpet-row';
        row.innerHTML = `
            <div class="cpet-top-row">
                <div class="cpet-avatar-wrap">
                    <div class="cpet-avatar-slot"></div>
                    <label class="cpet-avatar-upload" title="Upload photo">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        <input type="file" accept="image/*" style="display:none" onchange="AdminClients.uploadPetPhoto(this,${i})">
                    </label>
                </div>
                <div class="cpet-fields">
                    <input class="cpet-input" type="text" placeholder="Pet name" value="${escHtml(p.name || '')}"
                        oninput="AdminClients.updatePet(${i},'name',this.value)">
                    <select class="cpet-select" onchange="AdminClients.updatePet(${i},'type',this.value)">
                        <option value="dog"   ${p.type==='dog'   ?'selected':''}>🐶 Dog</option>
                        <option value="cat"   ${p.type==='cat'   ?'selected':''}>🐱 Cat</option>
                        <option value="other" ${p.type==='other' ?'selected':''}>🐾 Other</option>
                    </select>
                    <div class="cpet-bday-section">
                        <div class="cpet-bday-tabs">
                            <button type="button" class="cpet-bday-tab ${mode==='date'?'active':''}"
                                onclick="AdminClients.setBdayMode(${i},'date')">📅 Date</button>
                            <button type="button" class="cpet-bday-tab ${mode==='age'?'active':''}"
                                onclick="AdminClients.setBdayMode(${i},'age')">🎂 Age</button>
                        </div>
                        ${bdayContent}
                    </div>
                </div>
                <button class="cpet-remove" onclick="AdminClients.removePet(${i})">×</button>
            </div>
        `;

        // Set avatar via DOM (avoids base64 escaping issues in innerHTML)
        const slot = row.querySelector('.cpet-avatar-slot');
        if (p.photoUrl) {
            const img = document.createElement('img');
            img.className = 'cpet-avatar';
            img.alt = '';
            img.src = p.photoUrl;
            slot.replaceWith(img);
        } else {
            const div = document.createElement('div');
            div.className = 'cpet-avatar cpet-avatar-emoji';
            div.textContent = emoji;
            slot.replaceWith(div);
        }

        list.appendChild(row);
    });
}

function setBdayMode(i, mode) {
    if (!petEntries[i]) return;
    petEntries[i].birthMode = mode;
    renderModalPets();
}

function addPet() {
    petEntries.push({ name: '', type: 'dog', birthDate: '', photoUrl: '', birthMode: 'date', ageYears: '', ageMonths: '' });
    renderModalPets();
}

function refreshPetPreview(input, i) {
    const row = input.closest('.cpet-row');
    let preview = row.querySelector('.cpet-photo-preview');
    const url = input.value.trim();
    if (url) {
        if (!preview) {
            preview = document.createElement('img');
            preview.className = 'cpet-photo-preview';
            input.parentElement.insertBefore(preview, input);
        }
        preview.src = url;
    } else if (preview) {
        preview.remove();
    }
}

function removePet(i) {
    petEntries.splice(i, 1);
    renderModalPets();
}

function updatePet(i, field, value) {
    if (petEntries[i]) petEntries[i][field] = value;
}

async function saveModal() {
    const name    = document.getElementById('cModalName').value.trim();
    const phone   = document.getElementById('cModalPhone').value.trim();
    const email   = document.getElementById('cModalEmail').value.trim();
    const address = document.getElementById('cModalAddress').value.trim();
    const errEl   = document.getElementById('cModalError');

    if (!name) { errEl.textContent = 'Name is required.'; return; }
    errEl.textContent = '';

    const data = {
        name, phone, email, address,
        pets: petEntries.filter(p => p.name.trim()),
        updatedAt: serverTimestamp()
    };

    const btn = document.getElementById('cModalSaveBtn');
    btn.disabled = true; btn.textContent = 'Saving…';

    try {
        if (editingClientId) {
            await updateDoc(doc(db, 'clients', editingClientId), data);
        } else {
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, 'clients'), data);
        }
        closeModal();
    } catch(e) {
        errEl.textContent = 'Error: ' + e.message;
    } finally {
        btn.disabled = false; btn.textContent = 'Save';
    }
}

// ─── BOOK FROM CLIENT ────────────────────────────────────
function bookClient(clientId) {
    window.AdminCalendar?.openNewBookingModal();
    setTimeout(() => window.AdminCalendar?.selectClient(clientId), 50);
}

// ─── ADDRESS AUTOCOMPLETE (Nominatim) ────────────────────
let addrTimer = null;
function searchAddress(q) {
    clearTimeout(addrTimer);
    const dropdown = document.getElementById('addrDropdown');
    if (!q || q.length < 3) { dropdown.style.display = 'none'; return; }
    addrTimer = setTimeout(async () => {
        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&limit=5&q=${encodeURIComponent(q)}`,
                { headers: { 'Accept-Language': 'en' } }
            );
            const data = await res.json();
            if (!data.length) { dropdown.style.display = 'none'; return; }
            dropdown.innerHTML = '';
            data.forEach(r => {
                const div = document.createElement('div');
                div.className = 'addr-option';
                div.textContent = r.display_name;
                div.addEventListener('mousedown', e => {
                    e.preventDefault();
                    pickAddress(r.display_name);
                });
                dropdown.appendChild(div);
            });
            dropdown.style.display = '';
        } catch { dropdown.style.display = 'none'; }
    }, 350);
}

function pickAddress(addr) {
    document.getElementById('cModalAddress').value = addr;
    document.getElementById('addrDropdown').style.display = 'none';
}

// ─── HELPERS ─────────────────────────────────────────────
function compressImage(file, maxW = 500, q = 0.85) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Cannot read file.'));
        reader.onload = e => {
            const img = new Image();
            img.onerror = () => reject(new Error(
                'Cannot load this image format. Please use JPG or PNG.\n' +
                '(iPhone tip: Settings → Camera → Formats → Most Compatible)'
            ));
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

async function uploadPetPhoto(input, i) {
    const file = input.files[0];
    if (!file) return;
    try {
        const base64 = await compressImage(file);
        if (petEntries[i]) petEntries[i].photoUrl = base64;
        renderModalPets();
    } catch(e) {
        alert(e.message);
        input.value = '';
    }
}

function getAllClients() { return allClients; }

function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── EXPOSE ──────────────────────────────────────────────
window.AdminClients = {
    init, openModal, closeModal, saveModal,
    addPet, removePet, updatePet, refreshPetPreview, getAllClients,
    searchAddress, pickAddress, uploadPetPhoto, calcAge, bookClient, setBdayMode
};
