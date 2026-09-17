export const DEFAULT_COLOR_PRESETS = ["#ffffff", "#fef3c7", "#dcfce7", "#dbeafe", "#fce7f3", "#ede9fe"];
const TIMER_STATES = new Set(["idle", "running", "paused"]);

function normalizeIsoDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function normalizeNow(now) {
  return normalizeIsoDate(now) || new Date().toISOString();
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function updateTodo(items, id, updater) {
  const source = normalizeTodoItems(items);
  return source.map((item) => (item.id === id ? updater(item) : item));
}

export function createTodoItem(text, options = {}, now = new Date().toISOString()) {
  const trimmedText = String(text || "").trim();
  const createdAt = normalizeNow(now);
  return {
    id: options.id || createId(),
    text: trimmedText,
    color: options.color || DEFAULT_COLOR_PRESETS[0],
    reminderAt: normalizeIsoDate(options.reminderAt),
    reminded: Boolean(options.reminded) && Boolean(normalizeIsoDate(options.reminderAt)),
    timerState: "idle",
    timerElapsedMs: 0,
    timerStartedAt: "",
    timerLastTickAt: "",
    timerFirstStartedAt: "",
    timerFocused: false,
    createdAt,
    updatedAt: createdAt
  };
}

export function normalizeTodoItems(input) {
  const source = Array.isArray(input) ? input : [];
  const normalized = source
    .map((item) => {
      const reminderAt = normalizeIsoDate(item?.reminderAt);
      const validCreatedAt = normalizeIsoDate(item?.createdAt);
      const validUpdatedAt = normalizeIsoDate(item?.updatedAt);
      // Invalid createdAt falls back to valid updatedAt, then one shared current time; updatedAt mirrors that order.
      const fallbackDate = new Date().toISOString();
      const createdAt = validCreatedAt || validUpdatedAt || fallbackDate;
      const updatedAt = validUpdatedAt || validCreatedAt || fallbackDate;
      return {
        ...item,
        id: String(item?.id || createId()),
        text: String(item?.text || "").trim(),
        color: String(item?.color || DEFAULT_COLOR_PRESETS[0]),
        reminderAt,
        reminded: Boolean(item?.reminded) && Boolean(reminderAt),
        ...normalizeTodoTimerFields(item),
        createdAt,
        updatedAt
      };
    })
    .filter((item) => item.text);
  return normalizeTodoTimerFocusList(normalized);
}

export function addTodoItem(items, text, settings = {}, now = new Date().toISOString()) {
  const trimmedText = String(text || "").trim();
  const source = normalizeTodoItems(items);
  if (!trimmedText) return source;
  return [...source, createTodoItem(trimmedText, {
    color: nextTodoColor(source, settings)
  }, now)];
}

function nextTodoColor(items, settings = {}) {
  const presets = Array.isArray(settings.colorPresets) && settings.colorPresets.length ? settings.colorPresets : DEFAULT_COLOR_PRESETS;
  const lastColor = items[items.length - 1]?.color;
  if (!lastColor) return presets[0];
  const currentIndex = presets.findIndex((color) => color.toLowerCase() === String(lastColor).toLowerCase());
  return presets[currentIndex < 0 ? 0 : (currentIndex + 1) % presets.length];
}

export function updateTodoText(items, id, text, now = new Date().toISOString()) {
  const trimmedText = String(text || "").trim();
  if (!trimmedText) return normalizeTodoItems(items);
  return updateTodo(items, id, (item) => ({ ...item, text: trimmedText, updatedAt: normalizeNow(now) }));
}

export function updateTodoColor(items, id, color, settings = {}, now = new Date().toISOString()) {
  const presets = Array.isArray(settings.colorPresets) ? settings.colorPresets : [];
  if (!presets.includes(color)) return normalizeTodoItems(items);
  return updateTodo(items, id, (item) => ({ ...item, color, updatedAt: normalizeNow(now) }));
}

export function setTodoReminder(items, id, reminderAt, now = new Date().toISOString()) {
  const normalizedReminderAt = normalizeIsoDate(reminderAt);
  if (!normalizedReminderAt) return normalizeTodoItems(items);
  return updateTodo(items, id, (item) => ({
    ...item,
    reminderAt: normalizedReminderAt,
    reminded: false,
    updatedAt: normalizeNow(now)
  }));
}

export function clearTodoReminder(items, id, now = new Date().toISOString()) {
  return updateTodo(items, id, (item) => ({
    ...item,
    reminderAt: "",
    reminded: false,
    updatedAt: normalizeNow(now)
  }));
}

export function markTodoReminded(items, id, now = new Date().toISOString()) {
  return updateTodo(items, id, (item) => {
    if (!item.reminderAt) return item;
    return { ...item, reminded: true, updatedAt: normalizeNow(now) };
  });
}

// 获取待办在指定时刻的累计计时时长。
export function getTodoTimerElapsedMs(item, now = new Date().toISOString()) {
  const elapsedMs = normalizeDurationMs(item?.timerElapsedMs);
  if (item?.timerState !== "running") return elapsedMs;
  const startedAt = Date.parse(item?.timerStartedAt);
  const nowTime = Date.parse(now);
  if (!Number.isFinite(startedAt) || !Number.isFinite(nowTime)) return elapsedMs;
  return Math.max(0, Math.round(elapsedMs + nowTime - startedAt));
}

// 切换单条待办计时，并自动暂停其它正在计时的待办。
export function toggleTodoTimer(items, id, now = new Date().toISOString()) {
  const source = normalizeTodoItems(items);
  const nowIso = normalizeNow(now);
  const target = source.find((item) => item.id === id);
  if (!target) return source;
  const targetIsRunning = target.timerState === "running";

  return normalizeTodoTimerFocusList(source.map((item) => (
    item.id === id
      ? targetIsRunning ? pauseTodoTimerItem(item, nowIso, item.timerFocused) : startTodoTimerItem(item, nowIso)
      : item
  )));
}

// 切换当前悬浮球关注的计时任务。
export function toggleFocusedTodoTimer(items, now = new Date().toISOString()) {
  const source = normalizeTodoItems(items);
  const nowIso = normalizeNow(now);
  if (source.some((item) => item.timerState === "running")) {
    return normalizeTodoTimerFocusList(source.map((item) => (
      item.timerState === "running" ? pauseTodoTimerItem(item, nowIso, item.timerFocused) : item
    )));
  }
  if (!source.some((item) => item.timerState === "paused")) return source;
  return normalizeTodoTimerFocusList(source.map((item) => (
    item.timerState === "paused" ? startTodoTimerItem(item, nowIso) : item
  )));
}

// 更新正在运行计时器的最后心跳时间，用于浏览器重启时恢复为暂停态。
export function touchRunningTodoTimer(items, id, now = new Date().toISOString()) {
  const source = normalizeTodoItems(items);
  const nowIso = normalizeNow(now);
  const targetId = String(id || "").trim();
  if (!targetId && !source.some((item) => item.timerState === "running")) return source;
  return normalizeTodoTimerFocusList(source.map((item) => {
    if (item.timerState !== "running") return item;
    if (targetId && item.id !== targetId) return item;
    return { ...item, timerLastTickAt: nowIso, updatedAt: nowIso };
  }));
}

// 暂停所有运行中的计时器，重启浏览器时使用最后心跳避免把关闭时间计入统计。
export function pauseRunningTodoTimers(items, now = new Date().toISOString(), options = {}) {
  const source = normalizeTodoItems(items);
  const nowIso = normalizeNow(now);
  return normalizeTodoTimerFocusList(source.map((item) => {
    if (item.timerState !== "running") return item;
    const pausedAt = options.useLastTick ? item.timerLastTickAt || item.timerStartedAt || nowIso : nowIso;
    return pauseTodoTimerItem(item, pausedAt, item.timerFocused);
  }));
}

export function deleteTodoItem(items, id) {
  return normalizeTodoItems(items).filter((item) => item.id !== id);
}

export function reorderTodoItems(items, sourceId, targetId, position = "before") {
  const source = normalizeTodoItems(items);
  const sourceIndex = source.findIndex((item) => item.id === sourceId);
  const targetIndex = source.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceId === targetId) return source;

  const [moved] = source.splice(sourceIndex, 1);
  const adjustedTargetIndex = source.findIndex((item) => item.id === targetId);
  const insertIndex = position === "after" ? adjustedTargetIndex + 1 : adjustedTargetIndex;
  source.splice(insertIndex, 0, moved);
  return source;
}

