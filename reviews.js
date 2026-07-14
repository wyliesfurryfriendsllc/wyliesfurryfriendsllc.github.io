import {
    db,
    collection, getDocs, query, where
} from './firebase.js';

let allReviews  = [];
let allTags     = [];
let activeService  = '';
let activeTags     = new Set();
let sortOrder      = 'popular';

async function init() {
    try {
        await Promise.all([loadTags(), loadReviews()]);
    } catch(e) {
        console.error('reviews init:', e);
        document.getElementById('rvSummary').textContent = '';
        document.getElementById('rvGrid').innerHTML = '<p class="rv-empty">Failed to load reviews.</p>';
        return;
    }
    renderTagChips();
    renderGrid();
    updateSummary();
    bindControls();
}

async function loadReviews() {
    const q = query(collection(db, 'reviews'), where('status', '==', 'approved'));
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
        if (sortOrder === 'popular') {
            return (b.text || '').length - (a.text || '').length;
        }
        const ta = a.dateLabel ? new Date(a.dateLabel).getTime() : 0;
        const tb = b.dateLabel ? new Date(b.dateLabel).getTime() : 0;
        return sortOrder === 'newest' ? tb - ta : ta - tb;
    });

    return list;
}

function starsHtml(n) {
    return `<span class="rv-stars-filled">${'★'.repeat(n)}</span><span class="rv-stars-empty">${'☆'.repeat(5 - n)}</span>`;
}

function serviceIconHtml(service) {
    if (!service) return '';
    const walkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><circle cx="12" cy="5" r="1"/><path d="m9 20 3-6 3 6"/><path d="m6 8 6 4 6-4"/></svg>`;
    const homeIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
    return (service.includes('Walk') ? walkIcon : homeIcon) + ' ';
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

        const metaParts = [r.service, r.dateLabel].filter(Boolean).join(' · ');
        return `
        <div class="review-card ${color}">
            <div class="rv-card-header">
                <strong class="rv-author-name">${r.authorName || 'Client'}</strong>
                <div class="review-stars">${starsHtml(r.rating || 5)}</div>
                ${metaParts ? `<div class="rv-card-meta">${serviceIconHtml(r.service)}${metaParts}</div>` : ''}
            </div>
            <p class="review-text">${r.text}</p>
            ${tagsHtml}
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
