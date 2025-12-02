// kalender.js
// LocalStorage-Kalender mit Gruppen, Status, Verband/Bereich-Flags, Filtern, Mehrtagesbalken, Tooltips

const STORAGE_KEY = "calendarDataStatusGroupsV4";

// Konfiguration der verfügbaren Verbände (Haupt-Flags)
const FLAG_CONFIG = [
    { id: "prio", label: "Prio", color: "#b91c1c" },
    { id: "info", label: "Info", color: "#0f766e" },
    { id: "warte", label: "Warten", color: "#92400e" }
];

// Konfiguration der Bereiche (z. B. ELS / SKS)
const TYPE_FLAG_CONFIG = [
    { id: "ELS", label: "ELS", color: "#7c3aed" },
    { id: "SKS", label: "SKS", color: "#0ea5e9" }
];

// DOM-Referenzen
const daysContainer = document.getElementById("daysContainer");
const monthLabel = document.getElementById("monthLabel");
const selectedDateLabel = document.getElementById("selectedDateLabel");
const selectedDateFullLabel = document.getElementById("selectedDateFullLabel");

const eventForm = document.getElementById("eventForm");
const eventIdInput = document.getElementById("eventId");
const eventStartDateInput = document.getElementById("eventStartDate");
const eventEndDateInput = document.getElementById("eventEndDate");
const eventTitleInput = document.getElementById("eventTitle");
const eventTimeInput = document.getElementById("eventTime");
const eventStatusInput = document.getElementById("eventStatus");
const eventGroupSelect = document.getElementById("eventGroup");
const eventFlagSelect = document.getElementById("eventFlag");
const eventTypeFlagSelect = document.getElementById("eventTypeFlag");
const eventDescriptionInput = document.getElementById("eventDescription");
const resetFormBtn = document.getElementById("resetFormBtn");
const deleteSelectedEventBtn = document.getElementById("deleteSelectedEventBtn");
const saveEventBtn = document.getElementById("saveEventBtn");

const eventsList = document.getElementById("eventsList");

const prevMonthBtn = document.getElementById("prevMonthBtn");
const nextMonthBtn = document.getElementById("nextMonthBtn");
const todayBtn = document.getElementById("todayBtn");

const summaryList = document.getElementById("summaryList");
const groupForm = document.getElementById("groupForm");
const groupNameInput = document.getElementById("groupName");

// Filter
const flagFilterSelect = document.getElementById("flagFilter");
const typeFlagFilterSelect = document.getElementById("typeFlagFilter");

const MONTH_NAMES = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WEEKDAY_NAMES = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

let currentDate = new Date();
let selectedDateKey = formatDateKey(new Date());

// Events: Status + Verband + Bereich
let events = []; // [{id,startDate,endDate,title,time,status,description,groupId,flagId,typeFlagId}]
let groups = []; // [{id,name,closed}]
let eventsByDate = {}; // { 'YYYY-MM-DD': [event,...] }

// Aktuelle Filter
let currentFlagFilter = "ALL";      // ALL | <flagId>
let currentTypeFlagFilter = "ALL";  // ALL | <typeFlagId>

// Aktuell im Formular bearbeiteter Termin
let selectedEventId = null;

// -------------- Hilfsfunktionen Datum ----------------
function formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}
function parseDateKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
}

// -------------- Verbände / Bereiche ----------------
function getFlagById(id) {
    if (!id) return null;
    return FLAG_CONFIG.find(f => f.id === id) || null;
}
function getTypeFlagById(id) {
    if (!id) return null;
    return TYPE_FLAG_CONFIG.find(f => f.id === id) || null;
}

function createFlagBadge(flag) {
    if (!flag) return null;
    const span = document.createElement("span");
    span.className = "flag-badge";
    span.textContent = flag.label;
    span.style.background = flag.color + "20";
    span.style.color = flag.color;
    return span;
}

function renderFlagOptions() {
    // Verband im Formular
    if (eventFlagSelect) {
        eventFlagSelect.innerHTML = "";
        const optNone = document.createElement("option");
        optNone.value = "";
        optNone.textContent = "– Kein Verband –";
        eventFlagSelect.appendChild(optNone);
        FLAG_CONFIG.forEach(f => {
            const opt = document.createElement("option");
            opt.value = f.id;
            opt.textContent = f.label;
            eventFlagSelect.appendChild(opt);
        });
    }

    // Bereich im Formular
    if (eventTypeFlagSelect) {
        eventTypeFlagSelect.innerHTML = "";
        const optNone2 = document.createElement("option");
        optNone2.value = "";
        optNone2.textContent = "– Kein Bereich –";
        eventTypeFlagSelect.appendChild(optNone2);
        TYPE_FLAG_CONFIG.forEach(f => {
            const opt = document.createElement("option");
            opt.value = f.id;
            opt.textContent = f.label;
            eventTypeFlagSelect.appendChild(opt);
        });
    }
}

