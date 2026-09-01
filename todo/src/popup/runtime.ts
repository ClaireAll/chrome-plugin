import type { RuntimeResult } from "./types";

export function sendMessage(type: string, payload: Record<string, unknown> = {}): Promise<RuntimeResult> {
  return new Promise<RuntimeResult>((resolve) => {
    if (!globalThis.chrome?.runtime?.sendMessage) {
      resolve({ ok: false, message: "插件通信不可用" });
      return;
    }
    try {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          resolve({ ok: false, message: runtimeError.message || "插件通信失败" });
          return;
        }
        resolve(response || { ok: false, message: "插件没有返回结果" });
      });
    } catch (error) {
      resolve({ ok: false, message: error?.message || "插件通信失败" });
    }
  });
}
