import { buildEChartsHeatmapOption, buildWeeklySummary, getWeekRange } from "../shared/weekly-summary.js";
import { MESSAGE_TYPES } from "../shared/messages.js";
import {
  createCompletedJsonFile,
  pickCompletedJsonFile,
  requestCompletedFilePermission
} from "../shared/completed-file-store.js";

const elements = {
  addColorPreset: document.getElementById("addColorPreset"),
  averageDailyCount: document.getElementById("averageDailyCount"),
  ballThemeColor: document.getElementById("ballThemeColor"),
  colorPresetList: document.getElementById("colorPresetList"),
  completedFileName: document.getElementById("completedFileName"),
  completedFileStatus: document.getElementById("completedFileStatus"),
  completedList: document.getElementById("completedList"),
  completedPermissionBadge: document.getElementById("completedPermissionBadge"),
  completedSearch: document.getElementById("completedSearch"),
  createCompletedFile: document.getElementById("createCompletedFile"),
  optionsLower: document.querySelector(".todo-options-lower"),
  pickCompletedFile: document.getElementById("pickCompletedFile"),
  railThemePreview: document.querySelector(".todo-rail-theme-preview"),
  requestCompletedPermission: document.getElementById("requestCompletedPermission"),
  scheduledFrequencyButtons: document.querySelectorAll("[data-frequency]"),
  scheduledTaskForm: document.getElementById("scheduledTaskForm"),
  scheduledTaskFrequency: document.getElementById("scheduledTaskFrequency"),
  scheduledTaskList: document.getElementById("scheduledTaskList"),
  scheduledTaskMonthday: document.getElementById("scheduledTaskMonthday"),
  scheduledTaskMonthdayField: document.getElementById("scheduledTaskMonthdayField"),
  scheduledTaskText: document.getElementById("scheduledTaskText"),
  scheduledTaskTime: document.getElementById("scheduledTaskTime"),
  scheduledTaskWeekday: document.getElementById("scheduledTaskWeekday"),
  scheduledTaskWeekdayField: document.getElementById("scheduledTaskWeekdayField"),
  streakDays: document.getElementById("streakDays"),
  todayCompletedCount: document.getElementById("todayCompletedCount"),
  todayCompletedDelta: document.getElementById("todayCompletedDelta"),
  weekCompletedCount: document.getElementById("weekCompletedCount"),
  weekCompletionProgress: document.getElementById("weekCompletionProgress"),
  weekCompletionRate: document.getElementById("weekCompletionRate"),
  weeklyChart: document.getElementById("weeklyChart"),
  weeklyWeekSelect: document.getElementById("weeklyWeekSelect")
};

const WEEKDAY_LABELS = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

let completedData = { completed: [] };
let completedStatus = null;
let completedMutationBusy = false;
let settings = { ballThemeColor: "#2563eb", colorPresets: [], recurringTasks: [] };
let chart = null;
let lowerAlignmentFrame = 0;
let weeklyChartFrame = 0;
let selectedWeeklyStartKey = "";

function sendMessage(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, payload });
}

function createButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = className;
  button.addEventListener("click", onClick);
  return button;
}

function renderCompletedRecords() {
  const query = elements.completedSearch.value.trim().toLowerCase();
  const records = (completedData.completed || [])
    .map((record, recordIndex) => ({ ...record, recordIndex }))
    .filter((record) => String(record.text || "").toLowerCase().includes(query))
    .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt));

  elements.completedList.replaceChildren();

  if (!records.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "没有匹配的完成记录";
    elements.completedList.append(empty);
    syncLowerAlignment();
    return;
  }

  for (const record of records) {
    const row = document.createElement("div");
    row.className = "completed-row";
    const copy = document.createElement("div");
    copy.className = "completed-copy";
    const text = document.createElement("div");
    text.className = "completed-text";
    text.textContent = record.text;
    const tag = document.createElement("span");
    tag.className = "completed-tag";
    tag.style.setProperty("--completed-tag-color", getRecordAccentColor(record.recordIndex));
    tag.textContent = "完成";
    copy.append(text, tag);
    const time = document.createElement("time");
    time.className = "completed-time";
    time.dateTime = record.completedAt;
    time.textContent = formatCompletedTime(record.completedAt);
    const deleteButton = createButton("删除", "icon-button completed-delete-button", async () => {
      await handleCompletedMutation(
        () => sendMessage(MESSAGE_TYPES.DELETE_COMPLETED_RECORD, { recordIndex: record.recordIndex }),
        "完成记录删除失败"
      );
    });
    deleteButton.title = "删除完成记录";
    deleteButton.setAttribute("aria-label", `删除完成记录 ${record.text}`);
    deleteButton.disabled = completedMutationBusy;
    row.append(copy, time, deleteButton);
    elements.completedList.append(row);
  }
  syncLowerAlignment();
}