function renderFilterOptions() {
    // Verband-Filter
    if (flagFilterSelect) {
        flagFilterSelect.innerHTML = "";
        const optAll = document.createElement("option");
        optAll.value = "ALL";
        optAll.textContent = "Alle Verbände";
        flagFilterSelect.appendChild(optAll);

        FLAG_CONFIG.forEach(f => {
            const opt = document.createElement("option");
            opt.value = f.id;
            opt.textContent = f.label;
            flagFilterSelect.appendChild(opt);
        });

        flagFilterSelect.value = currentFlagFilter;
    }

    // Bereich-Filter
    if (typeFlagFilterSelect) {
        typeFlagFilterSelect.innerHTML = "";
        const optAll2 = document.createElement("option");
        optAll2.value = "ALL";
        optAll2.textContent = "Alle Bereiche";
        typeFlagFilterSelect.appendChild(optAll2);

        TYPE_FLAG_CONFIG.forEach(f => {
            const opt = document.createElement("option");
            opt.value = f.id;
            opt.textContent = f.label;
            typeFlagFilterSelect.appendChild(opt);
        });

        typeFlagFilterSelect.value = currentTypeFlagFilter;
    }
}

// -------------- Storage ----------------
function loadFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            events = [];
            groups = [];
            return;
        }
        const parsed = JSON.parse(raw);

        events = (parsed.events || []).map(e => ({
            id: e.id,
            title: e.title,
            startDate: e.startDate,
            endDate: e.endDate || null,
            time: e.time || null,
            status: e.status || "offen",
            description: e.description || null,
            groupId: typeof e.groupId === "number" ? e.groupId : null,
            flagId: e.flagId || null,
            typeFlagId: e.typeFlagId || null
        }));
        groups = (parsed.groups || []).map(g => ({
            id: g.id,
            name: g.name,
            closed: !!g.closed
        }));
    } catch (e) {
        console.error("Fehler beim Laden aus localStorage", e);
        events = [];
        groups = [];
    }
}

function saveToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ events, groups }));
    } catch (e) {
        console.error("Fehler beim Speichern in localStorage", e);
    }
}

// Map von Tagen -> Events
function rebuildEventsByDate() {
    const map = {};
    events.forEach(ev => {
        const start = new Date(ev.startDate);
        const end = new Date(ev.endDate || ev.startDate);
        if (isNaN(start) || isNaN(end)) return;
        if (end < start) return;
        for (let d = new Date(start.getTime()); d <= end; d.setDate(d.getDate() + 1)) {
            const key = d.toISOString().slice(0, 10);
            if (!map[key]) map[key] = [];
            map[key].push(ev);
        }
    });
    eventsByDate = map;
}

// Labels oben
function updateSelectedDateLabels() {
    const date = parseDateKey(selectedDateKey);
    const day = String(date.getDate()).padStart(2, "0");
    const mon = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    selectedDateLabel.textContent = `${day}.${mon}.${year}`;
    const weekday = WEEKDAY_NAMES[date.getDay()];
    selectedDateFullLabel.textContent =
        `${weekday}, ${day}. ${MONTH_NAMES[date.getMonth()]} ${year}`;
}

// Status -> Fortschritt intern
function statusToProgress(status) {
    switch (status) {
        case "in_bearbeitung": return 50;
        case "fertig": return 100;
        default: return 0;
    }
}

function progressToColor(progress) {
    if (progress >= 100) return "#16a34a";
    if (progress >= 50) return "#2563eb";
    if (progress > 0) return "#f59e0b";
    return "#9ca3af";
}

// Status-Farbklassen für Chips
function getStatusClass(status) {
    switch (status) {
        case "in_bearbeitung": return "status-chip status-in_bearbeitung";
        case "fertig": return "status-chip status-fertig";
        default: return "status-chip status-offen";
    }
}

// Event gesperrt? (Gruppe geschlossen)
function isEventLocked(ev) {
    if (ev.groupId == null) return false;
    const g = groups.find(gr => gr.id === ev.groupId);
    return !!(g && g.closed);
}

