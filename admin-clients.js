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
        const petsText = (c.pets || []).map(p => p.name).join(', ') || '—';
        card.innerHTML = `
            <div class="client-card-main">
                <div class="client-avatar">${escHtml((c.name || '?')[0].toUpperCase())}</div>
                <div class="client-info">
                    <div class="client-name">${escHtml(c.name || '—')}</div>
                    <div class="client-meta">${[c.phone, c.email].filter(Boolean).map(escHtml).join(' · ')}</div>
                    <div class="client-pets">🐾 ${escHtml(petsText)}</div>
                </div>
            </div>
            <div class="client-card-actions">
                <button class="admin-btn-secondary" onclick="AdminClients.openModal('${c.id}')">Edit</button>
            </div>
        `;
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

function renderModalPets() {
    const list = document.getElementById('cModalPetList');
    list.innerHTML = '';
    petEntries.forEach((p, i) => {
        const row = document.createElement('div');
        row.className = 'cpet-row';
        row.innerHTML = `
            <div class="cpet-main-row">
                <input class="cpet-input" type="text" placeholder="Pet name" value="${escHtml(p.name || '')}"
                    oninput="AdminClients.updatePet(${i},'name',this.value)">
                <select class="cpet-select" onchange="AdminClients.updatePet(${i},'type',this.value)">
                    <option value="dog"   ${p.type==='dog'   ?'selected':''}>Dog</option>
                    <option value="cat"   ${p.type==='cat'   ?'selected':''}>Cat</option>
                    <option value="other" ${p.type==='other' ?'selected':''}>Other</option>
                </select>
                <input class="cpet-input" type="text" placeholder="Age (e.g. 2 yrs)" value="${escHtml(p.age || '')}"
                    oninput="AdminClients.updatePet(${i},'age',this.value)" style="max-width:110px">
                <button class="cpet-remove" onclick="AdminClients.removePet(${i})">×</button>
            </div>
            <div class="cpet-photo-row">
                ${p.photoUrl ? `<img class="cpet-photo-preview" src="${escHtml(p.photoUrl)}" alt="">` : ''}
                <input class="cpet-input" type="url" placeholder="Photo URL (optional)" value="${escHtml(p.photoUrl || '')}"
                    oninput="AdminClients.updatePet(${i},'photoUrl',this.value);AdminClients.refreshPetPreview(this,${i})">
                <label class="cpet-upload-btn" title="Upload from device">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    <input type="file" accept="image/*" style="display:none" onchange="AdminClients.uploadPetPhoto(this,${i})">
                </label>
            </div>
        `;
        list.appendChild(row);
    });
}

function addPet() {
    petEntries.push({ name: '', type: 'dog', age: '', photoUrl: '' });
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
            dropdown.innerHTML = data.map(r =>
                `<div class="addr-option" onclick="AdminClients.pickAddress(${JSON.stringify(r.display_name).replace(/'/g,"&#39;")})">${escHtml(r.display_name)}</div>`
            ).join('');
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

async function uploadPetPhoto(input, i) {
    const file = input.files[0];
    if (!file) return;
    const base64 = await compressImage(file);
    if (petEntries[i]) petEntries[i].photoUrl = base64;
    renderModalPets();
}

function getAllClients() { return allClients; }

function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── EXPOSE ──────────────────────────────────────────────
window.AdminClients = {
    init, openModal, closeModal, saveModal,
    addPet, removePet, updatePet, refreshPetPreview, getAllClients,
    searchAddress, pickAddress, uploadPetPhoto
};
