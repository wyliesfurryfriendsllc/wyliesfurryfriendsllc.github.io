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
        const tid = `dt_${ds.replace(/-/g,'_')}`;
        const typeEl = document.querySelector(`input[name="timeType_${tid}"]:checked`);
        saved[ds] = {
            type: typeEl?.value || 'specific',
            spec: document.getElementById(`timeSpec_${tid}`)?.value || '',
            from: document.getElementById(`timeFrom_${tid}`)?.value || '',
            to:   document.getElementById(`timeTo_${tid}`)?.value   || ''
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
                <select id="timeSpec_${tid}" class="time-select" onchange="updateSummary()">
                    ${generateTimeOptions(false, s.spec)}
                </select>
            </div>
            <div id="windowWrap_${tid}" style="${windowChecked?'':'display:none'}">
                <div class="form-row">
                    <div class="form-group half">
                        <label>From</label>
                        <select id="timeFrom_${tid}" class="time-select" onchange="updateSummary()">${generateTimeOptions(false, s.from)}</select>
                    </div>
                    <div class="form-group half">
                        <label>To</label>
                        <select id="timeTo_${tid}" class="time-select" onchange="updateSummary()">${generateTimeOptions(false, s.to)}</select>
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

// ─── TIME OPTIONS ─────────────────────────────────────────
function generateTimeOptions(_, selected) {
    let html = `<option value=""${!selected?'selected':''}>Select time...</option>`;
    for (let h = 7; h <= 21; h++) {
        for (let m = 0; m < 60; m += 15) {
            if (h === 21 && m > 0) break;
            const hh    = String(h).padStart(2,'0');
            const mm    = String(m).padStart(2,'0');
            const val   = `${hh}:${mm}`;
            const ampm  = h >= 12 ? 'PM' : 'AM';
            const h12   = h % 12 || 12;
            const label = `${h12}:${mm} ${ampm}`;
            html += `<option value="${val}"${selected===val?'selected':''}>${label}</option>`;
        }
    }
    return html;
}

// ─── RANGE TIME ───────────────────────────────────────────
function switchRangeTime(type) {
    document.getElementById('rangeSpecificWrap').style.display = type === 'specific' ? '' : 'none';
    document.getElementById('rangeWindowWrap').style.display   = type === 'window'   ? '' : 'none';
    updateSummary();
}

function populateRangeTimeSelects() {
    const opts = generateTimeOptions(false, '');
    ['rangeTimeSpecific','rangeTimeFrom','rangeTimeTo'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = opts;
    });
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
                    const v = document.getElementById(`timeSpec_${tid}`)?.value;
                    timeStr = v ? formatTime(v) : '—';
                } else {
                    const from = document.getElementById(`timeFrom_${tid}`)?.value;
                    const to   = document.getElementById(`timeTo_${tid}`)?.value;
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
                const v = document.getElementById('rangeTimeSpecific')?.value;
                timeStr = v ? formatTime(v) : '—';
            } else {
                const from = document.getElementById('rangeTimeFrom')?.value;
                const to   = document.getElementById('rangeTimeTo')?.value;
                timeStr = (from && to) ? `${formatTime(from)} – ${formatTime(to)}` : '—';
            }
            datesDiv.innerHTML = `
                <div class="summary-date-item">
                    <strong>${formatDate(start)} – ${formatDate(end)}</strong>
                    <span>${numDates} day${numDates !== 1 ? 's' : ''} · ${timeStr}</span>
                </div>`;
        }
    }

    // Pets
    const petEntries = document.querySelectorAll('.pet-entry');
    const petsDiv = document.getElementById('summaryPets');
    if (petEntries.length === 0) {
        petsDiv.innerHTML = '<span class="summary-empty">No pets added yet</span>';
    } else {
        petsDiv.innerHTML = '';
        petEntries.forEach(entry => {
            const id    = entry.id.replace('petEntry','');
            const name  = document.getElementById(`petName${id}`)?.value || '—';
            const type  = document.getElementById(`petType${id}`)?.value || 'dog';
            const breed = document.getElementById(`petBreed${id}`)?.value;
            petsDiv.innerHTML += `
                <div class="summary-pet-item">
                    <strong>${name}</strong>
                    <span>${capitalize(type)}${breed ? ' · ' + breed : ''}</span>
                </div>`;
        });
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
                t = formatTime(document.getElementById(`timeSpec_${tid}`)?.value || '');
            } else {
                const from = document.getElementById(`timeFrom_${tid}`)?.value || '';
                const to   = document.getElementById(`timeTo_${tid}`)?.value   || '';
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
            t = formatTime(document.getElementById('rangeTimeSpecific')?.value || '');
        } else {
            const from = document.getElementById('rangeTimeFrom')?.value || '';
            const to   = document.getElementById('rangeTimeTo')?.value   || '';
            t = `${formatTime(from)} – ${formatTime(to)}`;
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
document.addEventListener('DOMContentLoaded', () => {
    populateRangeTimeSelects();
    addPetEntry();
    updateSummary();
});
