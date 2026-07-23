import { failure } from "../shared/messages.js";

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

export async function handleMessage() {
  return failure("not_implemented", "todo is not ready yet");
}

export async function handleAlarm() {}
