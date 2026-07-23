import {
  addTodoItem,
  clearTodoReminder,
  deleteTodoItem,
  markTodoReminded,
  reorderTodoItems,
  setTodoReminder,
  updateTodoColor,
  updateTodoText
} from "../shared/domain.js";
import {
  createCompletedJsonFile,
  pickCompletedJsonFile,
  requestCompletedFilePermission
} from "../shared/completed-file-store.js";
import * as completedDataLocation from "../shared/data-location.js";
import { failure, MESSAGE_TYPES, success } from "../shared/messages.js";
import { alarmNameForTodo, isReminderOnTime, todoIdFromAlarmName } from "../shared/reminder-schedule.js";
import { loadTodoItems, loadTodoState, saveSettings, saveTodoItems } from "../shared/storage.js";

let completedStoreOverride = null;

if (globalThis.chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender)
      .then(sendResponse)
      .catch((error) => sendResponse(failure("runtime_error", error?.message || "Operation failed")));
    return true;
  });
}

if (globalThis.chrome?.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    handleAlarm(alarm).catch(() => {});
  });
}

if (globalThis.chrome?.notifications?.onClicked) {
  chrome.notifications.onClicked.addListener(() => {});
}

export function __setCompletedStoreForTest(store) {
  completedStoreOverride = store;
}

export async function handleMessage(message = {}, sender) {
  const payload = message.payload || {};

  switch (message.type) {
    case MESSAGE_TYPES.GET_STATE: {
      const state = await loadTodoState();
      return success({ ...state, completedStatus: await completedStore().getCompletedStatus() });
    }
    case MESSAGE_TYPES.ADD_TODO:
      return saveItems(addTodoItem(await loadTodoItems(), payload.text, await loadSettingsForTodo()));
    case MESSAGE_TYPES.UPDATE_TODO_TEXT:
      return saveItems(updateTodoText(await loadTodoItems(), payload.id, payload.text));
    case MESSAGE_TYPES.UPDATE_TODO_COLOR:
      return saveItems(updateTodoColor(await loadTodoItems(), payload.id, payload.color, await loadSettingsForTodo()));
    case MESSAGE_TYPES.UPDATE_TODO_REMINDER:
      return updateReminder(payload);
    case MESSAGE_TYPES.CLEAR_TODO_REMINDER:
      return clearReminder(payload.id);
    case MESSAGE_TYPES.DELETE_TODO:
      return deleteTodo(payload.id);
    case MESSAGE_TYPES.REORDER_TODOS:
      return saveItems(reorderTodoItems(await loadTodoItems(), payload.sourceId, payload.targetId, payload.position));
    case MESSAGE_TYPES.COMPLETE_TODO:
      return completeTodo(payload);
    case MESSAGE_TYPES.UPDATE_SETTINGS:
      return success({ settings: await saveSettings(payload) });
    case MESSAGE_TYPES.OPEN_OPTIONS:
      await chrome.runtime.openOptionsPage();
      return success();
    case MESSAGE_TYPES.GET_COMPLETED_STATUS:
      return completedStore().getCompletedStatus();
    case MESSAGE_TYPES.PICK_COMPLETED_FILE:
      return pickCompletedJsonFile(payload);
    case MESSAGE_TYPES.CREATE_COMPLETED_FILE:
      return createCompletedJsonFile(payload);
    case MESSAGE_TYPES.REQUEST_COMPLETED_FILE_PERMISSION:
      return requestCompletedFilePermission(payload.mode);
    case MESSAGE_TYPES.READ_COMPLETED_DATA:
      return completedStore().readCompletedData();
    case MESSAGE_TYPES.WRITE_COMPLETED_DATA:
      return completedStore().writeCompletedData(payload.data);
    case MESSAGE_TYPES.UPDATE_COMPLETED_RECORD:
      return completedStore().updateCompletedRecord(payload.recordIndex, payload.text);
    case MESSAGE_TYPES.DELETE_COMPLETED_RECORD:
      return completedStore().deleteCompletedRecordAt(payload.recordIndex);
    default:
      return failure("unknown_message", "Unsupported todo message");
  }
}

export async function handleAlarm(alarm, handledAt = new Date().toISOString()) {
  const id = todoIdFromAlarmName(alarm?.name);
  if (!id) return;

  const items = await loadTodoItems();
  const item = items.find((todo) => todo.id === id);
  if (!item?.reminderAt || item.reminded) return;

  const updatedItems = markTodoReminded(items, id, handledAt);
  await saveTodoItems(updatedItems);
  if (!isReminderOnTime(item.reminderAt, handledAt)) return;

  await chrome.notifications.create(alarm.name, {
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title: "Todo reminder",
    message: item.text
  });
}

function completedStore() {
  return completedStoreOverride || completedDataLocation;
}

async function loadSettingsForTodo() {
  return (await loadTodoState()).settings;
}

async function saveItems(items) {
  return success({ items: await saveTodoItems(items) });
}

async function updateReminder(payload) {
  const items = setTodoReminder(await loadTodoItems(), payload.id, payload.reminderAt);
  const item = items.find((todo) => todo.id === payload.id);
  if (item?.reminderAt) await chrome.alarms.create(alarmNameForTodo(payload.id), { when: Date.parse(item.reminderAt) });
  return saveItems(items);
}

async function clearReminder(id) {
  await chrome.alarms.clear(alarmNameForTodo(id));
  return saveItems(clearTodoReminder(await loadTodoItems(), id));
}

async function deleteTodo(id) {
  await chrome.alarms.clear(alarmNameForTodo(id));
  return saveItems(deleteTodoItem(await loadTodoItems(), id));
}

async function completeTodo(payload) {
  const items = await loadTodoItems();
  const item = items.find((todo) => todo.id === payload.id);
  if (!item) return failure("missing_todo", "Todo was not found");

  const record = { text: item.text, completedAt: payload.completedAt };
  const result = await completedStore().appendCompletedRecord(record);
  if (!result.ok) return result;

  await chrome.alarms.clear(alarmNameForTodo(item.id));
  return saveItems(deleteTodoItem(items, item.id));
}
