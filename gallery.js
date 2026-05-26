const GALLERY_DEFAULT = [
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/rnqmvtddbs/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/dfqdwxffjj/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/aylzwamcou/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/ogqnatymph/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/tlvzsxazyw/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/aqlopykgwv/original.jpg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/chgptcekau/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/jtfaictrtv/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/tdqwahjquv/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/dfodateazq/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/hmaszvbbzv/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/rdntzudpcv/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/hufnihwkip/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/sgrbfvzpdz/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/tcavggawsz/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/xgjgrtedct/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/jdirgxupgt/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/cqoulgkpbv/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/azbcbiavst/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/ihrybvzbca/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/eqlcmypser/original.jpg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/ccxoqyzadm/original.jpg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/kmibgjnwql/original.jpg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/oglitsmynw/original.jpg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/mmaczlrufh/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/saekznhavg/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/lelvubkhqg/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/nwkfwdskib/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/deoyarqyfb/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/qyshpkocss/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/plkqcgzapo/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/tqlenlzqmz/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/kpubxtgdsh/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down',
    'https://www.rover.com/cf-image-cdn/remote/images/people/g4BkmD1A/mqbenolhrw/original.jpeg?width=1536&height=1536&quality=70&fit=scale-down'
];

// Grouped rows — each sub-array is one justified row (0-based photo index)
const GALLERY_GROUPS = [
    [0, 1, 2],
    [3, 4],
    [5, 6],
    [7, 8, 9],
    [11, 12],
];

function getGalleryPhotos() {
    try {
        const saved = localStorage.getItem('wff_gallery_order');
        if (saved) return JSON.parse(saved);
    } catch(e) {}
    return GALLERY_DEFAULT;
}

// ─── JUSTIFIED ROW SIZING ────────────────────────────────
function justifyRow(rowEl, imgs) {
    const isMobile = window.innerWidth <= 640;
    const GAP = isMobile ? 8 : 12;
    const containerW = rowEl.parentElement.clientWidth;
    const n = imgs.length;
    const totalAR = imgs.reduce((s, img) => s + img.naturalWidth / img.naturalHeight, 0);
    const rowH = (containerW - GAP * (n - 1)) / totalAR;
    imgs.forEach(img => {
        const ar = img.naturalWidth / img.naturalHeight;
        img.parentElement.style.width  = Math.round(ar * rowH) + 'px';
        img.parentElement.style.height = Math.round(rowH) + 'px';
    });
}

// ─── SCROLL REVEAL ───────────────────────────────────────
const _revealObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
        if (e.isIntersecting) {
            e.target.classList.add('visible');
            _revealObserver.unobserve(e.target);
        }
    });
}, { threshold: 0.08 });

// ─── RENDER ──────────────────────────────────────────────
let _photos = [];
let _lightboxIndex = 0;
const MOBILE_STEP = 3;
let _mobileVisible = MOBILE_STEP; // how many sections visible on mobile

function makeItem(url, absoluteIndex) {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Pet photo';
    img.loading = 'lazy';
    img.onclick = () => openLightbox(absoluteIndex);
    return { item, img };
}

function renderGallery() {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;
    _photos = getGalleryPhotos();
    grid.innerHTML = '';

    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        // ── Mobile: single flat 2-column grid, paginated ──
        const PHOTOS_PER_PAGE = MOBILE_STEP * 2; // 3 rows × 2 cols = 6 photos per page
        const visibleCount = _mobileVisible * 2;
        const mobileGrid = document.createElement('div');
        mobileGrid.className = 'gallery-mobile-grid visible';

        _photos.forEach((url, i) => {
            const { item, img } = makeItem(url, i);
            item.appendChild(img);
            if (i >= visibleCount) item.classList.add('gallery-hidden');
            mobileGrid.appendChild(item);
        });

        grid.appendChild(mobileGrid);
        grid.classList.add('visible');

        const moreWrap = document.getElementById('galleryMoreWrap');
        if (moreWrap) moreWrap.style.display = visibleCount < _photos.length ? 'block' : 'none';
        return;
    }

    // ── Desktop: justified rows + masonry tail ──
    const groupedSet = new Set(GALLERY_GROUPS.flat());

    GALLERY_GROUPS.forEach(indices => {
        const rowEl = document.createElement('div');
        rowEl.className = 'gallery-row';
        grid.appendChild(rowEl); // must be in DOM before onLoad runs (cached images call onLoad synchronously)

        const imgs = [];
        let loaded = 0;

        indices.forEach(i => {
            if (i >= _photos.length) return;
            const { item, img } = makeItem(_photos[i], i);
            item.appendChild(img);
            rowEl.appendChild(item);
            imgs.push(img);

            const onLoad = () => {
                loaded++;
                if (loaded === imgs.length) {
                    justifyRow(rowEl, imgs);
                    rowEl.classList.add('visible');
                }
            };
            img.onload = onLoad;
            if (img.complete && img.naturalWidth) onLoad();
        });
    });

    const tailIndices = _photos.map((_, i) => i).filter(i => !groupedSet.has(i));
    if (tailIndices.length > 0) {
        const tailEl = document.createElement('div');
        tailEl.className = 'gallery-grid-tail';

        tailIndices.forEach(i => {
            const { item, img } = makeItem(_photos[i], i);
            img.onload = () => img.classList.add('loaded');
            if (img.complete) img.classList.add('loaded');
            item.appendChild(img);
            tailEl.appendChild(item);
        });

        grid.appendChild(tailEl);
        setTimeout(() => tailEl.classList.add('visible'), 100);
    }

    grid.classList.add('visible');
    const moreWrap = document.getElementById('galleryMoreWrap');
    if (moreWrap) moreWrap.style.display = 'none';
}

function showMoreGallery() {
    _mobileVisible += MOBILE_STEP;
    renderGallery();
}

// Reset pagination when switching desktop ↔ mobile
window.addEventListener('resize', () => {
    if (window.innerWidth > 768) _mobileVisible = MOBILE_STEP;
});

// Recalculate justified widths on resize
let _resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(renderGallery, 150);
});

// ─── LIGHTBOX ────────────────────────────────────────────
function openLightbox(index) {
    _lightboxIndex = index;
    document.getElementById('lightboxImg').src = _photos[index];
    document.getElementById('lightbox').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    document.getElementById('lightbox').classList.remove('active');
    document.body.style.overflow = '';
}

function lightboxNav(dir) {
    _lightboxIndex = (_lightboxIndex + dir + _photos.length) % _photos.length;
    document.getElementById('lightboxImg').src = _photos[_lightboxIndex];
}

document.addEventListener('keydown', e => {
    const lb = document.getElementById('lightbox');
    if (!lb?.classList.contains('active')) return;
    if (e.key === 'Escape')     closeLightbox();
    if (e.key === 'ArrowRight') lightboxNav(1);
    if (e.key === 'ArrowLeft')  lightboxNav(-1);
});

document.addEventListener('DOMContentLoaded', renderGallery);
