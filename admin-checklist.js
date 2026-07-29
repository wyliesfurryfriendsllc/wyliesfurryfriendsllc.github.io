const LS_KEY = 'wff_checklist_items';

let clItems = [];
let checkedOrder = [];

function genId() { return Math.random().toString(36).slice(2, 10); }

function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function saveItems() {
    localStorage.setItem(LS_KEY, JSON.stringify(clItems));
}

function loadItems() {
    try { clItems = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { clItems = []; }
}

function updatePreview() {
    const pre = document.getElementById('clPreview');
    if (!pre) return;
    const checked = checkedOrder.map(id => clItems.find(i => i.id === id)).filter(Boolean);
    pre.textContent = checked.length
        ? checked.map(i => `☑️ ${i.label}`).join('\n')
        : '(Select items above to preview the message)';
}

function restoreChecked() {
    checkedOrder.forEach(id => {
        const cb = document.querySelector(`.cl-checkbox[data-id="${id}"]`);
        if (cb) cb.checked = true;
    });
}

function renderList() {
    const list = document.getElementById('clItemsList');
    if (!list) return;
    if (!clItems.length) {
        list.innerHTML = '<p class="cl-empty">No items yet. Click "+ Add Item" to get started.</p>';
        return;
    }
    list.innerHTML = clItems.map(item => `
        <div class="cl-item-row" id="clRow_${item.id}">
            <label class="cl-item-label">
                <input type="checkbox" class="cl-checkbox" data-id="${item.id}" onchange="AdminChecklist.onCheck(this)">
                <span class="cl-item-text" id="clText_${item.id}">${escHtml(item.label)}</span>
            </label>
            <div class="cl-item-actions">
                <button class="cl-btn-edit" onclick="AdminChecklist.editItem('${item.id}')">Edit</button>
                <button class="cl-btn-delete" onclick="AdminChecklist.deleteItem('${item.id}')">Delete</button>
            </div>
        </div>`).join('');
    restoreChecked();
}

function render() {
    const container = document.getElementById('clContent');
    if (!container) return;
    container.innerHTML = `
        <div class="admin-section-header" style="margin-bottom:20px">
            <div>
                <h2 class="admin-section-title">Care Checklist</h2>
                <p class="admin-section-sub">Build a reusable checklist and generate a message to share with clients.</p>
            </div>
        </div>
        <div class="cl-layout">
            <div class="cl-panel">
                <div class="cl-panel-header">
                    <span class="cl-panel-title">Checklist Items</span>
                    <button class="cl-add-btn" onclick="AdminChecklist.showAddRow()">+ Add Item</button>
                </div>
                <div id="clItemsList"></div>
                <div id="clAddRow" class="cl-add-row" style="display:none">
                    <input type="text" id="clAddInput" class="cl-input" placeholder="e.g. Refill water"
                        onkeydown="if(event.key==='Enter')AdminChecklist.confirmAdd();if(event.key==='Escape')AdminChecklist.hideAddRow()">
                    <button class="cl-btn-save" onclick="AdminChecklist.confirmAdd()">Add</button>
                    <button class="cl-btn-cancel" onclick="AdminChecklist.hideAddRow()">Cancel</button>
                </div>
            </div>
            <div class="cl-panel cl-export-panel">
                <div class="cl-panel-header">
                    <span class="cl-panel-title">Message Preview</span>
                    <div style="display:flex;gap:6px">
                        <button class="cl-sel-btn" onclick="AdminChecklist.selectAll()">Select All</button>
                        <button class="cl-sel-btn" onclick="AdminChecklist.clearAll()">Clear All</button>
                    </div>
                </div>
                <pre id="clPreview" class="cl-preview">(Select items on the left to preview)</pre>
                <button class="cl-copy-btn" onclick="AdminChecklist.copyMessage()">📋 Copy Message</button>
            </div>
        </div>`;
    renderList();
}

window.AdminChecklist = {
    init() {
        loadItems();
        checkedOrder = [];
        render();
    },

    onCheck(cb) {
        const id = cb.dataset.id;
        if (cb.checked) {
            if (!checkedOrder.includes(id)) checkedOrder.push(id);
        } else {
            checkedOrder = checkedOrder.filter(x => x !== id);
        }
        updatePreview();
    },

    showAddRow() {
        const row = document.getElementById('clAddRow');
        if (row) { row.style.display = 'flex'; document.getElementById('clAddInput')?.focus(); }
    },

    hideAddRow() {
        const row = document.getElementById('clAddRow');
        if (row) { row.style.display = 'none'; const inp = document.getElementById('clAddInput'); if (inp) inp.value = ''; }
    },

    confirmAdd() {
        const inp = document.getElementById('clAddInput');
        const label = inp?.value.trim();
        if (!label) { inp?.focus(); return; }
        clItems.push({ id: genId(), label });
        saveItems();
        this.hideAddRow();
        renderList();
        updatePreview();
    },

    editItem(id) {
        const span = document.getElementById(`clText_${id}`);
        const row  = document.getElementById(`clRow_${id}`);
        if (!span || !row) return;
        const current = clItems.find(i => i.id === id)?.label || '';
        span.outerHTML = `<input type="text" class="cl-edit-input" id="clEditInp_${id}" value="${escHtml(current)}"
            onkeydown="if(event.key==='Enter')AdminChecklist.saveEdit('${id}');if(event.key==='Escape')AdminChecklist.cancelEdit()">`;
        const actionsDiv = row.querySelector('.cl-item-actions');
        if (actionsDiv) actionsDiv.innerHTML = `
            <button class="cl-btn-save" onclick="AdminChecklist.saveEdit('${id}')">Save</button>
            <button class="cl-btn-cancel" onclick="AdminChecklist.cancelEdit()">Cancel</button>`;
        document.getElementById(`clEditInp_${id}`)?.focus();
    },

    saveEdit(id) {
        const inp = document.getElementById(`clEditInp_${id}`);
        const label = inp?.value.trim();
        if (!label) return;
        const item = clItems.find(i => i.id === id);
        if (item) item.label = label;
        saveItems();
        renderList();
        updatePreview();
    },

    cancelEdit() { renderList(); updatePreview(); },

    deleteItem(id) {
        if (!confirm('Delete this item?')) return;
        clItems = clItems.filter(i => i.id !== id);
        checkedOrder = checkedOrder.filter(x => x !== id);
        saveItems();
        renderList();
        updatePreview();
    },

    selectAll() {
        checkedOrder = clItems.map(i => i.id);
        document.querySelectorAll('.cl-checkbox').forEach(cb => cb.checked = true);
        updatePreview();
    },

    clearAll() {
        checkedOrder = [];
        document.querySelectorAll('.cl-checkbox').forEach(cb => cb.checked = false);
        updatePreview();
    },

    copyMessage() {
        const text = document.getElementById('clPreview')?.textContent || '';
        if (!text || text.startsWith('(')) { alert('Please select at least one item first.'); return; }
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.querySelector('.cl-copy-btn');
            if (btn) { const orig = btn.textContent; btn.textContent = '✓ Copied!'; setTimeout(() => btn.textContent = orig, 2000); }
        }).catch(() => alert('Copy failed. Please copy the text manually.'));
    }
};