// Formular read-only setzen
function setEventFormReadOnly(readonly) {
    const controls = [
        eventStartDateInput,
        eventEndDateInput,
        eventTitleInput,
        eventTimeInput,
        eventStatusInput,
        eventGroupSelect,
        eventFlagSelect,
        eventTypeFlagSelect,
        eventDescriptionInput
    ];
    controls.forEach(el => {
        el.disabled = readonly;
    });
    if (saveEventBtn) saveEventBtn.disabled = readonly;
    deleteSelectedEventBtn.disabled = readonly || !eventIdInput.value;
}

// Filter-Logik
function eventPassesFilter(ev) {
    // Verband
    if (currentFlagFilter !== "ALL") {
        if (ev.flagId !== currentFlagFilter) return false;
    }
    // Bereich
    if (currentTypeFlagFilter !== "ALL") {
        if (ev.typeFlagId !== currentTypeFlagFilter) return false;
    }
    return true;
}

// Position eines Mehrtagestermins im Balken (Start/Mitte/Ende)
function getMultiSegmentPosition(ev, dayKey) {
    const start = ev.startDate;
    const end = ev.endDate || ev.startDate;
    if (dayKey === start) return "start";
    if (dayKey === end) return "end";
    return "middle";
}

// -------------- Kalender zeichnen ----------------
function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    monthLabel.textContent = `${MONTH_NAMES[month]} ${year}`;
    daysContainer.innerHTML = "";

    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const daysInMonth = last.getDate();
    const jsFirst = first.getDay();
    const startIndex = (jsFirst + 6) % 7; // Montag=0

    // Leere Felder vor dem 1.
    for (let i = 0; i < startIndex; i++) {
        const empty = document.createElement("div");
        empty.className = "day outside";
        daysContainer.appendChild(empty);
    }

    const todayKey = formatDateKey(new Date());

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const key = formatDateKey(date);
        const cell = document.createElement("div");
        cell.classList.add("day");
        cell.dataset.dateKey = key;
        if (key === todayKey) cell.classList.add("today");
        if (key === selectedDateKey) cell.classList.add("selected");

        const num = document.createElement("div");
        num.className = "day-number";
        const span = document.createElement("span");
        span.textContent = day;
        num.appendChild(span);
        cell.appendChild(num);

        const listAll = eventsByDate[key] || [];
        const list = listAll.filter(eventPassesFilter);

        if (list.length > 0) {
            // Mehrtagestermine (startDate != endDate)
            const multiEvents = list.filter(ev => ev.endDate && ev.endDate !== ev.startDate);
            const singleEvents = list.filter(ev => !(ev.endDate && ev.endDate !== ev.startDate));

            if (multiEvents.length > 0) {
                const multiWrap = document.createElement("div");
                multiWrap.className = "day-multiday-bars";

                multiEvents.forEach(ev => {
                    const bar = document.createElement("div");
                    bar.className = "day-bar";
                    if (ev.id === selectedEventId) {
                        bar.classList.add("event-selected");
                    }

                    const p = statusToProgress(ev.status);
                    bar.style.background = progressToColor(p);

                    const pos = getMultiSegmentPosition(ev, key);
                    bar.classList.add("day-bar--" + pos); // start/middle/end

                    // Tooltip mit vollem Titel + Datumsbereich
                    const sameDay = !ev.endDate || ev.endDate === ev.startDate;
                    const rangeText = sameDay ? ev.startDate : `${ev.startDate} – ${ev.endDate}`;
                    const tooltipText = `${ev.title || "(ohne Titel)"} (${rangeText})`;
                    bar.title = tooltipText;

                    const flag = getFlagById(ev.flagId);
                    const typeFlag = getTypeFlagById(ev.typeFlagId);
                    if (flag) {
                        const badge = createFlagBadge(flag);
                        if (badge) bar.appendChild(badge);
                    }
                    if (typeFlag) {
                        const badge2 = createFlagBadge(typeFlag);
                        if (badge2) bar.appendChild(badge2);
                    }

                    const titleSpan = document.createElement("span");
                    titleSpan.className = "day-bar-title";
                    titleSpan.textContent = ev.title || "";
                    bar.appendChild(titleSpan);

                    bar.addEventListener("click", (e) => {
                        e.stopPropagation();
                        fillFormFromEvent(ev);
                        selectedDateKey = key;
                        updateSelectedDateLabels();
                        renderEventsList();
                        renderCalendar();
                    });

                    multiWrap.appendChild(bar);
                });

                cell.appendChild(multiWrap);
            }

            if (singleEvents.length > 0) {
                const scrollWrap = document.createElement("div");
                scrollWrap.className = "day-events-scroll";

                // Dynamische Begrenzung der sichtbaren Ein-Tages-Termine
                // Regeln:
                // - 0 oder 1 Mehrtages-Termin  -> 5 Ein-Tages-Termine sichtbar
                // - 2 Mehrtages-Termine        -> 4 Ein-Tages-Termine sichtbar
                // - >= 3 Mehrtages-Termine     -> 3 Ein-Tages-Termine sichtbar (Fallback)
                let visibleSingles;
                if (multiEvents.length <= 1) {
                    visibleSingles = 5;
                } else if (multiEvents.length === 2) {
                    visibleSingles = 4;
                } else {
                    visibleSingles = 3;
                }

                // Eine Zeile (Balken) ist ca. 16px hoch + 2px gap => grob 18px
                const barHeightPx = 18;
                scrollWrap.style.maxHeight = `${visibleSingles * barHeightPx}px`;

                singleEvents.forEach(ev => {
                    const bar = document.createElement("div");
                    bar.className = "day-bar";
                    if (ev.id === selectedEventId) {
                        bar.classList.add("event-selected");
                    }
                    const p = statusToProgress(ev.status);
                    bar.style.background = progressToColor(p);

                    // Tooltip mit vollem Titel + Datumsbereich
                    const sameDay = !ev.endDate || ev.endDate === ev.startDate;
                    const rangeText = sameDay ? ev.startDate : `${ev.startDate} – ${ev.endDate}`;
                    const tooltipText = `${ev.title || "(ohne Titel)"} (${rangeText})`;
                    bar.title = tooltipText;

                    const flag = getFlagById(ev.flagId);
                    const typeFlag = getTypeFlagById(ev.typeFlagId);
                    if (flag) {
                        const badge = createFlagBadge(flag);
                        if (badge) bar.appendChild(badge);
                    }
                    if (typeFlag) {
                        const badge2 = createFlagBadge(typeFlag);
                        if (badge2) bar.appendChild(badge2);
                    }

                    const titleSpan = document.createElement("span");
                    titleSpan.className = "day-bar-title";
                    titleSpan.textContent = ev.title || "";
                    bar.appendChild(titleSpan);

                    bar.addEventListener("click", (e) => {
                        e.stopPropagation();
                        fillFormFromEvent(ev);
                        selectedDateKey = key;
                        updateSelectedDateLabels();
                        renderEventsList();
                        renderCalendar();
                    });

                    scrollWrap.appendChild(bar);
                });

                cell.appendChild(scrollWrap);
            }
        }

        cell.addEventListener("click", () => {
            selectedDateKey = key;
            updateSelectedDateLabels();
            resetForm();
            eventStartDateInput.value = selectedDateKey;
            eventEndDateInput.value = "";
            renderEventsList();
            renderCalendar();
        });

        // Doppelklick auf Tag → ersten Termin (nach Filter) laden
        cell.addEventListener("dblclick", () => {
            const list2 = (eventsByDate[key] || []).filter(eventPassesFilter);
            if (list2.length > 0) {
                fillFormFromEvent(list2[0]);
            }
        });

        daysContainer.appendChild(cell);
    }
}

