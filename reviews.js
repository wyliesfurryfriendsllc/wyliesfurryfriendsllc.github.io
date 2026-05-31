import {
    db,
    collection, getDocs, query, where, orderBy
} from './firebase.js';

let allReviews  = [];
let allTags     = [];
let activeService  = '';
let activeTags     = new Set();
let sortOrder      = 'newest';

async function init() {
    await Promise.all([loadTags(), loadReviews()]);
    renderTagChips();
    renderGrid();
    updateSummary();
    bindControls();
}

async function loadReviews() {
    const q = query(
        collection(db, 'reviews'),
        where('status', '==', 'approved'),
        orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    allReviews = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function loadTags() {
    const snap = await getDocs(collection(db, 'reviewTags'));
    allTags = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function bindControls() {
    document.querySelectorAll('.rv-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            activeService = btn.dataset.service;
            document.querySelectorAll('.rv-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderGrid();
        });
    });

    document.getElementById('rvSort').addEventListener('change', e => {
        sortOrder = e.target.value;
        renderGrid();
    });
}

function renderTagChips() {
    const wrap  = document.getElementById('rvTagsWrap');
    const chips = document.getElementById('rvTagChips');
    if (!allTags.length) { wrap.style.display = 'none'; return; }

    wrap.style.display = '';
    chips.innerHTML = allTags.map(t =>
        `<button class="rv-tag-chip" data-id="${t.id}">${t.label}</button>`
    ).join('');

    chips.querySelectorAll('.rv-tag-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const id = chip.dataset.id;
            if (activeTags.has(id)) { activeTags.delete(id); chip.classList.remove('active'); }
            else                    { activeTags.add(id);    chip.classList.add('active');    }
            renderGrid();
        });
    });
}

function getFiltered() {
    let list = [...allReviews];

    if (activeService) list = list.filter(r => r.service === activeService);

    if (activeTags.size) {
        list = list.filter(r => {
            const tags = r.tags || [];
            return [...activeTags].some(tid => tags.includes(tid));
        });
    }

    list.sort((a, b) => {
        const ta = a.createdAt?.seconds ?? 0;
        const tb = b.createdAt?.seconds ?? 0;
        return sortOrder === 'newest' ? tb - ta : ta - tb;
    });

    return list;
}

function starsHtml(n) {
    return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function renderGrid() {
    const grid = document.getElementById('rvGrid');
    const list = getFiltered();

    if (!list.length) {
        grid.innerHTML = '<p class="rv-empty">No reviews found.</p>';
        return;
    }

    const colors = ['rc-pink','rc-green','rc-peach','rc-lavender','rc-sage','rc-rose'];
    grid.innerHTML = list.map((r, i) => {
        const color = r.colorVariant || colors[i % colors.length];
        const tagLabels = (r.tags || [])
            .map(tid => allTags.find(t => t.id === tid)?.label)
            .filter(Boolean);

        const tagsHtml = tagLabels.length
            ? `<div class="rv-card-tags">${tagLabels.map(l => `<span class="rv-card-tag">${l}</span>`).join('')}</div>`
            : '';

        return `
        <div class="review-card ${color}">
            <div class="review-stars">${starsHtml(r.rating || 5)}</div>
            <p class="review-text">"${r.text}"</p>
            ${tagsHtml}
            <div class="review-footer">
                <div class="review-author">
                    <strong>${r.authorName || 'Client'}</strong>
                    <span>${r.service ? r.service + ' · ' : ''}${r.dateLabel || ''}</span>
                </div>
            </div>
        </div>`;
    }).join('');
}

function updateSummary() {
    const approved = allReviews.length;
    if (!approved) { document.getElementById('rvSummary').textContent = 'No reviews yet.'; return; }
    const avg = (allReviews.reduce((s, r) => s + (r.rating || 5), 0) / approved).toFixed(1);
    document.getElementById('rvSummary').textContent =
        `${approved} review${approved !== 1 ? 's' : ''} · Average rating ${avg} / 5`;
}

init().catch(console.error);
