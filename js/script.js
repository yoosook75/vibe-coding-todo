/**
 * Todo 할일 관리 앱 - Firebase Realtime Database 기반
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  set,
  get,
  update,
  remove,
  onValue,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js";
import { firebaseConfig, isFirebaseConfigured } from "./config.js";

const STORAGE_KEY = "todo-app-data";
const THEME_STORAGE_KEY = "todo-app-theme";

const META_ICONS = {
  calendar:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  clock:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
};

const MONTH_NAMES = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
];

const CATEGORY_LABELS = {
  study: "공부",
  work: "업무",
  personal: "개인",
  other: "기타",
};

const PRIORITY_LABELS = {
  high: "높음",
  medium: "보통",
  low: "낮음",
};

const DAY_SHORT = ["일", "월", "화", "수", "목", "금", "토"];

const VALID_PRIORITIES = ["high", "medium", "low"];
const VALID_CATEGORIES = ["study", "work", "personal", "other"];

const FILTER_LABELS = {
  today: "오늘",
  upcoming: "예정",
  important: "중요",
  urgent: "마감 임박",
};

const CAL_CELL_PADDING = 12;
const CAL_EVENT_H_MARGIN = 8;
const CAL_DAY_HEADER = 42;
const CAL_WEEK_DAY_HEADER = 48;
const CAL_BAR_HEIGHT = 44;
const CAL_LANE_GAP = 6;
const CAL_LANE_HEIGHT = CAL_BAR_HEIGHT + CAL_LANE_GAP;
const CAL_CELL_MIN_HEIGHT = 170;
const CAL_WEEK_MIN_HEIGHT = 280;
const CAL_WEEK_BOTTOM_PAD = 14;
const TIME_GRID_HOURS = 24;
const TIME_GRID_HOUR_MIN = 56;
const TIME_GRID_LANE_HEIGHT = 32;
const TIME_GRID_BAR_HEIGHT = 36;
const CATEGORY_ORDER = ["study", "work", "personal", "other"];
const VALID_CAL_MODES = ["month", "week", "day", "timegrid"];

// DOM 요소
const els = {
  summaryTotal: document.getElementById("summaryTotal"),
  summaryToday: document.getElementById("summaryToday"),
  summaryDone: document.getElementById("summaryDone"),
  summaryImportant: document.getElementById("summaryImportant"),
  summaryUrgent: document.getElementById("summaryUrgent"),
  openTodoModalBtn: document.getElementById("openTodoModalBtn"),
  searchInput: document.getElementById("searchInput"),
  filterBar: document.getElementById("filterBar"),
  viewSwitcher: document.getElementById("viewSwitcher"),
  formMessage: document.getElementById("formMessage"),
  connectionStatus: document.getElementById("connectionStatus"),
  themeToggleBtn: document.getElementById("themeToggleBtn"),
  summaryCards: document.getElementById("summaryCards"),
  listView: document.getElementById("listView"),
  calendarView: document.getElementById("calendarView"),
  timelineView: document.getElementById("timelineView"),
  todoList: document.getElementById("todoList"),
  emptyMessage: document.getElementById("emptyMessage"),
  calPrevBtn: document.getElementById("calPrevBtn"),
  calNextBtn: document.getElementById("calNextBtn"),
  calMonthTitle: document.getElementById("calMonthTitle"),
  calModeSwitcher: document.getElementById("calModeSwitcher"),
  calMonthPanel: document.getElementById("calMonthPanel"),
  calWeekPanel: document.getElementById("calWeekPanel"),
  calDayPanel: document.getElementById("calDayPanel"),
  calDayList: document.getElementById("calDayList"),
  calDayEmpty: document.getElementById("calDayEmpty"),
  calTimeGridPanel: document.getElementById("calTimeGridPanel"),
  calTimeGrid: document.getElementById("calTimeGrid"),
  calTimeGridEmpty: document.getElementById("calTimeGridEmpty"),
  calDaysGrid: document.getElementById("calDaysGrid"),
  weekDayHeaders: document.getElementById("weekDayHeaders"),
  calWeekGrid: document.getElementById("calWeekGrid"),
  calendarEmpty: document.getElementById("calendarEmpty"),
  timelineGroups: document.getElementById("timelineGroups"),
  timelineEmpty: document.getElementById("timelineEmpty"),
  todoModal: document.getElementById("todoModal"),
  modalBackdrop: document.getElementById("modalBackdrop"),
  modalTitle: document.getElementById("modalTitle"),
  modalFormMessage: document.getElementById("modalFormMessage"),
  todoForm: document.getElementById("todoForm"),
  fieldTitle: document.getElementById("fieldTitle"),
  fieldStartDate: document.getElementById("fieldStartDate"),
  fieldEndDate: document.getElementById("fieldEndDate"),
  fieldStartTime: document.getElementById("fieldStartTime"),
  fieldEndTime: document.getElementById("fieldEndTime"),
  fieldPriority: document.getElementById("fieldPriority"),
  fieldCategory: document.getElementById("fieldCategory"),
  fieldMemo: document.getElementById("fieldMemo"),
  cancelModalBtn: document.getElementById("cancelModalBtn"),
};

// 앱 상태
let todos = [];
let currentFilter = "all";
let currentView = "list";
let editingId = null;
let calAnchorKey = getTodayKey();
let calMode = "month";

let db = null;
let firebaseReady = false;
let rtdbAvailable = false;
let useLocalFallback = false;
let unsubscribeTodos = null;
let seedingInProgress = false;

function getPreferredTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* ignore */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  const next = theme === "light" ? "light" : "dark";
  document.body.classList.remove("light-theme", "dark-theme");
  document.body.classList.add(`${next}-theme`);
  if (els.themeToggleBtn) {
    els.themeToggleBtn.setAttribute(
      "aria-label",
      next === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"
    );
    els.themeToggleBtn.title = next === "dark" ? "라이트 모드" : "다크 모드";
  }
}

function initTheme() {
  applyTheme(getPreferredTheme());
}

function toggleTheme() {
  const next = document.body.classList.contains("dark-theme") ? "light" : "dark";
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  applyTheme(next);
}

function createMetaChip(type, text) {
  const chip = document.createElement("span");
  chip.className = "meta-chip";
  if (META_ICONS[type]) {
    const icon = document.createElement("span");
    icon.className = "meta-chip-icon";
    icon.innerHTML = META_ICONS[type];
    chip.appendChild(icon);
  }
  const label = document.createElement("span");
  label.textContent = text;
  chip.appendChild(label);
  return chip;
}

function createCategoryBadge(categoryKey) {
  const badge = document.createElement("span");
  badge.className = "category-badge";
  badge.textContent = CATEGORY_LABELS[categoryKey] || "기타";
  return badge;
}

function createPriorityBadge(priorityKey) {
  const badge = document.createElement("span");
  badge.className = `priority-badge priority-${priorityKey}`;
  badge.textContent = PRIORITY_LABELS[priorityKey] || "보통";
  return badge;
}

function createStatusBadge(text, variant = "done") {
  const badge = document.createElement("span");
  badge.className = `status-badge-chip ${variant}`;
  badge.textContent = text;
  return badge;
}

function appendScheduleChips(row, todo, { useAmPm = true } = {}) {
  getScheduleDisplayChips(todo, { useAmPm }).forEach(({ type, text }) => {
    row.appendChild(createMetaChip(type === "schedule" ? "calendar" : type, text));
  });
}

function buildTodoMetaRow(todo, { useAmPm = true } = {}) {
  const row = document.createElement("div");
  row.className = "todo-meta-row";

  appendScheduleChips(row, todo, { useAmPm });

  const categoryKey = VALID_CATEGORIES.includes(todo.category) ? todo.category : "other";
  const priorityKey = VALID_PRIORITIES.includes(todo.priority) ? todo.priority : "medium";
  row.appendChild(createCategoryBadge(categoryKey));
  row.appendChild(createPriorityBadge(priorityKey));

  if (todo.completed) row.appendChild(createStatusBadge("완료", "done"));

  return row;
}

function createListChip(chipClass, iconType, text) {
  const chip = document.createElement("span");
  chip.className = `meta-chip ${chipClass}`.trim();
  if (iconType && META_ICONS[iconType]) {
    const icon = document.createElement("span");
    icon.className = "meta-chip-icon";
    icon.innerHTML = META_ICONS[iconType];
    chip.appendChild(icon);
  }
  const label = document.createElement("span");
  label.className = "meta-chip-label";
  label.textContent = text;
  chip.appendChild(label);
  return chip;
}

function appendListScheduleChips(row, todo) {
  getScheduleDisplayChips(todo, { useAmPm: true }).forEach(({ type, text }) => {
    if (type === "schedule") {
      row.appendChild(createListChip("todo-range-chip", "calendar", text));
    } else if (type === "calendar") {
      row.appendChild(createListChip("todo-date-chip", "calendar", text));
    } else if (type === "clock") {
      row.appendChild(createListChip("todo-time-chip", "clock", text));
    }
  });
}