// -------------- Tagesliste rechts ----------------
function renderEventsList() {
    eventsList.innerHTML = "";
    const listAll = eventsByDate[selectedDateKey] || [];
    const list = listAll.filter(eventPassesFilter);

    if (list.length === 0) {
        const info = document.createElement("div");
        info.className = "no-events";
        info.textContent = "Keine Termine an diesem Tag.";
        eventsList.appendChild(info);
        return;
    }

    list.sort((a, b) => {
        if (!a.time && !b.time) return 0;
        if (!a.time) return -1;
        if (!b.time) return 1;
        return a.time.localeCompare(b.time);
    });

    list.forEach(ev => {
        const item = document.createElement("div");
        item.className = "event-item";
        if (ev.id === selectedEventId) {
            item.classList.add("event-selected");
        }

        const main = document.createElement("div");
        main.className = "event-main";

        const titleEl = document.createElement("div");
        titleEl.className = "event-title";

        const flag = getFlagById(ev.flagId);
        const typeFlag = getTypeFlagById(ev.typeFlagId);
        if (flag) {
            const flagBadge = createFlagBadge(flag);
            if (flagBadge) titleEl.appendChild(flagBadge);
        }
        if (typeFlag) {
            const typeBadge = createFlagBadge(typeFlag);
            if (typeBadge) titleEl.appendChild(typeBadge);
        }

        const titleTextSpan = document.createElement("span");
        titleTextSpan.textContent = ev.title;
        titleEl.appendChild(titleTextSpan);

        const timeEl = document.createElement("div");
        timeEl.className = "event-time";
        const sameDay = !ev.endDate || ev.endDate === ev.startDate;
        const rangeText = sameDay
            ? ev.startDate
            : `${ev.startDate} – ${ev.endDate}`;
        timeEl.textContent = `📅 ${rangeText}` + (ev.time ? ` · ⏰ ${ev.time.substring(0, 5)}` : "");

        const statusEl = document.createElement("div");
        statusEl.className = "event-status";
        const group = groups.find(g => g.id === ev.groupId);
        const groupName = group ? group.name + (group.closed ? " (abgeschlossen)" : "") : "Keine Gruppe";

        const statusChip = document.createElement("span");
        statusChip.className = getStatusClass(ev.status);
        statusChip.textContent = statusLabel(ev.status);

        statusEl.textContent = "";
        statusEl.appendChild(statusChip);
        const groupSpan = document.createElement("span");
        groupSpan.textContent = " · Gruppe: " + groupName;
        statusEl.appendChild(groupSpan);

        const descEl = document.createElement("div");
        descEl.className = "event-desc";
        descEl.textContent = ev.description || "";

        main.appendChild(titleEl);
        main.appendChild(timeEl);
        main.appendChild(statusEl);
        if (ev.description) main.appendChild(descEl);

        const delBtn = document.createElement("button");
        delBtn.className = "event-delete-btn";
        delBtn.textContent = "Löschen";

        if (isEventLocked(ev)) {
            delBtn.disabled = true;
            delBtn.title = "Termin gehört zu einem abgeschlossenen Fortschrittsbalken und kann nicht gelöscht werden.";
        } else {
            delBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (!confirm("Termin wirklich löschen?")) return;
                deleteEvent(ev.id);
            });
        }

        item.appendChild(main);
        item.appendChild(delBtn);

        item.addEventListener("click", () => {
            fillFormFromEvent(ev);
            renderCalendar();
            renderEventsList();
        });

        eventsList.appendChild(item);
    });
}

