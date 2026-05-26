// Pricing config
const PRICING = {
    dropin:  { base: 23, addon60: 20, holiday: 31, extraDog: 9, cat: 23, extraCat: 9 },
    walking: { base: 26, addon60: 23, holiday: 34, extraDog: 9 }
};

// Holiday date ranges (inclusive)
const HOLIDAY_RANGES = [
    ['2026-05-22', '2026-05-25'],
    ['2026-06-19', '2026-06-21'],
    ['2026-07-03', '2026-07-05'],
    ['2026-09-04', '2026-09-07'],
    ['2026-11-26', '2026-11-29'],
    ['2026-12-24', '2027-01-03']
];

function isHolidayDate(dateStr) {
    return HOLIDAY_RANGES.some(([start, end]) => dateStr >= start && dateStr <= end);
}

function dateRangeHasHoliday(startStr, endStr) {
    const s = new Date(startStr + 'T00:00:00');
    const e = new Date(endStr   + 'T00:00:00');
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        const str = d.toISOString().split('T')[0];
        if (isHolidayDate(str)) return true;
    }
    return false;
}

function bookingHasHoliday() {
    const dateMode = document.querySelector('input[name="dateMode"]:checked')?.value || 'pick';
    if (dateMode === 'pick') {
        return [...selectedDates].some(isHolidayDate);
    } else {
        const start = document.getElementById('rangeStart')?.value;
        const end   = document.getElementById('rangeEnd')?.value;
        return (start && end) ? dateRangeHasHoliday(start, end) : false;
    }
}

// ─── STATE ───────────────────────────────────────────────
let selectedDates = new Set(); // 'YYYY-MM-DD' strings
let calYear, calMonth;
let petCount = 0;
let savedUserPets = [];  // pets loaded from Firestore profile

// Collected data for step 2
let _bookingData = {};

// ─── SERVICE / DURATION ──────────────────────────────────
function getService()  { return document.querySelector('input[name="service"]:checked').value; }
function getDuration() { return document.querySelector('input[name="duration"]:checked').value; }

// ─── DATE MODE ───────────────────────────────────────────
function switchDateMode(mode) {
    document.getElementById('pickMode').style.display  = mode === 'pick'  ? '' : 'none';
    document.getElementById('rangeMode').style.display = mode === 'range' ? '' : 'none';
    updateSummary();
}

// ─── CALENDAR ────────────────────────────────────────────
function toggleCalendar() {
    const wrap = document.getElementById('calendarWrap');
    const hidden = wrap.style.display === 'none' || wrap.style.display === '';
    if (hidden) { openCalendar(); } else { closeCalendar(); }
}

function openCalendar() {
    const now = new Date();
    if (calYear === undefined) { calYear = now.getFullYear(); calMonth = now.getMonth(); }
    renderCalendar();
    document.getElementById('calendarWrap').style.display = 'block';
}

function closeCalendar() {
    document.getElementById('calendarWrap').style.display = 'none';
    renderSelectedDatesList();
    updateCalendarTriggerText();
    updateSummary();
}

function changeMonth(dir) {
    calMonth += dir;
    if (calMonth < 0)  { calMonth = 11; calYear--; }
    if (calMonth > 11) { calMonth = 0;  calYear++; }
    renderCalendar();
}

function renderCalendar() {
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    document.getElementById('calMonthLabel').textContent = `${MONTHS[calMonth]} ${calYear}`;

    const today    = new Date(); today.setHours(0,0,0,0);
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysIn   = new Date(calYear, calMonth + 1, 0).getDate();
    const grid     = document.getElementById('calendarDays');
    grid.innerHTML = '';

    for (let i = 0; i < firstDay; i++) {
        const blank = document.createElement('div');
        blank.className = 'cal-day cal-blank';
        grid.appendChild(blank);
    }

    for (let d = 1; d <= daysIn; d++) {
        const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dateObj = new Date(calYear, calMonth, d);
        const isPast  = dateObj < today;

        const cell = document.createElement('div');
        cell.className = 'cal-day' +
            (isPast ? ' cal-past' : '') +
            (selectedDates.has(dateStr) ? ' cal-selected' : '') +
            (isHolidayDate(dateStr) ? ' cal-holiday' : '');
        cell.textContent = d;

        if (!isPast) {
            cell.onclick = () => {
                if (selectedDates.has(dateStr)) {
                    selectedDates.delete(dateStr);
                    cell.classList.remove('cal-selected');
                } else {
                    selectedDates.add(dateStr);
                    cell.classList.add('cal-selected');
                }
            };
        }
        grid.appendChild(cell);
    }
}

