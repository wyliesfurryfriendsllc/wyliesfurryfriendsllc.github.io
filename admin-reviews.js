import {
    db,
    collection, addDoc, getDocs, doc, updateDoc, deleteDoc,
    query, orderBy, where, serverTimestamp
} from './firebase.js';

const COLORS = ['rc-pink','rc-green','rc-peach','rc-lavender','rc-sage','rc-rose'];

let arReviews = [];
let arTags    = [];

/* ── called by admin.js when tab is activated ─────────────── */
window.AdminReviews = {
    async init() {
        try {
            await Promise.all([arLoadTags(), arLoadReviews()]);
            await arNormalizeHomeOrders();
        } catch(e) {
            console.error('AdminReviews init error:', e);
        }
        arRender();
    }
};

// One-time initialization: assign homeOrder to featured reviews that lack it
async function arNormalizeHomeOrders() {
    const featured = arReviews
        .filter(r => r.status === 'approved' && r.featuredOnHome)
        .sort((a, b) => {
            const ao = a.homeOrder, bo = b.homeOrder;
            if (ao != null && bo != null) return ao - bo;
            if (ao != null) return -1;
            if (bo != null) return 1;
            return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
        });
    const needsUpdate = featured.some((r, i) => r.homeOrder !== i);
    if (!needsUpdate) return;
    await Promise.all(featured.map((r, i) => updateDoc(doc(db, 'reviews', r.id), { homeOrder: i })));
    featured.forEach((r, i) => {
        arReviews = arReviews.map(x => x.id === r.id ? { ...x, homeOrder: i } : x);
    });
}

