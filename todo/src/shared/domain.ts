export const DEFAULT_COLOR_PRESETS = ["#bfdbfe", "#fef3c7", "#dcfce7", "#dbeafe", "#fce7f3", "#ede9fe"];

export type TodoItem = {
  id: string;
  text: string;
  color: string;
  reminderAt: string;
  reminded: boolean;
  createdAt: string;
  updatedAt: string;
  [key: string]: any;
};

export type CompletedRecord = {
  text: string;
  completedAt: string;
};

export type CompletedData = {
  version: number;
  completed: CompletedRecord[];
};

type TodoOptions = {
  id?: string;
  color?: string;
  reminderAt?: unknown;
  reminded?: boolean;
  [key: string]: any;
};

type TodoSettingsLike = {
  colorPresets?: unknown;
  [key: string]: any;
};

type TodoMutationOptions = {
  position?: "start" | "end";
  [key: string]: any;
};

function normalizeIsoDate(value: unknown): string {
  if (!value) return "";
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function normalizeNow(now: unknown): string {
  return normalizeIsoDate(now) || new Date().toISOString();
}

function createId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function updateTodo(items: unknown, id: string, updater: (item: TodoItem) => TodoItem): TodoItem[] {
  const source = normalizeTodoItems(items);
  return source.map((item) => (item.id === id ? updater(item) : item));
}

export function createTodoItem(text: unknown, options: TodoOptions = {}, now: unknown = new Date().toISOString()): TodoItem {
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

export function normalizeTodoItems(input: unknown): TodoItem[] {
  const source = Array.isArray(input) ? input as Array<Record<string, any>> : [];
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

export function nextTodoColor(items: unknown, settings: TodoSettingsLike = {}, position: "start" | "end" = "end"): string {
  const normalizedItems = normalizeTodoItems(items);
  const colorPresets = Array.isArray(settings.colorPresets) && settings.colorPresets.length
    ? settings.colorPresets
    : DEFAULT_COLOR_PRESETS;
  const previousItem = position === "start" ? normalizedItems[0] : normalizedItems.at(-1);
  const previousColorIndex = colorPresets.indexOf(previousItem?.color);
  return previousColorIndex < 0
    ? colorPresets[0]
    : colorPresets[(previousColorIndex + 1) % colorPresets.length];
}

export function addTodoItem(
  items: unknown,
  text: unknown,
  settings: TodoSettingsLike = {},
  now: unknown = new Date().toISOString(),
  options: TodoMutationOptions = {}
): TodoItem[] {
  const trimmedText = String(text || "").trim();
  if (!trimmedText) return normalizeTodoItems(items);
  const normalizedItems = normalizeTodoItems(items);
  const position = options.position === "start" ? "start" : "end";
  const newItem = createTodoItem(trimmedText, { color: nextTodoColor(normalizedItems, settings, position) }, now);
  return position === "start" ? [newItem, ...normalizedItems] : [...normalizedItems, newItem];
}

export function updateTodoText(items: unknown, id: string, text: unknown, now: unknown = new Date().toISOString()): TodoItem[] {
  const trimmedText = String(text || "").trim();
  if (!trimmedText) return normalizeTodoItems(items);
  return updateTodo(items, id, (item) => ({ ...item, text: trimmedText, updatedAt: normalizeNow(now) }));
}

export function updateTodoColor(items: unknown, id: string, color: string, settings: TodoSettingsLike = {}, now: unknown = new Date().toISOString()): TodoItem[] {
  const presets = Array.isArray(settings.colorPresets) ? settings.colorPresets : [];
  if (!presets.includes(color)) return normalizeTodoItems(items);
  return updateTodo(items, id, (item) => ({ ...item, color, updatedAt: normalizeNow(now) }));
}

export function setTodoReminder(items: unknown, id: string, reminderAt: unknown, now: unknown = new Date().toISOString()): TodoItem[] {
  const normalizedReminderAt = normalizeIsoDate(reminderAt);
  if (!normalizedReminderAt) return normalizeTodoItems(items);
  return updateTodo(items, id, (item) => ({
    ...item,
    reminderAt: normalizedReminderAt,
    reminded: false,
    updatedAt: normalizeNow(now)
  }));
}

export function clearTodoReminder(items: unknown, id: string, now: unknown = new Date().toISOString()): TodoItem[] {
  return updateTodo(items, id, (item) => ({
    ...item,
    reminderAt: "",
    reminded: false,
    updatedAt: normalizeNow(now)
  }));
}

export function markTodoReminded(items: unknown, id: string, now: unknown = new Date().toISOString()): TodoItem[] {
  return updateTodo(items, id, (item) => {
    if (!item.reminderAt) return item;
    return { ...item, reminded: true, updatedAt: normalizeNow(now) };
  });
}

export function deleteTodoItem(items: unknown, id: string): TodoItem[] {
  return normalizeTodoItems(items).filter((item) => item.id !== id);
}

export function reorderTodoItems(items: unknown, sourceId: string, targetId: string, position: "before" | "after" = "before"): TodoItem[] {
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

export function createEmptyCompletedData(): CompletedData {
  return { version: 1, completed: [] };
}

export function normalizeCompletedData(input: unknown): CompletedData {
  const source = input && typeof input === "object" ? input as { completed?: unknown } : {};
  const completed = Array.isArray(source.completed) ? source.completed as Array<Record<string, any>> : [];
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

export function appendCompletedRecord(data: unknown, text: unknown, completedAt: unknown = new Date().toISOString()): CompletedData {
  const source = normalizeCompletedData(data);
  const record = {
    text: String(text || "").trim(),
    completedAt: normalizeIsoDate(completedAt)
  };
  if (!record.text || !record.completedAt) return source;
  return { ...source, completed: [...source.completed, record] };
}

export function updateCompletedRecordText(data: unknown, recordIndex: number, text: unknown): CompletedData {
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

export function deleteCompletedRecord(data: unknown, recordIndex: number): CompletedData {
  const source = normalizeCompletedData(data);
  if (!Number.isInteger(recordIndex) || recordIndex < 0 || recordIndex >= source.completed.length) return source;
  return { ...source, completed: source.completed.filter((_, index) => index !== recordIndex) };
}

export function searchCompletedRecords(data: unknown, query: unknown): Array<CompletedRecord & { recordIndex: number }> {
  const source = normalizeCompletedData(data);
  const normalizedQuery = String(query || "").trim().toLowerCase();
  return source.completed
    .map((record, recordIndex) => ({ ...record, recordIndex }))
    .filter((record) => record.text.toLowerCase().includes(normalizedQuery));
}