// -------------- Termin in Formular laden ----------------
function fillFormFromEvent(ev) {
    selectedEventId = ev.id;
    eventIdInput.value = ev.id;
    eventTitleInput.value = ev.title;
    eventTimeInput.value = ev.time ? ev.time.substring(0, 5) : "";
    eventDescriptionInput.value = ev.description || "";
    eventStartDateInput.value = ev.startDate;
    eventEndDateInput.value = (ev.endDate && ev.endDate !== ev.startDate) ? ev.endDate : "";
    eventStatusInput.value = ev.status || "offen";

    const g = groups.find(g => g.id === ev.groupId && !g.closed);
    eventGroupSelect.value = g ? String(g.id) : "";

    eventFlagSelect.value = ev.flagId || "";
    eventTypeFlagSelect.value = ev.typeFlagId || "";

    const locked = isEventLocked(ev);
    setEventFormReadOnly(locked);
    if (!locked) {
        deleteSelectedEventBtn.disabled = false;
    }
}

// -------------- Status-Label ----------------
function statusLabel(status) {
    switch (status) {
        case "in_bearbeitung": return "In Bearbeitung";
        case "fertig": return "Fertig";
        default: return "Offen";
    }
}

// -------------- Gruppen-Auswahlliste (nur offene) ----------------
function renderGroupOptions() {
    eventGroupSelect.innerHTML = "";
    const optNone = document.createElement("option");
    optNone.value = "";
    optNone.textContent = "– Keine Zuordnung –";
    eventGroupSelect.appendChild(optNone);

    groups.filter(g => !g.closed).forEach(g => {
        const opt = document.createElement("option");
        opt.value = String(g.id);
        opt.textContent = g.name;
        eventGroupSelect.appendChild(opt);
    });
}

