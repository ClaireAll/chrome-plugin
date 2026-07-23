const ALARM_PREFIX = "todo-reminder:";

export function alarmNameForTodo(id) {
  return `${ALARM_PREFIX}${String(id || "")}`;
}

export function todoIdFromAlarmName(name) {
  const text = String(name || "");
  return text.startsWith(ALARM_PREFIX) ? text.slice(ALARM_PREFIX.length) : "";
}

export function isReminderOnTime(reminderAt, handledAt = new Date().toISOString(), graceMs = 120000) {
  const reminderTime = Date.parse(reminderAt);
  const handledTime = Date.parse(handledAt);
  const delta = handledTime - reminderTime;
  return Number.isFinite(reminderTime) && Number.isFinite(handledTime) && delta >= 0 && delta <= graceMs;
}