function renderColorPresets() {
  elements.colorPresetList.replaceChildren();
  const colorPresets = settings.colorPresets || [];
  const normalizedBallThemeColor = normalizePickerColor(settings.ballThemeColor || "#2563eb");
  const selectedColor = colorPresets.some((color) => normalizePickerColor(color) === normalizedBallThemeColor)
    ? normalizedBallThemeColor
    : normalizePickerColor(colorPresets[0] || normalizedBallThemeColor);
  for (const color of colorPresets) {
    const item = document.createElement("div");
    item.className = "color-preset-item";
    item.classList.toggle("is-selected", normalizePickerColor(color) === selectedColor);
    const swatch = document.createElement("input");
    swatch.type = "color";
    swatch.className = "color-swatch";
    swatch.value = normalizePickerColor(color);
    swatch.title = `编辑 ${color}`;
    swatch.setAttribute("aria-label", `编辑颜色 ${color}`);
    swatch.addEventListener("change", () => applyColorPreset(color, swatch.value));

    const deleteButton = createButton("x", "color-preset-delete", (event) => {
      event?.stopPropagation?.();
      deleteColorPreset(color);
    });
    deleteButton.title = `删除 ${color}`;
    deleteButton.setAttribute("aria-label", `删除颜色 ${color}`);
    item.append(swatch, deleteButton);
    elements.colorPresetList.append(item);
  }
}

function renderBallThemeColor() {
  elements.ballThemeColor.value = normalizePickerColor(settings.ballThemeColor || "#2563eb");
}

function renderScheduledTasks() {
  const tasks = settings.recurringTasks || [];
  elements.scheduledTaskList.replaceChildren();
  if (!tasks.length) {
    const empty = document.createElement("p");
    empty.className = "scheduled-empty";
    empty.textContent = "暂无定时任务";
    elements.scheduledTaskList.append(empty);
    syncLowerAlignment();
    return;
  }

  for (const task of tasks) {
    const row = document.createElement("div");
    row.className = "scheduled-task-row";
    const copy = document.createElement("div");
    copy.className = "scheduled-task-copy";
    const text = document.createElement("div");
    text.className = "scheduled-task-text";
    text.textContent = task.text;
    const meta = document.createElement("div");
    meta.className = "scheduled-task-meta";
    meta.textContent = scheduledTaskMeta(task);
    copy.append(text, meta);
    const deleteButton = createButton("删除", "scheduled-task-delete", () => deleteScheduledTask(task.id));
    deleteButton.setAttribute("aria-label", `删除${task.text}`);
    row.append(copy, deleteButton);
    elements.scheduledTaskList.append(row);
  }
  syncLowerAlignment();
}