// -------------- Gruppen-Übersicht (eine Zeile) ----------------
function renderGroupRow(group) {
    const assigned = events.filter(e => e.groupId === group.id);
    const total = assigned.length;
    const done = assigned.filter(e => statusToProgress(e.status) >= 100).length;
    const avg = total ? assigned.reduce((s, e) => s + statusToProgress(e.status), 0) / total : 0;
    const avgRounded = Math.round(avg);

    const row = document.createElement("div");
    row.className = "summary-item";

    const header = document.createElement("div");
    header.className = "summary-item-header";

    const title = document.createElement("div");
    title.className = "summary-title" + (group.closed ? " closed" : "");
    title.textContent = group.name + (group.closed ? " (abgeschlossen)" : "");

    const range = document.createElement("div");
    range.className = "summary-range";
    range.textContent = `${total} Termin(e), davon ${done} fertig`;

    const status = document.createElement("div");
    status.className = "summary-status";
    status.textContent = `Durchschnittlicher Fortschritt (aus Status): ${avgRounded}%`;

    const actions = document.createElement("div");
    actions.className = "summary-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "group-action-btn";
    editBtn.type = "button";
    editBtn.textContent = "✏️";

    const stateBtn = document.createElement("button");
    stateBtn.className = "group-action-btn";
    stateBtn.type = "button";

    if (group.closed) {
        stateBtn.textContent = "⟳";
        stateBtn.title = "Gruppe wieder öffnen";
    } else {
        stateBtn.textContent = "✔️";
        stateBtn.title = "Gruppe abschließen";
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "group-action-btn danger";
    deleteBtn.type = "button";
    deleteBtn.textContent = "🗑";

    const toggleIcon = document.createElement("div");
    toggleIcon.className = "summary-toggle";
    toggleIcon.textContent = "▼";

    actions.appendChild(editBtn);
    actions.appendChild(stateBtn);
    actions.appendChild(deleteBtn);
    actions.appendChild(toggleIcon);

    const details = document.createElement("div");
    details.className = "summary-item-details";

    if (total === 0) {
        const none = document.createElement("div");
        none.className = "no-events";
        none.textContent = "Keine Termine in dieser Gruppe.";
        details.appendChild(none);
    } else {
        const sorted = [...assigned].sort((a, b) => {
            if (a.startDate === b.startDate) {
                return (a.title || "").localeCompare(b.title || "");
            }
            return a.startDate.localeCompare(b.startDate);
        });
        sorted.forEach(ev => {
            const line = document.createElement("div");
            line.className = "summary-detail-item";

            const left = document.createElement("div");
            left.className = "summary-detail-left";

            const flag = getFlagById(ev.flagId);
            const typeFlag = getTypeFlagById(ev.typeFlagId);
            if (flag) {
                const flagBadge = createFlagBadge(flag);
                if (flagBadge) left.appendChild(flagBadge);
            }
            if (typeFlag) {
                const typeBadge = createFlagBadge(typeFlag);
                if (typeBadge) left.appendChild(typeBadge);
            }

            const titleSpan = document.createElement("span");
            titleSpan.textContent = ev.title;
            left.appendChild(titleSpan);

            const right = document.createElement("div");
            right.className = "summary-detail-right";
            const sameDay = !ev.endDate || ev.endDate === ev.startDate;
            const rangeText = sameDay ? ev.startDate : `${ev.startDate} – ${ev.endDate}`;
            const rangeSpan = document.createElement("span");
            rangeSpan.textContent = rangeText;

            const statusChip = document.createElement("span");
            statusChip.className = getStatusClass(ev.status);
            statusChip.textContent = statusLabel(ev.status);

            right.appendChild(rangeSpan);
            right.appendChild(statusChip);

            line.appendChild(left);
            line.appendChild(right);

            line.addEventListener("click", () => {
                fillFormFromEvent(ev);
                selectedDateKey = ev.startDate;
                updateSelectedDateLabels();
                rebuildEventsByDate();
                renderCalendar();
                renderEventsList();
            });

            details.appendChild(line);
        });
    }

    header.addEventListener("click", (e) => {
        if (e.target === editBtn || e.target === deleteBtn || e.target === stateBtn) return;
        const isOpen = details.style.display === "block";
        details.style.display = isOpen ? "none" : "block";
        toggleIcon.textContent = isOpen ? "▼" : "▲";
    });

    editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        renameGroup(group.id);
    });

    stateBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (group.closed) {
            reopenGroup(group.id);
        } else {
            closeGroup(group.id);
        }
    });

    deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteGroup(group.id);
    });

    header.appendChild(title);
    header.appendChild(range);
    header.appendChild(status);
    header.appendChild(actions);

    row.appendChild(header);
    row.appendChild(details);
    summaryList.appendChild(row);
}

