import { db, collection, getDocs, query, where } from './firebase.js';

async function loadHomeReviews() {
    const grid = document.getElementById('homeReviewsGrid');
    if (!grid) return;

    const q = query(
        collection(db, 'reviews'),
        where('status', '==', 'approved'),
        where('featuredOnHome', '==', true)
    );
    const snap = await getDocs(q);
    let reviews = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));

    if (!reviews.length) return; // keep hardcoded fallback

    const colors = ['rc-pink','rc-green','rc-peach','rc-lavender','rc-sage','rc-rose'];
    grid.innerHTML = reviews.map((r, i) => {
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
}

loadHomeReviews().catch(console.error);