function buildListMetaRow(todo) {
  const row = document.createElement("div");
  row.className = "todo-meta-row";

  appendListScheduleChips(row, todo);

  const categoryKey = VALID_CATEGORIES.includes(todo.category) ? todo.category : "other";
  const priorityKey = VALID_PRIORITIES.includes(todo.priority) ? todo.priority : "medium";
  row.appendChild(
    createListChip("todo-category-chip", null, CATEGORY_LABELS[categoryKey] || "기타")
  );
  row.appendChild(
    createListChip(
      `todo-priority-chip priority-${priorityKey}`,
      null,
      PRIORITY_LABELS[priorityKey] || "보통"
    )
  );

  if (todo.completed) {
    row.appendChild(createStatusBadge("완료", "done"));
  }

  return row;
}

/** 고유 ID 생성 */
function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** 오늘 날짜 문자열 (YYYY-MM-DD) */
function getTodayKey() {
  const d = new Date();
  return formatDateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDateKey(year, month, day) {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function parseDateKey(key) {
  if (!key) return null;
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function daysBetween(fromKey, toKey) {
  const from = parseDateKey(fromKey);
  const to = parseDateKey(toKey);
  if (!from || !to) return Infinity;
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
}

function formatDateDisplay(key) {
  const d = parseDateKey(key);
  if (!d) return key;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_SHORT[d.getDay()]})`;
}

function getDisplayTitle(title) {
  const trimmed = String(title ?? "").trim();
  return trimmed || "제목 없음";
}

/** 24시간 형식 (캘린더용) — 예: 14:00 */
function formatTime24(time24) {
  if (!time24 || typeof time24 !== "string") return "";
  const parts = time24.split(":");
  const hour = Number(parts[0]);
  const minute = (parts[1] ?? "00").padStart(2, "0");
  if (Number.isNaN(hour)) return time24;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

/** AM/PM 형식 (리스트·타임라인용) — 예: PM 02:00 */
function formatTimeAmPm(time24) {
  if (!time24 || typeof time24 !== "string") return "";
  const parts = time24.trim().split(":");
  const hourNum = Number(parts[0]);
  const minuteRaw = parts[1] ?? "0";
  const minuteNum = Number(String(minuteRaw).replace(/\D/g, ""));
  if (Number.isNaN(hourNum) || hourNum < 0 || hourNum > 23) return "";
  const minute = String(Number.isNaN(minuteNum) ? 0 : minuteNum).padStart(2, "0");
  const period = hourNum >= 12 ? "PM" : "AM";
  const hour12 = hourNum % 12 === 0 ? 12 : hourNum % 12;
  const hourStr = hour12 < 10 ? `0${hour12}` : String(hour12);
  return `${period} ${hourStr}:${minute}`;
}

function getTodoScheduleBounds(todo) {
  const startDate = todo.startDate || "";
  const endDate = todo.endDate || todo.startDate || "";
  return {
    startDate,
    endDate,
    startTime: todo.startTime || "",
    endTime: todo.endTime || "",
  };
}

function formatDateTimePoint(dateKey, time24, useAmPm = true, dateFormatter = formatDateCompact) {
  const datePart = dateFormatter(dateKey);
  if (!datePart) return "";
  if (!time24) return datePart;
  const timePart = useAmPm ? formatTimeAmPm(time24) : formatTime24(time24);
  return timePart ? `${datePart} ${timePart}` : datePart;
}

/**
 * 일정 표시 칩 목록
 * - 같은 날: 날짜 칩 + 시간 칩 분리
 * - 기간형: 날짜+시간 통합 범위 1개
 */
function getScheduleDisplayChips(todo, { useAmPm = true } = {}) {
  const { startDate, endDate, startTime, endTime } = getTodoScheduleBounds(todo);
  if (!startDate) return [];

  const formatTime = (time) => (useAmPm ? formatTimeAmPm(time) : formatTime24(time));
  const sameDay = startDate === endDate;
  const hasStartTime = Boolean(startTime);
  const hasEndTime = Boolean(endTime);

  if (!sameDay) {
    if (!hasStartTime && !hasEndTime) {
      return [{
        type: "calendar",
        text: `${formatDateCompact(startDate)} ~ ${formatDateCompact(endDate)}`,
      }];
    }

    const startPoint = formatDateTimePoint(startDate, startTime, useAmPm);
    const endPoint = formatDateTimePoint(endDate, endTime, useAmPm);
    return [{
      type: "schedule",
      text: `${startPoint} ~ ${endPoint}`,
    }];
  }

  const dateText = formatDateCompact(startDate);
  if (!hasStartTime && !hasEndTime) {
    return [{ type: "calendar", text: dateText }];
  }

  const chips = [{ type: "calendar", text: dateText }];
  let timeText = "";
  if (hasStartTime && hasEndTime) {
    timeText = `${formatTime(startTime)} ~ ${formatTime(endTime)}`;
  } else if (hasStartTime) {
    timeText = formatTime(startTime);
  } else if (hasEndTime) {
    timeText = formatTime(endTime);
  }
  if (timeText) chips.push({ type: "clock", text: timeText });
  return chips;
}

function formatScheduleRangeText(todo, { useAmPm = true } = {}) {
  const chips = getScheduleDisplayChips(todo, { useAmPm });
  if (chips.length === 0) return "";
  return chips.map((chip) => chip.text).join(" · ");
}

function getCalendarEventTooltip(todo) {
  const title = getDisplayTitle(todo.title);
  const schedule = formatScheduleRangeText(todo, { useAmPm: true });
  return schedule ? `${title}\n${schedule}` : title;
}

function formatTimeRange24(todo) {
  const { startDate, endDate, startTime, endTime } = getTodoScheduleBounds(todo);
  if (startDate !== endDate) return "";
  if (!startTime && !endTime) return "";
  if (startTime && endTime) return `${formatTime24(startTime)} ~ ${formatTime24(endTime)}`;
  return formatTime24(startTime || endTime);
}

function formatTimeRangeAmPm(todo) {
  const { startDate, endDate, startTime, endTime } = getTodoScheduleBounds(todo);
  if (startDate !== endDate) return "";
  if (!startTime && !endTime) return "";
  if (startTime && endTime) return `${formatTimeAmPm(startTime)} ~ ${formatTimeAmPm(endTime)}`;
  return formatTimeAmPm(startTime || endTime);
}

/** 캘린더 bar용 짧은 날짜 — 예: 06.30 */
function formatDateMonthDay(key) {
  if (!key) return "";
  const d = parseDateKey(key);
  if (!d) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}.${day}`;
}

/**
 * 월간/주간 캘린더 bar 시간 라벨
 * - 같은 날 + 시간: 10:00 ~ 11:30
 * - 기간형 + 시간: 06.30 20:00 ~ 07.03 16:19
 * - 기간형 + 시간 없음: 06.30 ~ 07.03
 */
function getCalendarEventTimeLabel(todo) {
  const { startDate, endDate, startTime, endTime } = getTodoScheduleBounds(todo);
  if (!startDate) return "";

  const sameDay = startDate === endDate;
  const hasStartTime = Boolean(startTime);
  const hasEndTime = Boolean(endTime);

  if (sameDay) {
    if (!hasStartTime && !hasEndTime) return "";
    if (hasStartTime && hasEndTime) {
      return `${formatTime24(startTime)} ~ ${formatTime24(endTime)}`;
    }
    return formatTime24(startTime || endTime);
  }

  if (!hasStartTime && !hasEndTime) {
    return `${formatDateMonthDay(startDate)} ~ ${formatDateMonthDay(endDate)}`;
  }

  const startPoint = formatDateTimePoint(startDate, startTime, false, formatDateMonthDay);
  const endPoint = formatDateTimePoint(endDate, endTime, false, formatDateMonthDay);
  return `${startPoint} ~ ${endPoint}`;
}

/** 캘린더 bar tooltip용 전체 일정 (YYYY.MM.DD + 24시간) */
function formatCalendarBarTooltipSchedule(todo) {
  const { startDate, endDate, startTime, endTime } = getTodoScheduleBounds(todo);
  if (!startDate) return "";

  const sameDay = startDate === endDate;
  const hasStartTime = Boolean(startTime);
  const hasEndTime = Boolean(endTime);

  if (!sameDay) {
    if (!hasStartTime && !hasEndTime) {
      return `${formatDateCompact(startDate)} ~ ${formatDateCompact(endDate)}`;
    }
    const startPoint = formatDateTimePoint(startDate, startTime, false);
    const endPoint = formatDateTimePoint(endDate, endTime, false);
    return `${startPoint} ~ ${endPoint}`;
  }

  if (!hasStartTime && !hasEndTime) return formatDateCompact(startDate);
  if (hasStartTime && hasEndTime) {
    return `${formatDateCompact(startDate)} ${formatTime24(startTime)} ~ ${formatTime24(endTime)}`;
  }
  if (hasStartTime) return `${formatDateCompact(startDate)} ${formatTime24(startTime)}`;
  return `${formatDateCompact(startDate)} ${formatTime24(endTime)}`;
}

function getCalendarBarTitle(todo) {
  const schedule = formatCalendarBarTooltipSchedule(todo);
  const title = getDisplayTitle(todo.title);
  return schedule ? `${schedule} ${title}` : title;
}

/** 캘린더 이벤트 라벨 — 예: 06.30 20:00 ~ 07.03 16:19 제출 전... */
function formatCalendarEventLabel(todo) {
  const title = getDisplayTitle(todo.title);
  const timeText = getCalendarEventTimeLabel(todo);
  return timeText ? `${timeText} ${title}` : title;
}

function appendCalendarEventLabelContent(parent, todo) {
  if (!parent || !todo) return;

  const timeText = getCalendarEventTimeLabel(todo);
  if (timeText) {
    const timeEl = document.createElement("div");
    timeEl.className = "event-time";
    timeEl.textContent = timeText;
    parent.appendChild(timeEl);
  }

  const titleEl = document.createElement("div");
  titleEl.className = "event-title";
  titleEl.textContent = getDisplayTitle(todo.title);
  parent.appendChild(titleEl);
}

function formatDateCompact(key) {
  if (!key) return "";
  const d = parseDateKey(key);
  if (!d) return key;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

function formatDateRangeDisplay(todo) {
  const { startDate, endDate } = getTodoScheduleBounds(todo);
  if (!startDate) return "";
  if (startDate === endDate) return formatDateCompact(startDate);
  return `${formatDateCompact(startDate)} ~ ${formatDateCompact(endDate)}`;
}


function todoHasTime(todo) {
  return Boolean(todo.startTime || todo.endTime);
}

function todoIncludesDate(todo, dateKey) {
  if (!todo.startDate || !dateKey) return false;
  const end = todo.endDate || todo.startDate;
  return dateKey >= todo.startDate && dateKey <= end;
}

/** 캘린더용 주(week) 배열 생성 */
function buildCalendarWeeks(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const weeks = [];
  let currentWeek = [];

  for (let i = 0; i < totalCells; i++) {
    let cellYear = year;
    let cellMonth = month;
    let day;
    let otherMonth = false;

    if (i < firstDay) {
      day = daysInPrev - firstDay + i + 1;
      cellMonth -= 1;
      otherMonth = true;
      if (cellMonth < 0) {
        cellMonth = 11;
        cellYear -= 1;
      }
    } else if (i >= firstDay + daysInMonth) {
      day = i - firstDay - daysInMonth + 1;
      cellMonth += 1;
      otherMonth = true;
      if (cellMonth > 11) {
        cellMonth = 0;
        cellYear += 1;
      }
    } else {
      day = i - firstDay + 1;
    }

    currentWeek.push({
      dateKey: formatDateKey(cellYear, cellMonth, day),
      day,
      otherMonth,
    });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  return weeks;
}

/** 기준 날짜가 속한 주의 일요일 */
function getWeekStartDate(dateKey) {
  const d = parseDateKey(dateKey) || new Date();
  const start = new Date(d);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

/** 기준 날짜가 속한 주의 토요일 */
function getWeekEndDate(dateKey) {
  const start = getWeekStartDate(dateKey);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return end;
}

/** 기준 날짜가 속한 주의 7일 배열 */
function getWeekDates(dateKey) {
  const start = getWeekStartDate(dateKey);
  const week = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    week.push({
      dateKey: formatDateKey(d.getFullYear(), d.getMonth(), d.getDate()),
      day: d.getDate(),
      month: d.getMonth() + 1,
      otherMonth: false,
    });
  }

  return week;
}

function formatWeekRangeTitle(week) {
  if (!Array.isArray(week) || week.length < 7) return "";
  return `${formatDateCompact(week[0].dateKey)} ~ ${formatDateCompact(week[6].dateKey)}`;
}

function getCalYearMonth() {
  const d = parseDateKey(calAnchorKey) || new Date();
  return { year: d.getFullYear(), month: d.getMonth() };
}

function shiftCalAnchorDays(delta) {
  const d = parseDateKey(calAnchorKey) || new Date();
  d.setDate(d.getDate() + delta);
  calAnchorKey = formatDateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

function shiftCalAnchorMonths(delta) {
  const d = parseDateKey(calAnchorKey) || new Date();
  d.setMonth(d.getMonth() + delta);
  calAnchorKey = formatDateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDayTitle(dateKey) {
  const d = parseDateKey(dateKey);
  if (!d) return dateKey || "";
  const dayName = DAY_SHORT[d.getDay()];
  return `${formatDateCompact(dateKey)} ${dayName}요일`;
}

function parseTimeHour(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return 0;
  const hour = Number(timeStr.split(":")[0]);
  return Number.isNaN(hour) ? 0 : Math.max(0, Math.min(23, hour));
}

function getTodosForDate(items, dateKey) {
  if (!Array.isArray(items) || !dateKey) return [];
  return items.filter((todo) => todoIncludesDate(todo, dateKey));
}

function getTimeGridSegment(todo) {
  if (!todo?.startTime) return null;

  const startH = parseTimeHour(todo.startTime);
  let endH = todo.endTime ? parseTimeHour(todo.endTime) : startH + 1;
  if (endH <= startH) endH = startH + 1;
  endH = Math.min(endH, TIME_GRID_HOURS);

  return {
    todo,
    colStart: startH + 1,
    colEnd: endH + 1,
  };
}

function applyTimeGridBarPosition(el, segment) {
  const { colStart, colEnd, lane = 0 } = segment;
  const colSpan = colEnd - colStart;
  const leftPct = ((colStart - 1) / TIME_GRID_HOURS) * 100;
  const widthPct = (colSpan / TIME_GRID_HOURS) * 100;

  el.style.left = `calc(${leftPct}% + 1px)`;
  el.style.width = `calc(${widthPct}% - 2px)`;
  el.style.top = `${6 + lane * TIME_GRID_LANE_HEIGHT}px`;
  el.style.height = `${TIME_GRID_BAR_HEIGHT}px`;
}

function createTodoDeleteButton(todoId) {
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "calendar-event-delete";
  deleteBtn.dataset.id = todoId;
  deleteBtn.setAttribute("aria-label", "삭제");
  deleteBtn.title = "삭제";
  deleteBtn.textContent = "×";
  return deleteBtn;
}

function createTimeGridBar(segment) {
  const { todo } = segment;
  const priorityKey = VALID_PRIORITIES.includes(todo.priority) ? todo.priority : "medium";

  const bar = document.createElement("div");
  bar.className = `time-grid-bar calendar-event-bar priority-${priorityKey} bar-single`;
  bar.dataset.id = todo.id;
  if (todo.completed) bar.classList.add("done");

  const titleSpan = document.createElement("span");
  titleSpan.className = "calendar-event-label";
  appendCalendarEventLabelContent(titleSpan, todo);
  bar.appendChild(titleSpan);
  bar.appendChild(createTodoDeleteButton(todo.id));
  bar.title = getCalendarBarTitle(todo);

  applyTimeGridBarPosition(bar, segment);
  return bar;
}

function createDayViewItem(todo) {
  const priorityKey = VALID_PRIORITIES.includes(todo.priority) ? todo.priority : "medium";
  const item = document.createElement("div");
  item.className = `day-view-item priority-${priorityKey}`;
  item.dataset.id = todo.id;
  if (todo.completed) item.classList.add("done");

  const body = document.createElement("div");
  body.className = "day-view-body";

  const title = document.createElement("div");
  title.className = "day-view-title";
  title.textContent = getDisplayTitle(todo.title);

  body.append(title, buildTodoMetaRow(todo));
  item.append(body, createTodoDeleteButton(todo.id));
  item.title = getCalendarEventTooltip(todo);
  return item;
}

function createDayViewChip(todo) {
  const priorityKey = VALID_PRIORITIES.includes(todo.priority) ? todo.priority : "medium";
  const chip = document.createElement("div");
  chip.className = `day-view-chip calendar-event-bar priority-${priorityKey} bar-single`;
  chip.dataset.id = todo.id;
  if (todo.completed) chip.classList.add("done");

  const titleSpan = document.createElement("span");
  titleSpan.className = "calendar-event-title event-title";
  titleSpan.textContent = getDisplayTitle(todo.title);
  chip.append(titleSpan, createTodoDeleteButton(todo.id));
  chip.title = getCalendarEventTooltip(todo);
  return chip;
}

function updateCalNavLabels() {
  if (!els.calPrevBtn || !els.calNextBtn) return;
  if (calMode === "week") {
    els.calPrevBtn.setAttribute("aria-label", "이전 주");
    els.calNextBtn.setAttribute("aria-label", "다음 주");
  } else if (calMode === "day" || calMode === "timegrid") {
    els.calPrevBtn.setAttribute("aria-label", "이전 날");
    els.calNextBtn.setAttribute("aria-label", "다음 날");
  } else {
    els.calPrevBtn.setAttribute("aria-label", "이전 달");
    els.calNextBtn.setAttribute("aria-label", "다음 달");
  }
}

function setCalMode(mode) {
  if (!VALID_CAL_MODES.includes(mode)) return;
  calMode = mode;

  els.calModeSwitcher?.querySelectorAll(".cal-mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.calMode === mode);
  });

  if (els.calMonthPanel) els.calMonthPanel.hidden = mode !== "month";
  if (els.calWeekPanel) els.calWeekPanel.hidden = mode !== "week";
  if (els.calDayPanel) els.calDayPanel.hidden = mode !== "day";
  if (els.calTimeGridPanel) els.calTimeGridPanel.hidden = mode !== "timegrid";

  updateCalNavLabels();
  renderCalendar();
}

/** 주 단위 이벤트 바 구간 계산 */
function getWeekEventSegment(todo, week) {
  const todoStart = todo.startDate;
  const todoEnd = getTodoEndDate(todo);
  const weekStart = week[0].dateKey;
  const weekEnd = week[6].dateKey;

  if (!todoStart || todoEnd < weekStart || todoStart > weekEnd) return null;

  const segStart = todoStart > weekStart ? todoStart : weekStart;
  const segEnd = todoEnd < weekEnd ? todoEnd : weekEnd;

  const startIdx = week.findIndex((d) => d.dateKey === segStart);
  const endIdx = week.findIndex((d) => d.dateKey === segEnd);
  if (startIdx === -1 || endIdx === -1) return null;

  return {
    todo,
    colStart: startIdx + 1,
    colEnd: endIdx + 2,
    isSegmentStart: segStart === todoStart,
    isSegmentEnd: segEnd === todoEnd,
  };
}

/** 겹치지 않도록 이벤트 바 레인(행) 배치 */
function assignEventLanes(segments) {
  const sorted = [...segments].sort((a, b) => {
    const spanDiff = b.colEnd - b.colStart - (a.colEnd - a.colStart);
    if (spanDiff !== 0) return spanDiff;
    return a.colStart - b.colStart;
  });
  const laneEnds = [];

  sorted.forEach((seg) => {
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] > seg.colStart) {
      lane += 1;
    }
    seg.lane = lane;
    laneEnds[lane] = seg.colEnd;
  });

  return sorted;
}

function applySegmentPosition(el, segment, dayHeaderHeight = CAL_DAY_HEADER) {
  const { colStart, colEnd, lane } = segment;
  const colSpan = colEnd - colStart;
  const leftPct = ((colStart - 1) / 7) * 100;
  const widthPct = (colSpan / 7) * 100;
  const margin = CAL_EVENT_H_MARGIN;

  el.style.left = `calc(${leftPct}% + ${margin}px)`;
  el.style.width = `calc(${widthPct}% - ${margin * 2}px)`;
  el.style.top = `${dayHeaderHeight + lane * CAL_LANE_HEIGHT}px`;
}

function createCalendarEventBar(segment, dayHeaderHeight = CAL_DAY_HEADER) {
  const { todo, colStart, colEnd, isSegmentStart, isSegmentEnd } = segment;
  const priorityKey = VALID_PRIORITIES.includes(todo.priority) ? todo.priority : "medium";
  const isSingleDay = colEnd - colStart === 1;

  const bar = document.createElement("div");
  bar.className = `calendar-event-bar priority-${priorityKey}`;
  bar.dataset.id = todo.id;

  if (isSingleDay || (isSegmentStart && isSegmentEnd)) bar.classList.add("bar-single");
  else if (isSegmentStart) bar.classList.add("bar-start");
  else if (isSegmentEnd) bar.classList.add("bar-end");
  else bar.classList.add("bar-middle");

  if (todo.completed) bar.classList.add("done");

  const showLabel = isSegmentStart || isSingleDay;
  const labelWrap = document.createElement("span");
  labelWrap.className = "calendar-event-label";
  if (showLabel) {
    appendCalendarEventLabelContent(labelWrap, todo);
  }
  bar.appendChild(labelWrap);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "calendar-event-delete";
  deleteBtn.dataset.id = todo.id;
  deleteBtn.setAttribute("aria-label", "삭제");
  deleteBtn.title = "삭제";
  deleteBtn.textContent = "×";
  bar.appendChild(deleteBtn);

  bar.title = getCalendarBarTitle(todo);
  bar.style.height = `${CAL_BAR_HEIGHT}px`;
  applySegmentPosition(bar, segment, dayHeaderHeight);
  return bar;
}

function compareTodosBySchedule(a, b) {
  const dateCmp = (a.startDate || "").localeCompare(b.startDate || "");
  if (dateCmp !== 0) return dateCmp;
  return (a.startTime || "").localeCompare(b.startTime || "");
}

function getTodoEndDate(todo) {
  return todo.endDate || todo.startDate || "";
}

/** startDate ~ endDate 사이 모든 날짜 (YYYY-MM-DD) */
function getDatesBetween(startDate, endDate) {
  if (!startDate) return [];

  const end = endDate || startDate;
  if (end < startDate) return [];

  const start = parseDateKey(startDate);
  const finish = parseDateKey(end);
  if (!start || !finish) return [startDate];

  const dates = [];
  const current = new Date(start);

  while (current <= finish) {
    dates.push(formatDateKey(current.getFullYear(), current.getMonth(), current.getDate()));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function isMultiDayTodo(todo) {
  const end = getTodoEndDate(todo);
  return Boolean(todo.startDate && end && todo.startDate !== end);
}

/** RTDB / fallback 데이터 정규화 (구 text/done, date/time 필드 호환) */
function normalizeTodo(raw) {
  if (!raw || typeof raw !== "object") return null;

  const title = String(raw.title ?? raw.text ?? "").trim();
  if (!title) return null;

  const legacyDate = typeof raw.date === "string" ? raw.date : "";
  const legacyTime = typeof raw.time === "string" ? raw.time : "";

  let startDate = typeof raw.startDate === "string" ? raw.startDate : legacyDate;
  let endDate = typeof raw.endDate === "string" ? raw.endDate : "";
  if (!endDate && startDate) endDate = startDate;

  let startTime = typeof raw.startTime === "string" ? raw.startTime : legacyTime;
  let endTime = typeof raw.endTime === "string" ? raw.endTime : "";

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : createId(),
    title,
    startDate,
    endDate,
    startTime,
    endTime,
    priority: VALID_PRIORITIES.includes(raw.priority) ? raw.priority : "medium",
    category: VALID_CATEGORIES.includes(raw.category) ? raw.category : "other",
    memo: String(raw.memo ?? ""),
    completed: Boolean(raw.completed ?? raw.done),
    createdAt: timestampToIso(raw.createdAt) || new Date().toISOString(),
  };
}

/** 빈 상태 안내 문구 */
function getEmptyMessage() {
  const query = (els.searchInput?.value || "").trim();

  if (todos.length === 0) {
    return "등록된 할 일이 없습니다. 할 일 추가 버튼을 눌러보세요.";
  }
  if (query) {
    return "검색 결과가 없습니다.";
  }
  if (currentFilter !== "all" && FILTER_LABELS[currentFilter]) {
    return `${FILTER_LABELS[currentFilter]} 할 일이 없습니다.`;
  }
  return "등록된 할 일이 없습니다.";
}

function updateEmptyMessage(el, hasItems) {
  if (!el) return;
  el.hidden = hasItems;
  if (!hasItems) {
    el.textContent = getEmptyMessage();
  }
}

/** 테스트용 샘플 할 일 (오늘·내일 기준) */
function getSampleTodos() {
  const today = getTodayKey();
  const tomorrow = formatDateKey(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate() + 1
  );
  const dayAfter = formatDateKey(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate() + 3
  );

  return [
    {
      id: createId(),
      title: "Todo 기능 구현하기",
      startDate: today,
      endDate: dayAfter,
      startTime: "14:00",
      endTime: "18:00",
      priority: "high",
      category: "study",
      memo: "Realtime Database 저장과 목록 렌더링 확인",
      completed: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: createId(),
      title: "캘린더 보기 확인하기",
      startDate: today,
      endDate: today,
      startTime: "16:30",
      endTime: "18:00",
      priority: "medium",
      category: "study",
      memo: "날짜별 할 일이 표시되는지 확인",
      completed: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: createId(),
      title: "모바일 반응형 점검하기",
      startDate: tomorrow,
      endDate: tomorrow,
      startTime: "10:00",
      endTime: "11:30",
      priority: "high",
      category: "work",
      memo: "작은 화면에서 레이아웃 확인",
      completed: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: createId(),
      title: "제출 전 오타 확인하기",
      startDate: tomorrow,
      endDate: tomorrow,
      startTime: "20:00",
      endTime: "",
      priority: "medium",
      category: "study",
      memo: "README와 화면 문구 점검",
      completed: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: createId(),
      title: "메모만 있는 할 일",
      startDate: today,
      endDate: today,
      startTime: "",
      endTime: "",
      priority: "low",
      category: "personal",
      memo: "시간 미정 할 일 테스트",
      completed: false,
      createdAt: new Date().toISOString(),
    },
  ].map((item) => normalizeTodo(item)).filter(Boolean);
}

function seedLocalSampleData() {
  if (todos.length > 0) return false;
  todos = getSampleTodos();
  saveTodosToLocalStorage();
  console.info(`[Todo App] 테스트 데이터 ${todos.length}건을 localStorage에 추가했습니다.`);
  return true;
}

async function seedRtdbSampleData() {
  if (!db || seedingInProgress) return false;

  seedingInProgress = true;
  try {
    const snapshot = await get(ref(db, "todos"));
    const data = snapshot.val();
    if (data && typeof data === "object" && Object.keys(data).length > 0) {
      return false;
    }

    const samples = getSampleTodos();
    for (const todo of samples) {
      const newRef = push(ref(db, "todos"));
      await set(
        newRef,
        buildRtdbPayload(
          {
            title: todo.title,
            startDate: todo.startDate,
            endDate: todo.endDate,
            startTime: todo.startTime,
            endTime: todo.endTime,
            priority: todo.priority,
            category: todo.category,
            memo: todo.memo,
          },
          { completed: false, isNew: true }
        )
      );
    }
    console.info(`[Todo App] 테스트 데이터 ${samples.length}건을 Realtime Database에 추가했습니다.`);
    return true;
  } catch (err) {
    console.error("[Todo App] RTDB 테스트 데이터 추가 실패:", err);
    return false;
  } finally {
    seedingInProgress = false;
  }
}

function timestampToIso(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value.toDate === "function") {
    try {
      return value.toDate().toISOString();
    } catch {
      return new Date().toISOString();
    }
  }
  if (typeof value.seconds === "number") {
    return new Date(value.seconds * 1000).toISOString();
  }
  return new Date().toISOString();
}

function buildRtdbPayload(fields, { completed = false, isNew = false } = {}) {
  const now = Date.now();
  const payload = {
    title: fields.title,
    startDate: fields.startDate,
    endDate: fields.endDate || fields.startDate,
    startTime: fields.startTime || "",
    endTime: fields.endTime || "",
    priority: fields.priority || "medium",
    category: fields.category || "other",
    memo: fields.memo || "",
    completed: Boolean(completed),
    updatedAt: now,
  };
  if (isNew) payload.createdAt = now;
  return payload;
}

function updateConnectionStatus() {
  if (!els.connectionStatus) return;

  if (firebaseReady && rtdbAvailable && !useLocalFallback) {
    els.connectionStatus.innerHTML =
      '<span class="status-dot status-dot--success" aria-hidden="true"></span><span>연결됨</span>';
    els.connectionStatus.className = "connection-status status-badge connected";
    els.connectionStatus.title = `Realtime Database · ${firebaseConfig.projectId}`;
    return;
  }

  if (isFirebaseConfigured(firebaseConfig)) {
    els.connectionStatus.innerHTML =
      '<span class="status-dot status-dot--error" aria-hidden="true"></span><span>localStorage 저장 중</span>';
    els.connectionStatus.className = "connection-status status-badge error";
    els.connectionStatus.title = "Realtime Database 사용 불가";
    return;
  }

  els.connectionStatus.innerHTML =
    '<span class="status-dot status-dot--error" aria-hidden="true"></span><span>Firebase 미연결</span>';
  els.connectionStatus.className = "connection-status status-badge error";
  els.connectionStatus.title = "js/config.js 설정을 확인해주세요.";
}

function switchToLocalFallback(reason) {
  if (typeof unsubscribeTodos === "function") {
    unsubscribeTodos();
    unsubscribeTodos = null;
  }
  useLocalFallback = true;
  firebaseReady = false;
  rtdbAvailable = false;
  if (reason) console.warn("[Todo App]", reason);
  updateConnectionStatus();
}

async function checkRtdbAvailable() {
  if (!db) return false;
  try {
    await get(ref(db, "todos"));
    rtdbAvailable = true;
    return true;
  } catch (err) {
    console.error("[Todo App] Realtime Database 연결 확인 실패:", err);
    rtdbAvailable = false;
    return false;
  }
}

function saveTodoLocally(todoData) {
  if (editingId) {
    const exists = todos.some((t) => t.id === editingId);
    if (!exists) {
      showMessage("수정할 할 일을 찾을 수 없습니다.", "error");
      return false;
    }
    todos = todos.map((t) => (t.id === editingId ? { ...t, ...todoData } : t));
    showMessage("할 일이 수정되었습니다.", "success");
  } else {
    todos.unshift({
      id: createId(),
      ...todoData,
      completed: false,
      createdAt: new Date().toISOString(),
    });
    showMessage("할 일이 추가되었습니다.", "success");
  }
  persistTodosLocally();
  return true;
}

/** localStorage 데이터를 Realtime Database로 1회 이전 */
async function migrateLocalStorageToRtdb() {
  if (!db) return;

  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  if (!raw) return;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearLegacyLocalStorage();
    return;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    clearLegacyLocalStorage();
    return;
  }

  const items = parsed.map((item) => normalizeTodo(item)).filter(Boolean);
  if (items.length === 0) {
    clearLegacyLocalStorage();
    return;
  }

  try {
    for (const todo of items) {
      const newRef = push(ref(db, "todos"));
      await set(
        newRef,
        buildRtdbPayload(
          {
            title: todo.title,
            startDate: todo.startDate,
            endDate: todo.endDate,
            startTime: todo.startTime,
            endTime: todo.endTime,
            priority: todo.priority,
            category: todo.category,
            memo: todo.memo,
          },
          { completed: todo.completed, isNew: true }
        )
      );
    }
    clearLegacyLocalStorage();
    showMessage(`localStorage 할 일 ${items.length}개를 Realtime Database로 옮겼습니다.`, "success");
    console.info(`[Todo App] localStorage → RTDB 이전 완료 (${items.length}건)`);
  } catch (err) {
    console.error("[Todo App] localStorage → RTDB 이전 실패:", err);
    showMessage("기존 할 일을 Realtime Database로 옮기지 못했습니다.", "error");
  }
}

function clearLegacyLocalStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn("[Todo App] localStorage 정리 실패:", err);
  }
}