// Übersicht unten (offen / abgeschlossen)
function renderSummary() {
    summaryList.innerHTML = "";
    if (groups.length === 0) {
        const info = document.createElement("div");
        info.className = "no-events";
        info.textContent = "Noch keine Fortschrittsgruppen angelegt.";
        summaryList.appendChild(info);
        return;
    }

    const openGroups = groups.filter(g => !g.closed);
    const closedGroups = groups.filter(g => g.closed);

    if (openGroups.length > 0) {
        const h = document.createElement("div");
        h.className = "summary-section-title";
        h.textContent = "Offene Gruppen";
        summaryList.appendChild(h);
        openGroups.forEach(g => renderGroupRow(g));
    }

    if (closedGroups.length > 0) {
        const h = document.createElement("div");
        h.className = "summary-section-title";
        h.textContent = "Abgeschlossene Gruppen";
        summaryList.appendChild(h);
        closedGroups.forEach(g => renderGroupRow(g));
    }
}

// Formular zurücksetzen
function resetForm() {
    selectedEventId = null;
    eventIdInput.value = "";
    eventTitleInput.value = "";
    eventTimeInput.value = "";
    eventDescriptionInput.value = "";
    eventStartDateInput.value = selectedDateKey;
    eventEndDateInput.value = "";
    eventStatusInput.value = "offen";
    eventGroupSelect.value = "";
    eventFlagSelect.value = "";
    eventTypeFlagSelect.value = "";
    setEventFormReadOnly(false);
}

// Termin speichern/aktualisieren
function upsertEvent() {
    const title = eventTitleInput.value.trim();
    const time = eventTimeInput.value;
    const description = eventDescriptionInput.value.trim();
    const existingId = eventIdInput.value ? Number(eventIdInput.value) : 0;
    const startDate = eventStartDateInput.value;
    const endDateRaw = eventEndDateInput.value || null;
    const status = eventStatusInput.value || "offen";
    const groupIdRaw = eventGroupSelect.value;
    const groupId = groupIdRaw ? Number(groupIdRaw) : null;
    const flagId = eventFlagSelect.value || null;
    const typeFlagId = eventTypeFlagSelect.value || null;

    if (!title || !startDate) {
        alert("Bitte mindestens Titel und Startdatum ausfüllen.");
        return;
    }
    if (endDateRaw && endDateRaw < startDate) {
        alert("Das Enddatum darf nicht vor dem Startdatum liegen.");
        return;
    }

    if (existingId) {
        const existingEv = events.find(e => e.id === existingId);
        if (existingEv && isEventLocked(existingEv)) {
            alert("Termine, deren Fortschrittsbalken abgeschlossen ist, können nicht mehr geändert werden.");
            return;
        }
        const idx = events.findIndex(e => e.id === existingId);
        if (idx !== -1) {
            events[idx].title = title;
            events[idx].startDate = startDate;
            events[idx].endDate = endDateRaw;
            events[idx].time = time || null;
            events[idx].description = description || null;
            events[idx].status = status;
            events[idx].groupId = groupId;
            events[idx].flagId = flagId;
            events[idx].typeFlagId = typeFlagId;
        }
    } else {
        const newEvent = {
            id: Date.now(),
            title,
            startDate,
            endDate: endDateRaw,
            time: time || null,
            description: description || null,
            status,
            groupId,
            flagId,
            typeFlagId
        };
        events.push(newEvent);
    }

    saveToStorage();
    rebuildEventsByDate();
    resetForm();
    renderCalendar();
    renderEventsList();
    renderSummary();
}

// Termin löschen
function deleteEvent(id) {
    const ev = events.find(e => e.id === id);
    if (ev && isEventLocked(ev)) {
        alert("Termine, deren Fortschrittsbalken abgeschlossen ist, können nicht mehr gelöscht werden.");
        return;
    }
    if (selectedEventId === id) {
        selectedEventId = null;
    }
    saveToStorage();
    rebuildEventsByDate();
    if (Number(eventIdInput.value) === Number(id)) resetForm();
    renderCalendar();
    renderEventsList();
    renderSummary();
}

// Gruppe erstellen
function createGroup(name) {
    const trimmed = name.trim();
    if (!trimmed) {
        alert("Bitte einen Namen für die Gruppe eingeben.");
        return;
    }
    const newGroup = {
        id: Date.now(),
        name: trimmed,
        closed: false
    };
    groups.push(newGroup);
    saveToStorage();
    renderGroupOptions();
    renderSummary();
    groupNameInput.value = "";
}

