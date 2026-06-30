/**
 * TaskMaster 대시보드 — Firebase Realtime Database 연동
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  set,
  update,
  remove,
  onValue,
  get,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js";
import { firebaseConfig, isFirebaseConfigured } from "./config.js";

const VALID_PRIORITIES = ["high", "medium", "low"];
const VALID_CATEGORIES = ["study", "work", "personal", "other"];
const LEGACY_STORAGE_KEY = "dashboard-preview-todos-v5";

let db = null;
let firebaseReady = false;
let rtdbAvailable = false;
let unsubscribeTodos = null;
let seedingInProgress = false;

const PRIORITY_STYLES = {
  high: "bg-red-100 text-red-600",
  medium: "bg-indigo-100 text-indigo-600",
  low: "bg-slate-100 text-slate-500",
};

const PRIORITY_LABELS = { high: "High", medium: "Med", low: "Low" };

const CATEGORY_STYLES = {
  personal: "bg-emerald-100 text-emerald-700",
  study: "bg-amber-100 text-amber-700",
  work: "bg-blue-100 text-blue-600",
  other: "bg-slate-100 text-slate-500",
};

const CATEGORY_LABELS = { study: "Study", work: "Work", personal: "Personal", other: "Other" };

const els = {
  sidebar: document.getElementById("sidebar"),
  sidebarBackdrop: document.getElementById("sidebar-backdrop"),
  menuBtn: document.getElementById("menu-btn"),
  filterNav: document.getElementById("filter-nav"),
  searchInput: document.getElementById("search-input"),
  addBtn: document.getElementById("add-btn"),
  listView: document.getElementById("list-view"),
  completedView: document.getElementById("completed-view"),
  completedList: document.getElementById("completed-list"),
  calendarView: document.getElementById("calendar-view"),
  calendarGrid: document.getElementById("calendar-grid"),
  calendarTitle: document.getElementById("calendar-title"),
  weekDayHeaders: document.getElementById("week-day-headers"),
  calendarScrollWrap: document.getElementById("calendar-scroll-wrap"),
  calendarScrollInner: document.getElementById("calendar-scroll-inner"),
  calModeTabs: document.getElementById("cal-mode-tabs"),
  calPrev: document.getElementById("cal-prev"),
  calNext: document.getElementById("cal-next"),
  viewListBtn: document.getElementById("view-list-btn"),
  viewCalendarBtn: document.getElementById("view-calendar-btn"),
  modal: document.getElementById("todo-modal"),
  modalTitle: document.getElementById("modal-title"),
  form: document.getElementById("todo-form"),
  closeModalBtn: document.getElementById("close-modal-btn"),
  cancelModalBtn: document.getElementById("cancel-modal-btn"),
  inputTitle: document.getElementById("input-title"),
  inputStartDate: document.getElementById("input-start-date"),
  inputEndDate: document.getElementById("input-end-date"),
  inputStartTime: document.getElementById("input-start-time"),
  inputEndTime: document.getElementById("input-end-time"),
  inputPriority: document.getElementById("input-priority"),
  inputCategory: document.getElementById("input-category"),
  inputMemo: document.getElementById("input-memo"),
  statTotalPercent: document.getElementById("stat-total-percent"),
  statCompleted: document.getElementById("stat-completed"),
  statTotal: document.getElementById("stat-total"),
  statProgressBar: document.getElementById("stat-progress-bar"),
  statToday: document.getElementById("stat-today"),
  statImportant: document.getElementById("stat-important"),
  statDeadline: document.getElementById("stat-deadline"),
  navBadgeToday: document.getElementById("nav-badge-today"),
  connectionStatus: document.getElementById("connection-status"),
  statViewCompletedBtn: document.getElementById("stat-view-completed-btn"),
};

const CATEGORY_LABELS_KO = { study: "공부", work: "업무", personal: "개인", other: "기타" };
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const MONTH_NAMES = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

const DAY_CARD_THEME = {
  high: { card: "bg-red-50 border-red-200 border-l-red-400", cat: "text-red-700", dot: "bg-red-500" },
  medium: { card: "bg-indigo-50 border-indigo-200 border-l-indigo-400", cat: "text-indigo-700", dot: "bg-indigo-500" },
  low: { card: "bg-slate-50 border-slate-200 border-l-slate-400", cat: "text-slate-600", dot: "bg-slate-400" },
};

const WEEK_CARD_THEME = {
  high: { card: "bg-red-50 border-red-200", cat: "text-red-700", dot: "bg-red-500" },
  medium: { card: "bg-indigo-50 border-indigo-200", cat: "text-indigo-700", dot: "bg-indigo-500" },
  low: { card: "bg-slate-50 border-slate-200", cat: "text-slate-600", dot: "bg-slate-400" },
};

const CAL_WEEK_DAY_HEADER = 12;
const CAL_BAR_HEIGHT = 52;
const CAL_LANE_HEIGHT = 52;
const CAL_WEEK_BAR_HEIGHT = 84;
const CAL_WEEK_LANE_GAP = 16;
const CAL_WEEK_LANE_STEP = CAL_WEEK_BAR_HEIGHT + CAL_WEEK_LANE_GAP;
const CAL_MONTH_BAR_HEIGHT = 44;
const CAL_MONTH_LANE_GAP = 8;
const CAL_MONTH_LANE_STEP = CAL_MONTH_BAR_HEIGHT + CAL_MONTH_LANE_GAP;
const CAL_EVENT_H_MARGIN = 6;

const TIMELINE_HOURS = 24;
const TIMELINE_HOUR_WIDTH = 64;
const TIMELINE_ROW_HEIGHT = 56;
const TIMELINE_MIN_ROWS = 15;

let todos = [];
let currentFilter = "all";
let currentCategory = null;
let currentView = "list";
let editingId = null;
let calAnchorKey = "";
let calMode = "week";
let timelineNowTimer = null;

function todayKey() {
  const d = new Date();
  return formatDateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDateKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function createId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `todo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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

  if (firebaseReady && rtdbAvailable) {
    els.connectionStatus.innerHTML =
      '<span class="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5"></span><span class="text-emerald-700">연결됨</span>';
    els.connectionStatus.className =
      "hidden sm:flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200";
    els.connectionStatus.title = `Realtime Database · ${firebaseConfig.projectId}`;
    return;
  }

  if (isFirebaseConfigured(firebaseConfig)) {
    els.connectionStatus.innerHTML =
      '<span class="inline-block w-2 h-2 rounded-full bg-red-500 mr-1.5"></span><span class="text-red-700">연결 실패</span>';
    els.connectionStatus.className =
      "hidden sm:flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 border border-red-200";
    els.connectionStatus.title = "Realtime Database에 연결할 수 없습니다.";
    return;
  }

  els.connectionStatus.innerHTML =
    '<span class="inline-block w-2 h-2 rounded-full bg-slate-400 mr-1.5"></span><span class="text-slate-600">미연결</span>';
  els.connectionStatus.className =
    "hidden sm:flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200";
  els.connectionStatus.title = "js/config.js 설정을 확인해주세요.";
}

async function checkRtdbAvailable() {
  if (!db) return false;
  try {
    await get(ref(db, "todos"));
    rtdbAvailable = true;
    return true;
  } catch (err) {
    console.error("[Dashboard] Realtime Database 연결 확인 실패:", err);
    rtdbAvailable = false;
    return false;
  }
}

function clearLegacyLocalStorage() {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

async function migrateLegacyLocalStorageToRtdb() {
  if (!db) return;

  let raw = null;
  try {
    raw = localStorage.getItem(LEGACY_STORAGE_KEY);
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
    console.info(`[Dashboard] localStorage → RTDB 이전 완료 (${items.length}건)`);
  } catch (err) {
    console.error("[Dashboard] localStorage → RTDB 이전 실패:", err);
  }
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
    console.info(`[Dashboard] 테스트 데이터 ${samples.length}건을 Realtime Database에 추가했습니다.`);
    return true;
  } catch (err) {
    console.error("[Dashboard] RTDB 테스트 데이터 추가 실패:", err);
    return false;
  } finally {
    seedingInProgress = false;
  }
}

function subscribeTodosFromRtdb() {
  if (!db) return;

  if (typeof unsubscribeTodos === "function") {
    unsubscribeTodos();
    unsubscribeTodos = null;
  }

  unsubscribeTodos = onValue(
    ref(db, "todos"),
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
      console.error("[Dashboard] Realtime Database 로드 실패:", err);
      firebaseReady = false;
      rtdbAvailable = false;
      updateConnectionStatus();
    }
  );
}

async function initFirebase() {
  if (!isFirebaseConfigured(firebaseConfig)) {
    console.error("[Dashboard] js/config.js Firebase 설정을 확인해주세요.");
    updateConnectionStatus();
    render();
    return;
  }

  try {
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);

    const rtdbOk = await checkRtdbAvailable();
    if (!rtdbOk) {
      firebaseReady = false;
      updateConnectionStatus();
      render();
      return;
    }

    firebaseReady = true;
    await migrateLegacyLocalStorageToRtdb();
    await seedRtdbSampleData();
    subscribeTodosFromRtdb();
    updateConnectionStatus();
  } catch (err) {
    console.error("[Dashboard] Firebase 초기화 실패:", err);
    firebaseReady = false;
    rtdbAvailable = false;
    updateConnectionStatus();
    render();
  }
}

function ensureFirebaseReady() {
  if (firebaseReady && rtdbAvailable && db) return true;
  alert("Firebase에 연결되지 않았습니다. js/config.js와 네트워크를 확인해주세요.");
  return false;
}

async function toggleTodoComplete(id) {
  const todo = todos.find((t) => t.id === id);
  if (!todo || !ensureFirebaseReady()) return;

  try {
    await update(ref(db, `todos/${id}`), {
      completed: !todo.completed,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error("[Dashboard] 완료 상태 저장 실패:", err);
    alert("저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
}

async function deleteTodoById(id) {
  const todo = todos.find((t) => t.id === id);
  if (!todo) return;
  if (!confirm(`"${todo.title}"\n삭제할까요?`)) return;
  if (!ensureFirebaseReady()) return;

  try {
    await remove(ref(db, `todos/${id}`));
  } catch (err) {
    console.error("[Dashboard] 삭제 실패:", err);
    alert("삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
}

async function saveTodoToFirebase(data) {
  if (!ensureFirebaseReady()) return false;

  const saveBtn = els.form?.querySelector('button[type="submit"]');
  if (saveBtn) saveBtn.disabled = true;

  try {
    if (editingId) {
      const existing = todos.find((t) => t.id === editingId);
      if (!existing) {
        alert("수정할 할 일을 찾을 수 없습니다.");
        return false;
      }
      await update(
        ref(db, `todos/${editingId}`),
        buildRtdbPayload(data, { completed: existing.completed ?? false })
      );
    } else {
      const newRef = push(ref(db, "todos"));
      await set(newRef, buildRtdbPayload(data, { completed: false, isNew: true }));
    }
    return true;
  } catch (err) {
    console.error("[Dashboard] 저장 실패:", err);
    alert("저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
    return false;
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function getSampleTodos() {
  const t = todayKey();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tk = formatDateKey(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());

  return [
    {
      id: "1",
      title: "메모장 기능 추가",
      startDate: t,
      endDate: t,
      startTime: "",
      endTime: "",
      priority: "medium",
      category: "personal",
      memo: "",
      completed: false,
    },
    {
      id: "2",
      title: "제출 전 오타 확인하기",
      startDate: t,
      endDate: addDaysFromKey(t, 3),
      startTime: "20:00",
      endTime: "16:19",
      priority: "medium",
      category: "study",
      memo: "",
      completed: false,
    },
    {
      id: "3",
      title: "모바일 반응형 점검하기",
      startDate: t,
      endDate: t,
      startTime: "10:00",
      endTime: "11:30",
      priority: "high",
      category: "work",
      memo: "",
      completed: false,
    },
    {
      id: "4",
      title: "Firebase 연동 테스트",
      startDate: tk,
      endDate: tk,
      startTime: "",
      endTime: "",
      priority: "low",
      category: "work",
      memo: "",
      completed: false,
    },
    {
      id: "5",
      title: "프로젝트 발표 준비",
      startDate: t,
      endDate: tk,
      startTime: "",
      endTime: "",
      priority: "high",
      category: "study",
      memo: "",
      completed: false,
    },
    {
      id: "6",
      title: "메모만 있는 할 일",
      startDate: "",
      endDate: "",
      startTime: "",
      endTime: "",
      priority: "",
      category: "",
      memo: "메모 내용만 있는 할 일입니다.",
      completed: false,
    },
    {
      id: "7",
      title: "캘린더 보기 확인하기",
      startDate: t,
      endDate: addDaysFromKey(t, 2),
      startTime: "04:30",
      endTime: "18:00",
      priority: "high",
      category: "study",
      memo: "날짜별 할 일이 표시되는지 확인",
      completed: false,
    },
    {
      id: "8",
      title: "Todo 기능 구현하기",
      startDate: t,
      endDate: t,
      startTime: "14:00",
      endTime: "18:00",
      priority: "high",
      category: "study",
      memo: "",
      completed: false,
    },
  ];
}

function addDaysFromKey(dateKey, days) {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + days);
  return formatDateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

function scheduleIconSpan(icon, label) {
  return `
    <span class="text-xs flex items-center gap-1">
      <span class="material-symbols-outlined icon-sm">${icon}</span>
      ${escapeHtml(label)}
    </span>`;
}

function buildScheduleHtml(todo, withMargin = false) {
  if (!todo.startDate) return "";

  const end = todo.endDate || todo.startDate;
  const sameDay = end === todo.startDate;
  const hasTime = !!(todo.startTime || todo.endTime);
  let inner = "";

  if (!sameDay && hasTime) {
    const startPart = `${todo.startDate}${todo.startTime ? ` ${todo.startTime}` : ""}`;
    const endPart = `${end}${todo.endTime ? ` ${todo.endTime}` : todo.startTime ? ` ${todo.startTime}` : ""}`;
    inner = scheduleIconSpan("calendar_today", `${startPart} ~ ${endPart}`);
  } else if (sameDay && hasTime) {
    const timeLabel = todo.startTime
      ? `${todo.startTime}${todo.endTime ? ` ~ ${todo.endTime}` : ""}`
      : todo.endTime;
    inner = scheduleIconSpan("calendar_today", todo.startDate) + scheduleIconSpan("schedule", timeLabel);
  } else if (!sameDay) {
    inner = scheduleIconSpan("calendar_today", `${todo.startDate} ~ ${end}`);
  } else {
    inner = scheduleIconSpan("calendar_today", todo.startDate);
  }

  const margin = withMargin ? " ml-1" : "";
  return `<div class="flex flex-wrap items-center gap-3${margin} text-slate-500 text-xs">${inner}</div>`;
}

function buildMetaRowHtml(todo) {
  const parts = [];

  if (todo.priority) {
    const pri = PRIORITY_STYLES[todo.priority] || PRIORITY_STYLES.medium;
    parts.push(
      `<span class="text-[10px] font-bold px-2 py-0.5 rounded uppercase shrink-0 ${pri}">${PRIORITY_LABELS[todo.priority] || "Med"}</span>`
    );
  }

  if (todo.category) {
    const cat = CATEGORY_STYLES[todo.category] || CATEGORY_STYLES.other;
    parts.push(
      `<span class="text-[10px] font-bold px-2 py-0.5 rounded uppercase shrink-0 ${cat}">${CATEGORY_LABELS[todo.category] || "Other"}</span>`
    );
  }

  const schedule = buildScheduleHtml(todo, parts.length > 0);
  if (schedule) parts.push(schedule);

  if (!parts.length) return "";

  return `<div class="flex flex-wrap items-center mt-2 gap-2">${parts.join("")}</div>`;
}

function getFilteredTodos() {
  const q = (els.searchInput?.value || "").trim().toLowerCase();
  const today = todayKey();

  return todos.filter((todo) => {
    const matchSearch =
      !q ||
      todo.title.toLowerCase().includes(q) ||
      (todo.memo || "").toLowerCase().includes(q);
    if (!matchSearch) return false;

    if (currentCategory && todo.category !== currentCategory) return false;

    switch (currentFilter) {
      case "today":
        return todo.startDate <= today && (todo.endDate || todo.startDate) >= today;
      case "upcoming":
        return todo.startDate > today;
      case "important":
        return todo.priority === "high";
      case "deadline": {
        if (todo.completed) return false;
        const end = todo.endDate || todo.startDate;
        if (!end) return false;
        const endD = parseDateKey(end);
        const todayD = parseDateKey(today);
        if (!endD || !todayD) return false;
        const diff = Math.floor((endD - todayD) / 86400000);
        return diff >= 0 && diff <= 3;
      }
      case "completed":
        return todo.completed;
      default:
        return !todo.completed;
    }
  });
}

function updateStats() {
  const today = todayKey();
  const total = todos.length;
  const completed = todos.filter((t) => t.completed).length;
  const todayCount = todos.filter(
    (t) => t.startDate <= today && (t.endDate || t.startDate) >= today
  ).length;
  const important = todos.filter((t) => !t.completed && t.priority === "high").length;
  const deadline = todos.filter((t) => {
    if (t.completed) return false;
    const end = t.endDate || t.startDate;
    if (!end) return false;
    const endD = parseDateKey(end);
    const todayD = parseDateKey(today);
    if (!endD || !todayD) return false;
    const diff = Math.floor((endD - todayD) / 86400000);
    return diff >= 0 && diff <= 3;
  }).length;
  const pct = total ? Math.round((completed / total) * 100) : 0;

  if (els.statTotalPercent) els.statTotalPercent.textContent = `${pct}%`;
  if (els.statCompleted) els.statCompleted.textContent = completed;
  if (els.statTotal) els.statTotal.textContent = total;
  if (els.statProgressBar) els.statProgressBar.style.width = `${pct}%`;
  if (els.statToday) els.statToday.textContent = todayCount;
  if (els.statImportant) els.statImportant.textContent = important;
  if (els.statDeadline) els.statDeadline.textContent = deadline;
  if (els.navBadgeToday) els.navBadgeToday.textContent = todayCount;
}

function renderList() {
  if (!els.listView) return;

  const active = getFilteredTodos().filter((t) => !t.completed);
  let completed = todos.filter((t) => t.completed);
  if (currentCategory) {
    completed = completed.filter((t) => t.category === currentCategory);
  }

  els.listView.innerHTML = "";

  if (active.length === 0) {
    els.listView.innerHTML = `
      <div class="text-center py-16 text-slate-400 border border-dashed border-slate-200 rounded-2xl">
        <span class="material-symbols-outlined text-4xl mb-2">inbox</span>
        <p class="text-sm font-medium">표시할 할 일이 없습니다</p>
      </div>`;
  } else {
    active.forEach((todo) => els.listView.appendChild(createTaskCard(todo)));
  }

  if (els.completedView && els.completedList) {
    if (completed.length > 0 && currentFilter === "all") {
      els.completedView.classList.remove("hidden");
      els.completedList.innerHTML = "";
      completed.forEach((todo) => els.completedList.appendChild(createTaskCard(todo)));
    } else {
      els.completedView.classList.add("hidden");
    }
  }
}

function createTaskCard(todo) {
  const card = document.createElement("div");
  card.className = `group p-4 border rounded-xl flex items-start gap-3 transition-all ${
    todo.completed
      ? "bg-slate-50 border-slate-100 opacity-70"
      : "bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm"
  }`;

  const toggleDone = todo.completed
    ? "border-indigo-500 bg-indigo-50"
    : "border-slate-300 group-hover:border-indigo-500";

  card.innerHTML = `
    <button
      type="button"
      class="toggle-btn w-6 h-6 border-2 ${toggleDone} rounded-md flex-shrink-0 mt-0.5 transition-colors flex items-center justify-center"
      data-id="${escapeHtml(todo.id)}"
      aria-label="완료"
      aria-pressed="${todo.completed ? "true" : "false"}"
    >${
      todo.completed
        ? '<span class="material-symbols-outlined icon-md text-indigo-600 leading-none">check</span>'
        : ""
    }</button>
    <div class="flex-1 min-w-0">
      <h3 class="text-sm font-semibold text-slate-800 truncate ${todo.completed ? "line-through text-slate-400" : ""}">${escapeHtml(todo.title)}</h3>
      ${buildMetaRowHtml(todo)}
    </div>
    <div class="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
      <button type="button" class="edit-btn p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" data-id="${escapeHtml(todo.id)}" title="수정">
        <span class="material-symbols-outlined icon-lg">edit</span>
      </button>
      <button type="button" class="delete-btn p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" data-id="${escapeHtml(todo.id)}" title="삭제">
        <span class="material-symbols-outlined icon-lg">delete</span>
      </button>
    </div>
  `;

  card.querySelector(".toggle-btn")?.addEventListener("click", () => {
    toggleTodoComplete(todo.id);
  });

  card.querySelector(".edit-btn")?.addEventListener("click", () => openModal(todo.id));
  card.querySelector(".delete-btn")?.addEventListener("click", () => {
    deleteTodoById(todo.id);
  });

  return card;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function deleteTodoWithConfirm(todo) {
  deleteTodoById(todo.id);
}

function attachHoverDeleteBtn(container, todo, btnClass) {
  if (container.querySelector(`.${btnClass}`)) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = btnClass;
  btn.title = "삭제";
  btn.setAttribute("aria-label", "삭제");
  btn.innerHTML = '<span class="material-symbols-outlined">close</span>';
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteTodoWithConfirm(todo);
  });
  container.appendChild(btn);
}

function parseDateKey(key) {
  if (!key) return null;
  const d = new Date(`${key}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateCompact(key) {
  const d = parseDateKey(key);
  if (!d) return key || "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

function formatDateMonthDay(key) {
  const d = parseDateKey(key);
  if (!d) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}.${day}`;
}

function getTodoEndDate(todo) {
  return todo.endDate || todo.startDate || "";
}

function isMultiDayTodo(todo) {
  const endDate = getTodoEndDate(todo);
  return Boolean(todo?.startDate && endDate && todo.startDate !== endDate);
}

function getCalendarEventTimeLabel(todo) {
  const startDate = todo.startDate;
  const endDate = getTodoEndDate(todo);
  if (!startDate) return "";

  const sameDay = startDate === endDate;
  const hasStartTime = Boolean(todo.startTime);
  const hasEndTime = Boolean(todo.endTime);

  if (sameDay) {
    if (!hasStartTime && !hasEndTime) return "";
    if (hasStartTime && hasEndTime) return `${todo.startTime} ~ ${todo.endTime}`;
    return todo.startTime || todo.endTime;
  }

  if (!hasStartTime && !hasEndTime) {
    return `${formatDateMonthDay(startDate)} ~ ${formatDateMonthDay(endDate)}`;
  }

  const startPoint = `${formatDateMonthDay(startDate)}${hasStartTime ? ` ${todo.startTime}` : ""}`;
  const endPoint = `${formatDateMonthDay(endDate)}${hasEndTime ? ` ${todo.endTime}` : ""}`;
  return `${startPoint} ~ ${endPoint}`;
}

function getWeekStartDate(dateKey) {
  const d = parseDateKey(dateKey) || new Date();
  d.setDate(d.getDate() - d.getDay());
  return d;
}

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
    });
  }
  return week;
}

function formatWeekRangeTitle(week) {
  if (!week?.length) return "";
  return `${formatDateCompact(week[0].dateKey)} ~ ${formatDateCompact(week[6].dateKey)}`;
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

function assignEventLanes(segments) {
  const sorted = [...segments].sort((a, b) => {
    const spanDiff = b.colEnd - b.colStart - (a.colEnd - a.colStart);
    if (spanDiff !== 0) return spanDiff;
    return a.colStart - b.colStart;
  });
  const laneEnds = [];
  sorted.forEach((seg) => {
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] > seg.colStart) lane += 1;
    seg.lane = lane;
    laneEnds[lane] = seg.colEnd;
  });
  return sorted;
}

function applySegmentPosition(el, segment, laneStep = CAL_LANE_HEIGHT, barHeight = CAL_BAR_HEIGHT) {
  const { colStart, colEnd, lane } = segment;
  const colSpan = colEnd - colStart;
  const leftPct = ((colStart - 1) / 7) * 100;
  const widthPct = (colSpan / 7) * 100;
  const margin = CAL_EVENT_H_MARGIN;
  el.style.left = `calc(${leftPct}% + ${margin}px)`;
  el.style.width = `calc(${widthPct}% - ${margin * 2}px)`;
  el.style.top = `${CAL_WEEK_DAY_HEADER + lane * laneStep}px`;
  el.style.height = `${barHeight}px`;
}

function createCalEventBar(segment, laneStep = CAL_MONTH_LANE_STEP, barHeight = CAL_BAR_HEIGHT) {
  const { todo, colStart, colEnd, isSegmentStart, isSegmentEnd } = segment;
  const priority = todo.priority || "medium";
  const theme = WEEK_CARD_THEME[priority] || WEEK_CARD_THEME.medium;
  const isSingleDay = colEnd - colStart === 1;
  const showLabel = isSegmentStart || isSingleDay;

  const bar = document.createElement("div");
  bar.className = `cal-event-bar week-event-card border ${theme.card}`;
  if (isSingleDay || (isSegmentStart && isSegmentEnd)) bar.classList.add("bar-single");
  else if (isSegmentStart) bar.classList.add("bar-start");
  else if (isSegmentEnd) bar.classList.add("bar-end");
  else bar.classList.add("bar-middle");
  if (todo.completed) bar.classList.add("done");

  if (showLabel) {
    const timeText = getCalendarEventTimeLabel(todo);
    const dateOnly =
      todo.startDate && !timeText
        ? todo.startDate === getTodoEndDate(todo)
          ? formatDateMonthDay(todo.startDate)
          : `${formatDateMonthDay(todo.startDate)} ~ ${formatDateMonthDay(getTodoEndDate(todo))}`
        : "";
    const footer = timeText || dateOnly;
    const cat = CATEGORY_LABELS_KO[todo.category] || "";

    bar.innerHTML = `
      ${
        cat
          ? `<div class="day-schedule-cat ${theme.cat}">
              <span class="day-schedule-cat-dot ${theme.dot}"></span>
              ${escapeHtml(cat)}
            </div>`
          : ""
      }
      <div class="day-schedule-title">${escapeHtml(todo.title)}</div>
      ${footer ? `<p class="day-schedule-memo">${escapeHtml(footer)}</p>` : ""}`;
    bar.title = [todo.title, cat, footer, todo.memo].filter(Boolean).join(" · ");
  }

  applySegmentPosition(bar, segment, laneStep, barHeight);
  bar.dataset.lane = String(segment.lane);
  bar.dataset.laneStep = String(laneStep);

  if (showLabel) {
    attachHoverDeleteBtn(bar, todo, "day-schedule-delete");
  }

  bar.addEventListener("click", (e) => {
    if (e.target.closest(".day-schedule-delete")) return;
    openModal(todo.id);
  });
  return bar;
}

function renderWeekDayHeaders(week) {
  if (!els.weekDayHeaders) return;
  const today = todayKey();
  els.weekDayHeaders.innerHTML = "";

  week.forEach((dayInfo, index) => {
    const isToday = dayInfo.dateKey === today;
    const cell = document.createElement("div");
    let color = "text-slate-500";
    if (index === 0) color = "text-red-500";
    if (index === 6) color = "text-indigo-500";
    cell.className = `py-2.5 text-xs font-bold ${color} ${isToday ? "bg-indigo-50" : ""}`;
    cell.textContent = `${DAY_NAMES[index]} ${dayInfo.month}/${dayInfo.day}`;
    els.weekDayHeaders.appendChild(cell);
  });
}

function getWeekCalendarViewportHeight() {
  const wrap = els.calendarScrollWrap;
  if (!wrap) return els.calendarGrid?.clientHeight ?? 0;
  const headers = els.weekDayHeaders;
  const headersH =
    headers && !headers.classList.contains("hidden") ? headers.offsetHeight : 0;
  return Math.max(0, wrap.clientHeight - headersH);
}

function syncWeekCalendarLayout(weekEl, laneCount) {
  if (!weekEl || !els.calendarGrid) return;
  const lanes = Math.max(laneCount, 1);
  const laneStep = CAL_WEEK_LANE_STEP;
  const contentMin = CAL_WEEK_DAY_HEADER + lanes * laneStep + 12;
  const available = getWeekCalendarViewportHeight();
  const h = Math.max(contentMin, available > 0 ? available : contentMin);
  weekEl.style.minHeight = `${h}px`;
  weekEl.style.height = `${h}px`;

  weekEl.querySelectorAll(".cal-event-bar").forEach((el) => {
    const lane = Number(el.dataset.lane) || 0;
    const step = Number(el.dataset.laneStep) || laneStep;
    el.style.top = `${CAL_WEEK_DAY_HEADER + lane * step}px`;
  });
}

function renderWeekCalendar(items) {
  if (!els.calendarGrid) return;
  const week = getWeekDates(calAnchorKey);
  if (els.calendarTitle) els.calendarTitle.textContent = formatWeekRangeTitle(week);
  renderWeekDayHeaders(week);
  els.weekDayHeaders?.classList.remove("hidden");

  const today = todayKey();
  const segments = [];
  items.forEach((todo) => {
    const seg = getWeekEventSegment(todo, week);
    if (seg) segments.push(seg);
  });
  assignEventLanes(segments);

  const laneCount = segments.reduce((max, s) => Math.max(max, s.lane), -1) + 1;

  els.calendarGrid.innerHTML = "";
  const weekEl = document.createElement("div");
  weekEl.className = "cal-week cal-week-fill";
  weekEl.dataset.lanes = String(Math.max(laneCount, 1));

  const bg = document.createElement("div");
  bg.className = "cal-week-bg";
  week.forEach((dayInfo) => {
    const cell = document.createElement("div");
    cell.className = `cal-day-cell ${dayInfo.dateKey === today ? "bg-indigo-50/40" : "bg-white"}`;
    bg.appendChild(cell);
  });
  weekEl.appendChild(bg);

  segments.forEach((seg) => weekEl.appendChild(createCalEventBar(seg, CAL_WEEK_LANE_STEP, CAL_WEEK_BAR_HEIGHT)));
  els.calendarGrid.appendChild(weekEl);

  requestAnimationFrame(() => {
    syncWeekCalendarLayout(weekEl, laneCount);
    requestAnimationFrame(() => syncWeekCalendarLayout(weekEl, laneCount));
  });
}

function buildCalendarWeeks(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const weeks = [];
  let current = [];

  for (let i = 0; i < startPad; i++) {
    const d = new Date(year, month, -startPad + i + 1);
    current.push({
      dateKey: formatDateKey(d.getFullYear(), d.getMonth(), d.getDate()),
      day: d.getDate(),
      month: d.getMonth() + 1,
      otherMonth: true,
    });
  }

  for (let day = 1; day <= last.getDate(); day++) {
    current.push({
      dateKey: formatDateKey(year, month, day),
      day,
      month: month + 1,
      otherMonth: false,
    });
    if (current.length === 7) {
      weeks.push(current);
      current = [];
    }
  }

  if (current.length) {
    let nextDay = 1;
    while (current.length < 7) {
      const d = new Date(year, month + 1, nextDay++);
      current.push({
        dateKey: formatDateKey(d.getFullYear(), d.getMonth(), d.getDate()),
        day: d.getDate(),
        month: d.getMonth() + 1,
        otherMonth: true,
      });
    }
    weeks.push(current);
  }

  return weeks;
}

function createMonthDayChip(todo) {
  const priority = todo.priority || "medium";
  const chip = document.createElement("div");
  chip.className = `cal-month-chip priority-${priority}${todo.completed ? " done" : ""}`;
  chip.innerHTML = `<span class="cal-month-chip-text">${escapeHtml(todo.title)}</span>`;
  chip.title = todo.title;

  attachHoverDeleteBtn(chip, todo, "cal-month-chip-delete");

  chip.addEventListener("click", (e) => {
    if (e.target.closest(".cal-month-chip-delete")) return;
    openModal(todo.id);
  });
  return chip;
}

function createMonthDayCell(dayInfo, dayTodos, today) {
  const isToday = dayInfo.dateKey === today;
  const cell = document.createElement("div");
  cell.className = `cal-month-day${dayInfo.otherMonth ? " other-month" : ""}${isToday ? " today" : ""}`;

  const head = document.createElement("div");
  head.className = "cal-month-day-head";
  head.textContent = String(dayInfo.day);
  cell.appendChild(head);

  const body = document.createElement("div");
  body.className = "cal-month-day-body";
  dayTodos.forEach((todo) => body.appendChild(createMonthDayChip(todo)));
  cell.appendChild(body);

  return cell;
}

function renderMonthCalendar(items) {
  if (!els.calendarGrid) return;
  const anchor = parseDateKey(calAnchorKey) || new Date();
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  if (els.calendarTitle) els.calendarTitle.textContent = `${year}년 ${MONTH_NAMES[month]}`;

  els.weekDayHeaders?.classList.remove("hidden");
  if (els.weekDayHeaders) {
    els.weekDayHeaders.innerHTML = DAY_NAMES.map((name, i) => {
      const color = i === 0 ? "text-red-500" : i === 6 ? "text-indigo-500" : "text-slate-500";
      return `<div class="py-2 text-xs font-bold ${color}">${name}</div>`;
    }).join("");
  }

  const today = todayKey();
  const weeks = buildCalendarWeeks(year, month);
  els.calendarGrid.innerHTML = "";

  const container = document.createElement("div");
  container.className = "cal-month-weeks";

  weeks.forEach((week) => {
    const weekEl = document.createElement("div");
    weekEl.className = "cal-month-week";

    week.forEach((dayInfo) => {
      const dayTodos = getTodosForDate(items, dayInfo.dateKey).sort((a, b) => {
        const timeCmp = (a.startTime || "").localeCompare(b.startTime || "");
        return timeCmp !== 0 ? timeCmp : (a.title || "").localeCompare(b.title || "");
      });
      weekEl.appendChild(createMonthDayCell(dayInfo, dayTodos, today));
    });

    container.appendChild(weekEl);
  });

  els.calendarGrid.appendChild(container);
}

function formatDayTitle(dateKey) {
  const d = parseDateKey(dateKey);
  if (!d) return dateKey || "";
  return `${formatDateCompact(dateKey)} ${DAY_NAMES[d.getDay()]}요일`;
}

function todoIncludesDate(todo, dateKey) {
  if (!todo?.startDate || !dateKey) return false;
  const end = getTodoEndDate(todo);
  return dateKey >= todo.startDate && dateKey <= end;
}

function getTodosForDate(items, dateKey) {
  return items.filter((todo) => todoIncludesDate(todo, dateKey));
}

function todoHasTime(todo) {
  return Boolean(todo?.startTime || todo?.endTime);
}

function getDayViewTimeHtml(todo) {
  const startDate = todo.startDate;
  const endDate = getTodoEndDate(todo);
  const hasStartTime = Boolean(todo.startTime);
  const hasEndTime = Boolean(todo.endTime);

  if (!hasStartTime && !hasEndTime) {
    return '<span class="day-schedule-time-line">종일</span>';
  }

  if (startDate === endDate) {
    const single =
      hasStartTime && hasEndTime
        ? `${todo.startTime} ~ ${todo.endTime}`
        : todo.startTime || todo.endTime;
    return `<span class="day-schedule-time-line">${escapeHtml(single)}</span>`;
  }

  const line1 = hasStartTime
    ? `${todo.startTime} ~ ${formatDateMonthDay(endDate)}`
    : `${formatDateMonthDay(startDate)} ~ ${formatDateMonthDay(endDate)}`;

  let html = `<span class="day-schedule-time-line">${escapeHtml(line1)}</span>`;
  if (hasEndTime) {
    html += `<span class="day-schedule-time-line">${escapeHtml(todo.endTime)}</span>`;
  }
  return html;
}

function getDatesBetween(startDate, endDate) {
  if (!startDate) return [];
  const end = endDate || startDate;
  const dates = [];
  const cur = parseDateKey(startDate);
  const last = parseDateKey(end);
  if (!cur || !last) return [startDate];
  while (cur <= last) {
    dates.push(formatDateKey(cur.getFullYear(), cur.getMonth(), cur.getDate()));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function createDayScheduleRow(todo, { isLast = false } = {}) {
  const priority = todo.priority || "medium";
  const theme = DAY_CARD_THEME[priority] || DAY_CARD_THEME.medium;
  const cat = CATEGORY_LABELS_KO[todo.category] || "";
  const row = document.createElement("div");
  row.className = "day-schedule-row";

  row.innerHTML = `
    <div class="day-schedule-time">${getDayViewTimeHtml(todo)}</div>
    <div class="day-schedule-rail">
      <span class="day-schedule-dot ${theme.dot}" style="color:${priority === "high" ? "#f87171" : priority === "low" ? "#94a3b8" : "#818cf8"}"></span>
      ${isLast ? "" : '<span class="day-schedule-line" aria-hidden="true"></span>'}
    </div>
    <div class="day-schedule-card border ${theme.card} ${todo.completed ? "done" : ""}" data-id="${escapeHtml(todo.id)}">
      ${
        cat
          ? `<div class="day-schedule-cat ${theme.cat}">
              <span class="day-schedule-cat-dot ${theme.dot}"></span>
              ${escapeHtml(cat)}
            </div>`
          : ""
      }
      <div class="day-schedule-title">${escapeHtml(todo.title)}</div>
      ${todo.memo ? `<p class="day-schedule-memo">${escapeHtml(todo.memo)}</p>` : ""}
      <button type="button" class="day-schedule-delete" title="삭제" aria-label="삭제">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>`;

  const card = row.querySelector(".day-schedule-card");
  card?.addEventListener("click", (e) => {
    if (e.target.closest(".day-schedule-delete")) return;
    openModal(todo.id);
  });
  row.querySelector(".day-schedule-delete")?.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteTodoById(todo.id);
  });
  return row;
}

function renderDayCalendar(items) {
  if (!els.calendarGrid) return;
  const dateKey = calAnchorKey;
  if (els.calendarTitle) els.calendarTitle.textContent = formatDayTitle(dateKey);
  els.weekDayHeaders?.classList.add("hidden");

  const dayTodos = getTodosForDate(items, dateKey);
  const withTime = dayTodos.filter((t) => todoHasTime(t));
  const withoutTime = dayTodos.filter((t) => !todoHasTime(t));
  withTime.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
  withoutTime.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  const sorted = [...withTime, ...withoutTime];

  els.calendarGrid.innerHTML = "";
  if (sorted.length === 0) {
    els.calendarGrid.innerHTML =
      '<p class="text-sm text-slate-400 font-medium text-center py-12">이 날짜에 표시할 할 일이 없습니다.</p>';
    return;
  }

  const list = document.createElement("div");
  list.className = "day-schedule-list";
  sorted.forEach((todo, index) => {
    list.appendChild(createDayScheduleRow(todo, { isLast: index === sorted.length - 1 }));
  });
  els.calendarGrid.appendChild(list);
}

function formatTimelineTitle(dateKey) {
  const d = parseDateKey(dateKey);
  if (!d) return "";
  return `${formatDateCompact(dateKey)} (${DAY_NAMES[d.getDay()]})`;
}

function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return 0;
  const [h, m] = timeStr.split(":").map(Number);
  if (Number.isNaN(h)) return 0;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

function minutesToLeftPx(minutes) {
  return (minutes / 60) * TIMELINE_HOUR_WIDTH;
}

function minutesToWidthPx(minutes) {
  return Math.max((minutes / 60) * TIMELINE_HOUR_WIDTH, 28);
}

function getTimelineTrackWidth() {
  return TIMELINE_HOURS * TIMELINE_HOUR_WIDTH;
}

function getTimelineGanttSegment(todo, dateKey) {
  if (!todoIncludesDate(todo, dateKey)) return null;

  const startDate = todo.startDate;
  const endDate = getTodoEndDate(todo);
  const dayEnd = TIMELINE_HOURS * 60;

  const hasStartTime = Boolean(todo.startTime);
  const hasEndTime = Boolean(todo.endTime);
  const startMin = hasStartTime ? parseTimeToMinutes(todo.startTime) : 0;
  const endMin = hasEndTime ? parseTimeToMinutes(todo.endTime) : dayEnd;

  if (!isMultiDayTodo(todo)) {
    if (!hasStartTime && !hasEndTime) {
      return { leftMin: 0, widthMin: dayEnd, todo, allDay: true };
    }

    const left = hasStartTime ? startMin : 0;
    let right;
    if (hasStartTime && hasEndTime) {
      right = endMin > startMin ? endMin : dayEnd;
    } else if (hasEndTime) {
      right = endMin;
    } else {
      right = Math.min(startMin + 60, dayEnd);
    }
    if (right <= left) right = Math.min(left + 60, dayEnd);
    return { leftMin: left, widthMin: right - left, todo };
  }

  if (dateKey === startDate) {
    const left = hasStartTime ? startMin : 0;
    return { leftMin: left, widthMin: dayEnd - left, todo };
  }
  if (dateKey === endDate) {
    const right = hasEndTime ? endMin : dayEnd;
    return { leftMin: 0, widthMin: right, todo };
  }
  return { leftMin: 0, widthMin: dayEnd, todo };
}

function getTimelineBarStartLabel(todo, dateKey) {
  if (dateKey === todo.startDate && todo.startTime) return todo.startTime;
  if (isMultiDayTodo(todo) && dateKey !== todo.startDate) return "00:00";
  if (todo.startTime) return todo.startTime;
  return "";
}

function getTimelineBarEndLabel(todo, dateKey) {
  const endDate = getTodoEndDate(todo);
  if (dateKey !== endDate || !todo.endTime) return "";
  return todo.endTime;
}

function isTimelineSegmentTimePassed(segment, dateKey) {
  const today = todayKey();
  if (dateKey < today) return true;
  if (dateKey > today) return false;

  const segmentEnd = segment.leftMin + segment.widthMin;
  return getNowMinutes() >= segmentEnd;
}

function applyTimelineBarContent(bar, segment, dateKey) {
  const { todo } = segment;
  const completed = Boolean(todo.completed);
  const timePassed = isTimelineSegmentTimePassed(segment, dateKey);
  const startLabel = getTimelineBarStartLabel(todo, dateKey);
  const endLabel = getTimelineBarEndLabel(todo, dateKey);

  let body = bar.querySelector(".timeline-gantt-bar-body");
  if (!body) {
    body = document.createElement("div");
    body.className = "timeline-gantt-bar-body";
    bar.insertBefore(body, bar.firstChild);
  }

  bar.classList.toggle("timeline-gantt-bar-ended", completed || timePassed);
  bar.classList.toggle("done", completed);

  if (completed) {
    body.innerHTML = `<div class="timeline-gantt-bar-inner">
      <span class="timeline-gantt-bar-time timeline-gantt-bar-status">완료</span>
    </div>`;
    bar.title = `${todo.title} · 완료`;
    return;
  }

  if (timePassed) {
    body.innerHTML = `<div class="timeline-gantt-bar-inner">
      <span class="timeline-gantt-bar-time timeline-gantt-bar-status">종료</span>
    </div>`;
    bar.title = `${todo.title} · 종료`;
    return;
  }

  if (startLabel || endLabel) {
    body.innerHTML = `<div class="timeline-gantt-bar-inner">
      ${startLabel ? `<span class="timeline-gantt-bar-time">${escapeHtml(startLabel)}</span>` : "<span></span>"}
      ${endLabel ? `<span class="timeline-gantt-bar-time timeline-gantt-bar-time-end">${escapeHtml(endLabel)}</span>` : ""}
    </div>`;
    const rangeParts = [startLabel, endLabel].filter(Boolean);
    bar.title = rangeParts.length ? `${todo.title} · ${rangeParts.join(" ~ ")}` : todo.title;
    return;
  }

  body.innerHTML = "";
  bar.title = todo.title;
}

function attachTimelineBarDeleteBtn(bar, todo) {
  attachHoverDeleteBtn(bar, todo, "timeline-gantt-bar-delete");
}

function createTimelineHourVLines(container) {
  for (let h = 0; h <= TIMELINE_HOURS; h++) {
    const line = document.createElement("div");
    line.className = "timeline-gantt-hour-vline";
    line.style.left = `${h * TIMELINE_HOUR_WIDTH}px`;
    container.appendChild(line);
  }
}

function createTimelineGanttBar(segment, dateKey) {
  const { todo, leftMin, widthMin } = segment;
  const priority = todo.priority || "medium";

  const bar = document.createElement("div");
  bar.className = `timeline-gantt-bar priority-${priority}${todo.completed ? " done" : ""}`;
  bar.dataset.todoId = todo.id;
  bar.style.left = `${minutesToLeftPx(leftMin)}px`;
  bar.style.width = `${minutesToWidthPx(widthMin)}px`;

  applyTimelineBarContent(bar, segment, dateKey);
  attachTimelineBarDeleteBtn(bar, todo);
  bar.addEventListener("click", (e) => {
    if (e.target.closest(".timeline-gantt-bar-delete")) return;
    openModal(todo.id);
  });
  return bar;
}

function createEmptyTimelineTaskRow() {
  const row = document.createElement("div");
  row.className = "timeline-gantt-task-row timeline-gantt-task-row-empty";
  row.setAttribute("aria-hidden", "true");
  return row;
}

function createEmptyTimelineTrackRow(trackWidth) {
  const row = document.createElement("div");
  row.className = "timeline-gantt-track-row";
  row.style.width = `${trackWidth}px`;
  createTimelineHourVLines(row);
  return row;
}

function getTimelineViewportHeight() {
  const wrap = els.calendarScrollWrap;
  if (wrap) return wrap.clientHeight;
  return els.calendarGrid?.clientHeight ?? 0;
}

function getTimelineRowCount(segmentCount) {
  const hoursHeaderH = 40;
  const gridH = getTimelineViewportHeight();
  let fillRows = TIMELINE_MIN_ROWS;
  if (gridH > hoursHeaderH) {
    fillRows = Math.ceil((gridH - hoursHeaderH) / TIMELINE_ROW_HEIGHT);
  }
  return Math.max(segmentCount, TIMELINE_MIN_ROWS, fillRows);
}

function getTimelineSegmentsForDate(items, dateKey) {
  return getTodosForDate(items, dateKey)
    .map((todo) => getTimelineGanttSegment(todo, dateKey))
    .filter(Boolean)
    .sort((a, b) => a.leftMin - b.leftMin || a.todo.title.localeCompare(b.todo.title));
}

function renderTimelineRows(gantt, segments, dateKey) {
  const tasksInner = gantt.querySelector(".timeline-gantt-tasks-inner");
  const tracksInner = gantt.querySelector(".timeline-gantt-tracks-inner");
  if (!tasksInner || !tracksInner) return;

  const trackWidth = getTimelineTrackWidth();
  const rowCount = getTimelineRowCount(segments.length);
  const nowLine = tracksInner.querySelector(".timeline-gantt-now");

  tasksInner.innerHTML = "";
  tracksInner.innerHTML = "";
  if (nowLine) tracksInner.appendChild(nowLine);

  for (let i = 0; i < rowCount; i++) {
    if (i < segments.length) {
      tasksInner.appendChild(createTimelineGanttTaskRow(segments[i].todo));
      const row = document.createElement("div");
      row.className = "timeline-gantt-track-row";
      row.style.width = `${trackWidth}px`;
      createTimelineHourVLines(row);
      row.appendChild(createTimelineGanttBar(segments[i], dateKey));
      tracksInner.appendChild(row);
    } else {
      tasksInner.appendChild(createEmptyTimelineTaskRow());
      tracksInner.appendChild(createEmptyTimelineTrackRow(trackWidth));
    }
  }

  tracksInner.style.minHeight = `${rowCount * TIMELINE_ROW_HEIGHT}px`;
}

function syncTimelineFillRows(gantt, dateKey) {
  if (!gantt) return;
  const segments = getTimelineSegmentsForDate(getCalendarTodos(), dateKey);
  renderTimelineRows(gantt, segments, dateKey);
}

function createTimelineGanttTaskRow(todo) {
  const cat = CATEGORY_LABELS_KO[todo.category] || "";
  const row = document.createElement("div");
  row.className = "timeline-gantt-task-row";
  row.innerHTML = `
    <div class="timeline-gantt-task-title">${escapeHtml(todo.title)}</div>
    ${cat ? `<div class="timeline-gantt-task-cat">${escapeHtml(cat)}</div>` : ""}`;
  return row;
}

function bindTimelineScrollSync(root) {
  const hoursScroll = root.querySelector(".timeline-gantt-hours-scroll");
  const tracksScroll = root.querySelector(".timeline-gantt-tracks-scroll");
  const tasksScroll = root.querySelector(".timeline-gantt-tasks-scroll");
  let syncing = false;

  const syncX = (source, target) => {
    if (syncing || !source || !target) return;
    syncing = true;
    target.scrollLeft = source.scrollLeft;
    syncing = false;
  };
  const syncY = (source, target) => {
    if (syncing || !source || !target) return;
    syncing = true;
    target.scrollTop = source.scrollTop;
    syncing = false;
  };

  tracksScroll?.addEventListener("scroll", () => {
    syncX(tracksScroll, hoursScroll);
    syncY(tracksScroll, tasksScroll);
  });
  tasksScroll?.addEventListener("scroll", () => syncY(tasksScroll, tracksScroll));
}

function clearTimelineNowTimer() {
  if (timelineNowTimer) {
    clearInterval(timelineNowTimer);
    timelineNowTimer = null;
  }
}

function getNowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
}

function updateTimelineNowLine(gantt, dateKey) {
  if (!gantt || dateKey !== todayKey()) return;
  const nowLine = gantt.querySelector(".timeline-gantt-now");
  if (!nowLine) return;
  nowLine.style.left = `${minutesToLeftPx(getNowMinutes())}px`;
}

function refreshTimelineBarStates(gantt, dateKey) {
  if (!gantt) return;
  const segments = getTimelineSegmentsForDate(getCalendarTodos(), dateKey);
  segments.forEach((seg) => {
    const bar = gantt.querySelector(`.timeline-gantt-bar[data-todo-id="${seg.todo.id}"]`);
    if (bar) applyTimelineBarContent(bar, seg, dateKey);
  });
}

function updateTimelineLiveState(gantt, dateKey) {
  updateTimelineNowLine(gantt, dateKey);
  refreshTimelineBarStates(gantt, dateKey);
}

function scrollTimelineToNow(gantt, dateKey) {
  if (!gantt || dateKey !== todayKey()) return;
  const tracksScroll = gantt.querySelector(".timeline-gantt-tracks-scroll");
  const hoursScroll = gantt.querySelector(".timeline-gantt-hours-scroll");
  if (!tracksScroll) return;

  const nowLeft = minutesToLeftPx(getNowMinutes());
  const targetScroll = Math.max(0, nowLeft - tracksScroll.clientWidth / 2);
  tracksScroll.scrollLeft = targetScroll;
  if (hoursScroll) hoursScroll.scrollLeft = targetScroll;
}

function ensureTimelineNowVisible(gantt, dateKey) {
  requestAnimationFrame(() => {
    scrollTimelineToNow(gantt, dateKey);
    requestAnimationFrame(() => scrollTimelineToNow(gantt, dateKey));
  });
}

function startTimelineNowTicker(gantt, dateKey) {
  clearTimelineNowTimer();
  if (!gantt || dateKey !== todayKey()) return;

  const tick = () => updateTimelineLiveState(gantt, dateKey);
  tick();
  timelineNowTimer = setInterval(tick, 30_000);
}

function renderTimelineCalendar(items) {
  if (!els.calendarGrid) return;
  clearTimelineNowTimer();

  const dateKey = calAnchorKey;
  if (els.calendarTitle) els.calendarTitle.textContent = formatTimelineTitle(dateKey);
  els.weekDayHeaders?.classList.add("hidden");

  const segments = getTimelineSegmentsForDate(items, dateKey);
  const trackWidth = getTimelineTrackWidth();

  els.calendarGrid.innerHTML = "";

  const gantt = document.createElement("div");
  gantt.className = "timeline-gantt";

  const sidebar = document.createElement("div");
  sidebar.className = "timeline-gantt-sidebar";
  const corner = document.createElement("div");
  corner.className = "timeline-gantt-corner";
  corner.textContent = "할일";
  const tasksScroll = document.createElement("div");
  tasksScroll.className = "timeline-gantt-tasks-scroll";
  const tasksInner = document.createElement("div");
  tasksInner.className = "timeline-gantt-tasks-inner";
  tasksScroll.appendChild(tasksInner);
  sidebar.append(corner, tasksScroll);

  const main = document.createElement("div");
  main.className = "timeline-gantt-main";

  const hoursScroll = document.createElement("div");
  hoursScroll.className = "timeline-gantt-hours-scroll";
  const hours = document.createElement("div");
  hours.className = "timeline-gantt-hours";
  hours.style.width = `${trackWidth}px`;
  for (let h = 0; h < TIMELINE_HOURS; h++) {
    const cell = document.createElement("div");
    cell.className = "timeline-gantt-hour";
    cell.textContent = `${String(h).padStart(2, "0")}:00`;
    hours.appendChild(cell);
  }
  hoursScroll.appendChild(hours);

  const tracksScroll = document.createElement("div");
  tracksScroll.className = "timeline-gantt-tracks-scroll";
  const tracksInner = document.createElement("div");
  tracksInner.className = "timeline-gantt-tracks-inner";
  tracksInner.style.width = `${trackWidth}px`;

  if (dateKey === todayKey()) {
    const nowLine = document.createElement("div");
    nowLine.className = "timeline-gantt-now";
    nowLine.style.left = `${minutesToLeftPx(getNowMinutes())}px`;
    tracksInner.appendChild(nowLine);
  }

  tracksScroll.appendChild(tracksInner);
  main.append(hoursScroll, tracksScroll);
  gantt.append(sidebar, main);
  els.calendarGrid.appendChild(gantt);

  renderTimelineRows(gantt, segments, dateKey);
  bindTimelineScrollSync(gantt);

  requestAnimationFrame(() => {
    syncTimelineFillRows(gantt, dateKey);
    requestAnimationFrame(() => {
      syncTimelineFillRows(gantt, dateKey);
      ensureTimelineNowVisible(gantt, dateKey);
      startTimelineNowTicker(gantt, dateKey);
    });
  });
}

function renderCalendarPlaceholder(message) {
  if (!els.calendarGrid) return;
  els.weekDayHeaders?.classList.add("hidden");
  if (els.calendarTitle) els.calendarTitle.textContent = formatDateCompact(calAnchorKey);
  els.calendarGrid.innerHTML = `
    <div class="flex items-center justify-center min-h-[200px] text-sm text-slate-400 font-medium">${escapeHtml(message)}</div>`;
}

function getCalendarTodos() {
  return getFilteredTodos().filter((t) => t.startDate);
}

function setCalMode(mode) {
  calMode = mode;
  els.calModeTabs?.querySelectorAll(".cal-mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.calMode === mode);
  });
  renderCalendar();
}

function updateCalendarScrollMode(mode) {
  const inner = els.calendarScrollInner;
  const wrap = els.calendarScrollWrap;
  if (!inner) return;
  inner.classList.remove("cal-min-week", "cal-min-month", "cal-min-day", "cal-min-timeline");
  wrap?.classList.remove("cal-scroll-week", "cal-scroll-month", "cal-scroll-day", "cal-scroll-timeline");
  if (mode === "week") {
    inner.classList.add("cal-min-week");
    wrap?.classList.add("cal-scroll-week");
  } else if (mode === "month") {
    inner.classList.add("cal-min-month");
    wrap?.classList.add("cal-scroll-month");
  } else if (mode === "day") {
    inner.classList.add("cal-min-day");
    wrap?.classList.add("cal-scroll-day");
  } else if (mode === "timeline") {
    inner.classList.add("cal-min-timeline");
    wrap?.classList.add("cal-scroll-timeline");
  }
}

function renderCalendar() {
  const items = getCalendarTodos();
  const inset = calMode === "day";
  updateCalendarScrollMode(calMode);
  els.calendarGrid?.classList.toggle("cal-grid-inset", inset);
  els.calendarGrid?.classList.toggle("cal-grid-week", calMode === "week");
  els.calendarGrid?.classList.toggle("cal-grid-month", calMode === "month");
  els.calendarGrid?.classList.toggle("cal-grid-timeline", calMode === "timeline");
  els.weekDayHeaders?.classList.toggle("cal-week-headers-inset", calMode === "week");

  if (calMode !== "timeline") clearTimelineNowTimer();

  if (calMode === "week") renderWeekCalendar(items);
  else if (calMode === "month") renderMonthCalendar(items);
  else if (calMode === "day") renderDayCalendar(items);
  else if (calMode === "timeline") renderTimelineCalendar(items);
  else renderCalendarPlaceholder("표시할 보기가 없습니다.");
}

function render() {
  updateStats();
  if (currentView === "list") {
    renderList();
  } else {
    renderCalendar();
  }
}

function setView(view) {
  currentView = view;
  const listActive = view === "list";
  els.listView?.classList.toggle("hidden", !listActive);
  els.completedView?.classList.toggle("hidden", !listActive);
  els.calendarView?.classList.toggle("hidden", listActive);

  els.viewListBtn?.classList.toggle("bg-white", listActive);
  els.viewListBtn?.classList.toggle("shadow-sm", listActive);
  els.viewListBtn?.classList.toggle("text-indigo-600", listActive);
  els.viewListBtn?.classList.toggle("font-semibold", listActive);
  els.viewListBtn?.classList.toggle("text-slate-500", !listActive);
  els.viewListBtn?.classList.toggle("font-medium", !listActive);

  els.viewCalendarBtn?.classList.toggle("bg-white", !listActive);
  els.viewCalendarBtn?.classList.toggle("shadow-sm", !listActive);
  els.viewCalendarBtn?.classList.toggle("text-indigo-600", !listActive);
  els.viewCalendarBtn?.classList.toggle("font-semibold", !listActive);
  els.viewCalendarBtn?.classList.toggle("text-slate-500", listActive);
  els.viewCalendarBtn?.classList.toggle("font-medium", listActive);

  if (listActive) clearTimelineNowTimer();
  render();
  if (view === "calendar" && calMode === "week") {
    requestAnimationFrame(() => {
      const weekEl = els.calendarGrid?.querySelector(".cal-week-fill");
      if (weekEl) syncWeekCalendarLayout(weekEl, Number(weekEl.dataset.lanes) || 1);
    });
  }
}

function updateCategoryButtons() {
  els.filterNav?.querySelectorAll(".category-btn").forEach((btn) => {
    const active = btn.dataset.category === currentCategory;
    btn.classList.toggle("bg-indigo-50", active);
    btn.classList.toggle("text-indigo-700", active);
    btn.classList.toggle("text-slate-600", !active);
  });
}

function setCategory(category) {
  currentCategory = currentCategory === category ? null : category;
  updateCategoryButtons();
  updateStatCardButtons();
  render();
}

function updateStatCardButtons() {
  document.querySelectorAll(".stat-card-btn").forEach((btn) => {
    const active = btn.dataset.filter === currentFilter;
    btn.classList.toggle("border-indigo-300", active);
    btn.classList.toggle("bg-indigo-50", active);
    btn.classList.toggle("ring-2", active);
    btn.classList.toggle("ring-indigo-200", active);
  });
}

function setFilter(filter) {
  currentFilter = filter;
  if (filter !== "all") {
    currentCategory = null;
    updateCategoryButtons();
  }
  els.filterNav?.querySelectorAll(".filter-btn").forEach((btn) => {
    const active = btn.dataset.filter === filter;
    btn.classList.toggle("bg-indigo-50", active);
    btn.classList.toggle("text-indigo-700", active);
    btn.classList.toggle("text-slate-600", !active);
  });
  updateStatCardButtons();
  render();
}

function openModal(id = null) {
  editingId = id;
  const todo = id ? todos.find((t) => t.id === id) : null;

  if (els.modalTitle) {
    els.modalTitle.textContent = todo ? "할 일 수정" : "새로운 할 일";
  }

  els.form?.reset();
  if (els.inputStartDate) els.inputStartDate.value = todo?.startDate || todayKey();
  if (els.inputEndDate) els.inputEndDate.value = todo?.endDate || "";
  if (els.inputTitle) els.inputTitle.value = todo?.title || "";
  if (els.inputStartTime) els.inputStartTime.value = todo?.startTime || "";
  if (els.inputEndTime) els.inputEndTime.value = todo?.endTime || "";
  if (els.inputPriority) els.inputPriority.value = todo?.priority || "medium";
  if (els.inputCategory) els.inputCategory.value = todo?.category || "personal";
  if (els.inputMemo) els.inputMemo.value = todo?.memo || "";

  els.modal?.classList.remove("hidden");
  els.inputTitle?.focus();
}

function closeModal() {
  editingId = null;
  els.modal?.classList.add("hidden");
}

function handleSubmit(e) {
  e.preventDefault();
  const startDate = els.inputStartDate?.value || "";
  const endDate = els.inputEndDate?.value || startDate;
  const data = {
    title: els.inputTitle?.value.trim() || "",
    startDate,
    endDate,
    startTime: els.inputStartTime?.value || "",
    endTime: els.inputEndTime?.value || "",
    priority: els.inputPriority?.value || "medium",
    category: els.inputCategory?.value || "personal",
    memo: els.inputMemo?.value.trim() || "",
  };

  if (!data.title) return;

  if (startDate && endDate < startDate) {
    alert("종료일은 시작일보다 빠를 수 없습니다.");
    els.inputEndDate?.focus();
    return;
  }

  saveTodoToFirebase(data).then((ok) => {
    if (ok) closeModal();
  });
}

// Events
els.menuBtn?.addEventListener("click", () => {
  els.sidebar?.classList.toggle("hidden");
  els.sidebar?.classList.toggle("flex");
  els.sidebar?.classList.toggle("fixed");
  els.sidebar?.classList.toggle("inset-y-0");
  els.sidebar?.classList.toggle("left-0");
  els.sidebarBackdrop?.classList.toggle("hidden");
});

els.sidebarBackdrop?.addEventListener("click", () => {
  els.sidebar?.classList.add("hidden");
  els.sidebar?.classList.remove("flex", "fixed", "inset-y-0", "left-0");
  els.sidebarBackdrop?.classList.add("hidden");
});

els.filterNav?.addEventListener("click", (e) => {
  const filterBtn = e.target.closest(".filter-btn");
  if (filterBtn?.dataset.filter) {
    setFilter(filterBtn.dataset.filter);
    return;
  }
  const catBtn = e.target.closest(".category-btn");
  if (catBtn?.dataset.category) {
    setCategory(catBtn.dataset.category);
  }
});

document.querySelectorAll(".stat-card-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const filter = btn.dataset.filter;
    if (!filter) return;
    setView("list");
    setFilter(filter);
  });
});

els.statViewCompletedBtn?.addEventListener("click", () => {
  setView("list");
  setFilter("completed");
});

els.searchInput?.addEventListener("input", render);
els.addBtn?.addEventListener("click", () => openModal());
els.closeModalBtn?.addEventListener("click", closeModal);
els.cancelModalBtn?.addEventListener("click", closeModal);
els.form?.addEventListener("submit", handleSubmit);
els.viewListBtn?.addEventListener("click", () => setView("list"));
els.viewCalendarBtn?.addEventListener("click", () => setView("calendar"));

els.calPrev?.addEventListener("click", () => {
  if (calMode === "month") shiftCalAnchorMonths(-1);
  else if (calMode === "week") shiftCalAnchorDays(-7);
  else shiftCalAnchorDays(-1);
  renderCalendar();
});

els.calNext?.addEventListener("click", () => {
  if (calMode === "month") shiftCalAnchorMonths(1);
  else if (calMode === "week") shiftCalAnchorDays(7);
  else shiftCalAnchorDays(1);
  renderCalendar();
});

els.calModeTabs?.addEventListener("click", (e) => {
  const btn = e.target.closest(".cal-mode-btn");
  if (btn?.dataset.calMode) setCalMode(btn.dataset.calMode);
});

els.modal?.addEventListener("click", (e) => {
  if (e.target === els.modal) closeModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

window.addEventListener("resize", () => {
  if (currentView !== "calendar") return;
  if (calMode === "week") {
    const weekEl = els.calendarGrid?.querySelector(".cal-week-fill");
    if (weekEl) syncWeekCalendarLayout(weekEl, Number(weekEl.dataset.lanes) || 1);
  } else if (calMode === "timeline") {
    const gantt = els.calendarGrid?.querySelector(".timeline-gantt");
    if (gantt) syncTimelineFillRows(gantt, calAnchorKey);
  }
});

calAnchorKey = todayKey();
initFirebase().then(() => {
  setView("list");
  setFilter("all");
});