/** Realtime Database 실시간 구독 */
function subscribeTodosFromRtdb() {
  if (!db) return;

  if (typeof unsubscribeTodos === "function") {
    unsubscribeTodos();
    unsubscribeTodos = null;
  }

  const todosRef = ref(db, "todos");

  unsubscribeTodos = onValue(
    todosRef,
    (snapshot) => {
      const data = snapshot.val();
      if (!data || typeof data !== "object") {
        todos = [];
      } else {
        todos = Object.entries(data)
          .map(([id, value]) => normalizeTodo({ id, ...(value || {}) }))
          .filter(Boolean)
          .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      }
      updateConnectionStatus();
      render();
    },
    (err) => {
      console.error("[Todo App] Realtime Database 로드 실패:", err);
      switchToLocalFallback("RTDB 구독 실패, localStorage로 전환");
      loadTodosFromLocalStorageFallback();
    }
  );
}

/** Firebase 초기화 */
async function initFirebase() {
  if (!isFirebaseConfigured(firebaseConfig)) {
    console.error(
      "[Todo App] Firebase 설정이 없습니다.\n" +
        "js/config.js에 apiKey, databaseURL, appId 등을 확인해주세요."
    );
    useLocalFallback = true;
    loadTodosFromLocalStorageFallback();
    updateConnectionStatus();
    switchView("list");
    return;
  }

  try {
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);

    const rtdbOk = await checkRtdbAvailable();
    if (!rtdbOk) {
      switchToLocalFallback("Realtime Database에 연결할 수 없습니다.");
      loadTodosFromLocalStorageFallback();
      switchView("list");
      return;
    }

    firebaseReady = true;
    useLocalFallback = false;
    await migrateLocalStorageToRtdb();
    await seedRtdbSampleData();
    subscribeTodosFromRtdb();
    updateConnectionStatus();
    switchView("list");
  } catch (err) {
    console.error("[Todo App] Firebase 초기화 실패:", err);
    useLocalFallback = true;
    loadTodosFromLocalStorageFallback();
    updateConnectionStatus();
    switchView("list");
  }
}

