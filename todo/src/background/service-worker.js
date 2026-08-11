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

const RECURRING_ALARM_PREFIX = "todo-recurring:";

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

if (globalThis.chrome?.runtime?.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    scheduleRecurringTasks().catch(() => {});
  });
}

if (globalThis.chrome?.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => {
    scheduleRecurringTasks().catch(() => {});
  });
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
      return updateSettings(payload);
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
  const recurringTaskId = recurringTaskIdFromAlarmName(alarm?.name);
  if (recurringTaskId) return handleRecurringTaskAlarm(recurringTaskId, alarm, handledAt);

  const id = todoIdFromAlarmName(alarm?.name);
  if (!id) return;

  const items = await loadTodoItems();
  const item = items.find((todo) => todo.id === id);
  if (!item?.reminderAt || item.reminded) return;
  if (alarm?.scheduledTime !== Date.parse(item.reminderAt)) return;
  if (isLateReminder(item.reminderAt, handledAt)) {
    await saveTodoItems(markTodoReminded(items, id, handledAt));
    return;
  }
  if (!isReminderOnTime(item.reminderAt, handledAt)) return;

  await notifyOpenPages(item);
  await chrome.notifications.create(alarm.name, {
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title: "Todo reminder",
    message: item.text
  });
  await saveTodoItems(markTodoReminded(items, id, handledAt));
}

async function notifyOpenPages(item) {
  if (!chrome.tabs?.query || !chrome.tabs?.sendMessage) return;
  try {
    const tabs = await chrome.tabs.query({});
    const message = {
      type: MESSAGE_TYPES.REMINDER_DUE,
      payload: { id: item.id, text: item.text, reminderAt: item.reminderAt }
    };
    await Promise.allSettled((Array.isArray(tabs) ? tabs : [])
      .filter((tab) => Number.isInteger(tab.id))
      .map((tab) => chrome.tabs.sendMessage(tab.id, message)));
  } catch {
    // Page prompts are helpful, but the system notification remains the reliable fallback.
  }
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

async function updateSettings(payload) {
  const settings = await saveSettings(payload);
  if (Object.hasOwn(payload || {}, "recurringTasks")) await syncRecurringTaskAlarms(settings.recurringTasks);
  return success({ settings });
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
  let items = await loadTodoItems();
  let item = items.find((todo) => todo.id === payload.id);
  if (!item) return failure("missing_todo", "Todo was not found");

  let receipt = completionReceiptFor(item, payload.completedAt);
  const recovery = await completePriorMatchingPendingCompletions(items, item.id, receipt);
  if (!recovery.ok) return recovery;
  items = recovery.items;
  item = items.find((todo) => todo.id === payload.id);
  if (!item) return failure("missing_todo", "Todo was not found");

  receipt = completionReceiptFor(item, payload.completedAt);
  return completeTodoItem(items, item, receipt);
}

async function handleRecurringTaskAlarm(taskId, alarm, handledAt) {
  const state = await loadTodoState();
  const task = (state.settings.recurringTasks || []).find((item) => item.id === taskId);
  if (!task) {
    await chrome.alarms.clear(recurringTaskAlarmName(taskId));
    return;
  }

  const scheduledTime = Number(alarm?.scheduledTime);
  const occurrenceTime = Number.isFinite(scheduledTime) ? new Date(scheduledTime) : new Date(handledAt);
  const runKey = recurringTaskRunKey(task, occurrenceTime);
  const nextRecurringTasks = state.settings.recurringTasks.map((item) => (
    item.id === task.id ? { ...item, lastRunKey: runKey } : item
  ));

  if (task.lastRunKey !== runKey) {
    await saveTodoItems(addTodoItem(state.items, task.text, state.settings, handledAt));
  }

  const settings = await saveSettings({ recurringTasks: nextRecurringTasks });
  const nextTask = (settings.recurringTasks || []).find((item) => item.id === task.id);
  if (nextTask) await scheduleRecurringTask(nextTask, new Date(occurrenceTime.getTime() + 1000));
}

async function scheduleRecurringTasks() {
  if (!chrome.alarms?.create) return;
  const state = await loadTodoState();
  await syncRecurringTaskAlarms(state.settings.recurringTasks);
}

async function syncRecurringTaskAlarms(recurringTasks = []) {
  if (!chrome.alarms?.getAll) return;
  const alarms = await chrome.alarms.getAll();
  await Promise.all((alarms || [])
    .filter((alarm) => String(alarm.name || "").startsWith(RECURRING_ALARM_PREFIX))
    .map((alarm) => chrome.alarms.clear(alarm.name)));
  await Promise.all((recurringTasks || []).map((task) => scheduleRecurringTask(task)));
}

async function scheduleRecurringTask(task, from = new Date()) {
  const nextTime = nextRecurringTaskTime(task, from);
  if (!nextTime) return;
  await chrome.alarms.create(recurringTaskAlarmName(task.id), { when: nextTime.getTime() });
}

function nextRecurringTaskTime(task, from = new Date()) {
  const [hour, minute] = String(task.time || "").split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (task.type === "workday") return nextWorkdayTaskTime(hour, minute, from);
  if (task.type === "weekly") return nextWeeklyTaskTime(Number(task.weekday), hour, minute, from);
  return nextMonthlyTaskTime(Number(task.monthDay), hour, minute, from);
}

function nextWorkdayTaskTime(hour, minute, from) {
  const candidate = new Date(from);
  candidate.setHours(hour, minute, 0, 0);
  if (candidate <= from) candidate.setDate(candidate.getDate() + 1);
  while (candidate.getDay() === 0 || candidate.getDay() === 6) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

function nextWeeklyTaskTime(weekday, hour, minute, from) {
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return null;
  const currentWeekday = from.getDay() === 0 ? 7 : from.getDay();
  const daysAhead = (weekday - currentWeekday + 7) % 7;
  const candidate = new Date(from);
  candidate.setDate(from.getDate() + daysAhead);
  candidate.setHours(hour, minute, 0, 0);
  if (candidate <= from) candidate.setDate(candidate.getDate() + 7);
  return candidate;
}

function nextMonthlyTaskTime(monthDay, hour, minute, from) {
  if (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 31) return null;
  const candidate = monthlyCandidate(from.getFullYear(), from.getMonth(), monthDay, hour, minute);
  if (candidate > from) return candidate;
  return monthlyCandidate(from.getFullYear(), from.getMonth() + 1, monthDay, hour, minute);
}

function monthlyCandidate(year, month, monthDay, hour, minute) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(monthDay, lastDay), hour, minute, 0, 0);
}