export function createEmptyCompletedData() {
  return { version: 1, completed: [] };
}

export function normalizeCompletedData(input) {
  const source = input && typeof input === "object" ? input : {};
  const completed = Array.isArray(source.completed) ? source.completed : [];
  return {
    version: 1,
    completed: completed
      .map((record) => normalizeCompletedRecord(record))
      .filter((record) => record.text && record.completedAt)
  };
}

export function appendCompletedRecord(data, recordOrText, completedAt = new Date().toISOString(), durationMs = null) {
  const source = normalizeCompletedData(data);
  const record = normalizeCompletedRecord(recordOrText, completedAt, durationMs);
  if (!record.text || !record.completedAt) return source;
  return { ...source, completed: [...source.completed, record] };
}

export function updateCompletedRecordText(data, recordIndex, text) {
  const source = normalizeCompletedData(data);
  const trimmedText = String(text || "").trim();
  if (!Number.isInteger(recordIndex) || recordIndex < 0 || recordIndex >= source.completed.length || !trimmedText) {
    return source;
  }
  return {
    ...source,
    completed: source.completed.map((record, index) => index === recordIndex ? { ...record, text: trimmedText } : record)
  };
}

export function deleteCompletedRecord(data, recordIndex) {
  const source = normalizeCompletedData(data);
  if (!Number.isInteger(recordIndex) || recordIndex < 0 || recordIndex >= source.completed.length) return source;
  return { ...source, completed: source.completed.filter((_, index) => index !== recordIndex) };
}

