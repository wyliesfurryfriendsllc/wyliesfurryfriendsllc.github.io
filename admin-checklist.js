const LS_KEY = 'wff_checklist_items';

let clItems = [];
let _dragSrcId = null;

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

function getChecked() {
    return Array.from(document.querySelectorAll('.cl-checkbox:checked'))
        .map(cb => clItems.find(i => i.id === cb.dataset.id))
        .filter(Boolean);
}

function updatePreview() {
    const pre = document.getElementById('clPreview');
    if (!pre) return;
    const checked = getChecked();
    pre.textContent = checked.length
        ? checked.map(i => `☑️ ${i.label}`).join('\n')
        : '(Select items above to preview the message)';
}

const DRAG_HANDLE = `<span class="cl-drag-handle" title="Drag to reorder">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
</span>`;

function renderList() {
    const list = document.getElementById('clItemsList');
    if (!list) return;
    if (!clItems.length) {
        list.innerHTML = '<p class="cl-empty">No items yet. Click "+ Add Item" to get started.</p>';
        return;
    }
    list.innerHTML = clItems.map(item => `
        <div class="cl-item-row" id="clRow_${item.id}" draggable="true"
            ondragstart="AdminChecklist.onDragStart(event,'${item.id}')"
            ondragover="AdminChecklist.onDragOver(event)"
            ondrop="AdminChecklist.onDrop(event,'${item.id}')"
            ondragend="AdminChecklist.onDragEnd()">
            ${DRAG_HANDLE}
            <label class="cl-item-label">
                <input type="checkbox" class="cl-checkbox" data-id="${item.id}" onchange="AdminChecklist.onCheck()">
                <span class="cl-item-text" id="clText_${item.id}">${escHtml(item.label)}</span>
            </label>
            <div class="cl-item-actions">
                <button class="cl-btn-edit" onclick="AdminChecklist.editItem('${item.id}')">Edit</button>
                <button class="cl-btn-delete" onclick="AdminChecklist.deleteItem('${item.id}')">Delete</button>
            </div>
        </div>`).join('');
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
        render();
    },

    onCheck() { updatePreview(); },

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
            onkeydown="if(event.key==='Enter')AdminChecklist.saveEdit('${id}');if(event.key==='Escape')AdminChecklist.cancelEdit('${id}')">`;
        const actionsDiv = row.querySelector('.cl-item-actions');
        if (actionsDiv) actionsDiv.innerHTML = `
            <button class="cl-btn-save" onclick="AdminChecklist.saveEdit('${id}')">Save</button>
            <button class="cl-btn-cancel" onclick="AdminChecklist.cancelEdit('${id}')">Cancel</button>`;
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

    cancelEdit() { renderList(); },

    deleteItem(id) {
        if (!confirm('Delete this item?')) return;
        clItems = clItems.filter(i => i.id !== id);
        saveItems();
        renderList();
        updatePreview();
    },

    selectAll() {
        document.querySelectorAll('.cl-checkbox').forEach(cb => cb.checked = true);
        updatePreview();
    },

    clearAll() {
        document.querySelectorAll('.cl-checkbox').forEach(cb => cb.checked = false);
        updatePreview();
    },

    onDragStart(e, id) {
        _dragSrcId = id;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => document.getElementById(`clRow_${id}`)?.classList.add('cl-dragging'), 0);
    },

    onDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const row = e.currentTarget;
        document.querySelectorAll('.cl-item-row').forEach(r => r.classList.remove('cl-drag-over'));
        if (row.id !== `clRow_${_dragSrcId}`) row.classList.add('cl-drag-over');
    },

    onDrop(e, targetId) {
        e.preventDefault();
        if (!_dragSrcId || _dragSrcId === targetId) return;
        const srcIdx = clItems.findIndex(i => i.id === _dragSrcId);
        const tgtIdx = clItems.findIndex(i => i.id === targetId);
        if (srcIdx === -1 || tgtIdx === -1) return;
        const [moved] = clItems.splice(srcIdx, 1);
        clItems.splice(tgtIdx, 0, moved);
        saveItems();
        renderList();
        updatePreview();
    },

    onDragEnd() {
        _dragSrcId = null;
        document.querySelectorAll('.cl-item-row').forEach(r => r.classList.remove('cl-dragging', 'cl-drag-over'));
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