/** localStorage fallback 로드 (Firebase 연결 실패 시에만) */
function loadTodosFromLocalStorageFallback() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      todos = [];
    } else {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        todos = [];
      } else {
        todos = parsed.map((item) => normalizeTodo(item)).filter(Boolean);
      }
    }
  } catch (err) {
    console.error("[Todo App] localStorage fallback 로드 실패:", err);
    todos = [];
  }

  if (todos.length === 0) {
    seedLocalSampleData();
  }

  updateConnectionStatus();
  render();
}

/** localStorage fallback 저장 */
function saveTodosToLocalStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch (err) {
    console.error("[Todo App] localStorage fallback 저장 실패:", err);
    showMessage("저장에 실패했습니다. 브라우저 저장 공간을 확인해주세요.", "error");
  }
}

function persistTodosLocally() {
  saveTodosToLocalStorage();
  render();
}

function showMessage(text, type) {
  const inModal = els.todoModal && !els.todoModal.hidden;
  const el = inModal && els.modalFormMessage ? els.modalFormMessage : els.formMessage;
  if (!el) return;
  el.textContent = text;
  el.className = "form-message " + type + (inModal ? " modal-form-message" : "");
  el.hidden = false;
  if (type === "success") {
    setTimeout(() => {
      if (el) el.hidden = true;
    }, 2500);
  }
}