export function searchCompletedRecords(data, query) {
  const source = normalizeCompletedData(data);
  const normalizedQuery = String(query || "").trim().toLowerCase();
  return source.completed
    .map((record, recordIndex) => ({ ...record, recordIndex }))
    .filter((record) => record.text.toLowerCase().includes(normalizedQuery));
}

// 标准化待办计时字段，避免旧数据或坏数据影响渲染和统计。
function normalizeTodoTimerFields(item) {
  const timerElapsedMs = normalizeDurationMs(item?.timerElapsedMs);
  const requestedState = TIMER_STATES.has(item?.timerState) ? item.timerState : "idle";
  const timerStartedAt = normalizeIsoDate(item?.timerStartedAt);
  const timerLastTickAt = normalizeIsoDate(item?.timerLastTickAt);
  const timerFirstStartedAt = normalizeIsoDate(item?.timerFirstStartedAt);
  const timerState = requestedState === "running" && timerStartedAt
    ? "running"
    : requestedState === "paused"
      ? "paused"
      : "idle";
  const timerOrderAt = timerState === "idle"
    ? ""
    : timerFirstStartedAt || timerStartedAt || timerLastTickAt || normalizeIsoDate(item?.updatedAt) || normalizeIsoDate(item?.createdAt);
  return {
    timerState,
    timerElapsedMs,
    timerStartedAt: timerState === "running" ? timerStartedAt : "",
    timerLastTickAt: timerState === "running" ? timerLastTickAt || timerStartedAt : "",
    timerFirstStartedAt: timerOrderAt,
    timerFocused: timerState !== "idle" && Boolean(item?.timerFocused)
  };
}

// 保证同一批待办里只有一个计时任务处于悬浮球关注态。
function normalizeTodoTimerFocus(item, index, items) {
  const activeIndex = findEarliestTimerIndex(items);
  return {
    ...item,
    timerFocused: activeIndex === index && item.timerState !== "idle"
  };
}

// 重新计算整组待办里由浮球展示的最早计时任务。
function normalizeTodoTimerFocusList(items) {
  return items.map((item, index, source) => normalizeTodoTimerFocus(item, index, source));
}

// 找到所有运行或暂停任务里首次开始时间最早的一条。
function findEarliestTimerIndex(items) {
  let activeIndex = -1;
  let activeTime = Number.POSITIVE_INFINITY;
  items.forEach((item, index) => {
    if (item.timerState === "idle") return;
    const time = timerFocusTime(item);
    if (time < activeTime) {
      activeIndex = index;
      activeTime = time;
    }
  });
  return activeIndex;
}

// 生成稳定的计时排序时间，兼容旧数据里没有首次开始时间的情况。
function timerFocusTime(item) {
  const value = Date.parse(item.timerFirstStartedAt || item.timerStartedAt || item.timerLastTickAt || item.updatedAt || item.createdAt);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

// 将待办切换为运行态，并把当前任务设为悬浮球关注项。
function startTodoTimerItem(item, now) {
  return {
    ...item,
    timerState: "running",
    timerStartedAt: now,
    timerLastTickAt: now,
    timerFirstStartedAt: item.timerFirstStartedAt || now,
    timerFocused: true,
    updatedAt: now
  };
}

// 将待办切换为暂停态，同时结算本轮运行时长。
function pauseTodoTimerItem(item, now, focused) {
  return {
    ...item,
    timerState: "paused",
    timerElapsedMs: getTodoTimerElapsedMs(item, now),
    timerStartedAt: "",
    timerLastTickAt: "",
    timerFirstStartedAt: item.timerFirstStartedAt || item.timerStartedAt || now,
    timerFocused: focused,
    updatedAt: now
  };
}

// 标准化毫秒时长，只保留非负整数。
function normalizeDurationMs(value) {
  const durationMs = Number(value);
  return Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs) : 0;
}

// 标准化完成记录，并仅在存在有效计时时写入 durationMs。
function normalizeCompletedRecord(recordOrText, completedAt = new Date().toISOString(), durationMs = null) {
  const source = recordOrText && typeof recordOrText === "object" ? recordOrText : {
    text: recordOrText,
    completedAt,
    durationMs
  };
  const normalizedDurationMs = normalizeDurationMs(source.durationMs);
  return {
    text: String(source.text || "").trim(),
    completedAt: normalizeIsoDate(source.completedAt || completedAt),
    ...(normalizedDurationMs > 0 ? { durationMs: normalizedDurationMs } : {})
  };
}
