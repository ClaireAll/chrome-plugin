import { normalizeTodoItems } from "./domain.js";
import { COMPLETION_CATS_CONFLICT_MESSAGE, SETTINGS_CONFLICT_MESSAGE, sanitizeSettings } from "./settings.js";

const TODO_ITEMS_KEY = "todoUnfinishedItems";
const TODO_SETTINGS_KEY = "todoSettings";

function storageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(result);
    });
  });
}

function storageSet(value) {
  return new Promise((resolve, reject) => {
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

export async function saveTodoItems(items) {
  const normalizedItems = normalizeTodoItems(items);
  await storageSet({ [TODO_ITEMS_KEY]: normalizedItems });
  return normalizedItems;
}

export async function loadSettings() {
  const result = await storageGet(TODO_SETTINGS_KEY);
  return sanitizeSettings(result[TODO_SETTINGS_KEY]);
}

export async function saveSettings(patch) {
  const current = await loadSettings();
  const source = patch && typeof patch === "object" ? patch : {};
  for (const key of ["colorPresets", "recurringTasks"]) {
    if (!Object.hasOwn(source, key) || !Object.hasOwn(source.expectedSettings || {}, key)) continue;
    const expected = source.expectedSettings[key];
    if (!Array.isArray(expected)
      || JSON.stringify(current[key]) !== JSON.stringify(sanitizeSettings({ [key]: expected })[key])) {
      throw new Error(SETTINGS_CONFLICT_MESSAGE);
    }
  }
  const updatesCompletionCats = Object.hasOwn(source, "completionCats");
  if (updatesCompletionCats && source.completionCatsRevision !== current.completionCatsRevision) {
    throw new Error(COMPLETION_CATS_CONFLICT_MESSAGE);
  }
  const settings = sanitizeSettings({
    ...current,
    ...source,
    completionCatsRevision: current.completionCatsRevision + (updatesCompletionCats ? 1 : 0)
  });
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

export async function saveTodoStatePatch(patch) {
  const source = patch && typeof patch === "object" ? patch : {};
  const updates = {};
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
