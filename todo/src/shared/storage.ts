import { normalizeTodoItems } from "./domain.ts";
import { sanitizeSettings } from "./settings.ts";

const TODO_ITEMS_KEY = "todoUnfinishedItems";
const TODO_SETTINGS_KEY = "todoSettings";

function storageGet(keys: string | string[]): Promise<Record<string, any>> {
  return new Promise<Record<string, any>>((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(result);
    });
  });
}

function storageSet(value: Record<string, any>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    chrome.storage.local.set(value, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}

export async function loadTodoItems() {
  const result = await storageGet(TODO_ITEMS_KEY);
  return normalizeTodoItems(result[TODO_ITEMS_KEY]);
}

export async function saveTodoItems(items: unknown) {
  const normalizedItems = normalizeTodoItems(items);
  await storageSet({ [TODO_ITEMS_KEY]: normalizedItems });
  return normalizedItems;
}

export async function loadSettings() {
  const result = await storageGet(TODO_SETTINGS_KEY);
  return sanitizeSettings(result[TODO_SETTINGS_KEY]);
}

export async function saveSettings(patch: unknown) {
  const current = await loadSettings();
  const settings = sanitizeSettings({ ...current, ...(patch && typeof patch === "object" ? patch : {}) });
  await storageSet({ [TODO_SETTINGS_KEY]: settings });
  return settings;
}

export async function loadTodoState() {
  const result = await storageGet([TODO_ITEMS_KEY, TODO_SETTINGS_KEY]);
  return {
    items: normalizeTodoItems(result[TODO_ITEMS_KEY]),
    settings: sanitizeSettings(result[TODO_SETTINGS_KEY])
  };
}

export async function saveTodoStatePatch(patch: unknown) {
  const source = patch && typeof patch === "object" ? patch as Record<string, any> : {};
  const updates: Record<string, any> = {};
  if (Object.hasOwn(source, "items")) updates[TODO_ITEMS_KEY] = normalizeTodoItems(source.items);
  if (Object.hasOwn(source, "settings")) {
    const current = await loadSettings();
    updates[TODO_SETTINGS_KEY] = sanitizeSettings({
      ...current,
      ...(source.settings && typeof source.settings === "object" ? source.settings : {})
    });
  }
  if (Object.keys(updates).length) await storageSet(updates);
  return loadTodoState();
}
