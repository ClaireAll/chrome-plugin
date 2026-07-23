export const DEFAULT_COLOR_PRESETS = ["#ffffff", "#fef3c7", "#dcfce7", "#dbeafe", "#fce7f3", "#ede9fe"];

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
    createdAt,
    updatedAt: createdAt
  };
}

export function normalizeTodoItems(input) {
  const source = Array.isArray(input) ? input : [];
  return source
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
        createdAt,
        updatedAt
      };
    })
    .filter((item) => item.text);
}

export function addTodoItem(items, text, settings = {}, now = new Date().toISOString()) {
  const trimmedText = String(text || "").trim();
  if (!trimmedText) return normalizeTodoItems(items);
  return [...normalizeTodoItems(items), createTodoItem(trimmedText, {
    color: settings.defaultColor || DEFAULT_COLOR_PRESETS[0]
  }, now)];
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
      .map((record) => ({
        text: String(record?.text || "").trim(),
        completedAt: normalizeIsoDate(record?.completedAt)
      }))
      .filter((record) => record.text && record.completedAt)
  };
}

export function appendCompletedRecord(data, text, completedAt = new Date().toISOString()) {
  const source = normalizeCompletedData(data);
  const record = {
    text: String(text || "").trim(),
    completedAt: normalizeIsoDate(completedAt)
  };
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
