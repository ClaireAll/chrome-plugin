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
import * as completedDataLocation from "../shared/data-location.js";
import { failure, MESSAGE_TYPES, success } from "../shared/messages.js";
import { alarmNameForTodo, isReminderOnTime, todoIdFromAlarmName } from "../shared/reminder-schedule.js";
import { loadTodoItems, loadTodoState, saveSettings, saveTodoItems } from "../shared/storage.js";

let completedStoreOverride = null;
let mutationQueue = Promise.resolve();

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
  if (isMutationMessage(message.type)) return enqueueMutation(() => handleMessageNow(message, sender));
  return handleMessageNow(message, sender);
}

async function handleMessageNow(message = {}, sender) {
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
  return enqueueMutation(() => handleAlarmNow(alarm, handledAt));
}

async function handleAlarmNow(alarm, handledAt) {
  const id = todoIdFromAlarmName(alarm?.name);
  if (!id) return;

  const items = await loadTodoItems();
  const item = items.find((todo) => todo.id === id);
  if (!item?.reminderAt || item.reminded) return;
  if (alarm?.scheduledTime !== Date.parse(item.reminderAt)) return;
  if (!isReminderOnTime(item.reminderAt, handledAt)) return;

  await chrome.notifications.create(alarm.name, {
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title: "Todo reminder",
    message: item.text
  });
  await saveTodoItems(markTodoReminded(items, id, handledAt));
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
  const result = await saveItems(items);
  if (item?.reminderAt) await chrome.alarms.create(alarmNameForTodo(payload.id), { when: Date.parse(item.reminderAt) });
  return result;
}

async function clearReminder(id) {
  const result = await saveItems(clearTodoReminder(await loadTodoItems(), id));
  await chrome.alarms.clear(alarmNameForTodo(id));
  return result;
}

async function deleteTodo(id) {
  const result = await saveItems(deleteTodoItem(await loadTodoItems(), id));
  await chrome.alarms.clear(alarmNameForTodo(id));
  return result;
}

async function completeTodo(payload) {
  const items = await loadTodoItems();
  const item = items.find((todo) => todo.id === payload.id);
  if (!item) return failure("missing_todo", "Todo was not found");

  let receiptItems = items;
  let receipt = completionReceiptFor(item, payload.completedAt);
  if (!sameCompletionReceipt(item.completionReceipt, receipt)) {
    receiptItems = withCompletionReceipt(items, item.id, receipt);
    await saveTodoItems(receiptItems);
  }

  if (!receipt.appended) {
    if (!receipt.appendStarted || !Number.isInteger(receipt.matchingCountBefore)) {
      const countResult = await countCompletedRecords(receipt);
      if (!countResult.ok) return countResult;
      receipt = {
        ...receipt,
        appendStarted: true,
        matchingCountBefore: countResult.count
      };
      receiptItems = withCompletionReceipt(receiptItems, item.id, receipt);
      await saveTodoItems(receiptItems);
    }

    const countResult = await countCompletedRecords(receipt);
    if (!countResult.ok) return countResult;
    if (countResult.count <= receipt.matchingCountBefore) {
      const result = await completedStore().appendCompletedRecord({ text: receipt.text, completedAt: receipt.completedAt });
      if (!result.ok) return result;
    }

    receipt = { ...receipt, appendStarted: true, appended: true };
    receiptItems = withCompletionReceipt(receiptItems, item.id, receipt);
    await saveTodoItems(receiptItems);
  }

  await chrome.alarms.clear(alarmNameForTodo(item.id));
  return saveItems(deleteTodoItem(receiptItems, item.id));
}

function enqueueMutation(operation) {
  const task = mutationQueue.then(operation, operation);
  mutationQueue = task.catch(() => {});
  return task;
}

function isMutationMessage(type) {
  return new Set([
    MESSAGE_TYPES.ADD_TODO,
    MESSAGE_TYPES.UPDATE_TODO_TEXT,
    MESSAGE_TYPES.UPDATE_TODO_COLOR,
    MESSAGE_TYPES.UPDATE_TODO_REMINDER,
    MESSAGE_TYPES.CLEAR_TODO_REMINDER,
    MESSAGE_TYPES.DELETE_TODO,
    MESSAGE_TYPES.REORDER_TODOS,
    MESSAGE_TYPES.COMPLETE_TODO,
    MESSAGE_TYPES.UPDATE_SETTINGS,
    MESSAGE_TYPES.READ_COMPLETED_DATA,
    MESSAGE_TYPES.WRITE_COMPLETED_DATA,
    MESSAGE_TYPES.UPDATE_COMPLETED_RECORD,
    MESSAGE_TYPES.DELETE_COMPLETED_RECORD
  ]).has(type);
}

function completionReceiptFor(item, completedAt) {
  const existing = item.completionReceipt;
  if (existing && Number.isFinite(Date.parse(existing.completedAt))) {
    return {
      text: String(existing.text || item.text || "").trim(),
      completedAt: new Date(existing.completedAt).toISOString(),
      appendStarted: existing.appendStarted === true || existing.appended === true,
      appended: existing.appended === true,
      matchingCountBefore: Number.isInteger(existing.matchingCountBefore) && existing.matchingCountBefore >= 0
        ? existing.matchingCountBefore
        : null
    };
  }
  const time = new Date(completedAt);
  return {
    text: String(item.text || "").trim(),
    completedAt: Number.isNaN(time.getTime()) ? new Date().toISOString() : time.toISOString(),
    appendStarted: false,
    appended: false,
    matchingCountBefore: null
  };
}

function withCompletionReceipt(items, id, receipt) {
  return items.map((todo) => todo.id === id ? { ...todo, completionReceipt: receipt } : todo);
}

function sameCompletionReceipt(left, right) {
  return left &&
    left.text === right.text &&
    left.completedAt === right.completedAt &&
    left.appendStarted === right.appendStarted &&
    left.appended === right.appended &&
    left.matchingCountBefore === right.matchingCountBefore;
}

async function countCompletedRecords(receipt) {
  const store = completedStore();
  if (typeof store.readCompletedData !== "function") return { ok: true, count: 0 };
  const result = await store.readCompletedData();
  if (!result.ok) return result;
  const completed = Array.isArray(result.data?.completed) ? result.data.completed : [];
  return {
    ok: true,
    count: completed.filter((record) => record.text === receipt.text && record.completedAt === receipt.completedAt).length
  };
}
