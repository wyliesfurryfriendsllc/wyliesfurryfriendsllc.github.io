const ADMIN_PASSWORD = 'wylie2024';

// ─── AUTH ─────────────────────────────────────────────────
function login() {
    const pw = document.getElementById('adminPassword').value;
    if (pw === ADMIN_PASSWORD) {
        sessionStorage.setItem('wff_admin', '1');
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('adminPanel').style.display  = 'block';
        renderAdminGallery();
    } else {
        document.getElementById('loginError').style.display = 'block';
    }
}

function logout() {
    sessionStorage.removeItem('wff_admin');
    document.getElementById('adminPanel').style.display  = 'none';
    document.getElementById('loginScreen').style.display = '';
    document.getElementById('adminPassword').value = '';
}

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
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('adminPanel').style.display  = 'block';
        renderAdminGallery();
    }
});
