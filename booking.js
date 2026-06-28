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

// { dateStr: { isSame: bool, slots: [{type, specHr, specMin, fromHr, fromMin, toHr, toMin}] } }
let dateSlotData = {};

// ─── SERVICE / DURATION ──────────────────────────────────
function getService()  { return document.querySelector('input[name="service"]:checked').value; }
function getDuration() { return document.querySelector('input[name="duration"]:checked').value; }

function onDurationChange() {
    renderSelectedDatesList();
    updateSummary();
}

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
    saveCurrentDateState();
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
            cell.onmousedown = () => {
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
function emptySlot() {
    return { type: 'window', period: '', specHr: '', specMin: '00', fromHr: '', fromMin: '00', toHr: '', toMin: '00', comboDur: '30' };
}

function saveCurrentDateState() {
    const container = document.getElementById('selectedDatesList');
    container.querySelectorAll('.date-entry').forEach(entry => {
        const ds = entry.dataset.date;
        if (!ds) return;
        const tid = `dt_${ds.replace(/-/g,'_')}`;
        const modeEl = entry.querySelector(`input[name="dtMode_${tid}"]:checked`);
        const isSame = modeEl?.value === 'same';
        const slots = [];
        entry.querySelectorAll('.date-slot').forEach((_, si) => {
            const type = document.querySelector(`input[name="slotType_${tid}_${si}"]:checked`)?.value || 'specific';
            slots.push({
                type,
                period:  document.getElementById(`slotPeriod_${tid}_${si}`)?.value ?? '',
                specHr:  document.getElementById(`slotSpecHr_${tid}_${si}`)?.value ?? '',
                specMin: document.getElementById(`slotSpecMin_${tid}_${si}`)?.value ?? '00',
                fromHr:  document.getElementById(`slotFromHr_${tid}_${si}`)?.value ?? '',
                fromMin: document.getElementById(`slotFromMin_${tid}_${si}`)?.value ?? '00',
                toHr:    document.getElementById(`slotToHr_${tid}_${si}`)?.value ?? '',
                toMin:   document.getElementById(`slotToMin_${tid}_${si}`)?.value ?? '00',
                comboDur: document.getElementById(`comboDur_${tid}_${si}`)?.checked ? '60' : '30',
            });
        });
        if (slots.length === 0) slots.push(emptySlot());
        dateSlotData[ds] = { isSame, slots };
    });
}

function renderSelectedDatesList() {
    const container = document.getElementById('selectedDatesList');
    container.innerHTML = '';
    const sorted = [...selectedDates].sort();
    if (sorted.length === 0) return;

    sorted.forEach((dateStr, index) => {
        const tid = `dt_${dateStr.replace(/-/g,'_')}`;
        const isFirst = index === 0;
        const defaultSame = !isFirst; // non-first dates default to "Same as Day 1"
        const state = dateSlotData[dateStr] || { isSame: defaultSame, slots: [emptySlot()] };
        if (!dateSlotData[dateStr]) dateSlotData[dateStr] = state;
        const isSame = !isFirst && state.isSame;
        const slots = state.slots.length > 0 ? state.slots : [emptySlot()];

        const div = document.createElement('div');
        div.className = isFirst ? 'date-entry date-entry--first' : 'date-entry';
        div.dataset.date = dateStr;

        const slotsHtml = slots.map((sl, si) => renderSlotHtml(tid, dateStr, si, sl, slots.length, isFirst)).join('');

        div.innerHTML = `
            <div class="date-entry-header">
                <span class="date-entry-label">${formatDate(dateStr)}</span>
            </div>
            ${!isFirst ? `
            <div class="toggle-pills mb-12">
                <label class="pill-option">
                    <input type="radio" name="dtMode_${tid}" value="same" ${isSame?'checked':''} onchange="onDateModeChange('${tid}','${dateStr}')">
                    <span>Same as Day 1</span>
                </label>
                <label class="pill-option">
                    <input type="radio" name="dtMode_${tid}" value="own" ${!isSame?'checked':''} onchange="onDateModeChange('${tid}','${dateStr}')">
                    <span>Set time</span>
                </label>
            </div>` : ''}
            <div id="dateSlots_${tid}" style="${isSame ? 'display:none' : ''}">
                ${slotsHtml}
                <button type="button" class="add-time-btn" onclick="addDateSlot('${dateStr}')">+ Add time</button>
            </div>
        `;
        container.appendChild(div);
    });
}

function renderSlotHtml(tid, dateStr, si, sl, totalSlots, isFirstDate = true) {
    const isSpecific = sl.type === 'specific';
    const isCombo = getDuration() === 'combo';
    const comboDur = sl.comboDur || '30';
    return `
        <div class="date-slot" data-si="${si}">
            ${si === 0 && isFirstDate ? `<div class="slot-type-tip"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-4px;margin-right:6px"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg><strong>Flexible time ranges help with scheduling.</strong></div>` : ''}
            ${isCombo ? `<div class="combo-dur-row">
                <span class="combo-dur-label">Duration</span>
                <div class="combo-dur-toggle">
                    <span class="combo-dur-opt">30 min</span>
                    <label class="c-toggle">
                        <input type="checkbox" id="comboDur_${tid}_${si}" ${comboDur === '60' ? 'checked' : ''} onchange="updateSummary()">
                        <span class="c-toggle-track"><span class="c-toggle-knob"></span></span>
                    </label>
                    <span class="combo-dur-opt">60 min</span>
                </div>
            </div>` : ''}
            <div class="slot-header">
                <div class="slot-type-seg" id="slotSeg_${tid}_${si}">
                    <input type="radio" name="slotType_${tid}_${si}" value="window" ${!isSpecific?'checked':''} style="display:none">
                    <input type="radio" name="slotType_${tid}_${si}" value="specific" ${isSpecific?'checked':''} style="display:none">
                    <div class="slot-type-seg-knob${isSpecific?' right':''}" id="slotSegKnob_${tid}_${si}"></div>
                    <span class="slot-type-seg-label${!isSpecific?' active':''}" onclick="setSlotType('${tid}',${si},'window')">Range</span>
                    <span class="slot-type-seg-label${isSpecific?' active':''}" onclick="setSlotType('${tid}',${si},'specific')">Exact Time</span>
                </div>
                ${totalSlots > 1 ? `<button type="button" class="slot-remove-btn" onclick="removeSlot('${dateStr}',${si})" title="Remove">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>` : ''}
            </div>
            <div id="slotSpecWrap_${tid}_${si}" style="${isSpecific?'':'display:none'}">
                ${buildPickerHtml(`spec_${tid}_${si}`, `slotSpecHr_${tid}_${si}`, `slotSpecMin_${tid}_${si}`, sl.specHr, sl.specMin)}
            </div>
            <div id="slotWindowWrap_${tid}_${si}" style="${isSpecific?'display:none':''}">
                <input type="hidden" id="slotPeriod_${tid}_${si}" value="${sl.period||''}">
                <div class="time-period-quick-label"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px"><path d="M14 4.1 12 6"/><path d="m5.1 8-2.9-.8"/><path d="m6 12-1.9 2"/><path d="M7.2 2.2 8 5.1"/><path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"/></svg>Quick select</div>
                <div class="time-period-pills">
                    ${['Anytime','Morning','Afternoon','Evening'].map(p =>
                        `<button type="button" class="time-period-pill${(sl.period||'')=== p?' active':''}" onclick="selectPeriod('${tid}',${si},'${p}')">${p}</button>`
                    ).join('')}
                </div>
                <div id="slotPickerWrap_${tid}_${si}" class="slot-picker-wrap" style="${sl.period==='Anytime'?'display:none':''}">
                    <div class="time-range-inline">
                        <span class="time-range-label">From</span>
                        ${buildPickerHtml(`from_${tid}_${si}`, `slotFromHr_${tid}_${si}`, `slotFromMin_${tid}_${si}`, sl.fromHr, sl.fromMin)}
                        <span class="time-range-label">To</span>
                        ${buildPickerHtml(`to_${tid}_${si}`, `slotToHr_${tid}_${si}`, `slotToMin_${tid}_${si}`, sl.toHr, sl.toMin)}
                    </div>
                    <div class="slot-picker-hint">Times are editable.</div>
                </div>
            </div>
        </div>`;
}

function onDateModeChange(tid, dateStr) {
    saveCurrentDateState();
    const isSame = document.querySelector(`input[name="dtMode_${tid}"]:checked`)?.value === 'same';
    if (dateSlotData[dateStr]) dateSlotData[dateStr].isSame = isSame;
    document.getElementById(`dateSlots_${tid}`).style.display = isSame ? 'none' : '';
    updateSummary();
}

function setSlotType(tid, si, type) {
    document.querySelectorAll(`input[name="slotType_${tid}_${si}"]`).forEach(r => r.checked = r.value === type);
    const isSpecific = type === 'specific';
    document.getElementById(`slotSpecWrap_${tid}_${si}`).style.display   = isSpecific ? '' : 'none';
    document.getElementById(`slotWindowWrap_${tid}_${si}`).style.display = isSpecific ? 'none' : '';
    const knob = document.getElementById(`slotSegKnob_${tid}_${si}`);
    if (knob) {
        knob.classList.toggle('right', isSpecific);
    }
    document.querySelectorAll(`#slotSeg_${tid}_${si} .slot-type-seg-label`).forEach((el, i) => {
        el.classList.toggle('active', isSpecific ? i === 1 : i === 0);
    });
    updateSummary();
}