async function arLoadReviews() {
    const q    = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    arReviews  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function arLoadTags() {
    const snap = await getDocs(collection(db, 'reviewTags'));
    arTags = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function arRender() {
    const el = document.getElementById('arContent');
    if (!el) return;
    el.innerHTML = `
    <div class="ar-wrap">

      <!-- A: Pending -->
      <div class="admin-section">
        <div class="admin-section-header">
          <div>
            <h2 class="admin-section-title">Pending Reviews</h2>
            <p class="admin-section-sub">Reviews submitted by clients awaiting approval.</p>
          </div>
        </div>
        <div id="arPendingList">${arPendingHtml()}</div>
      </div>

      <!-- A2: Featured on Home -->
      <div class="admin-section">
        <div class="admin-section-header">
          <div>
            <h2 class="admin-section-title">Featured on Home</h2>
            <p class="admin-section-sub">Reviews shown on the homepage. Use ↑↓ to set display order.</p>
          </div>
        </div>
        <div id="arFeaturedList">${arFeaturedHtml()}</div>
      </div>

      <!-- B: Approved -->
      <div class="admin-section">
        <div class="admin-section-header">
          <div>
            <h2 class="admin-section-title">All Reviews</h2>
            <p class="admin-section-sub">Manage approved reviews and homepage featuring.</p>
          </div>
          <div class="ar-sort-row">
            <label>Sort:
              <select id="arApprovedSort" onchange="arSortApproved(this.value)">
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
              </select>
            </label>
          </div>
        </div>
        <div id="arApprovedList">${arApprovedHtml()}</div>
      </div>

      <!-- C: Add Review -->
      <div class="admin-section">
        <div class="admin-section-header">
          <div>
            <h2 class="admin-section-title">Add Review</h2>
            <p class="admin-section-sub">Manually add a review (shown as approved immediately).</p>
          </div>
        </div>
        ${arAddFormHtml()}
      </div>

      <!-- D: Tags -->
      <div class="admin-section">
        <div class="admin-section-header">
          <div>
            <h2 class="admin-section-title">Review Tags</h2>
            <p class="admin-section-sub">Manage tags that can be assigned to reviews.</p>
          </div>
        </div>
        <div id="arTagsList">${arTagsHtml()}</div>
        <div class="ar-add-tag-row">
          <input class="ar-input" id="arNewTagInput" placeholder="New tag label..." style="max-width:240px">
          <button class="admin-btn-primary" onclick="arAddTag()">Add Tag</button>
        </div>
      </div>

    </div>`;
}

/* ── Pending HTML ──────────────────────────────────────────── */
function arPendingHtml() {
    const list = arReviews.filter(r => r.status === 'pending');
    if (!list.length) return '<p class="ar-empty">No pending reviews.</p>';
    return list.map(r => `
    <div class="ar-card" id="arc_${r.id}">
      <div class="ar-card-meta">
        <strong>${esc(r.authorName)}</strong>
        <span class="ar-badge ar-badge-pending">Pending</span>
        <span>${esc(r.service)}</span>
        <span>${starsText(r.rating)}</span>
        <span class="ar-date">${r.dateLabel || ''}</span>
      </div>
      <p class="ar-card-text">${esc(r.text)}</p>
      <div class="ar-card-actions">
        <button class="admin-btn-primary ar-btn-sm" onclick="arApprove('${r.id}')">Approve</button>
        <button class="admin-btn-secondary ar-btn-sm" onclick="arReject('${r.id}')">Reject</button>
      </div>
    </div>`).join('');
}

/* ── Featured on Home HTML (drag + number input) ───────────── */
function arFeaturedSorted() {
    return arReviews
        .filter(r => r.status === 'approved' && r.featuredOnHome)
        .sort((a, b) => (a.homeOrder ?? 9999) - (b.homeOrder ?? 9999));
}

function arFeaturedHtml() {
    const list = arFeaturedSorted();
    if (!list.length) return '<p class="ar-empty">No reviews featured on home yet.</p>';
    return list.map((r, i) => `
    <div class="ar-featured-row" id="arf_${r.id}" draggable="true"
         ondragstart="arDragStart(event,'${r.id}')"
         ondragover="arDragOver(event)"
         ondragleave="arDragLeave(event)"
         ondrop="arDrop(event,'${r.id}')"
         ondragend="arDragEnd()">
      <span class="ar-drag-handle">⠿</span>
      <input type="number" class="ar-order-input" value="${i + 1}" min="1" max="${list.length}"
             onchange="arSetOrder('${r.id}', +this.value)">
      <div class="ar-featured-info">
        <strong>${esc(r.authorName)}</strong>
        <span class="ar-date">${esc(r.service)} · ${r.dateLabel || ''}</span>
        <p class="ar-featured-text">"${esc(r.text.length > 80 ? r.text.slice(0, 80) + '…' : r.text)}"</p>
      </div>
    </div>`).join('');
}

let _dragSrcId = null;

function arDragStart(e, id) {
    _dragSrcId = id;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => { const el = document.getElementById('arf_' + id); if (el) el.classList.add('ar-dragging'); }, 0);
}
window.arDragStart = arDragStart;

function arDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.ar-featured-row').forEach(el => el.classList.remove('ar-drag-over'));
    e.currentTarget.classList.add('ar-drag-over');
}
window.arDragOver = arDragOver;

function arDragLeave(e) {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    e.currentTarget.classList.remove('ar-drag-over');
}
window.arDragLeave = arDragLeave;

function arDragEnd() {
    document.querySelectorAll('.ar-featured-row').forEach(el => {
        el.classList.remove('ar-dragging', 'ar-drag-over');
    });
}
window.arDragEnd = arDragEnd;

async function arDrop(e, targetId) {
    e.preventDefault();
    arDragEnd();
    if (!_dragSrcId || _dragSrcId === targetId) return;
    const list = arFeaturedSorted();
    const srcIdx = list.findIndex(r => r.id === _dragSrcId);
    const tgtIdx = list.findIndex(r => r.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) return;
    const [moved] = list.splice(srcIdx, 1);
    list.splice(tgtIdx, 0, moved);
    await arSaveOrder(list);
}
window.arDrop = arDrop;

async function arSetOrder(id, newPos) {
    const list = arFeaturedSorted();
    const srcIdx = list.findIndex(r => r.id === id);
    const tgtIdx = Math.max(0, Math.min(list.length - 1, newPos - 1));
    if (srcIdx < 0 || srcIdx === tgtIdx) { document.getElementById('arFeaturedList').innerHTML = arFeaturedHtml(); return; }
    const [moved] = list.splice(srcIdx, 1);
    list.splice(tgtIdx, 0, moved);
    await arSaveOrder(list);
}
window.arSetOrder = arSetOrder;