// Gruppe umbenennen
function renameGroup(id) {
    const group = groups.find(g => g.id === id);
    if (!group) return;
    const newName = prompt("Neuer Name für die Gruppe:", group.name);
    if (newName === null) return;
    const trimmed = newName.trim();
    if (!trimmed) {
        alert("Name darf nicht leer sein.");
        return;
    }
    group.name = trimmed;
    saveToStorage();
    renderGroupOptions();
    renderSummary();
}

// Gruppe abschließen -> NUR wenn alle Termine fertig
function closeGroup(id) {
    const group = groups.find(g => g.id === id);
    if (!group) return;
    if (group.closed) return;

    const assigned = events.filter(e => e.groupId === id);
    const notFinished = assigned.filter(e => e.status !== "fertig");

    if (notFinished.length > 0) {
        alert(
            `Gruppe "${group.name}" kann nicht abgeschlossen werden.\n` +
            `Es sind noch ${notFinished.length} Termin(e) nicht fertig.`
        );
        return;
    }

    if (!confirm(`Gruppe "${group.name}" abschließen? Sie kann danach nicht mehr neuen Terminen zugeordnet werden.`)) {
        return;
    }

    group.closed = true;
    saveToStorage();
    renderGroupOptions();
    renderSummary();

    const currentId = eventIdInput.value ? Number(eventIdInput.value) : null;
    if (currentId) {
        const ev = events.find(e => e.id === currentId);
        if (ev && isEventLocked(ev)) {
            setEventFormReadOnly(true);
        }
    }
}

// Gruppe wieder öffnen
function reopenGroup(id) {
    const group = groups.find(g => g.id === id);
    if (!group) return;
    if (!group.closed) return;

    if (!confirm(`Gruppe "${group.name}" wieder öffnen? Termine können danach wieder geändert werden.`)) {
        return;
    }

    group.closed = false;
    saveToStorage();
    renderGroupOptions();
    renderSummary();

    const currentId = eventIdInput.value ? Number(eventIdInput.value) : null;
    if (currentId) {
        const ev = events.find(e => e.id === currentId);
        if (ev && !isEventLocked(ev)) {
            setEventFormReadOnly(false);
        }
    }
}

// Gruppe löschen
function deleteGroup(id) {
    const group = groups.find(g => g.id === id);
    if (!group) return;
    if (!confirm(`Gruppe "${group.name}" löschen? Die Zuordnung in den Terminen wird entfernt.`)) {
        return;
    }
    groups = groups.filter(g => g.id !== id);
    events = events.map(e => e.groupId === id ? { ...e, groupId: null } : e);
    saveToStorage();
    rebuildEventsByDate();
    renderGroupOptions();
    renderCalendar();
    renderEventsList();
    renderSummary();
}

// ---------------- Event-Handler ----------------
eventForm.addEventListener("submit", (e) => { e.preventDefault(); upsertEvent(); });
resetFormBtn.addEventListener("click", () => {
    resetForm();
    renderCalendar();
    renderEventsList();
});
deleteSelectedEventBtn.addEventListener("click", () => {
    const id = eventIdInput.value;
    if (!id) return;
    if (!confirm("Termin wirklich löschen?")) return;
    deleteEvent(Number(id));
});

groupForm.addEventListener("submit", (e) => {
    e.preventDefault();
    createGroup(groupNameInput.value);
});

prevMonthBtn.addEventListener("click", () => {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    renderCalendar();
    renderEventsList();
});
nextMonthBtn.addEventListener("click", () => {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    renderCalendar();
    renderEventsList();
});
todayBtn.addEventListener("click", () => {
    const today = new Date();
    currentDate = new Date(today.getFullYear(), today.getMonth(), 1);
    selectedDateKey = formatDateKey(today);
    updateSelectedDateLabels();
    resetForm();
    renderCalendar();
    renderEventsList();
});

// Filter-Events
if (flagFilterSelect) {
    flagFilterSelect.addEventListener("change", () => {
        currentFlagFilter = flagFilterSelect.value;
        renderCalendar();
        renderEventsList();
    });
}
if (typeFlagFilterSelect) {
    typeFlagFilterSelect.addEventListener("change", () => {
        currentTypeFlagFilter = typeFlagFilterSelect.value;
        renderCalendar();
        renderEventsList();
    });
}

// ---------------- Init ----------------
(function init() {
    loadFromStorage();
    renderFlagOptions();
    renderFilterOptions();
    rebuildEventsByDate();
    renderGroupOptions();
    selectedDateKey = formatDateKey(new Date());
    updateSelectedDateLabels();
    renderCalendar();
    renderEventsList();
    renderSummary();
})();
