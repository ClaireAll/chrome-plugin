import { MAX_BODY_BYTES } from "../shared/constants.js";
import { formatJson, getUtf8ByteLength, parseJsonText } from "../shared/domain.js";

const elements = {
  heading: document.getElementById("heading"),
  method: document.getElementById("method"),
  url: document.getElementById("url"),
  form: document.getElementById("editorForm"),
  bodyLabel: document.getElementById("bodyLabel"),
  editor: document.getElementById("jsonEditor"),
  error: document.getElementById("editorError"),
  formatButton: document.getElementById("formatButton"),
  cancelButton: document.getElementById("cancelButton"),
  confirmButton: document.getElementById("confirmButton")
};

const channelName = new URLSearchParams(location.search).get("channel") || "";
const channel = channelName.startsWith("api-rewriter-editor-") ? new BroadcastChannel(channelName) : null;

elements.editor.addEventListener("input", validateEditor);
elements.formatButton.addEventListener("click", formatEditor);
elements.cancelButton.addEventListener("click", () => window.close());
elements.form.addEventListener("submit", submitEditor);
document.addEventListener("keydown", handleKeyboardShortcut);
window.addEventListener("beforeunload", () => channel?.close());

if (channel) {
  channel.addEventListener("message", handleChannelMessage);
  channel.postMessage({ type: "ready" });
} else {
  elements.error.textContent = "无法连接原编辑器，请关闭窗口后重试";
}

// 接收侧栏的初始内容以及同步结果。
function handleChannelMessage(event) {
  if (event.data?.type === "initialize") {
    elements.heading.textContent = event.data.bodyLabel || "编辑 JSON Body";
    elements.bodyLabel.textContent = event.data.bodyLabel || "JSON Body";
    elements.method.textContent = event.data.method || "";
    elements.url.textContent = event.data.url || "";
    elements.url.title = event.data.url || "";
    elements.editor.value = String(event.data.text || "");
    elements.editor.disabled = false;
    elements.formatButton.disabled = false;
    validateEditor();
    elements.editor.focus();
    return;
  }
  if (event.data?.type === "accepted") window.close();
  if (event.data?.type === "error") {
    elements.error.textContent = event.data.message || "内容未能同步，请重试";
    elements.confirmButton.disabled = false;
    elements.form.setAttribute("aria-busy", "false");
  }
}

// 校验当前 JSON 内容及请求体大小，并更新错误提示。
function validateEditor() {
  const parsed = parseJsonText(elements.editor.value);
  const oversized = parsed.ok && getUtf8ByteLength(JSON.stringify(parsed.value)) > MAX_BODY_BYTES;
  const valid = parsed.ok && !oversized;
  const locationText = parsed.ok || !parsed.line ? "" : `（第 ${parsed.line} 行，第 ${parsed.column} 列）`;
  elements.error.textContent = !parsed.ok
    ? `${parsed.error}${locationText}`
    : oversized
      ? "JSON Body 超过 5 MB，不能同步"
      : "";
  elements.editor.setAttribute("aria-invalid", valid ? "false" : "true");
  elements.confirmButton.disabled = !valid;
  return valid;
}

// 将合法的 JSON 内容格式化为两空格缩进。
function formatEditor() {
  const parsed = parseJsonText(elements.editor.value);
  if (!parsed.ok) {
    validateEditor();
    return;
  }
  elements.editor.value = formatJson(parsed.value);
  validateEditor();
}

// 将已确认的内容发送回侧栏，等待侧栏接收后关闭窗口。
function submitEditor(event) {
  event.preventDefault();
  if (!channel || !validateEditor()) return;
  elements.form.setAttribute("aria-busy", "true");
  elements.confirmButton.disabled = true;
  channel.postMessage({ type: "confirm", text: elements.editor.value });
}

// 支持 Escape 取消和 Ctrl/Command + Enter 确定。
function handleKeyboardShortcut(event) {
  if (event.key === "Escape") window.close();
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    elements.form.requestSubmit();
  }
}