const TP_PERIODS = {
    Anytime:   null,
    Morning:   { fromHr: 6,  fromMin: '00', toHr: 12, toMin: '00' },
    Afternoon: { fromHr: 12, fromMin: '00', toHr: 18, toMin: '00' },
    Evening:   { fromHr: 16, fromMin: '00', toHr: 21, toMin: '00' },
};

function setPickerVal(uid, hr24, min) {
    const wrap = document.getElementById(`tpWrap_${uid}`);
    if (!wrap) return;
    const [hrInput, minInput] = wrap.querySelectorAll('input[type="hidden"]');
    if (hrInput) hrInput.value = hr24;
    if (minInput) minInput.value = min;
    const lbl = document.getElementById(`tpLabel_${uid}`);
    if (lbl) lbl.textContent = _tpFmt(hr24, min);
    const ampm = hr24 >= 12 ? 'PM' : 'AM';
    const hr12 = hr24 % 12 || 12;
    const ampmCol = document.getElementById(`tpAmpm_${uid}`);
    const hrCol   = document.getElementById(`tpHr_${uid}`);
    const minCol  = document.getElementById(`tpMin_${uid}`);
    if (ampmCol) ampmCol.scrollTop = (ampm === 'PM' ? 1 : 0) * TP_H;
    if (hrCol)   hrCol.scrollTop   = (hr12 - 1) * TP_H;
    if (minCol)  minCol.scrollTop  = ['00','15','30','45'].indexOf(min) * TP_H;
}

function clearPickerVal(uid) {
    const wrap = document.getElementById(`tpWrap_${uid}`);
    if (!wrap) return;
    const [hrInput, minInput] = wrap.querySelectorAll('input[type="hidden"]');
    if (hrInput) hrInput.value = '';
    if (minInput) minInput.value = '00';
    const lbl = document.getElementById(`tpLabel_${uid}`);
    if (lbl) lbl.textContent = '—';
}

