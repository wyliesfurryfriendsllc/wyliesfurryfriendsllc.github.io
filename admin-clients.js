import {
    db, collection, query, orderBy, onSnapshot,
    doc, updateDoc, addDoc, deleteDoc, serverTimestamp
} from './firebase.js';

let clientsUnsub = null;
let allClients = [];
let clientSearchQuery = '';
let editingClientId = null;
let petEntries = [];
let _adminEditingAddr = '';

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

// ─── SEARCH ──────────────────────────────────────────────
function onSearch(val) {
    clientSearchQuery = val.trim().toLowerCase();
    renderClients();
}

// ─── LIST ────────────────────────────────────────────────
function renderClients() {
    const container = document.getElementById('adminClientsList');
    if (!container) return;
    const filtered = clientSearchQuery
        ? allClients.filter(c => {
            const ownerMatch = (c.name || '').toLowerCase().includes(clientSearchQuery);
            const petMatch = (c.pets || []).some(p => (p.name || '').toLowerCase().includes(clientSearchQuery));
            return ownerMatch || petMatch;
        })
        : allClients;
    if (allClients.length === 0) {
        container.innerHTML = '<p class="empty-msg">No clients yet. Add your first client.</p>';
        return;
    }
    if (filtered.length === 0) {
        container.innerHTML = '<p class="empty-msg">No clients match your search.</p>';
        return;
    }
    container.innerHTML = '';
    filtered.forEach(c => {
        const card = document.createElement('div');
        card.className = 'client-card';
        const pets = c.pets || [];
        const petsHtml = pets.map(p => {
            const emoji = p.type === 'cat' ? '🐱' : '🐶';
            const avatarSlot = p.photoUrl
                ? `<img class="cc-pet-avatar cc-pet-avatar-img" alt="${escHtml(p.name || '')}">`
                : `<div class="cc-pet-avatar cc-pet-emoji">${emoji}</div>`;
            const tags = [
                p.sex ? `<span class="cc-pet-tag">${escHtml(p.sex)}</span>` : '',
                p.spayedNeutered === 'yes' ? `<span class="cc-pet-tag">Spayed/Neutered</span>` : '',
                p.microchipped === 'yes' ? `<span class="cc-pet-tag">Microchipped</span>` : '',
            ].filter(Boolean).join('');
            const meta = [
                p.breed ? escHtml(p.breed) : '',
                p.weight ? `${escHtml(String(p.weight))} lbs` : '',
            ].filter(Boolean).join(' · ');
            return `
            <div class="cc-pet-item" data-photo="${p.photoUrl ? '1' : ''}">
                ${avatarSlot}
                <div class="cc-pet-info">
                    <span class="cc-pet-name">${escHtml(p.name || '—')}</span>
                    ${meta ? `<span class="cc-pet-meta">${meta}</span>` : ''}
                    ${tags ? `<div class="cc-pet-tags">${tags}</div>` : ''}
                    ${p.notes ? `<div class="cc-pet-notes">${escHtml(p.notes)}</div>` : ''}
                </div>
            </div>`;
        }).join('');

        card.innerHTML = `
            <div class="client-card-layout">
                <div class="client-card-left">
                    ${petsHtml || '<span class="cc-no-pets">No pets</span>'}
                </div>
                <div class="client-card-right">
                    <div class="client-card-right-info">
                        <div class="client-name">${escHtml(c.name || '—')}</div>
                        ${c.phone  ? `<div class="client-detail">${escHtml(c.phone)}</div>`  : ''}
                        ${c.email  ? `<div class="client-detail">${escHtml(c.email)}</div>`  : ''}
                        ${c.address? `<div class="client-detail client-address">${escHtml(c.address)}</div>` : ''}
                        ${c.notes  ? `<div class="client-detail cc-client-notes">${escHtml(c.notes)}</div>` : ''}
                    </div>
                    <div class="client-card-actions">
                        <button class="admin-btn-primary" onclick="AdminClients.bookClient('${c.id}')">+ Book</button>
                        <button class="admin-btn-secondary" onclick="AdminClients.openModal('${c.id}')">Edit</button>
                        <button class="admin-btn-delete" onclick="AdminClients.deleteClient('${c.id}','${escHtml(c.name||'')}')">Delete</button>
                    </div>
                </div>
            </div>
        `;
        // Set pet avatar src via DOM to avoid base64 in innerHTML
        pets.forEach((p, idx) => {
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
    document.getElementById('cModalNotes').value   = '';
    document.getElementById('cModalError').textContent = '';

    if (clientId) {
        const c = allClients.find(x => x.id === clientId);
        if (c) {
            document.getElementById('cModalName').value    = c.name    || '';
            document.getElementById('cModalPhone').value   = c.phone   || '';
            document.getElementById('cModalEmail').value   = c.email   || '';
            document.getElementById('cModalAddress').value = c.address || '';
            document.getElementById('cModalNotes').value   = c.notes   || '';
            _adminEditingAddr = c.address || '';
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
        row.className = 'cpet-card';
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
                    <div class="cpet-row-inline">
                        <input class="cpet-input" type="text" placeholder="Pet name" value="${escHtml(p.name || '')}"
                            oninput="AdminClients.updatePet(${i},'name',this.value)">
                        <select class="cpet-select" onchange="AdminClients.updatePet(${i},'type',this.value)">
                            <option value="dog"   ${p.type==='dog'   ?'selected':''}>🐶 Dog</option>
                            <option value="cat"   ${p.type==='cat'   ?'selected':''}>🐱 Cat</option>
                            <option value="other" ${p.type==='other' ?'selected':''}>🐾 Other</option>
                        </select>
                        <button class="cpet-remove" onclick="AdminClients.removePet(${i})">×</button>
                    </div>
                    <div class="cpet-row-inline">
                        <input class="cpet-input" type="text" placeholder="Breed" value="${escHtml(p.breed || '')}"
                            oninput="AdminClients.updatePet(${i},'breed',this.value)">
                        <input class="cpet-input cpet-weight" type="number" placeholder="Weight (lbs)" value="${escHtml(String(p.weight || ''))}"
                            oninput="AdminClients.updatePet(${i},'weight',this.value)">
                    </div>
                    <div class="cpet-row-inline cpet-pills-row">
                        <label class="cpet-pill-label">Sex:</label>
                        <button type="button" class="cpet-pill${p.sex==='male'?' active':''}" onclick="AdminClients.updatePet(${i},'sex','male');AdminClients.renderModalPets()">Male</button>
                        <button type="button" class="cpet-pill${p.sex==='female'?' active':''}" onclick="AdminClients.updatePet(${i},'sex','female');AdminClients.renderModalPets()">Female</button>
                    </div>
                    <div class="cpet-row-inline cpet-pills-row">
                        <label class="cpet-pill-label">Spayed/Neutered:</label>
                        <button type="button" class="cpet-pill${p.spayedNeutered==='yes'?' active':''}" onclick="AdminClients.updatePet(${i},'spayedNeutered','yes');AdminClients.renderModalPets()">Yes</button>
                        <button type="button" class="cpet-pill${p.spayedNeutered==='no'?' active':''}" onclick="AdminClients.updatePet(${i},'spayedNeutered','no');AdminClients.renderModalPets()">No</button>
                    </div>
                    <div class="cpet-row-inline cpet-pills-row">
                        <label class="cpet-pill-label">Microchipped:</label>
                        <button type="button" class="cpet-pill${p.microchipped==='yes'?' active':''}" onclick="AdminClients.updatePet(${i},'microchipped','yes');AdminClients.renderModalPets()">Yes</button>
                        <button type="button" class="cpet-pill${p.microchipped==='no'?' active':''}" onclick="AdminClients.updatePet(${i},'microchipped','no');AdminClients.renderModalPets()">No</button>
                    </div>
                    <div class="cpet-bday-section">
                        <div class="cpet-bday-tabs">
                            <button type="button" class="cpet-bday-tab ${mode==='date'?'active':''}"
                                onclick="AdminClients.setBdayMode(${i},'date')">📅 Date</button>
                            <button type="button" class="cpet-bday-tab ${mode==='age'?'active':''}"
                                onclick="AdminClients.setBdayMode(${i},'age')">🎂 Age</button>
                        </div>
                        ${bdayContent}
                    </div>
                    <textarea class="cpet-input cpet-notes" placeholder="Pet notes (special needs, allergies, behavior...)" rows="2"
                        oninput="AdminClients.updatePet(${i},'notes',this.value)">${escHtml(p.notes || '')}</textarea>
                </div>
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
    petEntries.push({ name: '', type: 'dog', birthDate: '', photoUrl: '', birthMode: 'date', ageYears: '', ageMonths: '', breed: '', weight: '', sex: '', spayedNeutered: '', microchipped: '', notes: '' });
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
    const notes   = document.getElementById('cModalNotes').value.trim();
    const errEl   = document.getElementById('cModalError');

    if (!name) { errEl.textContent = 'Name is required.'; return; }
    errEl.textContent = '';

    const data = {
        name, phone, email, address, notes,
        pets: petEntries.filter(p => p.name.trim()),
        updatedAt: serverTimestamp()
    };

    const btn = document.getElementById('cModalSaveBtn');
    btn.disabled = true; btn.textContent = 'Saving…';

    try {
        if (editingClientId) {
            await updateDoc(doc(db, 'clients', editingClientId), data);
            const clientObj = allClients.find(x => x.id === editingClientId);
            if (clientObj?.uid) {
                await updateDoc(doc(db, 'users', clientObj.uid), { pets: data.pets });
            }
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

// ─── ADDRESS AUTOCOMPLETE (Nominatim + local prefix match) ──
let addrTimer = null;
function formatAddress(r) {
    const a = r.address || {};
    const street = [a.house_number, a.road].filter(Boolean).join(' ');
    const city   = a.city || a.town || a.village || a.suburb || '';
    const state  = a.state || '';
    const zip    = a.postcode || '';
    return [street, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}
function _adminLocalMatch(q, saved) {
    if (!saved) return false;
    const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const words  = saved.toLowerCase().split(/[\s,]+/).filter(Boolean);
    return tokens.every(tok => words.some(w => w.startsWith(tok)));
}
function _renderAdminAddrDropdown(dropdown, items) {
    if (!items.length) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = '';
    items.forEach(addr => {
        const div = document.createElement('div');
        div.className = 'addr-option';
        div.textContent = addr;
        div.addEventListener('mousedown', e => { e.preventDefault(); pickAddress(addr); });
        dropdown.appendChild(div);
    });
    dropdown.style.display = '';
}
function searchAddress(q) {
    clearTimeout(addrTimer);
    const dropdown = document.getElementById('addrDropdown');
    if (!q) { dropdown.style.display = 'none'; return; }

    const localMatches = _adminLocalMatch(q, _adminEditingAddr) ? [_adminEditingAddr] : [];

    if (q.length < 3) {
        _renderAdminAddrDropdown(dropdown, localMatches);
        return;
    }

    addrTimer = setTimeout(async () => {
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
            const remote = data.map(formatAddress).filter(Boolean);
            const all = [...localMatches, ...remote.filter(r => r !== _adminEditingAddr)];
            _renderAdminAddrDropdown(dropdown, all);
        } catch { _renderAdminAddrDropdown(dropdown, localMatches); }
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
    input.value = '';
    try {
        const base64 = await window.openCropModal(file);
        if (!base64) return;
        if (petEntries[i]) petEntries[i].photoUrl = base64;
        renderModalPets();
    } catch(e) {
        alert(e.message);
    }
}

function getAllClients() { return allClients; }

async function deleteClient(clientId, clientName) {
    if (!confirm(`Delete client "${clientName}"? This cannot be undone.`)) return;
    try {
        await deleteDoc(doc(db, 'clients', clientId));
    } catch(e) {
        alert('Error deleting client: ' + e.message);
    }
}

function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── EXPOSE ──────────────────────────────────────────────
window.AdminClients = {
    init, openModal, closeModal, saveModal, onSearch,
    addPet, removePet, updatePet, refreshPetPreview, getAllClients,
    searchAddress, pickAddress, uploadPetPhoto, calcAge, bookClient, setBdayMode,
    renderModalPets, deleteClient
};