function renderStats() {
  const records = getValidCompletedRecords();
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayCount = countRecordsOnDate(records, now);
  const yesterdayCount = countRecordsOnDate(records, yesterday);
  const delta = todayCount - yesterdayCount;
  const { start, end } = getWeekRange(now);
  const weekRecords = records.filter(({ date }) => date >= start && date <= end);
  const activeWorkdays = new Set(
    weekRecords
      .filter(({ date }) => date.getDay() >= 1 && date.getDay() <= 5)
      .map(({ date }) => localDateKey(date))
  );
  const activeRate = Math.min(100, Math.round((activeWorkdays.size / 5) * 100));

  elements.todayCompletedCount.textContent = String(todayCount);
  elements.todayCompletedDelta.textContent = delta > 0 ? `较昨日 +${delta}` : `较昨日 ${delta}`;
  elements.todayCompletedDelta.dataset.trend = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  elements.weekCompletedCount.textContent = String(weekRecords.length);
  elements.weekCompletionRate.textContent = `活跃率 ${activeRate}%`;
  elements.weekCompletionProgress.style.width = `${activeRate}%`;
  elements.streakDays.textContent = String(getCompletionStreak(records, now));
  elements.averageDailyCount.textContent = formatAverage(weekRecords.length / 7);
}

function scheduledTaskMeta(task) {
  if (task.type === "workday") return `工作日 ${task.time}`;
  if (task.type === "weekly") return `每周${WEEKDAY_LABELS[task.weekday] || ""} ${task.time}`;
  return `每月${task.monthDay}日 ${task.time}`;
}

async function updateColorPresets(colorPresets) {
  const result = await sendMessage(MESSAGE_TYPES.UPDATE_SETTINGS, { colorPresets });
  if (!result.ok) return;
  settings = result.settings || { ...settings, colorPresets };
  renderColorPresets();
  renderCompletedRecords();
  renderWeeklySummary();
}

async function updateBallThemeColor(color) {
  const ballThemeColor = normalizePickerColor(color);
  const result = await sendMessage(MESSAGE_TYPES.UPDATE_SETTINGS, { ballThemeColor });
  if (!result.ok) return;
  settings = result.settings || { ...settings, ballThemeColor };
  renderBallThemeColor();
  renderColorPresets();
}

function applyColorPreset(color, nextColor) {
  const normalizedColor = normalizePickerColor(nextColor);
  if (normalizedColor === color) return;
  const colorPresets = [...(settings.colorPresets || [])];
  const colorIndex = colorPresets.indexOf(color);
  if (colorIndex < 0) return;
  colorPresets[colorIndex] = normalizedColor;
  updateColorPresets(colorPresets);
}

function deleteColorPreset(color) {
  updateColorPresets(settings.colorPresets.filter((item) => item !== color));
}

async function addScheduledTask() {
  if (!elements.scheduledTaskForm.reportValidity()) return;
  const task = createScheduledTask();
  const recurringTasks = [...(settings.recurringTasks || []), task];
  const result = await sendMessage(MESSAGE_TYPES.UPDATE_SETTINGS, { recurringTasks });
  if (!result.ok) return;
  settings = result.settings || { ...settings, recurringTasks };
  resetScheduledTaskForm();
  renderScheduledTasks();
}

async function deleteScheduledTask(taskId) {
  const recurringTasks = (settings.recurringTasks || []).filter((task) => task.id !== taskId);
  const result = await sendMessage(MESSAGE_TYPES.UPDATE_SETTINGS, { recurringTasks });
  if (!result.ok) return;
  settings = result.settings || { ...settings, recurringTasks };
  renderScheduledTasks();
}

function createScheduledTask() {
  const type = elements.scheduledTaskFrequency.value;
  const task = {
    id: createScheduledTaskId(),
    type,
    text: elements.scheduledTaskText.value.trim(),
    time: elements.scheduledTaskTime.value
  };
  if (type === "weekly") return { ...task, weekday: Number(elements.scheduledTaskWeekday.value) };
  if (type === "monthly") return { ...task, monthDay: Number(elements.scheduledTaskMonthday.value) };
  return task;
}

function resetScheduledTaskForm() {
  elements.scheduledTaskForm.reset();
  elements.scheduledTaskTime.value = "09:00";
  renderScheduledTaskFrequencyFields();
}

