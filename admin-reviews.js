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
        } catch(e) {
            console.error('AdminReviews init error:', e);
        }
        arRender();
    }
};

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

      <!-- B: Approved -->
      <div class="admin-section">
        <div class="admin-section-header">
          <div>
            <h2 class="admin-section-title">All Reviews</h2>
            <p class="admin-section-sub">Manage approved reviews and homepage featuring.</p>
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

/* ── Approved HTML ─────────────────────────────────────────── */
function arApprovedHtml() {
    const list = arReviews.filter(r => r.status === 'approved');
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
    await updateDoc(doc(db, 'reviews', id), { featuredOnHome: val });
    arReviews = arReviews.map(r => r.id === id ? { ...r, featuredOnHome: val } : r);
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