function hideMessage() {
  if (els.formMessage) els.formMessage.hidden = true;
  if (els.modalFormMessage) els.modalFormMessage.hidden = true;
}

/** 검색 + 필터 적용 */
function getFilteredTodos() {
  const query = (els.searchInput?.value || "").trim().toLowerCase();
  const today = getTodayKey();

  return todos.filter((todo) => {
    if (!todo || typeof todo !== "object") return false;

    const matchSearch =
      !query ||
      (todo.title || "").toLowerCase().includes(query) ||
      (todo.memo || "").toLowerCase().includes(query);

    if (!matchSearch) return false;

    switch (currentFilter) {
      case "today":
        return todoIncludesDate(todo, today);
      case "upcoming":
        return Boolean(todo.startDate && todo.startDate > today);
      case "important":
        return todo.priority === "high";
      case "done":
        return Boolean(todo.completed);
      case "urgent": {
        if (todo.completed || !todo.startDate) return false;
        const deadline = getTodoEndDate(todo);
        const diff = daysBetween(today, deadline);
        return diff >= 0 && diff <= 3;
      }
      default:
        return true;
    }
  });
}

/** 요약 카드 업데이트 */
function updateSummary() {
  const today = getTodayKey();
  const total = todos.length;
  const todayCount = todos.filter((t) => todoIncludesDate(t, today)).length;
  const doneCount = todos.filter((t) => t.completed).length;
  const importantCount = todos.filter((t) => t.priority === "high").length;
  const urgentCount = todos.filter((t) => {
    if (t.completed || !t.startDate) return false;
    const deadline = getTodoEndDate(t);
    const diff = daysBetween(today, deadline);
    return diff >= 0 && diff <= 3;
  }).length;

  if (els.summaryTotal) els.summaryTotal.textContent = total;
  if (els.summaryToday) els.summaryToday.textContent = todayCount;
  if (els.summaryDone) els.summaryDone.textContent = doneCount;
  if (els.summaryImportant) els.summaryImportant.textContent = importantCount;
  if (els.summaryUrgent) els.summaryUrgent.textContent = urgentCount;
  updateSummaryCardsActive();
}

