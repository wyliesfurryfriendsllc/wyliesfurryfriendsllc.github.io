import { db, collection, getDocs, query, where } from './firebase.js';

// Row 1 = 2 cards (large spans 2 cols + 1 normal); subsequent rows = 3 cards
const REVIEWS_ROW1 = 2;
const REVIEWS_PER_ROW = 3;
let _allReviews = [];
let _reviewsVisible = REVIEWS_ROW1;

function renderReviews() {
    const grid = document.getElementById('homeReviewsGrid');
    if (!grid || !_allReviews.length) return;
    const colors = ['rc-pink','rc-green','rc-peach','rc-lavender','rc-sage','rc-rose'];
    const shown = _allReviews.slice(0, _reviewsVisible);
    grid.innerHTML = shown.map((r, i) => {
        const color = r.colorVariant || colors[i % colors.length];
        const stars = '★'.repeat(r.rating || 5) + '☆'.repeat(5 - (r.rating || 5));
        const isFirst = i === 0;
        return `
        <div class="review-card ${isFirst ? 'review-card-large ' : ''}${color}">
            <div class="review-stars">${stars}</div>
            <p class="review-text">"${r.text}"</p>
            <div class="review-footer">
                <div class="review-author">
                    <strong>${r.authorName || 'Client'}</strong>
                    <span>${r.service ? r.service + ' · ' : ''}${r.dateLabel || ''}</span>
                </div>
            </div>
        </div>`;
    }).join('');

    const btn = document.getElementById('reviewsMoreBtn');
    if (btn) btn.style.display = _reviewsVisible < _allReviews.length ? 'block' : 'none';
}

window.showMoreReviews = function() {
    _reviewsVisible += REVIEWS_PER_ROW;
    renderReviews();
};

async function loadHomeReviews() {
    const grid = document.getElementById('homeReviewsGrid');
    if (!grid) return;

    const q = query(
        collection(db, 'reviews'),
        where('status', '==', 'approved'),
        where('featuredOnHome', '==', true)
    );
    const snap = await getDocs(q);
    _allReviews = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
            const ao = a.homeOrder, bo = b.homeOrder;
            if (ao != null && bo != null) return ao - bo;
            if (ao != null) return -1;
            if (bo != null) return 1;
            return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
        });

    if (!_allReviews.length) return;
    renderReviews();
}

loadHomeReviews().catch(console.error);