function selectPeriod(tid, si, period) {
    const periodInput = document.getElementById(`slotPeriod_${tid}_${si}`);
    const current = periodInput?.value || '';
    const isToggleOff = current === period;
    const newPeriod = isToggleOff ? '' : period;

    document.querySelectorAll(`#slotWindowWrap_${tid}_${si} .time-period-pill`).forEach(el => {
        el.classList.toggle('active', !isToggleOff && el.textContent === period);
    });
    if (periodInput) periodInput.value = newPeriod;

    const pickerWrap = document.getElementById(`slotPickerWrap_${tid}_${si}`);
    if (pickerWrap) pickerWrap.style.display = newPeriod === 'Anytime' ? 'none' : '';

    if (isToggleOff) {
        clearPickerVal(`from_${tid}_${si}`);
        clearPickerVal(`to_${tid}_${si}`);
    } else {
        const t = TP_PERIODS[period];
        if (t) {
            setPickerVal(`from_${tid}_${si}`, t.fromHr, t.fromMin);
            setPickerVal(`to_${tid}_${si}`,   t.toHr,   t.toMin);
        }
    }
    updateSummary();
}

function addDateSlot(dateStr) {
    saveCurrentDateState();
    if (!dateSlotData[dateStr]) dateSlotData[dateStr] = { isSame: false, slots: [emptySlot()] };
    dateSlotData[dateStr].slots.push(emptySlot());
    renderSelectedDatesList();
    updateSummary();
}

function removeSlot(dateStr, si) {
    saveCurrentDateState();
    if (dateSlotData[dateStr] && dateSlotData[dateStr].slots.length > 1) {
        dateSlotData[dateStr].slots.splice(si, 1);
    }
    renderSelectedDatesList();
    updateSummary();
}