function renderScheduledTaskFrequencyFields() {
  const type = elements.scheduledTaskFrequency.value;
  elements.scheduledTaskWeekdayField.hidden = type !== "weekly";
  elements.scheduledTaskMonthdayField.hidden = type !== "monthly";
  elements.scheduledTaskWeekday.disabled = type !== "weekly";
  elements.scheduledTaskMonthday.disabled = type !== "monthly";
  for (const button of elements.scheduledFrequencyButtons) {
    const active = button.dataset.frequency === type;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function createScheduledTaskId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizePickerColor(color) {
  return /^#[0-9a-f]{6}$/i.test(color || "") ? color.toLowerCase() : "#ffffff";
}

function getRecordAccentColor(index) {
  const colors = (settings.colorPresets || []).map(normalizePickerColor).filter((color) => color !== "#ffffff");
  if (!colors.length) return "#2563eb";
  const color = colors[Math.abs(Number(index) || 0) % colors.length];
  return color;
}

function getValidCompletedRecords() {
  return (completedData.completed || [])
    .map((record) => ({ record, date: new Date(record?.completedAt) }))
    .filter(({ record, date }) => record?.text && !Number.isNaN(date.getTime()));
}

function countRecordsOnDate(records, date) {
  return records.filter((record) => isSameLocalDay(record.date, date)).length;
}

function getCompletionStreak(records, anchorDate) {
  const completedDays = new Set(records.map(({ date }) => localDateKey(date)));
  const cursor = new Date(anchorDate);
  cursor.setHours(0, 0, 0, 0);
  if (!completedDays.has(localDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!completedDays.has(localDateKey(cursor))) return 0;
  }

  let streak = 0;
  while (completedDays.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function isSameLocalDay(left, right) {
  return localDateKey(left) === localDateKey(right);
}

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatCompletedTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameLocalDay(date, now)) return `今天 ${time}`;
  if (isSameLocalDay(date, yesterday)) return `昨天 ${time}`;
  return `${date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })} ${time}`;
}

function formatAverage(value) {
  return value.toFixed(1).replace(/\.0$/, "");
}

function randomColorPreset() {
  const bytes = new Uint8Array(3);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return `#${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  return `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`;
}

function populateMonthlyTaskDays() {
  if (elements.scheduledTaskMonthday.options.length) return;
  for (let day = 1; day <= 31; day += 1) {
    const option = document.createElement("option");
    option.value = String(day);
    option.textContent = `${day}日`;
    elements.scheduledTaskMonthday.append(option);
  }
}

function getWeeklySummaryOptions() {
  const weeks = new Map();
  for (const { date } of getValidCompletedRecords()) {
    const { start, end } = getWeekRange(date);
    const key = localDateKey(start);
    const option = weeks.get(key) || {
      count: 0,
      end: new Date(end),
      key,
      start: new Date(start)
    };
    option.count += 1;
    weeks.set(key, option);
  }
  return [...weeks.values()].sort((left, right) => right.start - left.start);
}

function renderWeeklyWeekSelect(weekOptions) {
  elements.weeklyWeekSelect.replaceChildren();
  if (!weekOptions.length) {
    selectedWeeklyStartKey = "";
    elements.weeklyWeekSelect.disabled = true;
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "暂无有数据的周";
    elements.weeklyWeekSelect.append(option);
    return null;
  }

  elements.weeklyWeekSelect.disabled = false;
  const currentWeekKey = localDateKey(getWeekRange(new Date()).start);
  const hasSelectedWeek = weekOptions.some((option) => option.key === selectedWeeklyStartKey);
  if (!hasSelectedWeek) {
    selectedWeeklyStartKey = weekOptions.some((option) => option.key === currentWeekKey)
      ? currentWeekKey
      : weekOptions[0].key;
  }

  for (const week of weekOptions) {
    const option = document.createElement("option");
    option.value = week.key;
    option.textContent = formatWeekOptionLabel(week);
    elements.weeklyWeekSelect.append(option);
  }
  elements.weeklyWeekSelect.value = selectedWeeklyStartKey;
  return weekOptions.find((option) => option.key === selectedWeeklyStartKey) || weekOptions[0];
}

function formatWeekOptionLabel(week) {
  return `${formatMonthDay(week.start)}-${formatMonthDay(week.end)}（${week.count}条）`;
}

function formatMonthDay(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function renderWeeklySummary() {
  const selectedWeek = renderWeeklyWeekSelect(getWeeklySummaryOptions());
  const weeklyRecords = withCompletedRecordColors(completedData.completed);
  const summary = selectedWeek
    ? buildWeeklySummary(weeklyRecords, selectedWeek.start)
    : buildWeeklySummary([], new Date());
  elements.weeklyChart.style.height = `${Math.max(288, summary.chartHeight)}px`;
  if (!summary.hours.length) {
    chart?.dispose();
    chart = null;
    elements.weeklyChart.classList.add("weekly-chart-empty");
    elements.weeklyChart.textContent = selectedWeek ? "这一周没有完成记录" : "暂无完成记录";
    return;
  }
  elements.weeklyChart.classList.remove("weekly-chart-empty");
  if (!globalThis.echarts) {
    elements.weeklyChart.textContent = "图表组件不可用";
    return;
  }
  if (!chart) elements.weeklyChart.textContent = "";
  chart ||= globalThis.echarts.init(elements.weeklyChart);
  chart.setOption(buildEChartsHeatmapOption(summary), true);
  resizeWeeklyChart();
}

function withCompletedRecordColors(records) {
  return (Array.isArray(records) ? records : []).map((record, recordIndex) => ({
    ...record,
    color: getRecordAccentColor(recordIndex)
  }));
}

async function refreshCompletedData(statusOverride = "") {
  const result = await sendMessage(MESSAGE_TYPES.READ_COMPLETED_DATA).catch((error) => ({
    ok: false,
    message: error?.message || "无法读取完成记录文件"
  }));
  if (!result.ok) {
    elements.completedFileStatus.textContent = statusOverride || completedFileErrorText(result.message || "未绑定完成记录文件");
  } else {
    applyCompletedData(result.data);
    if (result.fileName) completedStatus = { ...completedStatus, fileName: result.fileName };
    updateCompletedFileCard(statusOverride || formatFileUpdatedAt(result.data) || "已读取完成记录文件");
    return;
  }
  renderCompletedRecords();
  renderStats();
  renderWeeklySummary();
}

async function handleCompletedMutation(operation, fallbackMessage) {
  if (completedMutationBusy) return;
  completedMutationBusy = true;
  renderCompletedRecords();
  try {
    const result = await operation();
    if (result?.ok) {
      await refreshCompletedData();
      return;
    }
    await refreshCompletedData(result?.message || fallbackMessage);
  } catch (error) {
    await refreshCompletedData(error?.message || fallbackMessage);
  } finally {
    completedMutationBusy = false;
    renderCompletedRecords();
  }
}

async function showCompletedFileResult(result) {
  if (result.ok) {
    applyCompletedStatus(result);
    if (result.data) applyCompletedData(result.data);
    await refreshCompletedData();
    return;
  }
  elements.completedFileStatus.textContent = result.message || "Completed JSON file operation failed";
}

async function refreshState() {
  const state = await sendMessage(MESSAGE_TYPES.GET_STATE).catch(() => ({ ok: false }));
  if (state.ok) {
    settings = state.settings;
    applyCompletedStatus(state.completedStatus);
  }
  renderBallThemeColor();
  renderColorPresets();
  renderScheduledTasks();
  await refreshCompletedData();
}

function applyCompletedStatus(status) {
  if (!status?.fileName) {
    updateCompletedFileCard();
    return;
  }
  completedStatus = {
    fileName: status.fileName,
    permission: status.permission || completedStatus?.permission || ""
  };
  updateCompletedFileCard();
}

function applyCompletedData(data) {
  completedData = data && Array.isArray(data.completed) ? data : { completed: [] };
  renderCompletedRecords();
  renderStats();
  renderWeeklySummary();
}

function completedFileStatusText(fileName) {
  const name = fileName || completedStatus?.fileName;
  if (!name) return "";
  return completedStatus?.permission && completedStatus.fileName === name
    ? `${name} (${completedStatus.permission})`
    : name;
}

function completedFileErrorText(message) {
  const status = completedFileStatusText();
  return status ? `${status} - ${message}` : message;
}

function updateCompletedFileCard(detail = "") {
  const fileName = completedStatus?.fileName || "todo-completed.json";
  const permission = completedStatus?.permission || "";
  const granted = permission === "granted";
  elements.completedFileName.textContent = fileName;
  elements.completedPermissionBadge.textContent = granted ? "已授权" : permission || "未授权";
  elements.completedPermissionBadge.dataset.state = granted ? "granted" : "pending";
  elements.completedFileStatus.textContent = detail || (completedStatus?.fileName ? "已绑定完成记录文件" : "未绑定完成记录文件");
}

function formatFileUpdatedAt(data) {
  const latest = (data?.completed || [])
    .map((record) => new Date(record?.completedAt))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => right - left)[0];
  if (!latest) return "";
  return `最后更新：${latest.toLocaleString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  })}`;
}

function resizeWeeklyChart() {
  if (!chart) return;
  if (weeklyChartFrame) globalThis.cancelAnimationFrame(weeklyChartFrame);
  weeklyChartFrame = globalThis.requestAnimationFrame(() => {
    weeklyChartFrame = 0;
    chart?.resize();
  });
}

function syncLowerAlignment() {
  if (!elements.optionsLower || !elements.railThemePreview) return;
  if (lowerAlignmentFrame) globalThis.cancelAnimationFrame(lowerAlignmentFrame);
  lowerAlignmentFrame = globalThis.requestAnimationFrame(() => {
    lowerAlignmentFrame = 0;
    elements.optionsLower.style.marginTop = "";
    elements.railThemePreview.style.marginTop = "";
    if (globalThis.matchMedia("(max-width: 1180px)").matches) return;

    const lowerTop = elements.optionsLower.getBoundingClientRect().top;
    const railTop = elements.railThemePreview.getBoundingClientRect().top;
    const offset = Math.round(railTop - lowerTop);
    if (Math.abs(offset) <= 1) return;
    if (offset > 0) elements.optionsLower.style.marginTop = `${offset}px`;
    else elements.railThemePreview.style.marginTop = `${Math.abs(offset)}px`;
    resizeWeeklyChart();
  });
}

elements.completedSearch.addEventListener("input", renderCompletedRecords);
elements.weeklyWeekSelect.addEventListener("change", () => {
  selectedWeeklyStartKey = elements.weeklyWeekSelect.value;
  renderWeeklySummary();
});
elements.pickCompletedFile.addEventListener("click", async () => {
  const result = await pickCompletedJsonFile();
  await showCompletedFileResult(result);
});
elements.createCompletedFile.addEventListener("click", async () => {
  const result = await createCompletedJsonFile();
  await showCompletedFileResult(result);
});
elements.requestCompletedPermission.addEventListener("click", async () => {
  const result = await requestCompletedFilePermission();
  if (result.ok) {
    applyCompletedStatus(result);
    await refreshCompletedData();
  }
  else elements.completedFileStatus.textContent = result.message;
});
elements.addColorPreset.addEventListener("click", () => {
  updateColorPresets([...(settings.colorPresets || []), randomColorPreset()]);
});
elements.ballThemeColor.addEventListener("change", () => {
  updateBallThemeColor(elements.ballThemeColor.value);
});
elements.scheduledTaskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addScheduledTask();
});
elements.scheduledTaskFrequency.addEventListener("change", renderScheduledTaskFrequencyFields);
for (const button of elements.scheduledFrequencyButtons) {
  button.addEventListener("click", () => {
    elements.scheduledTaskFrequency.value = button.dataset.frequency;
    renderScheduledTaskFrequencyFields();
  });
}
globalThis.addEventListener("resize", () => {
  resizeWeeklyChart();
  syncLowerAlignment();
});

populateMonthlyTaskDays();
renderScheduledTaskFrequencyFields();
refreshState();
