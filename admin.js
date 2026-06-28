const ADMIN_EMAIL = 'wyliesfurryfriendsllc@gmail.com';

// ─── AUTH ─────────────────────────────────────────────────
async function login() {
    const email = document.getElementById('adminEmail').value.trim();
    const pw    = document.getElementById('adminPassword').value;
    const errEl = document.getElementById('loginError');
    const btn   = document.getElementById('adminLoginBtn');
    if (!email || !pw) return;
    btn.disabled = true; btn.textContent = 'Signing in...';
    errEl.style.display = 'none';
    try {
        const wff  = window.WFF;
        const cred = await wff.signInWithEmailAndPassword(wff.auth, email, pw);
        if (cred.user.email !== ADMIN_EMAIL) {
            await wff.signOut(wff.auth);
            errEl.textContent = 'Access denied.';
            errEl.style.display = 'block';
            return;
        }
        showAdminPanel();
    } catch(e) {
        errEl.textContent = 'Incorrect email or password.';
        errEl.style.display = 'block';
    } finally {
        btn.disabled = false; btn.textContent = 'Sign In';
    }
}

function showAdminPanel() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display  = 'block';
    renderAdminGallery();
    window.AdminBookings?.init();
    window.AdminClients?.init();
    window.AdminCalendar?.init();
}

function showAdminTab(tab) {
    ['bookings','clients','calendar','gallery','reviews'].forEach(t => {
        const el = document.getElementById('adminTab' + t.charAt(0).toUpperCase() + t.slice(1));
        if (el) el.style.display = t === tab ? '' : 'none';
    });
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    if (tab === 'clients')  window.AdminClients?.init();
    if (tab === 'calendar') window.AdminCalendar?.init();
    if (tab === 'reviews') {
        if (window.AdminReviews) {
            window.AdminReviews.init();
        } else {
            const t = setInterval(() => {
                if (window.AdminReviews) { clearInterval(t); window.AdminReviews.init(); }
            }, 100);
            setTimeout(() => clearInterval(t), 5000);
        }
    }
}

function logout() {
    const wff = window.WFF;
    if (wff?.signOut && wff?.auth) wff.signOut(wff.auth).catch(() => {});
    document.getElementById('adminPanel').style.display  = 'none';
    document.getElementById('loginScreen').style.display = '';
    document.getElementById('adminEmail').value    = '';
    document.getElementById('adminPassword').value = '';
}

// Auto-restore session if already signed in
window.addEventListener('load', () => {
    const wff = window.WFF;
    if (wff?.onAuthStateChanged && wff?.auth) {
        wff.onAuthStateChanged(wff.auth, user => {
            if (user && user.email === ADMIN_EMAIL) showAdminPanel();
        });
    }
});

// ─── DRAG & DROP ─────────────────────────────────────────
let _dragSrc = null;

function renderAdminGallery() {
    const grid = document.getElementById('adminGallery');
    const photos = getGalleryPhotos();
    grid.innerHTML = '';

    photos.forEach((url, i) => {
        const item = document.createElement('div');
        item.className = 'admin-photo';
        item.draggable = true;
        item.dataset.url = url;

        item.innerHTML = `
            <div class="admin-photo-drag-handle">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
            </div>
            <img src="${url}" alt="Photo ${i+1}" loading="lazy">
            <div class="admin-photo-num">${i + 1}</div>
        `;

        item.addEventListener('dragstart', e => {
            _dragSrc = item;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            document.querySelectorAll('.admin-photo').forEach(el => el.classList.remove('drag-over'));
        });
        item.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            document.querySelectorAll('.admin-photo').forEach(el => el.classList.remove('drag-over'));
            item.classList.add('drag-over');
        });
        item.addEventListener('drop', e => {
            e.preventDefault();
            if (_dragSrc && _dragSrc !== item) {
                const allItems = [...grid.querySelectorAll('.admin-photo')];
                const srcIdx  = allItems.indexOf(_dragSrc);
                const destIdx = allItems.indexOf(item);
                if (srcIdx < destIdx) {
                    grid.insertBefore(_dragSrc, item.nextSibling);
                } else {
                    grid.insertBefore(_dragSrc, item);
                }
                renumberPhotos();
            }
        });

        grid.appendChild(item);
    });
}

function renumberPhotos() {
    document.querySelectorAll('.admin-photo').forEach((el, i) => {
        const num = el.querySelector('.admin-photo-num');
        if (num) num.textContent = i + 1;
    });
}

function getAdminOrder() {
    return [...document.querySelectorAll('.admin-photo')].map(el => el.dataset.url);
}

function saveOrder() {
    const order = getAdminOrder();
    localStorage.setItem('wff_gallery_order', JSON.stringify(order));
    const status = document.getElementById('saveStatus');
    status.textContent = '✓ Order saved successfully';
    status.className = 'save-status save-ok';
    status.style.display = 'block';
    setTimeout(() => status.style.display = 'none', 3000);
}

function resetOrder() {
    if (!confirm('Reset to default order?')) return;
    localStorage.removeItem('wff_gallery_order');
    renderAdminGallery();
    const status = document.getElementById('saveStatus');
    status.textContent = 'Order reset to default';
    status.className = 'save-status save-ok';
    status.style.display = 'block';
    setTimeout(() => status.style.display = 'none', 3000);
}

// ─── INIT ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (sessionStorage.getItem('wff_admin')) {
        const wff = window.WFF;
        if (wff?.signInAnonymously && wff?.auth) {
            wff.signInAnonymously(wff.auth).catch(e => console.warn('Anon sign-in:', e));
        }
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('adminPanel').style.display  = 'block';
        renderAdminGallery();
        window.AdminBookings?.init();
        window.AdminClients?.init();
        window.AdminCalendar?.init();
    }
});