// ─── TIME HELPERS ─────────────────────────────────────────
function hrOptions(sel) {
    let h = '';
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

// ─── SCROLL WHEEL TIME PICKER ────────────────────────────
const TP_H = 44;
const _tpTimers = {};
let _tpDrag = null;

document.addEventListener('mousemove', e => {
    if (!_tpDrag) return;
    _tpDrag.col.scrollTop = _tpDrag.startScrollTop - (e.clientY - _tpDrag.startY);
});
document.addEventListener('mouseup', () => {
    if (!_tpDrag) return;
    const { col, uid } = _tpDrag;
    _tpDrag = null;
    col.style.cursor = '';
    // Snap to nearest item then sync
    const snapped = Math.round(col.scrollTop / TP_H) * TP_H;
    col.scrollTo({ top: snapped, behavior: 'smooth' });
    setTimeout(() => syncPickerToInputs(uid), 200);
});

function buildPickerHtml(uid, hrId, minId, initHr, initMin) {
    const hr24 = (initHr !== '' && initHr != null) ? parseInt(initHr) : -1;
    const minVal = initMin || '00';
    const label = hr24 >= 0 ? _tpFmt(hr24, minVal) : '—';
    const hrItems = [1,2,3,4,5,6,7,8,9,10,11,12]
        .map(h => `<div class="tp-item" data-val="${h}">${h}</div>`).join('');
    const minItems = ['00','15','30','45']
        .map(m => `<div class="tp-item" data-val="${m}">${m}</div>`).join('');
    return `<div class="tp-wrap" id="tpWrap_${uid}">
        <button type="button" class="tp-trigger" onclick="openPicker('${uid}')">
            <span id="tpLabel_${uid}">${label}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <input type="hidden" id="${hrId}" value="${hr24 >= 0 ? hr24 : ''}">
        <input type="hidden" id="${minId}" value="${minVal}">
        <div class="tp-popup" id="tpPop_${uid}" style="display:none">
            <div class="tp-picker-body">
                <div class="tp-sel-bar"></div>
                <div class="tp-cols">
                    <div class="tp-col" id="tpAmpm_${uid}" onscroll="onPickerScroll('${uid}')">
                        <div class="tp-item" data-val="AM">AM</div>
                        <div class="tp-item" data-val="PM">PM</div>
                    </div>
                    <div class="tp-col" id="tpHr_${uid}" onscroll="onPickerScroll('${uid}')">${hrItems}</div>
                    <div class="tp-col" id="tpMin_${uid}" onscroll="onPickerScroll('${uid}')">${minItems}</div>
                </div>
                <div class="tp-fade-t"></div>
                <div class="tp-fade-b"></div>
            </div>
        </div>
    </div>`;
}

function _tpFmt(hr24, min) {
    return `${hr24 % 12 || 12}:${min} ${hr24 >= 12 ? 'PM' : 'AM'}`;
}

function openPicker(uid) {
    document.querySelectorAll('.tp-popup').forEach(p => {
        if (p.id !== `tpPop_${uid}`) p.style.display = 'none';
    });
    const popup = document.getElementById(`tpPop_${uid}`);
    if (!popup) return;
    popup.style.display = 'block';

    const wrap = document.getElementById(`tpWrap_${uid}`);
    const [hrInput, minInput] = wrap.querySelectorAll('input[type="hidden"]');
    const hr24 = (hrInput && hrInput.value !== '') ? parseInt(hrInput.value) : 9;
    const minVal = (minInput && minInput.value) || '00';

    _tpScrollTo(`tpAmpm_${uid}`, hr24 >= 12 ? 'PM' : 'AM');
    _tpScrollTo(`tpHr_${uid}`, String(hr24 % 12 || 12));
    _tpScrollTo(`tpMin_${uid}`, minVal);

    // Init drag-to-scroll on columns (once per picker)
    wrap.querySelectorAll('.tp-col').forEach(col => {
        if (col._tpDragInit) return;
        col._tpDragInit = true;
        col.addEventListener('mousedown', e => {
            _tpDrag = { col, uid, startY: e.clientY, startScrollTop: col.scrollTop };
            col.style.cursor = 'grabbing';
            e.preventDefault();
        });
    });

    setTimeout(() => {
        const handler = (e) => {
            if (!wrap.contains(e.target)) {
                closePicker(uid);
                document.removeEventListener('click', handler);
            }
        };
        document.addEventListener('click', handler);
    }, 0);
}

function _tpScrollTo(colId, val) {
    const col = document.getElementById(colId);
    if (!col) return;
    const items = col.querySelectorAll('.tp-item');
    for (let i = 0; i < items.length; i++) {
        if (items[i].dataset.val === val) { col.scrollTop = i * TP_H; return; }
    }
}

function closePicker(uid) {
    const p = document.getElementById(`tpPop_${uid}`);
    if (p) p.style.display = 'none';
}

function onPickerScroll(uid) {
    clearTimeout(_tpTimers[uid]);
    _tpTimers[uid] = setTimeout(() => syncPickerToInputs(uid), 150);
}

function syncPickerToInputs(uid) {
    const wrap = document.getElementById(`tpWrap_${uid}`);
    if (!wrap) return;
    const getVal = id => {
        const col = document.getElementById(id);
        if (!col) return null;
        return col.querySelectorAll('.tp-item')[Math.round(col.scrollTop / TP_H)]?.dataset.val;
    };
    const ampm = getVal(`tpAmpm_${uid}`) || 'AM';
    const hr12 = parseInt(getVal(`tpHr_${uid}`) || '12');
    const min  = getVal(`tpMin_${uid}`) || '00';
    let hr24 = hr12 % 12;
    if (ampm === 'PM') hr24 += 12;

    const [hrInput, minInput] = wrap.querySelectorAll('input[type="hidden"]');
    if (hrInput) hrInput.value = hr24;
    if (minInput) minInput.value = min;

    const lbl = document.getElementById(`tpLabel_${uid}`);
    if (lbl) lbl.textContent = _tpFmt(hr24, min);
    updateSummary();
}

// ─── RANGE CALENDAR ──────────────────────────────────────
let rangeCalYear, rangeCalMonth;

function openRangeCal() {
    const now = new Date();
    if (rangeCalYear === undefined) {
        rangeCalYear  = now.getFullYear();
        rangeCalMonth = now.getMonth();
    }
    renderRangeCalendar();
    document.getElementById('rangeCalWrap').style.display = 'block';
}

function closeRangeCal() {
    document.getElementById('rangeCalWrap').style.display = 'none';
    updateRangeCalTriggers();
    updateSummary();
}

function changeRangeMonth(dir) {
    rangeCalMonth += dir;
    if (rangeCalMonth < 0)  { rangeCalMonth = 11; rangeCalYear--; }
    if (rangeCalMonth > 11) { rangeCalMonth = 0;  rangeCalYear++; }
    renderRangeCalendar();
}

function renderRangeCalendar() {
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    document.getElementById('rangeCalMonthLabel').textContent = `${MONTHS[rangeCalMonth]} ${rangeCalYear}`;

    const today    = new Date(); today.setHours(0,0,0,0);
    const firstDay = new Date(rangeCalYear, rangeCalMonth, 1).getDay();
    const daysIn   = new Date(rangeCalYear, rangeCalMonth + 1, 0).getDate();
    const grid     = document.getElementById('rangeCalDays');
    const startVal = document.getElementById('rangeStart').value;
    const endVal   = document.getElementById('rangeEnd').value;
    grid.innerHTML = '';

    for (let i = 0; i < firstDay; i++) {
        const blank = document.createElement('div');
        blank.className = 'cal-day cal-blank';
        grid.appendChild(blank);
    }

    for (let d = 1; d <= daysIn; d++) {
        const dateStr = `${rangeCalYear}-${String(rangeCalMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dateObj = new Date(rangeCalYear, rangeCalMonth, d);
        const isPast  = dateObj < today;

        let cls = 'cal-day';
        if (isPast) cls += ' cal-past';
        else if (dateStr === startVal || dateStr === endVal) cls += ' cal-selected';
        else if (startVal && endVal && dateStr > startVal && dateStr < endVal) cls += ' cal-in-range';
        if (isHolidayDate(dateStr)) cls += ' cal-holiday';

        const cell = document.createElement('div');
        cell.className  = cls;
        cell.textContent = d;

        if (!isPast) cell.onclick = () => pickRangeDate(dateStr);
        grid.appendChild(cell);
    }
}

function pickRangeDate(dateStr) {
    const startEl  = document.getElementById('rangeStart');
    const endEl    = document.getElementById('rangeEnd');
    const startVal = startEl.value;
    const endVal   = endEl.value;

    if (!startVal || (startVal && endVal)) {
        startEl.value = dateStr;
        endEl.value   = '';
    } else if (dateStr > startVal) {
        endEl.value = dateStr;
    } else {
        startEl.value = dateStr;
        endEl.value   = '';
    }
    renderRangeCalendar();
    updateRangeCalTriggers();
    updateSummary();
}

function updateRangeCalTriggers() {
    const s = document.getElementById('rangeStart').value;
    const e = document.getElementById('rangeEnd').value;
    document.getElementById('rangeStartText').textContent = s ? formatDate(s) : 'Choose start date...';
    document.getElementById('rangeEndText').textContent   = e ? formatDate(e) : 'Choose end date...';
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
function _calcAgeFromDate(iso) {
    if (!iso) return '';
    const now = new Date(), bd = new Date(iso + 'T00:00:00');
    let m = (now.getFullYear() - bd.getFullYear()) * 12 + (now.getMonth() - bd.getMonth());
    if (now.getDate() < bd.getDate()) m--;
    if (m < 0) return '';
    const y = Math.floor(m / 12), mo = m % 12;
    if (y === 0) return `${mo}mo`;
    return mo ? `${y}yr ${mo}mo` : `${y}yr`;
}

function renderSavedPetCards(pets) {
    savedUserPets = pets;
    const container = document.getElementById('savedPetCards');
    if (!container) return;

    const savedPetBtn = document.getElementById('addSavedPetBtn');

    if (!pets || pets.length === 0) {
        container.innerHTML = '';
        if (savedPetBtn) savedPetBtn.style.display = '';
        return;
    }

    // Has saved pets — render selection cards, hide manual entry form
    container.innerHTML = `
        <p class="saved-pets-hint">Select the pets for this visit:</p>
        <div class="saved-pet-list">
            ${pets.map((p, i) => {
                const emoji = p.type === 'cat' ? '🐱' : '🐶';
                const avatar = p.photoUrl
                    ? `<img class="sp-avatar" src="${p.photoUrl}" alt="${p.name || ''}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
                    : '';
                const ageStr = _calcAgeFromDate(p.birthDate || p.birthday)
                    || [p.ageYears ? p.ageYears + 'yr' : '', p.ageMonths ? p.ageMonths + 'mo' : ''].filter(Boolean).join(' ');
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

    if (savedPetBtn) savedPetBtn.style.display = '';
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
    const durationLabel = duration === 'combo' ? '30 & 60 min' : `${duration} min`;
    document.getElementById('summaryServiceName').textContent = `${names[service]} · ${durationLabel}`;

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
                const tid = `dt_${dateStr.replace(/-/g,'_')}`;
                const slotsWrap = document.getElementById(`dateSlots_${tid}`);
                let timeStr = '—';
                if (slotsWrap && slotsWrap.style.display === 'none') {
                    timeStr = 'Same as Day 1';
                } else if (slotsWrap) {
                    const slotEls = slotsWrap.querySelectorAll('.date-slot');
                    const times = [];
                    slotEls.forEach((_, si) => {
                        const type   = document.querySelector(`input[name="slotType_${tid}_${si}"]:checked`)?.value || 'specific';
                        const period = document.getElementById(`slotPeriod_${tid}_${si}`)?.value || '';
                        if (period === 'Anytime') {
                            times.push('Anytime (All day)');
                        } else if (type === 'specific') {
                            const v = getHMTime(`slotSpecHr_${tid}_${si}`, `slotSpecMin_${tid}_${si}`);
                            times.push(v ? formatTime(v) : '—');
                        } else {
                            const from = getHMTime(`slotFromHr_${tid}_${si}`, `slotFromMin_${tid}_${si}`);
                            const to   = getHMTime(`slotToHr_${tid}_${si}`, `slotToMin_${tid}_${si}`);
                            times.push(`${from ? formatTime(from) : '—'} – ${to ? formatTime(to) : '—'}`);
                        }
                    });
                    timeStr = times.length ? times.join(', ') : '—';
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
    const isCombo = getDuration() === 'combo';
    let text = '';
    if (dateMode === 'pick') {
        let day1TimesStr = null;
        [...selectedDates].sort().forEach(dateStr => {
            const tid = `dt_${dateStr.replace(/-/g,'_')}`;
            const slotsWrap = document.getElementById(`dateSlots_${tid}`);
            if (slotsWrap && slotsWrap.style.display === 'none') {
                text += `  ${formatDate(dateStr)}: ${day1TimesStr || '—'}\n`;
                return;
            }
            const slotEls = slotsWrap ? slotsWrap.querySelectorAll('.date-slot') : [];
            const times = [];
            slotEls.forEach((_, si) => {
                const type   = document.querySelector(`input[name="slotType_${tid}_${si}"]:checked`)?.value || 'specific';
                const period = document.getElementById(`slotPeriod_${tid}_${si}`)?.value || '';
                const comboSuffix = isCombo ? ` (${document.getElementById(`comboDur_${tid}_${si}`)?.checked ? '60' : '30'} min)` : '';
                if (period === 'Anytime') {
                    times.push('Anytime (All day)' + comboSuffix);
                } else if (type === 'specific') {
                    times.push(formatTime(getHMTime(`slotSpecHr_${tid}_${si}`, `slotSpecMin_${tid}_${si}`)) + comboSuffix);
                } else {
                    const from = getHMTime(`slotFromHr_${tid}_${si}`, `slotFromMin_${tid}_${si}`);
                    const to   = getHMTime(`slotToHr_${tid}_${si}`, `slotToMin_${tid}_${si}`);
                    times.push(`${formatTime(from)} – ${formatTime(to)}` + comboSuffix);
                }
            });
            const timesStr = times.join(', ') || '—';
            if (day1TimesStr === null) day1TimesStr = timesStr;
            text += `  ${formatDate(dateStr)}: ${timesStr}\n`;
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

    const currentUser = window.WFF?.auth?.currentUser;
    if (!currentUser) {
        const el = document.getElementById('loginRequiredMsg');
        if (el) { el.style.display = 'block'; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        return;
    }

    // Validate: at least one pet
    const _savedPets = getSelectedSavedPets();
    const _petEntries = document.querySelectorAll('.pet-entry');
    if (_savedPets.length + _petEntries.length === 0) {
        alert('Please add at least one pet before submitting.');
        document.querySelector('.form-section:has(#petSection), #petSection')
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

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

    // Count total visits (each time slot per day = one visit)
    let numDates = 1;
    if (dateMode === 'pick') {
        const sortedPick = [...selectedDates].sort();
        let totalSlots = 0;
        let day1SlotCount = 0;
        sortedPick.forEach((dateStr, idx) => {
            const tid = `dt_${dateStr.replace(/-/g,'_')}`;
            const slotsWrap = document.getElementById(`dateSlots_${tid}`);
            if (slotsWrap && slotsWrap.style.display === 'none') {
                totalSlots += day1SlotCount;
            } else {
                const cnt = slotsWrap ? slotsWrap.querySelectorAll('.date-slot').length : 1;
                if (idx === 0) day1SlotCount = cnt;
                totalSlots += cnt;
            }
        });
        numDates = totalSlots || 1;
    } else {
        const start = document.getElementById('rangeStart')?.value;
        const end   = document.getElementById('rangeEnd')?.value;
        const diff  = Math.round((new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000) + 1;
        numDates = diff > 0 ? diff : 1;
    }

    // Count pets & determine type
    const petEntries = document.querySelectorAll('.pet-entry');
    const savedPets  = getSelectedSavedPets();
    const numPets    = savedPets.length + petEntries.length || 1;
    let firstPetType = 'dog';
    if (savedPets.length > 0) {
        firstPetType = savedPets[0].type || 'dog';
    } else if (petEntries.length > 0) {
        const firstId = petEntries[0].id.replace('petEntry','');
        firstPetType  = document.getElementById(`petType${firstId}`)?.value || 'dog';
    }

    const isCat     = service === 'dropin' && firstPetType === 'cat';
    const base      = isHoliday ? pricing.holiday : (isCat ? pricing.cat : pricing.base);
    const show60    = duration === '60';
    const hasExtra  = numPets > 1;
    const extraRate = isCat ? pricing.extraCat : pricing.extraDog;
    const extra     = hasExtra ? extraRate * (numPets - 1) : 0;

    // For combo: count 30-min and 60-min slots separately
    let num30 = 0, num60 = 0;
    if (duration === 'combo' && dateMode === 'pick') {
        let day1Combos = null;
        [...selectedDates].sort().forEach((dateStr, idx) => {
            const tid = `dt_${dateStr.replace(/-/g,'_')}`;
            const slotsWrap = document.getElementById(`dateSlots_${tid}`);
            let combos;
            if (idx > 0 && slotsWrap && slotsWrap.style.display === 'none') {
                combos = day1Combos || ['30'];
            } else {
                const slotEls = slotsWrap ? slotsWrap.querySelectorAll('.date-slot') : [];
                combos = [...slotEls].map((_, si) =>
                    document.getElementById(`comboDur_${tid}_${si}`)?.checked ? '60' : '30'
                );
                if (idx === 0) day1Combos = combos;
            }
            combos.forEach(d => d === '60' ? num60++ : num30++);
        });
    }

    const perVisit = base + (show60 ? pricing.addon60 : 0) + extra;
    const total = duration === 'combo'
        ? (base + extra) * (num30 + num60) + pricing.addon60 * num60
        : perVisit * numDates;

    // Build confirm details HTML
    let petsHtml = '';
    savedPets.forEach(p => {
        petsHtml += `<div class="confirm-info-row"><span>${p.name || '—'}</span><span>${capitalize(p.type || 'dog')}${p.breed ? ' · ' + p.breed : ''}</span></div>`;
    });
    petEntries.forEach((entry) => {
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

    const durationLabel = duration === 'combo' ? '30 & 60 min' : `${duration} min`;
    document.getElementById('confirmDetails').innerHTML = `
        <div class="confirm-section">
            <div class="confirm-section-title">Service</div>
            <div class="confirm-info-row"><span>${names[service]}</span><span>${durationLabel}</span></div>
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
    if (duration === 'combo') {
        if (hasExtra) priceRowsHtml += `<div class="confirm-price-row"><span>Additional pet × ${numPets - 1}</span><span>+$${extra}</span></div>`;
        priceRowsHtml += `<div class="confirm-price-row"><span>30 min slots</span><span>× ${num30}</span></div>`;
        priceRowsHtml += `<div class="confirm-price-row"><span>60 min slots (+$${pricing.addon60})</span><span>× ${num60}</span></div>`;
    } else {
        if (show60) priceRowsHtml += `<div class="confirm-price-row"><span>60-min add-on</span><span>+$${pricing.addon60}</span></div>`;
        if (hasExtra) priceRowsHtml += `<div class="confirm-price-row"><span>Additional pet × ${numPets - 1}</span><span>+$${extra}</span></div>`;
        priceRowsHtml += `<div class="confirm-price-row"><span>${numDates > 1 ? 'Visits' : 'Visit'}</span><span>× ${numDates}</span></div>`;
    }
    document.getElementById('confirmPriceRows').innerHTML = priceRowsHtml;

    document.getElementById('confirmTotal').innerHTML = `
        <span>Estimated Total</span>
        <span class="total-amount">$${total}</span>
    `;

    // Build dateTimes object for structured calendar display
    const isCombo = duration === 'combo';
    const dateTimesObj = {};
    if (dateMode === 'pick') {
        const sortedPick2 = [...selectedDates].sort();
        let day1Times = null;
        sortedPick2.forEach((dateStr, idx) => {
            const tid = `dt_${dateStr.replace(/-/g,'_')}`;
            const slotsWrap = document.getElementById(`dateSlots_${tid}`);
            if (idx > 0 && slotsWrap && slotsWrap.style.display === 'none') {
                dateTimesObj[dateStr] = day1Times ? [...day1Times] : [];
            } else {
                const slotEls = slotsWrap ? slotsWrap.querySelectorAll('.date-slot') : [];
                const times = [];
                slotEls.forEach((_, si) => {
                    const type   = document.querySelector(`input[name="slotType_${tid}_${si}"]:checked`)?.value || 'specific';
                    const period = document.getElementById(`slotPeriod_${tid}_${si}`)?.value || '';
                    const comboTag = isCombo ? `|${document.getElementById(`comboDur_${tid}_${si}`)?.checked ? '60' : '30'}` : '';
                    if (period === 'Anytime') {
                        times.push('anytime' + comboTag);
                    } else if (type === 'specific') {
                        const t = getHMTime(`slotSpecHr_${tid}_${si}`, `slotSpecMin_${tid}_${si}`);
                        if (t) times.push(t + comboTag);
                    } else {
                        const from = getHMTime(`slotFromHr_${tid}_${si}`, `slotFromMin_${tid}_${si}`);
                        const to   = getHMTime(`slotToHr_${tid}_${si}`, `slotToMin_${tid}_${si}`);
                        if (from && to) times.push(`${from}~${to}` + comboTag);
                    }
                });
                const sorted2 = times.sort();
                dateTimesObj[dateStr] = sorted2;
                if (idx === 0) day1Times = sorted2;
            }
        });
    }

    // Save for sendRequest
    _bookingData = {
        service: names[service],
        duration: duration === 'combo' ? '30 & 60 min' : duration,
        isHoliday, total,
        clientName, clientPhone, clientEmail, clientNotes,
        dateTimes: dateMode === 'pick' ? dateTimesObj : null,
        priceBreakdown: {
            numVisits:    duration === 'combo' ? (num30 + num60) : numDates,
            serviceLabel: names[service],
            basePerVisit: base + (show60 ? pricing.addon60 : 0),
            extraRate:    hasExtra ? extraRate : 0,
            numExtra:     numPets - 1,
            isCat,
            numPets,
            ...(duration === 'combo' ? { num30, num60, addon60: pricing.addon60 } : {})
        }
    };

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
    let pidx = 0;
    getSelectedSavedPets().forEach(p => {
        pidx++;
        const ageStr = p.ageYears ? `${p.ageYears}yr${p.ageMonths ? ' ' + p.ageMonths + 'mo' : ''}` : (p.ageMonths ? p.ageMonths + 'mo' : '');
        petsText += `Pet ${pidx}: ${p.name || '—'} (${capitalize(p.type || 'dog')})\n`;
        if (p.breed)          petsText += `  Breed: ${p.breed}\n`;
        if (p.birthDate)      petsText += `  Birthday: ${p.birthDate}\n`;
        else if (ageStr)      petsText += `  Age: ${ageStr}\n`;
        if (p.spayedNeutered) petsText += `  Spayed/Neutered: ${p.spayedNeutered}\n`;
        if (p.careNotes)      petsText += `  Notes: ${p.careNotes}\n`;
    });
    document.querySelectorAll('.pet-entry').forEach(entry => {
        pidx++;
        const id    = entry.id.replace('petEntry','');
        const name  = document.getElementById(`petName${id}`)?.value  || '—';
        const type  = document.getElementById(`petType${id}`)?.value  || 'dog';
        const age   = document.getElementById(`petAge${id}`)?.value   || '';
        const breed = document.getElementById(`petBreed${id}`)?.value || '';
        const notes = document.getElementById(`petNotes${id}`)?.value || '';
        petsText += `Pet ${pidx}: ${name} (${capitalize(type)})\n`;
        if (breed) petsText += `  Breed: ${breed}\n`;
        if (age)   petsText += `  Age: ${age}\n`;
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
                clientId: wff.auth?.currentUser?.uid || null,
                service, duration,
                datesText: collectDatesText(),
                pets: petsData,
                notes: clientNotes,
                total,
                dateTimes: _bookingData.dateTimes || null,
                priceBreakdown: _bookingData.priceBreakdown || null,
                status: 'pending',
                createdAt: wff.serverTimestamp()
            }).catch(err => console.error('Firestore save failed:', err));

            // Auto-save newly entered pets to user profile
            const uid = wff.auth?.currentUser?.uid;
            if (uid) {
                const newPets = [];
                document.querySelectorAll('.pet-entry').forEach(entry => {
                    const id = entry.id.replace('petEntry', '');
                    const name = document.getElementById(`petName${id}`)?.value?.trim();
                    if (!name) return;
                    newPets.push({
                        name,
                        type:      document.getElementById(`petType${id}`)?.value  || 'dog',
                        breed:     document.getElementById(`petBreed${id}`)?.value?.trim() || '',
                        careNotes: document.getElementById(`petNotes${id}`)?.value?.trim() || '',
                        photoUrl:  ''
                    });
                });
                if (newPets.length > 0) {
                    (async () => {
                        const snap = await wff.getDoc(wff.doc(wff.db, 'users', uid));
                        const existing = snap.exists() ? (snap.data().pets || []) : [];
                        await wff.updateDoc(wff.doc(wff.db, 'users', uid), { pets: [...existing, ...newPets] });
                    })().catch(err => console.error('Pet profile sync failed:', err));
                }
            }
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
// ─── BOOKING PET BIRTHDAY CALENDAR ───────────────────────
let bkBdayCalYear, bkBdayCalMonth;

function bkSwitchAgeMode(mode) {
    document.getElementById('bkPetBdayWrap').style.display    = mode === 'exact'     ? '' : 'none';
    document.getElementById('bkPetAgeYMWrap').style.display   = mode === 'yearmonth' ? '' : 'none';
}

function populateBkBdayYears() {
    const sel = document.getElementById('bkBdayYearSel');
    if (sel.options.length > 0) return;
    const now = new Date().getFullYear();
    for (let y = now; y >= 1980; y--) sel.add(new Option(y, y));
}

function onBkBdayYearChange() {
    bkBdayCalYear = parseInt(document.getElementById('bkBdayYearSel').value);
    bkRenderBdayCal();
}

function onBkBdayMonthChange() {
    bkBdayCalMonth = parseInt(document.getElementById('bkBdayMonthSel').value);
    bkRenderBdayCal();
}

function bkOpenBdayCal() {
    const now = new Date();
    if (bkBdayCalYear === undefined) { bkBdayCalYear = now.getFullYear(); bkBdayCalMonth = now.getMonth(); }
    populateBkBdayYears();
    bkRenderBdayCal();
    document.getElementById('bkPetBdayCalWrap').style.display = 'block';
}

function bkCloseBdayCal() {
    document.getElementById('bkPetBdayCalWrap').style.display = 'none';
    const val = document.getElementById('bkPetBirthday').value;
    document.getElementById('bkPetBdayText').textContent = val ? bkFmtDate(val) : 'Choose birthday...';
}

function bkChangeBdayMonth(dir) {
    bkBdayCalMonth += dir;
    if (bkBdayCalMonth < 0)  { bkBdayCalMonth = 11; bkBdayCalYear--; }
    if (bkBdayCalMonth > 11) { bkBdayCalMonth = 0;  bkBdayCalYear++; }
    bkRenderBdayCal();
}

function bkRenderBdayCal() {
    document.getElementById('bkBdayYearSel').value  = bkBdayCalYear;
    document.getElementById('bkBdayMonthSel').value = bkBdayCalMonth;
    const today    = new Date(); today.setHours(0,0,0,0);
    const firstDay = new Date(bkBdayCalYear, bkBdayCalMonth, 1).getDay();
    const daysIn   = new Date(bkBdayCalYear, bkBdayCalMonth + 1, 0).getDate();
    const grid     = document.getElementById('bkPetBdayDays');
    const selVal   = document.getElementById('bkPetBirthday').value;
    grid.innerHTML = '';
    for (let i = 0; i < firstDay; i++) {
        const b = document.createElement('div'); b.className = 'cal-day cal-blank'; grid.appendChild(b);
    }
    for (let d = 1; d <= daysIn; d++) {
        const dateStr  = `${bkBdayCalYear}-${String(bkBdayCalMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isFuture = new Date(bkBdayCalYear, bkBdayCalMonth, d) > today;
        const cell     = document.createElement('div');
        cell.className = 'cal-day' + (isFuture ? ' cal-past' : '') + (dateStr === selVal ? ' cal-selected' : '');
        cell.textContent = d;
        if (!isFuture) cell.onclick = () => { document.getElementById('bkPetBirthday').value = dateStr; bkRenderBdayCal(); };
        grid.appendChild(cell);
    }
}

function bkFmtDate(d) {
    if (!d) return '—';
    const [y, mo, day] = d.split('-');
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${m[parseInt(mo)-1]} ${parseInt(day)}, ${y}`;
}

function openBookingPetModal() {
    // Reset form
    ['bkPetName','bkPetWeight','bkPetBreed','bkPetNotes','bkPetPhotoUrl','bkPetBirthday','bkPetAgeYear'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    const mo = document.getElementById('bkPetAgeMonth'); if (mo) mo.value = '';
    document.getElementById('bkPetPhotoPreview').style.display = 'none';
    document.getElementById('bkPetPhotoPlaceholder').style.display = '';
    document.querySelectorAll('#bkPetTypeGroup .pet-type-card').forEach((b,i) => b.classList.toggle('active', i===0));
    document.querySelectorAll('#bkPetSexGroup .pet-pill, #bkPetSpayedGroup .pet-pill').forEach(b => b.classList.remove('active'));
    const exactR = document.querySelector('input[name="bkPetAgeMode"][value="exact"]');
    if (exactR) { exactR.checked = true; bkSwitchAgeMode('exact'); }
    document.getElementById('bkPetBdayText').textContent = 'Choose birthday...';
    bkBdayCalYear = undefined;
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
    input.value = '';
    const base64 = await window.openCropModal(file);
    if (!base64) return;
    document.getElementById('bkPetPhotoUrl').value = base64;
    bkUpdatePhotoPreview();
}


async function saveBookingPet() {
    const wff = window.WFF;
    const name = document.getElementById('bkPetName').value.trim();
    if (!name) { alert("Please enter your pet's name."); return; }

    const bkAgeMode = document.querySelector('input[name="bkPetAgeMode"]:checked')?.value || 'exact';
    const birthday  = bkAgeMode === 'exact'     ? (document.getElementById('bkPetBirthday').value || '') : '';
    const ageYear   = bkAgeMode === 'yearmonth' ? (document.getElementById('bkPetAgeYear').value.trim() || '') : '';
    const ageMonth  = bkAgeMode === 'yearmonth' ? (document.getElementById('bkPetAgeMonth').value || '') : '';
    const sex           = bkGetPillValue('bkPetSexGroup');
    const spayedNeutered = bkGetPillValue('bkPetSpayedGroup');

    if (!birthday && !ageYear) { alert("Please enter your pet's birthday or birth year."); return; }
    if (!sex) { alert("Please select your pet's sex."); return; }
    if (!spayedNeutered) { alert("Please indicate if your pet is spayed/neutered."); return; }

    const pet = {
        name,
        type:     bkGetPillValue('bkPetTypeGroup') || 'dog',
        sex, spayedNeutered, birthday, ageYear, ageMonth,
        weight:   document.getElementById('bkPetWeight').value.trim(),
        breed:    document.getElementById('bkPetBreed').value.trim(),
        careNotes:document.getElementById('bkPetNotes').value.trim(),
        photoUrl: document.getElementById('bkPetPhotoUrl').value.trim(),
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

    // Check if user is logged in; load their saved pets
    const wff = window.WFF;
    if (wff && wff.auth && wff.onAuthStateChanged) {
        wff.onAuthStateChanged(wff.auth, async user => {
            const loginSection  = document.getElementById('step1LoginSection');
            const bookingSteps  = document.getElementById('bookingSteps');
            const submitBtn     = document.getElementById('submitBtn');
            if (!user) {
                if (loginSection)  loginSection.style.display  = '';
                if (bookingSteps)  bookingSteps.style.display   = 'none';
                if (submitBtn)     submitBtn.style.display       = 'none';
                return;
            }
            if (loginSection)  loginSection.style.display  = 'none';
            if (bookingSteps)  bookingSteps.style.display   = '';
            if (submitBtn)     submitBtn.style.display       = '';
            try {
                const snap = await wff.getDoc(wff.doc(wff.db, 'users', user.uid));
                const data = snap.exists() ? snap.data() : {};
                renderSavedPetCards(data.pets || []);
                if (data.name || data.phone || data.email) {
                    if (data.name)  document.getElementById('clientName').value  = data.name;
                    if (data.phone) document.getElementById('clientPhone').value = data.phone;
                    if (data.email) document.getElementById('clientEmail').value = data.email;
                    ['clientName','clientPhone','clientEmail'].forEach(id => {
                        document.getElementById(id).readOnly = true;
                    });
                    document.getElementById('contactFromAccount').style.display = '';
                }
            } catch (e) {
                console.warn('Could not load user profile:', e);
            }
        });
    }
});

function useManualContactInfo() {
    ['clientName','clientPhone','clientEmail'].forEach(id => {
        const el = document.getElementById(id);
        el.readOnly = false;
        el.value = '';
    });
    document.getElementById('contactFromAccount').style.display = 'none';
    document.getElementById('clientName').focus();
}