function updateCalendarTriggerText() {
    const count = selectedDates.size;
    const el = document.getElementById('calendarTriggerText');
    if (count === 0) {
        el.textContent = 'Choose dates...';
    } else if (count === 1) {
        el.textContent = formatDate([...selectedDates][0]);
    } else {
        el.textContent = `${count} dates selected`;
    }
}

// ─── SELECTED DATES LIST ─────────────────────────────────
function renderSelectedDatesList() {
    const container = document.getElementById('selectedDatesList');

    const saved = {};
    container.querySelectorAll('.date-entry').forEach(entry => {
        const ds = entry.dataset.date;
        if (!ds) return;
        const tid    = `dt_${ds.replace(/-/g,'_')}`;
        const typeEl = document.querySelector(`input[name="timeType_${tid}"]:checked`);
        saved[ds] = {
            type:    typeEl?.value || 'specific',
            specHr:  document.getElementById(`timeSpecHr_${tid}`)?.value ?? '',
            specMin: document.getElementById(`timeSpecMin_${tid}`)?.value ?? '00',
            fromHr:  document.getElementById(`timeFromHr_${tid}`)?.value ?? '',
            fromMin: document.getElementById(`timeFromMin_${tid}`)?.value ?? '00',
            toHr:    document.getElementById(`timeToHr_${tid}`)?.value ?? '',
            toMin:   document.getElementById(`timeToMin_${tid}`)?.value ?? '00',
        };
    });

    container.innerHTML = '';
    const sorted = [...selectedDates].sort();
    if (sorted.length === 0) return;

    sorted.forEach((dateStr, index) => {
        const tid     = `dt_${dateStr.replace(/-/g,'_')}`;
        const isFirst = index === 0;
        const s       = saved[dateStr] || {};
        const type0   = s.type || (isFirst ? 'specific' : 'same');

        const div = document.createElement('div');
        div.className    = 'date-entry';
        div.dataset.date = dateStr;

        const sameChecked     = !isFirst && type0 === 'same';
        const specificChecked = type0 === 'specific';
        const windowChecked   = type0 === 'window';

        div.innerHTML = `
            <div class="date-entry-header">
                <span class="date-entry-label">${formatDate(dateStr)}</span>
            </div>
            <div class="toggle-pills mb-16">
                ${!isFirst ? `
                <label class="pill-option">
                    <input type="radio" name="timeType_${tid}" value="same" ${sameChecked?'checked':''} onchange="toggleDateTimeType('${tid}')">
                    <span>Same as Day 1</span>
                </label>` : ''}
                <label class="pill-option">
                    <input type="radio" name="timeType_${tid}" value="specific" ${specificChecked?'checked':''} onchange="toggleDateTimeType('${tid}')">
                    <span>Specific time</span>
                </label>
                <label class="pill-option">
                    <input type="radio" name="timeType_${tid}" value="window" ${windowChecked?'checked':''} onchange="toggleDateTimeType('${tid}')">
                    <span>Time window</span>
                </label>
            </div>
            <div id="specificWrap_${tid}" class="form-group" style="margin-bottom:0;${!specificChecked?'display:none':''}">
                <label>Preferred time</label>
                <div class="time-hm-wrap">
                    <select id="timeSpecHr_${tid}" onchange="updateSummary()">${hrOptions(s.specHr)}</select>
                    <span class="time-hm-colon">:</span>
                    <select id="timeSpecMin_${tid}" onchange="updateSummary()">${minOptions(s.specMin)}</select>
                </div>
            </div>
            <div id="windowWrap_${tid}" style="${windowChecked?'':'display:none'}">
                <div class="form-row">
                    <div class="form-group half">
                        <label>From</label>
                        <div class="time-hm-wrap">
                            <select id="timeFromHr_${tid}" onchange="updateSummary()">${hrOptions(s.fromHr)}</select>
                            <span class="time-hm-colon">:</span>
                            <select id="timeFromMin_${tid}" onchange="updateSummary()">${minOptions(s.fromMin)}</select>
                        </div>
                    </div>
                    <div class="form-group half">
                        <label>To</label>
                        <div class="time-hm-wrap">
                            <select id="timeToHr_${tid}" onchange="updateSummary()">${hrOptions(s.toHr)}</select>
                            <span class="time-hm-colon">:</span>
                            <select id="timeToMin_${tid}" onchange="updateSummary()">${minOptions(s.toMin)}</select>
                        </div>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

function toggleDateTimeType(tid) {
    const type = document.querySelector(`input[name="timeType_${tid}"]:checked`).value;
    document.getElementById(`specificWrap_${tid}`).style.display = type === 'specific' ? '' : 'none';
    document.getElementById(`windowWrap_${tid}`).style.display   = type === 'window'   ? '' : 'none';
    updateSummary();
}

// ─── TIME HELPERS ─────────────────────────────────────────
function hrOptions(sel) {
    let h = '<option value="">Hr</option>';
    for (let i = 0; i <= 23; i++) {
        h += `<option value="${i}"${String(sel)===String(i)?'selected':''}>${i}</option>`;
    }
    return h;
}

function minOptions(sel) {
    return ['00','15','30','45'].map(m =>
        `<option value="${m}"${sel===m?'selected':''}>${m}</option>`
    ).join('');
}

function getHMTime(hrId, minId) {
    const hr  = document.getElementById(hrId)?.value;
    const min = document.getElementById(minId)?.value;
    if (hr === '' || hr == null || min == null) return '';
    return `${String(hr).padStart(2,'0')}:${min}`;
}

// ─── RANGE TIME ───────────────────────────────────────────
function switchRangeTime(type) {
    document.getElementById('rangeSpecificWrap').style.display = type === 'specific' ? '' : 'none';
    document.getElementById('rangeWindowWrap').style.display   = type === 'window'   ? '' : 'none';
    updateSummary();
}

function populateRangeTimeSelects() {
    ['rangeSpecHr', 'rangeFromHr', 'rangeToHr'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = hrOptions('');
    });
}

// ─── SAVED PETS ──────────────────────────────────────────
function renderSavedPetCards(pets) {
    savedUserPets = pets;
    const container = document.getElementById('savedPetCards');
    const addBtn = document.getElementById('addAnotherPetBtn');
    if (!container) return;

    if (!pets || pets.length === 0) {
        container.innerHTML = '';
        // Show "Add a Pet" modal button
        const savedPetBtn = document.getElementById('addSavedPetBtn');
        if (savedPetBtn) savedPetBtn.style.display = '';
        if (addBtn) addBtn.style.display = 'none';
        if (document.getElementById('petList').children.length === 0) addPetEntry();
        return;
    }

    // Has saved pets — render selection cards
    container.innerHTML = `
        <p class="saved-pets-hint">Select the pets for this visit:</p>
        <div class="saved-pet-list">
            ${pets.map((p, i) => {
                const emoji = p.type === 'cat' ? '🐱' : '🐶';
                const avatar = p.photoUrl
                    ? `<img class="sp-avatar" src="${p.photoUrl}" alt="${p.name || ''}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
                    : '';
                const ageStr = [p.ageYears ? p.ageYears + 'yr' : '', p.ageMonths ? p.ageMonths + 'mo' : ''].filter(Boolean).join(' ');
                const meta = [p.breed, ageStr].filter(Boolean).join(' · ');
                return `<label class="saved-pet-card" id="spc${i}">
                    <input type="checkbox" class="sp-check" data-idx="${i}" checked onchange="updateSummary()">
                    <div class="sp-avatar-wrap">
                        ${avatar}<div class="sp-emoji" style="${p.photoUrl ? 'display:none' : ''}">${emoji}</div>
                    </div>
                    <div class="sp-info">
                        <div class="sp-name">${p.name || '—'}</div>
                        ${meta ? `<div class="sp-meta">${meta}</div>` : ''}
                    </div>
                    <div class="sp-check-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                </label>`;
            }).join('')}
        </div>`;

    // Show both buttons
    if (addBtn) addBtn.style.display = '';
    const savedPetBtn = document.getElementById('addSavedPetBtn');
    if (savedPetBtn) savedPetBtn.style.display = '';
    // Clear manual pet list
    document.getElementById('petList').innerHTML = '';
    petCount = 0;
    updateSummary();
}

function getSelectedSavedPets() {
    return [...document.querySelectorAll('.sp-check:checked')].map(cb => {
        const idx = parseInt(cb.dataset.idx);
        return savedUserPets[idx];
    }).filter(Boolean);
}

// ─── PET ENTRIES ─────────────────────────────────────────
function addPetEntry() {
    petCount++;
    const id = petCount;
    const container = document.getElementById('petList');

    const el = document.createElement('div');
    el.className = 'pet-entry';
    el.id = `petEntry${id}`;
    el.innerHTML = `
        <div class="pet-entry-header">
            <span class="pet-entry-label">Pet ${id}</span>
            ${id > 1 ? `<button type="button" class="remove-btn" onclick="removePetEntry(${id})" title="Remove">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>` : ''}
        </div>
        <div class="form-row" style="margin-bottom:12px">
            <div class="form-group half">
                <label>Pet name</label>
                <input type="text" id="petName${id}" placeholder="e.g. Luna" oninput="updateSummary()">
            </div>
            <div class="form-group half">
                <label>Pet type</label>
                <select id="petType${id}" onchange="updateSummary()">
                    <option value="dog">Dog</option>
                    <option value="cat">Cat</option>
                    <option value="other">Other</option>
                </select>
            </div>
        </div>
        <div class="form-row" style="margin-bottom:12px">
            <div class="form-group half">
                <label>Age <span class="optional">(optional)</span></label>
                <input type="text" id="petAge${id}" placeholder="e.g. 2 years">
            </div>
            <div class="form-group half">
                <label>Breed <span class="optional">(optional)</span></label>
                <input type="text" id="petBreed${id}" placeholder="e.g. Golden Retriever">
            </div>
        </div>
        <div class="form-group" style="margin-bottom:0">
            <label>Notes <span class="optional">(optional)</span></label>
            <textarea id="petNotes${id}" rows="2" placeholder="Medical needs, feeding instructions..."></textarea>
        </div>
    `;
    container.appendChild(el);
    updateSummary();
}

function removePetEntry(id) {
    document.getElementById(`petEntry${id}`)?.remove();
    document.querySelectorAll('.pet-entry').forEach((el, i) => {
        const label = el.querySelector('.pet-entry-label');
        if (label) label.textContent = `Pet ${i + 1}`;
    });
    updateSummary();
}

// ─── SUMMARY (sidebar — no pricing) ──────────────────────
function updateSummary() {
    const service  = getService();
    const duration = getDuration();
    const names    = { dropin: 'Drop-In Visit', walking: 'Dog Walking' };
    document.getElementById('summaryServiceName').textContent = `${names[service]} · ${duration} min`;

    // Dates
    const dateMode = document.querySelector('input[name="dateMode"]:checked')?.value || 'pick';
    const datesDiv = document.getElementById('summaryDates');

    if (dateMode === 'pick') {
        const sorted = [...selectedDates].sort();
        if (sorted.length === 0) {
            datesDiv.innerHTML = '<span class="summary-empty">No dates selected yet</span>';
        } else {
            datesDiv.innerHTML = '';
            sorted.forEach(dateStr => {
                const tid   = `dt_${dateStr.replace(/-/g,'_')}`;
                const type  = document.querySelector(`input[name="timeType_${tid}"]:checked`)?.value || 'specific';
                let timeStr = '—';
                if (type === 'same') {
                    timeStr = 'Same as Day 1';
                } else if (type === 'specific') {
                    const v = getHMTime(`timeSpecHr_${tid}`, `timeSpecMin_${tid}`);
                    timeStr = v ? formatTime(v) : '—';
                } else {
                    const from = getHMTime(`timeFromHr_${tid}`, `timeFromMin_${tid}`);
                    const to   = getHMTime(`timeToHr_${tid}`, `timeToMin_${tid}`);
                    timeStr = `${from ? formatTime(from) : '—'} – ${to ? formatTime(to) : '—'}`;
                }
                datesDiv.innerHTML += `
                    <div class="summary-date-item">
                        <strong>${formatDate(dateStr)}</strong>
                        <span>${timeStr}</span>
                    </div>`;
            });
        }
    } else {
        const start = document.getElementById('rangeStart')?.value;
        const end   = document.getElementById('rangeEnd')?.value;
        if (!start || !end) {
            datesDiv.innerHTML = '<span class="summary-empty">No dates selected yet</span>';
        } else {
            const diff = Math.round((new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000) + 1;
            const numDates = diff > 0 ? diff : 0;
            const timeType = document.querySelector('input[name="rangeTimeType"]:checked')?.value || 'specific';
            let timeStr = '—';
            if (timeType === 'specific') {
                const v = getHMTime('rangeSpecHr', 'rangeSpecMin');
                timeStr = v ? formatTime(v) : '—';
            } else {
                const from = getHMTime('rangeFromHr', 'rangeFromMin');
                const to   = getHMTime('rangeToHr', 'rangeToMin');
                timeStr = (from && to) ? `${formatTime(from)} – ${formatTime(to)}` : '—';
            }
            datesDiv.innerHTML = `
                <div class="summary-date-item">
                    <strong>${formatDate(start)} – ${formatDate(end)}</strong>
                    <span>${numDates} day${numDates !== 1 ? 's' : ''} · ${timeStr}</span>
                </div>`;
        }
    }

    // Pets — combine saved (checked) + manual entries
    const petsDiv = document.getElementById('summaryPets');
    const allPets = [];
    getSelectedSavedPets().forEach(p => allPets.push({ name: p.name || '—', type: p.type || 'dog', breed: p.breed || '' }));
    document.querySelectorAll('.pet-entry').forEach(entry => {
        const id = entry.id.replace('petEntry','');
        allPets.push({
            name:  document.getElementById(`petName${id}`)?.value || '—',
            type:  document.getElementById(`petType${id}`)?.value || 'dog',
            breed: document.getElementById(`petBreed${id}`)?.value || ''
        });
    });
    if (allPets.length === 0) {
        petsDiv.innerHTML = '<span class="summary-empty">No pets added yet</span>';
    } else {
        petsDiv.innerHTML = allPets.map(p => `
            <div class="summary-pet-item">
                <strong>${p.name}</strong>
                <span>${capitalize(p.type)}${p.breed ? ' · ' + p.breed : ''}</span>
            </div>`).join('');
    }
}

// ─── COLLECT DATES TEXT ───────────────────────────────────
function collectDatesText() {
    const dateMode = document.querySelector('input[name="dateMode"]:checked')?.value || 'pick';
    let text = '';
    if (dateMode === 'pick') {
        [...selectedDates].sort().forEach(dateStr => {
            const tid  = `dt_${dateStr.replace(/-/g,'_')}`;
            const type = document.querySelector(`input[name="timeType_${tid}"]:checked`)?.value || 'specific';
            let t = '';
            if (type === 'same') {
                t = 'Same as Day 1';
            } else if (type === 'specific') {
                t = formatTime(getHMTime(`timeSpecHr_${tid}`, `timeSpecMin_${tid}`));
            } else {
                const from = getHMTime(`timeFromHr_${tid}`, `timeFromMin_${tid}`);
                const to   = getHMTime(`timeToHr_${tid}`, `timeToMin_${tid}`);
                t = `${formatTime(from)} – ${formatTime(to)}`;
            }
            text += `  ${formatDate(dateStr)}: ${t}\n`;
        });
    } else {
        const start    = document.getElementById('rangeStart')?.value || '';
        const end      = document.getElementById('rangeEnd')?.value   || '';
        const timeType = document.querySelector('input[name="rangeTimeType"]:checked')?.value || 'specific';
        let t = '';
        if (timeType === 'specific') {
            t = formatTime(getHMTime('rangeSpecHr', 'rangeSpecMin'));
        } else {
            const from = getHMTime('rangeFromHr', 'rangeFromMin');
            const to   = getHMTime('rangeToHr', 'rangeToMin');
            t = from && to ? `${formatTime(from)} – ${formatTime(to)}` : '—';
        }
        text = `  ${formatDate(start)} – ${formatDate(end)}: ${t}\n`;
    }
    return text;
}

// ─── STEP 2: REVIEW ORDER ────────────────────────────────
function reviewOrder(e) {
    e.preventDefault();

    // Validate: at least one date
    const dateMode = document.querySelector('input[name="dateMode"]:checked')?.value || 'pick';
    if (dateMode === 'pick' && selectedDates.size === 0) {
        alert('Please select at least one date.');
        return;
    }
    if (dateMode === 'range') {
        const s = document.getElementById('rangeStart')?.value;
        const en = document.getElementById('rangeEnd')?.value;
        if (!s || !en) { alert('Please select a start and end date.'); return; }
    }

    const service   = getService();
    const duration  = getDuration();
    const pricing   = PRICING[service];
    const names     = { dropin: 'Drop-In Visit', walking: 'Dog Walking' };
    const isHoliday = bookingHasHoliday();

    // Count dates
    let numDates = 1;
    if (dateMode === 'pick') {
        numDates = selectedDates.size;
    } else {
        const start = document.getElementById('rangeStart')?.value;
        const end   = document.getElementById('rangeEnd')?.value;
        const diff  = Math.round((new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000) + 1;
        numDates = diff > 0 ? diff : 1;
    }

    // Count pets & determine type
    const petEntries = document.querySelectorAll('.pet-entry');
    const numPets = petEntries.length || 1;
    let firstPetType = 'dog';
    if (petEntries.length > 0) {
        const firstId = petEntries[0].id.replace('petEntry','');
        firstPetType  = document.getElementById(`petType${firstId}`)?.value || 'dog';
    }

    const isCat     = service === 'dropin' && firstPetType === 'cat';
    const base      = isHoliday ? pricing.holiday : (isCat ? pricing.cat : pricing.base);
    const show60    = duration === '60';
    const hasExtra  = numPets > 1;
    const extraRate = isCat ? pricing.extraCat : pricing.extraDog;
    const extra     = hasExtra ? extraRate * (numPets - 1) : 0;
    const perVisit  = base + (show60 ? pricing.addon60 : 0) + extra;
    const total     = perVisit * numDates;

    // Build confirm details HTML
    let petsHtml = '';
    petEntries.forEach((entry, i) => {
        const id    = entry.id.replace('petEntry','');
        const name  = document.getElementById(`petName${id}`)?.value  || '—';
        const type  = document.getElementById(`petType${id}`)?.value  || 'dog';
        const age   = document.getElementById(`petAge${id}`)?.value   || '';
        const breed = document.getElementById(`petBreed${id}`)?.value || '';
        petsHtml += `<div class="confirm-info-row"><span>${name}</span><span>${capitalize(type)}${age ? ', ' + age : ''}${breed ? ' · ' + breed : ''}</span></div>`;
    });

    const clientName  = document.getElementById('clientName').value;
    const clientPhone = document.getElementById('clientPhone').value;
    const clientEmail = document.getElementById('clientEmail').value;
    const clientNotes = document.getElementById('clientNotes').value;

    document.getElementById('confirmDetails').innerHTML = `
        <div class="confirm-section">
            <div class="confirm-section-title">Service</div>
            <div class="confirm-info-row"><span>${names[service]}</span><span>${duration} min</span></div>
        </div>
        <div class="confirm-section">
            <div class="confirm-section-title">Dates &amp; Times</div>
            ${document.getElementById('summaryDates').innerHTML}
        </div>
        <div class="confirm-section">
            <div class="confirm-section-title">Pets</div>
            ${petsHtml || '<span class="summary-empty">—</span>'}
        </div>
        <div class="confirm-section">
            <div class="confirm-section-title">Contact</div>
            <div class="confirm-info-row"><span>Name</span><span>${clientName}</span></div>
            <div class="confirm-info-row"><span>Phone</span><span>${clientPhone}</span></div>
            <div class="confirm-info-row"><span>Email</span><span>${clientEmail}</span></div>
            ${clientNotes ? `<div class="confirm-info-row"><span>Notes</span><span>${clientNotes}</span></div>` : ''}
        </div>
    `;

    // Price breakdown
    let priceRowsHtml = `<div class="confirm-price-row"><span>Base rate (${isHoliday ? 'holiday' : 'regular'})</span><span>$${base}</span></div>`;
    if (show60) priceRowsHtml += `<div class="confirm-price-row"><span>60-min add-on</span><span>+$${pricing.addon60}</span></div>`;
    if (hasExtra) priceRowsHtml += `<div class="confirm-price-row"><span>Additional pet × ${numPets - 1}</span><span>+$${extra}</span></div>`;
    priceRowsHtml += `<div class="confirm-price-row"><span>${numDates > 1 ? 'Visits' : 'Visit'}</span><span>× ${numDates}</span></div>`;
    document.getElementById('confirmPriceRows').innerHTML = priceRowsHtml;

    document.getElementById('confirmTotal').innerHTML = `
        <span>Estimated Total</span>
        <span class="total-amount">$${total}</span>
    `;

    // Save for sendRequest
    _bookingData = { service: names[service], duration, isHoliday, total, clientName, clientPhone, clientEmail, clientNotes };

    // Switch views
    document.getElementById('bookingLayout').style.display  = 'none';
    document.getElementById('bookingConfirm').style.display = 'block';
    window.scrollTo(0, 0);
}

function backToForm() {
    document.getElementById('bookingConfirm').style.display = 'none';
    document.getElementById('bookingLayout').style.display  = '';
    window.scrollTo(0, 0);
}

// ─── STEP 3: SEND ────────────────────────────────────────
function sendRequest() {
    const btn = document.getElementById('sendBtn');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    const datesText = collectDatesText();
    const { service, duration, total, clientName, clientPhone, clientEmail, clientNotes } = _bookingData;

    let petsText = '';
    document.querySelectorAll('.pet-entry').forEach((entry, i) => {
        const id    = entry.id.replace('petEntry','');
        const name  = document.getElementById(`petName${id}`)?.value  || '—';
        const type  = document.getElementById(`petType${id}`)?.value  || 'dog';
        const age   = document.getElementById(`petAge${id}`)?.value   || '';
        const breed = document.getElementById(`petBreed${id}`)?.value || '';
        const notes = document.getElementById(`petNotes${id}`)?.value || '';
        petsText += `Pet ${i+1}: ${name} (${capitalize(type)}${age ? ', ' + age : ''}${breed ? ', ' + breed : ''})\n`;
        if (notes) petsText += `  Notes: ${notes}\n`;
    });

    const message =
        `New booking request from your website:\n\n` +
        `Name: ${clientName}\n` +
        `Phone: ${clientPhone}\n` +
        `Email: ${clientEmail}\n\n` +
        `Service: ${service} (${duration})\n\n` +
        `Dates & Times:\n${datesText}\n\n` +
        `Pets:\n${petsText}\n` +
        `Estimated Total: $${total}\n` +
        (clientNotes ? `\nNotes: ${clientNotes}` : '');

    emailjs.send('service_oeulu98', 'template_83he207', {
        client_name:  clientName,
        client_email: clientEmail,
        message:      message
    }).then(() => {
        // Save to Firestore
        const wff = window.WFF;
        if (wff && wff.db) {
            // Saved (checked) pets from profile
            const petsData = getSelectedSavedPets().map(p => ({
                name: p.name || '', type: p.type || 'dog',
                age: [p.ageYears ? p.ageYears + 'yr' : '', p.ageMonths ? p.ageMonths + 'mo' : ''].filter(Boolean).join(' '),
                breed: p.breed || '', photoUrl: p.photoUrl || '', notes: p.careNotes || ''
            }));
            // Manually entered pets
            document.querySelectorAll('.pet-entry').forEach(entry => {
                const id = entry.id.replace('petEntry','');
                petsData.push({
                    name:  document.getElementById(`petName${id}`)?.value  || '',
                    type:  document.getElementById(`petType${id}`)?.value  || 'dog',
                    age:   document.getElementById(`petAge${id}`)?.value   || '',
                    breed: document.getElementById(`petBreed${id}`)?.value || '',
                    notes: document.getElementById(`petNotes${id}`)?.value || ''
                });
            });
            wff.addDoc(wff.collection(wff.db, 'bookings'), {
                clientName, clientEmail, clientPhone,
                service, duration,
                datesText: collectDatesText(),
                pets: petsData,
                notes: clientNotes,
                total,
                status: 'pending',
                createdAt: wff.serverTimestamp()
            }).catch(err => console.error('Firestore save failed:', err));
        }
        document.getElementById('bookingConfirm').style.display = 'none';
        document.getElementById('bookingLayout').style.display  = '';
        document.getElementById('bookingForm').style.display    = 'none';
        document.getElementById('bookingSuccess').style.display = 'block';
        window.scrollTo(0, 0);
    }).catch(err => {
        console.error('EmailJS error:', err);
        btn.disabled = false;
        btn.textContent = 'Send Booking Request';
        alert('Failed to send. Please try again or email us directly at wyliesfurryfriendsllc@gmail.com');
    });
}

// ─── HELPERS ─────────────────────────────────────────────
function formatTime(t) {
    if (!t) return '—';
    const [h, m] = t.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12  = hour % 12 || 12;
    return `${h12}:${m} ${ampm}`;
}

function formatDate(d) {
    if (!d) return '—';
    const [y, mo, day] = d.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(mo)-1]} ${parseInt(day)}, ${y}`;
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

// ─── INIT ─────────────────────────────────────────────────
// ─── BOOKING PAGE PET MODAL ──────────────────────────────
function openBookingPetModal() {
    // Reset form
    document.getElementById('bkPetName').value = '';
    document.getElementById('bkPetWeight').value = '';
    document.getElementById('bkPetAgeYears').value = '';
    document.getElementById('bkPetAgeMonths').value = '';
    document.getElementById('bkPetBreed').value = '';
    document.getElementById('bkPetNotes').value = '';
    document.getElementById('bkPetPhotoUrl').value = '';
    document.getElementById('bkPetPhotoPreview').style.display = 'none';
    document.getElementById('bkPetPhotoPlaceholder').style.display = '';
    document.querySelectorAll('#bkPetTypeGroup .pet-type-card').forEach((b,i) => b.classList.toggle('active', i===0));
    document.querySelectorAll('#bkPetSexGroup .pet-pill').forEach(b => b.classList.remove('active'));
    document.getElementById('bkPetModal').style.display = '';
    document.body.style.overflow = 'hidden';
}

function closeBookingPetModal() {
    document.getElementById('bkPetModal').style.display = 'none';
    document.body.style.overflow = '';
}

function bkTogglePill(btn, mode) {
    if (mode === 'single') {
        btn.closest('.pet-pills, .pet-type-cards').querySelectorAll('.pet-pill, .pet-type-card').forEach(p => p.classList.remove('active'));
    }
    btn.classList.toggle('active');
}

function bkGetPillValue(groupId) {
    const el = document.querySelector(`#${groupId} .pet-pill.active, #${groupId} .pet-type-card.active`);
    return el ? el.dataset.value : '';
}

function bkUpdatePhotoPreview() {
    const url = document.getElementById('bkPetPhotoUrl').value.trim();
    const img = document.getElementById('bkPetPhotoPreview');
    const ph  = document.getElementById('bkPetPhotoPlaceholder');
    if (url) { img.src = url; img.style.display = ''; ph.style.display = 'none'; }
    else     { img.style.display = 'none'; ph.style.display = ''; }
}

async function bkHandlePhoto(input) {
    const file = input.files[0];
    if (!file) return;
    const base64 = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                const s = Math.min(1, 500 / img.width);
                const c = document.createElement('canvas');
                c.width = img.width * s; c.height = img.height * s;
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                resolve(c.toDataURL('image/jpeg', 0.85));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
    document.getElementById('bkPetPhotoUrl').value = base64;
    bkUpdatePhotoPreview();
}

async function saveBookingPet() {
    const wff = window.WFF;
    const name = document.getElementById('bkPetName').value.trim();
    if (!name) { alert("Please enter your pet's name."); return; }

    const pet = {
        name,
        type:      bkGetPillValue('bkPetTypeGroup') || 'dog',
        sex:       bkGetPillValue('bkPetSexGroup'),
        weight:    document.getElementById('bkPetWeight').value.trim(),
        ageYears:  document.getElementById('bkPetAgeYears').value.trim(),
        ageMonths: document.getElementById('bkPetAgeMonths').value.trim(),
        breed:     document.getElementById('bkPetBreed').value.trim(),
        careNotes: document.getElementById('bkPetNotes').value.trim(),
        photoUrl:  document.getElementById('bkPetPhotoUrl').value.trim(),
    };

    // Save to Firestore if logged in
    if (wff && wff.auth && wff.auth.currentUser) {
        const uid = wff.auth.currentUser.uid;
        const snap = await wff.getDoc(wff.doc(wff.db, 'users', uid));
        const existing = snap.exists() ? (snap.data().pets || []) : [];
        existing.push(pet);
        await wff.updateDoc(wff.doc(wff.db, 'users', uid), { pets: existing });
        renderSavedPetCards(existing);
    } else {
        // Not logged in — just add as manual entry
        savedUserPets.push(pet);
        renderSavedPetCards(savedUserPets);
    }
    closeBookingPetModal();
}

document.addEventListener('DOMContentLoaded', () => {
    populateRangeTimeSelects();
    updateSummary();

    // Show add-another button and blank form by default (non-logged-in fallback)
    const addBtn = document.getElementById('addAnotherPetBtn');
    if (addBtn) addBtn.style.display = '';
    addPetEntry();

    // Check if user is logged in; load their saved pets
    const wff = window.WFF;
    if (wff && wff.auth && wff.onAuthStateChanged) {
        wff.onAuthStateChanged(wff.auth, async user => {
            if (!user) return; // not logged in — keep manual form
            try {
                const snap = await wff.getDoc(wff.doc(wff.db, 'users', user.uid));
                const pets = snap.exists() ? (snap.data().pets || []) : [];
                renderSavedPetCards(pets);
            } catch (e) {
                console.warn('Could not load saved pets:', e);
            }
        });
    }
});