function updateSummaryCardsActive() {
  els.summaryCards?.querySelectorAll(".summary-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.filter === currentFilter);
  });
}

function setFilter(filter) {
  currentFilter = filter || "all";
  els.filterBar?.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === currentFilter);
  });
  updateSummaryCardsActive();
  render();
}

/** 리스트 보기 렌더링 */
function renderList() {
  if (!els.todoList) return;

  const items = getFilteredTodos();
  els.todoList.innerHTML = "";

  items.forEach((todo) => {
    const li = document.createElement("li");
    li.className = "todo-item todo-card" + (todo.completed ? " done" : "");
    li.dataset.id = todo.id;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "todo-checkbox";
    checkbox.checked = !!todo.completed;
    checkbox.setAttribute("aria-label", "완료 표시");
    checkbox.addEventListener("change", () => toggleComplete(todo.id));

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-edit";
    editBtn.textContent = "수정";
    editBtn.addEventListener("click", () => openEditModal(todo.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-delete";
    deleteBtn.textContent = "삭제";
    deleteBtn.addEventListener("click", () => handleDelete(todo.id, todo.title || ""));

    const actions = document.createElement("div");
    actions.className = "todo-actions";
    actions.append(editBtn, deleteBtn);

    const title = document.createElement("div");
    title.className = "todo-title";
    title.textContent = getDisplayTitle(todo.title);

    const headerRow = document.createElement("div");
    headerRow.className = "todo-header-row";
    headerRow.append(checkbox, title, actions);

    const main = document.createElement("div");
    main.className = "todo-card-main";
    main.append(headerRow, buildListMetaRow(todo));

    if (todo.memo) {
      const memo = document.createElement("p");
      memo.className = "todo-note";
      memo.textContent = todo.memo;
      main.appendChild(memo);
    }

    li.appendChild(main);
    els.todoList.appendChild(li);
  });

  updateEmptyMessage(els.emptyMessage, items.length > 0);
}

/** 캘린더 보기 렌더링 */
function renderCalendar() {
  const items = getFilteredTodos().filter((t) => t.startDate);
  updateCalNavLabels();

  if (calMode === "week") {
    renderWeekCalendar(items);
  } else if (calMode === "day") {
    renderDayCalendar(items);
  } else if (calMode === "timegrid") {
    renderTimeGridCalendar(items);
  } else {
    renderMonthCalendar(items);
  }

  updateEmptyMessage(els.calendarEmpty, items.length > 0);
}

function renderMonthCalendar(items) {
  if (!els.calDaysGrid) return;

  const { year: calYear, month: calMonth } = getCalYearMonth();
  if (els.calMonthTitle) {
    els.calMonthTitle.textContent = `${calYear}년 ${MONTH_NAMES[calMonth]}`;
  }

  const todayKey = getTodayKey();
  const weeks = buildCalendarWeeks(calYear, calMonth);

  els.calDaysGrid.innerHTML = "";
  els.calDaysGrid.className = "cal-weeks-container";

  weeks.forEach((week) => {
    const weekEl = document.createElement("div");
    weekEl.className = "calendar-week";

    week.forEach((dayInfo, colIndex) => {
      const cell = document.createElement("div");
      cell.className = "cal-day-cell calendar-day month-day-cell";
      cell.style.gridColumn = String(colIndex + 1);
      if (dayInfo.otherMonth) cell.classList.add("other-month");
      if (dayInfo.dateKey === todayKey) cell.classList.add("today");

      const num = document.createElement("span");
      num.className = "cal-day-num calendar-date";
      if (dayInfo.otherMonth) num.classList.add("is-muted");
      num.textContent = dayInfo.day;
      cell.appendChild(num);
      weekEl.appendChild(cell);
    });

    const segments = [];
    items.forEach((todo) => {
      const seg = getWeekEventSegment(todo, week);
      if (seg) segments.push(seg);
    });

    assignEventLanes(segments);

    const laneCount = segments.reduce((max, s) => Math.max(max, s.lane), -1) + 1;
    const weekHeight = Math.max(
      CAL_CELL_MIN_HEIGHT,
      CAL_DAY_HEADER + Math.max(laneCount, 1) * CAL_LANE_HEIGHT + CAL_WEEK_BOTTOM_PAD
    );
    weekEl.style.minHeight = `${weekHeight}px`;

    segments.forEach((seg) => {
      weekEl.appendChild(createCalendarEventBar(seg));
    });

    els.calDaysGrid.appendChild(weekEl);
  });
}

function renderWeekCalendar(items) {
  if (!els.calWeekGrid) return;

  const week = getWeekDates(calAnchorKey);
  if (els.calMonthTitle) {
    els.calMonthTitle.textContent = formatWeekRangeTitle(week);
  }

  const todayKey = getTodayKey();

  if (els.weekDayHeaders) {
    els.weekDayHeaders.innerHTML = "";
    week.forEach((dayInfo, index) => {
      const header = document.createElement("span");
      header.className = "week-day-header";
      if (dayInfo.dateKey === todayKey) header.classList.add("today");
      header.textContent = `${DAY_SHORT[index]} ${dayInfo.month}/${dayInfo.day}`;
      els.weekDayHeaders.appendChild(header);
    });
  }

  els.calWeekGrid.innerHTML = "";
  els.calWeekGrid.className = "cal-week-grid";

  const weekEl = document.createElement("div");
  weekEl.className = "calendar-week week-view-row";

  week.forEach((dayInfo, colIndex) => {
    const cell = document.createElement("div");
    cell.className = "cal-day-cell calendar-day week-day-cell";
    cell.style.gridColumn = String(colIndex + 1);
    if (dayInfo.dateKey === todayKey) cell.classList.add("today");

    const num = document.createElement("span");
    num.className = "cal-day-num calendar-date";
    num.textContent = dayInfo.day;
    cell.appendChild(num);
    weekEl.appendChild(cell);
  });

  const segments = [];
  items.forEach((todo) => {
    const seg = getWeekEventSegment(todo, week);
    if (seg) segments.push(seg);
  });

  assignEventLanes(segments);

  const laneCount = segments.reduce((max, s) => Math.max(max, s.lane), -1) + 1;
  const weekHeight = Math.max(
    CAL_WEEK_MIN_HEIGHT,
    CAL_WEEK_DAY_HEADER + Math.max(laneCount, 1) * CAL_LANE_HEIGHT + CAL_WEEK_BOTTOM_PAD
  );
  weekEl.style.minHeight = `${weekHeight}px`;

  segments.forEach((seg) => {
    weekEl.appendChild(createCalendarEventBar(seg, CAL_WEEK_DAY_HEADER));
  });

  els.calWeekGrid.appendChild(weekEl);
}

function renderDayCalendar(items) {
  if (!els.calDayList) return;

  const dateKey = calAnchorKey;
  if (els.calMonthTitle) {
    els.calMonthTitle.textContent = formatDayTitle(dateKey);
  }

  const dayTodos = getTodosForDate(items, dateKey);
  const withTime = dayTodos.filter((t) => todoHasTime(t));
  const withoutTime = dayTodos.filter((t) => !todoHasTime(t));

  withTime.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
  withoutTime.sort((a, b) => (a.title || "").localeCompare(b.title || ""));

  els.calDayList.innerHTML = "";

  withTime.forEach((todo) => {
    els.calDayList.appendChild(createDayViewItem(todo));
  });

  if (withoutTime.length > 0) {
    const sectionTitle = document.createElement("h3");
    sectionTitle.className = "day-view-section-title";
    sectionTitle.textContent = "시간 미정";
    els.calDayList.appendChild(sectionTitle);

    const chipWrap = document.createElement("div");
    chipWrap.className = "time-grid-unscheduled-list";
    withoutTime.forEach((todo) => {
      chipWrap.appendChild(createDayViewChip(todo));
    });
    els.calDayList.appendChild(chipWrap);
  }

  const hasDayTodos = dayTodos.length > 0;
  if (els.calDayEmpty) {
    els.calDayEmpty.hidden = hasDayTodos;
    if (!hasDayTodos) {
      els.calDayEmpty.textContent = "이 날짜에 표시할 할 일이 없습니다.";
    }
  }
}

function renderTimeGridCalendar(items) {
  if (!els.calTimeGrid) return;

  const dateKey = calAnchorKey;
  if (els.calMonthTitle) {
    els.calMonthTitle.textContent = formatDayTitle(dateKey);
  }

  const dayTodos = getTodosForDate(items, dateKey);
  const withStartTime = dayTodos.filter((t) => t.startTime);
  const withoutStartTime = dayTodos.filter((t) => !t.startTime);

  els.calTimeGrid.innerHTML = "";

  const header = document.createElement("div");
  header.className = "time-grid-header";

  const corner = document.createElement("div");
  corner.className = "time-grid-corner";
  corner.textContent = "카테고리";

  const hoursRow = document.createElement("div");
  hoursRow.className = "time-grid-header-hours";

  for (let h = 0; h < TIME_GRID_HOURS; h++) {
    const label = document.createElement("span");
    label.className = "time-grid-hour-label";
    label.textContent = `${String(h).padStart(2, "0")}:00`;
    hoursRow.appendChild(label);
  }

  header.append(corner, hoursRow);
  els.calTimeGrid.appendChild(header);

  const body = document.createElement("div");
  body.className = "time-grid-body";

  CATEGORY_ORDER.forEach((categoryKey) => {
    const categoryTodos = withStartTime.filter((todo) => {
      const key = VALID_CATEGORIES.includes(todo.category) ? todo.category : "other";
      return key === categoryKey;
    });

    const row = document.createElement("div");
    row.className = "time-grid-row";

    const label = document.createElement("div");
    label.className = "time-grid-label";
    label.textContent = CATEGORY_LABELS[categoryKey] || "기타";

    const track = document.createElement("div");
    track.className = "time-grid-track";

    const hourBg = document.createElement("div");
    hourBg.className = "time-grid-hour-bg";
    for (let h = 0; h < TIME_GRID_HOURS; h++) {
      const cell = document.createElement("span");
      cell.className = "time-grid-hour-cell";
      hourBg.appendChild(cell);
    }
    track.appendChild(hourBg);

    const barsLayer = document.createElement("div");
    barsLayer.className = "time-grid-bars-layer";

    const segments = categoryTodos
      .map((todo) => getTimeGridSegment(todo))
      .filter(Boolean);

    assignEventLanes(segments);

    const laneCount = segments.reduce((max, s) => Math.max(max, s.lane), -1) + 1;
    const trackHeight = Math.max(60, 10 + Math.max(laneCount, 1) * TIME_GRID_LANE_HEIGHT + 10);
    track.style.minHeight = `${trackHeight}px`;
    hourBg.style.minHeight = `${trackHeight}px`;

    segments.forEach((seg) => {
      barsLayer.appendChild(createTimeGridBar(seg));
    });

    track.appendChild(barsLayer);
    row.append(label, track);
    body.appendChild(row);
  });

  els.calTimeGrid.appendChild(body);

  if (withoutStartTime.length > 0) {
    withoutStartTime.sort((a, b) => (a.title || "").localeCompare(b.title || ""));

    const unscheduled = document.createElement("div");
    unscheduled.className = "time-grid-unscheduled";

    const unscheduledTitle = document.createElement("h3");
    unscheduledTitle.className = "time-grid-unscheduled-title";
    unscheduledTitle.textContent = "시간 미정";

    const list = document.createElement("div");
    list.className = "time-grid-unscheduled-list";
    withoutStartTime.forEach((todo) => {
      list.appendChild(createDayViewChip(todo));
    });

    unscheduled.append(unscheduledTitle, list);
    els.calTimeGrid.appendChild(unscheduled);
  }

  const hasDayTodos = dayTodos.length > 0;
  if (els.calTimeGridEmpty) {
    els.calTimeGridEmpty.hidden = hasDayTodos;
    if (!hasDayTodos) {
      els.calTimeGridEmpty.textContent = "이 날짜에 표시할 할 일이 없습니다.";
    }
  }
}

/** 타임라인 보기 렌더링 */
function renderTimeline() {
  if (!els.timelineGroups) return;

  const items = getFilteredTodos();
  const groups = {};
  const noDate = [];

  items.forEach((todo) => {
    if (!todo?.startDate) {
      noDate.push(todo);
      return;
    }

    const dates = getDatesBetween(todo.startDate, getTodoEndDate(todo));
    if (dates.length === 0) {
      noDate.push(todo);
      return;
    }

    dates.forEach((dateKey) => {
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(todo);
    });
  });

  els.timelineGroups.innerHTML = "";

  Object.keys(groups)
    .sort()
    .forEach((dateKey) => {
      const section = document.createElement("section");
      section.className = "timeline-date-group";

      const heading = document.createElement("h3");
      heading.className = "timeline-date-title";
      heading.textContent = formatDateCompact(dateKey);
      section.appendChild(heading);

      const dayTodos = groups[dateKey];
      const withTime = dayTodos.filter((t) => todoHasTime(t));
      const withoutTime = dayTodos.filter((t) => !todoHasTime(t));

      withTime.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
      withoutTime.sort((a, b) => (a.title || "").localeCompare(b.title || ""));

      withTime.forEach((todo) => {
        section.appendChild(createTimelineItem(todo));
      });
      withoutTime.forEach((todo) => {
        section.appendChild(createTimelineItem(todo));
      });

      els.timelineGroups.appendChild(section);
    });

  if (noDate.length > 0) {
    noDate.sort((a, b) => (a.title || "").localeCompare(b.title || ""));

    const section = document.createElement("section");
    section.className = "timeline-date-group";

    const heading = document.createElement("h3");
    heading.className = "timeline-date-title";
    heading.textContent = "날짜 미정";
    section.appendChild(heading);

    noDate.forEach((todo) => {
      section.appendChild(createTimelineItem(todo));
    });

    els.timelineGroups.appendChild(section);
  }

  const hasContent = Object.keys(groups).length > 0 || noDate.length > 0;
  updateEmptyMessage(els.timelineEmpty, hasContent);
}

function createTimelineItem(todo) {
  const item = document.createElement("div");
  item.className = "timeline-item" + (todo.completed ? " done" : "");

  const content = document.createElement("div");
  content.className = "timeline-content";

  const title = document.createElement("strong");
  title.className = "timeline-title";
  title.textContent = getDisplayTitle(todo.title);

  content.append(title, buildTodoMetaRow(todo));
  item.appendChild(content);
  return item;
}

/** 전체 UI 갱신 */
function render() {
  updateSummary();
  renderList();
  renderCalendar();
  renderTimeline();
}

/** 보기 모드 전환 */
function switchView(view) {
  currentView = view;

  els.viewSwitcher?.querySelectorAll(".view-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });

  if (els.listView) els.listView.hidden = view !== "list";
  if (els.calendarView) els.calendarView.hidden = view !== "calendar";
  if (els.timelineView) els.timelineView.hidden = view !== "timeline";

  render();
}

/** 모달 열기 - 추가 모드 */
function openAddModal() {
  editingId = null;
  hideMessage();
  if (els.modalTitle) els.modalTitle.textContent = "할 일 추가";
  els.todoForm?.reset();
  const today = getTodayKey();
  if (els.fieldStartDate) els.fieldStartDate.value = today;
  if (els.fieldEndDate) els.fieldEndDate.value = "";
  if (els.fieldStartTime) els.fieldStartTime.value = "";
  if (els.fieldEndTime) els.fieldEndTime.value = "";
  if (els.fieldPriority) els.fieldPriority.value = "medium";
  if (els.fieldCategory) els.fieldCategory.value = "study";
  if (els.todoModal) els.todoModal.hidden = false;
  els.fieldTitle?.focus();
}

/** 모달 열기 - 수정 모드 */
function openEditModal(id) {
  const todo = todos.find((t) => t.id === id);
  if (!todo) return;

  editingId = id;
  hideMessage();
  if (els.modalTitle) els.modalTitle.textContent = "할 일 수정";
  if (els.fieldTitle) els.fieldTitle.value = todo.title || "";
  if (els.fieldStartDate) els.fieldStartDate.value = todo.startDate || "";
  if (els.fieldEndDate) {
    const end = todo.endDate || todo.startDate || "";
    els.fieldEndDate.value = end !== todo.startDate ? end : "";
  }
  if (els.fieldStartTime) els.fieldStartTime.value = todo.startTime || "";
  if (els.fieldEndTime) els.fieldEndTime.value = todo.endTime || "";
  if (els.fieldPriority) els.fieldPriority.value = todo.priority || "medium";
  if (els.fieldCategory) els.fieldCategory.value = todo.category || "other";
  if (els.fieldMemo) els.fieldMemo.value = todo.memo || "";
  if (els.todoModal) els.todoModal.hidden = false;
  els.fieldTitle?.focus();
}

function closeModal() {
  editingId = null;
  hideMessage();
  if (els.todoModal) els.todoModal.hidden = true;
  els.todoForm?.reset();
}

/** 할 일 저장 (추가/수정) */
async function saveTodoFromForm(e) {
  e.preventDefault();

  const title = (els.fieldTitle?.value || "").trim();
  if (!title) {
    showMessage("할 일 제목을 입력해주세요.", "error");
    els.fieldTitle?.focus();
    return;
  }

  const startDate = els.fieldStartDate?.value || "";
  if (!startDate) {
    showMessage("시작일을 입력해주세요.", "error");
    els.fieldStartDate?.focus();
    return;
  }

  const endDate = els.fieldEndDate?.value || startDate;
  if (endDate < startDate) {
    showMessage("종료일은 시작일보다 빠를 수 없습니다.", "error");
    els.fieldEndDate?.focus();
    return;
  }

  const startTime = els.fieldStartTime?.value || "";
  const endTime = els.fieldEndTime?.value || "";

  if (startDate === endDate && startTime && endTime && endTime < startTime) {
    showMessage("종료 시간은 시작 시간보다 빠를 수 없습니다.", "error");
    els.fieldEndTime?.focus();
    return;
  }

  const todoData = {
    title,
    startDate,
    endDate,
    startTime,
    endTime,
    priority: els.fieldPriority?.value || "medium",
    category: els.fieldCategory?.value || "other",
    memo: (els.fieldMemo?.value || "").trim(),
  };

  if (useLocalFallback || !firebaseReady || !db || !rtdbAvailable) {
    if (saveTodoLocally(todoData)) closeModal();
    return;
  }

  const saveBtn = els.todoForm?.querySelector('button[type="submit"]');
  if (saveBtn) saveBtn.disabled = true;

  try {
    if (editingId) {
      const exists = todos.some((t) => t.id === editingId);
      if (!exists) {
        showMessage("수정할 할 일을 찾을 수 없습니다.", "error");
        return;
      }
      const existing = todos.find((t) => t.id === editingId);
      await update(
        ref(db, `todos/${editingId}`),
        buildRtdbPayload(todoData, { completed: existing?.completed ?? false })
      );
      showMessage("할 일이 수정되었습니다.", "success");
    } else {
      const newRef = push(ref(db, "todos"));
      await set(newRef, buildRtdbPayload(todoData, { completed: false, isNew: true }));
      showMessage("할 일이 추가되었습니다.", "success");
    }
    closeModal();
  } catch (err) {
    console.error("[Todo App] Realtime Database 저장 실패:", err);
    switchToLocalFallback("RTDB 저장 실패, localStorage로 전환");
    loadTodosFromLocalStorageFallback();
    if (saveTodoLocally(todoData)) closeModal();
    else showMessage("저장에 실패했습니다. 잠시 후 다시 시도해주세요.", "error");
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

/** 완료 토글 (리스트 체크박스 전용) */
async function toggleComplete(id) {
  const todo = todos.find((t) => t.id === id);
  if (!todo) return;

  if (useLocalFallback || !firebaseReady || !db || !rtdbAvailable) {
    todos = todos.map((t) =>
      t.id === id ? { ...t, completed: !t.completed } : t
    );
    persistTodosLocally();
    return;
  }

  try {
    await update(ref(db, `todos/${id}`), {
      completed: !todo.completed,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error("[Todo App] RTDB 완료 상태 저장 실패:", err);
    switchToLocalFallback("RTDB 저장 실패, localStorage로 전환");
    todos = todos.map((t) =>
      t.id === id ? { ...t, completed: !t.completed } : t
    );
    persistTodosLocally();
  }
}

/** 삭제 */
async function deleteTodo(id, confirmMessage) {
  const todo = todos.find((t) => t.id === id);
  if (!todo) return;

  const message =
    confirmMessage ?? `"${getDisplayTitle(todo.title)}"\n할 일을 삭제할까요?`;
  if (!confirm(message)) return;

  if (useLocalFallback || !firebaseReady || !db || !rtdbAvailable) {
    todos = todos.filter((t) => t.id !== id);
    showMessage("할 일이 삭제되었습니다.", "success");
    persistTodosLocally();
    return;
  }

  try {
    await remove(ref(db, `todos/${id}`));
    showMessage("할 일이 삭제되었습니다.", "success");
  } catch (err) {
    console.error("[Todo App] RTDB 삭제 실패:", err);
    switchToLocalFallback("RTDB 삭제 실패, localStorage로 전환");
    todos = todos.filter((t) => t.id !== id);
    showMessage("할 일이 삭제되었습니다.", "success");
    persistTodosLocally();
  }
}

function handleDelete(id, title) {
  const todo = todos.find((t) => t.id === id);
  if (!todo) return;
  deleteTodo(
    id,
    `"${title || getDisplayTitle(todo.title)}"\n할 일을 삭제할까요?`
  );
}

// 이벤트 바인딩
els.openTodoModalBtn?.addEventListener("click", openAddModal);
els.cancelModalBtn?.addEventListener("click", closeModal);
els.modalBackdrop?.addEventListener("click", closeModal);
els.todoForm?.addEventListener("submit", saveTodoFromForm);

els.searchInput?.addEventListener("input", render);

els.filterBar?.addEventListener("click", (e) => {
  const btn = e.target.closest(".filter-btn");
  if (!btn) return;
  setFilter(btn.dataset.filter || "all");
});

els.summaryCards?.addEventListener("click", (e) => {
  const card = e.target.closest(".summary-card");
  if (!card?.dataset.filter) return;
  setFilter(card.dataset.filter);
});

els.themeToggleBtn?.addEventListener("click", toggleTheme);

els.viewSwitcher?.addEventListener("click", (e) => {
  const btn = e.target.closest(".view-tab");
  if (!btn) return;
  switchView(btn.dataset.view || "list");
});

els.calPrevBtn?.addEventListener("click", () => {
  if (calMode === "week") {
    shiftCalAnchorDays(-7);
  } else if (calMode === "day" || calMode === "timegrid") {
    shiftCalAnchorDays(-1);
  } else {
    shiftCalAnchorMonths(-1);
  }
  render();
});

els.calNextBtn?.addEventListener("click", () => {
  if (calMode === "week") {
    shiftCalAnchorDays(7);
  } else if (calMode === "day" || calMode === "timegrid") {
    shiftCalAnchorDays(1);
  } else {
    shiftCalAnchorMonths(1);
  }
  render();
});

els.calModeSwitcher?.addEventListener("click", (e) => {
  const btn = e.target.closest(".cal-mode-btn");
  if (!btn) return;
  setCalMode(btn.dataset.calMode || "month");
});

els.calendarView?.addEventListener("click", (e) => {
  const deleteBtn = e.target.closest(".calendar-event-delete");
  if (deleteBtn) {
    e.stopPropagation();
    e.preventDefault();
    const id = deleteBtn.dataset.id;
    if (id) deleteTodo(id, "정말로 삭제하시겠습니까?");
    return;
  }

  const interactive = e.target.closest(
    ".calendar-event-bar, .day-view-item, .day-view-chip, .time-grid-bar"
  );
  if (!interactive) return;
  const id = interactive.dataset.id;
  if (id) openEditModal(id);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && els.todoModal && !els.todoModal.hidden) {
    closeModal();
  }
});

// 초기화
initTheme();
initFirebase();