function recurringTaskAlarmName(id) {
  return `${RECURRING_ALARM_PREFIX}${String(id || "")}`;
}

function recurringTaskIdFromAlarmName(name) {
  const text = String(name || "");
  return text.startsWith(RECURRING_ALARM_PREFIX) ? text.slice(RECURRING_ALARM_PREFIX.length) : "";
}

function recurringTaskRunKey(task, date) {
  const value = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const datePart = `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  return `${task.type}:${task.id}:${datePart}:${task.time}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

async function completeTodoItem(items, item, receipt) {
  let receiptItems = items;
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
      const result = await completedStore().appendCompletedRecord({ text: receipt.text, completedAt: receipt.completedAt });
      if (!result.ok) return result;
    } else {
      const countResult = await countCompletedRecords(receipt);
      if (!countResult.ok) return countResult;
      if (countResult.count <= receipt.matchingCountBefore) {
        const result = await completedStore().appendCompletedRecord({ text: receipt.text, completedAt: receipt.completedAt });
        if (!result.ok) return result;
      }
    }

    receipt = { ...receipt, appendStarted: true, appended: true };
    receiptItems = withCompletionReceipt(receiptItems, item.id, receipt);
    await saveTodoItems(receiptItems);
  }

  await chrome.alarms.clear(alarmNameForTodo(item.id));
  return saveItems(deleteTodoItem(receiptItems, item.id));
}

async function completePriorMatchingPendingCompletions(items, targetId, targetReceipt) {
  let currentItems = items;
  while (true) {
    const pending = currentItems.find((todo) => todo.id !== targetId && isMatchingPendingCompletion(todo, targetReceipt));
    if (!pending) return success({ items: currentItems });

    const result = await completeTodoItem(currentItems, pending, completionReceiptFor(pending, pending.completionReceipt.completedAt));
    if (!result.ok) return result;
    currentItems = result.items;
  }
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
  if ((existing?.appendStarted || existing?.appended) && Number.isFinite(Date.parse(existing.completedAt))) {
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

function isMatchingPendingCompletion(item, targetReceipt) {
  if (!item?.completionReceipt?.appendStarted || item.completionReceipt.appended) return false;
  const receipt = completionReceiptFor(item, item.completionReceipt.completedAt);
  return receipt.text === targetReceipt.text && receipt.completedAt === targetReceipt.completedAt;
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

function isLateReminder(reminderAt, handledAt, graceMs = 120000) {
  const reminderTime = Date.parse(reminderAt);
  const handledTime = Date.parse(handledAt);
  return Number.isFinite(reminderTime) && Number.isFinite(handledTime) && handledTime - reminderTime > graceMs;
}