async function arSaveOrder(list) {
    await Promise.all(list.map((r, i) => updateDoc(doc(db, 'reviews', r.id), { homeOrder: i })));
    list.forEach((r, i) => {
        arReviews = arReviews.map(x => x.id === r.id ? { ...x, homeOrder: i } : x);
    });
    document.getElementById('arFeaturedList').innerHTML = arFeaturedHtml();
}

let arApprovedSortOrder = 'newest';

function arSortApproved(val) {
    arApprovedSortOrder = val;
    document.getElementById('arApprovedList').innerHTML = arApprovedHtml();
}
window.arSortApproved = arSortApproved;

/* ── Approved HTML ─────────────────────────────────────────── */
function arApprovedHtml() {
    let list = arReviews.filter(r => r.status === 'approved');
    list.sort((a, b) => {
        const ta = a.dateLabel ? new Date(a.dateLabel).getTime() : 0;
        const tb = b.dateLabel ? new Date(b.dateLabel).getTime() : 0;
        return arApprovedSortOrder === 'newest' ? tb - ta : ta - tb;
    });
    if (!list.length) return '<p class="ar-empty">No approved reviews yet.</p>';
    return list.map(r => {
        const tagOptions = arTags.map(t =>
            `<option value="${t.id}" ${(r.tags||[]).includes(t.id)?'selected':''}>${esc(t.label)}</option>`
        ).join('');

        return `
    <div class="ar-card" id="arc_${r.id}">
      <div class="ar-card-meta">
        <strong>${esc(r.authorName)}</strong>
        <span class="ar-badge ar-badge-approved">Approved</span>
        <span>${esc(r.service)}</span>
        <span>${starsText(r.rating)}</span>
        <span class="ar-date">${r.dateLabel || ''}</span>
        ${r.source === 'admin' ? '<span class="ar-badge ar-badge-admin">Admin</span>' : ''}
      </div>
      <p class="ar-card-text">${esc(r.text)}</p>
      <div class="ar-card-row">
        <label class="ar-toggle-label">
          <input type="checkbox" ${r.featuredOnHome ? 'checked' : ''} onchange="arToggleFeatured('${r.id}', this.checked)">
          Featured on Home
        </label>
        <label class="ar-toggle-label" style="margin-left:16px">
          Color:
          <select onchange="arUpdateColor('${r.id}', this.value)">
            ${COLORS.map(c => `<option value="${c}" ${r.colorVariant===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </label>
      </div>
      ${arTags.length ? `
      <div class="ar-card-row" style="margin-top:8px">
        <label class="ar-toggle-label">Tags:
          <select multiple class="ar-tag-select" onchange="arUpdateTags('${r.id}', this)">
            ${tagOptions}
          </select>
        </label>
      </div>` : ''}
      <div class="ar-card-actions" style="margin-top:8px">
        <button class="admin-btn-primary ar-btn-sm" onclick="arOpenEdit('${r.id}')">Edit</button>
        <button class="admin-btn-secondary ar-btn-sm" onclick="arDeleteReview('${r.id}')">Delete</button>
      </div>
    </div>`;
    }).join('');
}

/* ── Add Form HTML ─────────────────────────────────────────── */
function arAddFormHtml() {
    const tagCheckboxes = arTags.map(t =>
        `<label class="ar-toggle-label"><input type="checkbox" value="${t.id}" class="ar-form-tag"> ${esc(t.label)}</label>`
    ).join(' ');

    return `
    <div class="ar-add-form">
      <div class="ar-form-row">
        <div class="ar-form-field">
          <label>Author Name</label>
          <input class="ar-input" id="arFAuthor" placeholder="e.g. Monica K.">
        </div>
        <div class="ar-form-field">
          <label>Service</label>
          <select class="ar-input" id="arFService">
            <option value="Drop-In Visit">Drop-In Visit</option>
            <option value="Dog Walking">Dog Walking</option>
          </select>
        </div>
        <div class="ar-form-field">
          <label>Rating</label>
          <select class="ar-input" id="arFRating">
            <option value="5">★★★★★ (5)</option>
            <option value="4">★★★★☆ (4)</option>
            <option value="3">★★★☆☆ (3)</option>
            <option value="2">★★☆☆☆ (2)</option>
            <option value="1">★☆☆☆☆ (1)</option>
          </select>
        </div>
        <div class="ar-form-field">
          <label>Date Label</label>
          <div style="display:flex;gap:6px">
            <select class="ar-input" id="arFMonth" style="flex:1">
              ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
                .map((m,i) => `<option value="${m}" ${i === new Date().getMonth() ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
            <select class="ar-input" id="arFDay" style="width:68px">
              ${Array.from({length:31},(_,i)=>i+1)
                .map(d=>`<option value="${d}" ${d===new Date().getDate()?'selected':''}>${d}</option>`).join('')}
            </select>
            <select class="ar-input" id="arFYear" style="width:80px">
              ${Array.from({length:5},(_,i)=> new Date().getFullYear()-i)
                .map(y=>`<option value="${y}">${y}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
      <div class="ar-form-row">
        <div class="ar-form-field" style="flex:2">
          <label>Review Text</label>
          <textarea class="ar-input ar-textarea" id="arFText" placeholder="Review content..."></textarea>
        </div>
        <div class="ar-form-field">
          <label>Color Variant</label>
          <select class="ar-input" id="arFColor">
            ${COLORS.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="ar-form-row" style="align-items:center;gap:16px;flex-wrap:wrap">
        <label class="ar-toggle-label">
          <input type="checkbox" id="arFFeatured"> Featured on Home
        </label>
        ${arTags.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span style="font-size:13px;font-weight:500">Tags:</span>${tagCheckboxes}</div>` : ''}
      </div>
      <button class="admin-btn-primary" style="margin-top:12px" onclick="arSubmitAdd()">Add Review</button>
      <p id="arAddMsg" style="margin-top:8px;font-size:13px"></p>
    </div>`;
}

/* ── Tags HTML ─────────────────────────────────────────────── */
function arTagsHtml() {
    if (!arTags.length) return '<p class="ar-empty">No tags yet.</p>';
    return `<div class="ar-tags-list">${arTags.map(t => `
    <div class="ar-tag-row" id="artrow_${t.id}">
      <input class="ar-input ar-tag-edit-input" value="${esc(t.label)}" id="arte_${t.id}">
      <button class="admin-btn-secondary ar-btn-sm" onclick="arSaveTag('${t.id}')">Save</button>
      <button class="admin-btn-secondary ar-btn-sm" onclick="arDeleteTag('${t.id}')">Delete</button>
    </div>`).join('')}</div>`;
}

/* ── Actions ───────────────────────────────────────────────── */
async function arApprove(id) {
    await updateDoc(doc(db, 'reviews', id), { status: 'approved' });
    await refresh();
}
window.arApprove = arApprove;

async function arReject(id) {
    if (!confirm('Reject this review?')) return;
    await updateDoc(doc(db, 'reviews', id), { status: 'rejected' });
    await refresh();
}
window.arReject = arReject;

async function arDeleteReview(id) {
    if (!confirm('Delete this review permanently?')) return;
    await deleteDoc(doc(db, 'reviews', id));
    await refresh();
}
window.arDeleteReview = arDeleteReview;

async function arToggleFeatured(id, val) {
    const update = { featuredOnHome: val };
    if (val) {
        const maxOrder = Math.max(-1, ...arReviews
            .filter(r => r.featuredOnHome && r.id !== id)
            .map(r => r.homeOrder ?? -1));
        update.homeOrder = maxOrder + 1;
    }
    await updateDoc(doc(db, 'reviews', id), update);
    arReviews = arReviews.map(r => r.id === id ? { ...r, ...update } : r);
    document.getElementById('arFeaturedList').innerHTML = arFeaturedHtml();
}
window.arToggleFeatured = arToggleFeatured;

async function arUpdateColor(id, val) {
    await updateDoc(doc(db, 'reviews', id), { colorVariant: val });
    arReviews = arReviews.map(r => r.id === id ? { ...r, colorVariant: val } : r);
}
window.arUpdateColor = arUpdateColor;

async function arUpdateTags(id, select) {
    const tags = Array.from(select.selectedOptions).map(o => o.value);
    await updateDoc(doc(db, 'reviews', id), { tags });
    arReviews = arReviews.map(r => r.id === id ? { ...r, tags } : r);
}
window.arUpdateTags = arUpdateTags;

async function arSubmitAdd() {
    const author   = document.getElementById('arFAuthor').value.trim();
    const service  = document.getElementById('arFService').value;
    const rating   = Number(document.getElementById('arFRating').value);
    const dateLabel= (document.getElementById('arFMonth').value + ' ' + document.getElementById('arFDay').value + ', ' + document.getElementById('arFYear').value).trim();
    const text     = document.getElementById('arFText').value.trim();
    const color    = document.getElementById('arFColor').value;
    const featured = document.getElementById('arFFeatured').checked;
    const tagEls   = document.querySelectorAll('.ar-form-tag:checked');
    const tags     = Array.from(tagEls).map(e => e.value);
    const msg      = document.getElementById('arAddMsg');

    if (!author || !text) { msg.textContent = 'Author name and review text are required.'; msg.style.color='#c0392b'; return; }

    msg.textContent = 'Saving...'; msg.style.color = '#888';
    try {
        await addDoc(collection(db, 'reviews'), {
            authorName: author, service, rating, dateLabel, text,
            colorVariant: color, featuredOnHome: featured, tags,
            status: 'approved', source: 'admin',
            bookingId: null, userId: null,
            createdAt: serverTimestamp()
        });
        msg.textContent = 'Review added successfully!'; msg.style.color = '#1e8449';
        await refresh();
    } catch(e) {
        console.error('arSubmitAdd error:', e);
        msg.textContent = 'Error: ' + e.message; msg.style.color = '#c0392b';
    }
}
window.arSubmitAdd = arSubmitAdd;

async function arAddTag() {
    const input = document.getElementById('arNewTagInput');
    const label = input?.value.trim();
    if (!label) return;
    await addDoc(collection(db, 'reviewTags'), { label });
    input.value = '';
    await refresh();
}
window.arAddTag = arAddTag;

async function arSaveTag(id) {
    const val = document.getElementById(`arte_${id}`)?.value.trim();
    if (!val) return;
    await updateDoc(doc(db, 'reviewTags', id), { label: val });
    await refresh();
}
window.arSaveTag = arSaveTag;

async function arDeleteTag(id) {
    if (!confirm('Delete this tag? It will be removed from all reviews.')) return;
    await deleteDoc(doc(db, 'reviewTags', id));
    // remove tag from all reviews that have it
    const affected = arReviews.filter(r => (r.tags || []).includes(id));
    await Promise.all(affected.map(r =>
        updateDoc(doc(db, 'reviews', r.id), { tags: (r.tags || []).filter(t => t !== id) })
    ));
    await refresh();
}
window.arDeleteTag = arDeleteTag;

/* ── Edit Modal ────────────────────────────────────────────── */
function arOpenEdit(id) {
    const r = arReviews.find(x => x.id === id);
    if (!r) return;

    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dateParts = r.dateLabel ? r.dateLabel.split(/[\s,]+/) : [];
    const selMonth = dateParts[0] || 'Jan';
    const selDay   = dateParts[1] || '1';
    const selYear  = dateParts[2] || new Date().getFullYear();

    const overlay = document.createElement('div');
    overlay.id = 'arEditOverlay';
    overlay.className = 'admin-modal-overlay';
    overlay.style.cssText = 'display:flex;align-items:center;justify-content:center;z-index:1000';
    overlay.innerHTML = `
    <div class="admin-modal" style="max-width:560px;width:100%;padding:28px">
      <h3 style="margin:0 0 20px;font-size:18px;color:var(--brown)">Edit Review</h3>
      <div class="ar-form-row">
        <div class="ar-form-field"><label>Author Name</label>
          <input class="ar-input" id="arEAuthor" value="${esc(r.authorName)}"></div>
        <div class="ar-form-field"><label>Service</label>
          <select class="ar-input" id="arEService">
            <option ${r.service==='Drop-In Visit'?'selected':''}>Drop-In Visit</option>
            <option ${r.service==='Dog Walking'?'selected':''}>Dog Walking</option>
          </select></div>
      </div>
      <div class="ar-form-row">
        <div class="ar-form-field"><label>Rating</label>
          <select class="ar-input" id="arERating">
            ${[5,4,3,2,1].map(n=>`<option value="${n}" ${r.rating==n?'selected':''}>${'★'.repeat(n)}${'☆'.repeat(5-n)} (${n})</option>`).join('')}
          </select></div>
        <div class="ar-form-field"><label>Date Label</label>
          <div style="display:flex;gap:6px">
            <select class="ar-input" id="arEMonth" style="flex:1">
              ${months.map(m=>`<option ${m===selMonth?'selected':''}>${m}</option>`).join('')}
            </select>
            <select class="ar-input" id="arEDay" style="width:68px">
              ${Array.from({length:31},(_,i)=>i+1).map(d=>`<option ${d==selDay?'selected':''}>${d}</option>`).join('')}
            </select>
            <select class="ar-input" id="arEYear" style="width:80px">
              ${Array.from({length:5},(_,i)=>new Date().getFullYear()-i).map(y=>`<option ${y==selYear?'selected':''}>${y}</option>`).join('')}
            </select>
          </div></div>
      </div>
      <div class="ar-form-field" style="margin-bottom:12px"><label>Review Text</label>
        <textarea class="ar-input ar-textarea" id="arEText">${esc(r.text)}</textarea></div>
      <div style="display:flex;gap:16px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
        <label class="ar-toggle-label"><input type="checkbox" id="arEFeatured" ${r.featuredOnHome?'checked':''}> Featured on Home</label>
        <label class="ar-toggle-label">Color:
          <select class="ar-input" id="arEColor">
            ${COLORS.map(c=>`<option ${r.colorVariant===c?'selected':''}>${c}</option>`).join('')}
          </select></label>
      </div>
      <p id="arEditMsg" style="font-size:13px;margin-bottom:8px"></p>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="admin-btn-secondary" onclick="document.getElementById('arEditOverlay').remove()">Cancel</button>
        <button class="admin-btn-primary" onclick="arSaveEdit('${id}')">Save</button>
      </div>
    </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}
window.arOpenEdit = arOpenEdit;

async function arSaveEdit(id) {
    const author   = document.getElementById('arEAuthor').value.trim();
    const service  = document.getElementById('arEService').value;
    const rating   = Number(document.getElementById('arERating').value);
    const month    = document.getElementById('arEMonth').value;
    const day      = document.getElementById('arEDay').value;
    const year     = document.getElementById('arEYear').value;
    const dateLabel= `${month} ${day}, ${year}`;
    const text     = document.getElementById('arEText').value.trim();
    const featured = document.getElementById('arEFeatured').checked;
    const color    = document.getElementById('arEColor').value;
    const msg      = document.getElementById('arEditMsg');

    if (!author || !text) { msg.textContent = 'Author and text are required.'; msg.style.color='#c0392b'; return; }
    msg.textContent = 'Saving...'; msg.style.color = '#888';
    try {
        await updateDoc(doc(db, 'reviews', id), { authorName:author, service, rating, dateLabel, text, featuredOnHome:featured, colorVariant:color });
        document.getElementById('arEditOverlay')?.remove();
        await refresh();
    } catch(e) {
        msg.textContent = 'Error: ' + e.message; msg.style.color = '#c0392b';
    }
}
window.arSaveEdit = arSaveEdit;

async function refresh() {
    await Promise.all([arLoadReviews(), arLoadTags()]);
    arRender();
}

/* ── Auto-init if Reviews tab is already visible when module loads ── */
if (document.getElementById('adminTabReviews')?.style.display !== 'none') {
    window.AdminReviews.init();
}

/* ── Helpers ───────────────────────────────────────────────── */
function starsText(n) { return '★'.repeat(n || 5) + '☆'.repeat(5 - (n || 5)); }
function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
