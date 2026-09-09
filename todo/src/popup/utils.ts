import { DEFAULT_COLOR_PRESETS } from "../shared/domain.ts";
import type { CompletedCounts, CompletedData } from "./types";

export const DEFAULT_CONFIG_FILE_NAME = "todo.json";
export const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
export const EMPTY_COMPLETED_DATA: CompletedData = { version: 1, completed: [] };

export function normalizePickerColor(value: unknown): string {
  const candidate = typeof value === "string" ? value : "";
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate.toLowerCase() : DEFAULT_COLOR_PRESETS[0];
}

export function randomColorPreset(): string {
  const bytes = new Uint8Array(3);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return `#${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  return `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`;
}

export function validDate(value: unknown): Date | null {
  const date = new Date(
    typeof value === "string" || typeof value === "number" || value instanceof Date ? value : ""
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatReminder(value: unknown): string {
  const date = validDate(value);
  if (!date) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  const time = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (sameDay) return `今天 ${time}`;
  if (isTomorrow) return `明天 ${time}`;
  return `${date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })} ${time}`;
}

export function toDateTimeLocal(value: unknown): string {
  const date = validDate(value);
  if (!date) return "";
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatCompletedAt(value: unknown): string {
  const date = validDate(value);
  return date
    ? date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "时间未知";
}

export function getWeekRange(anchor: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(anchor);
  const offset = (start.getDay() + 6) % 7;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - offset);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

export function getCompletedCounts(data: CompletedData): CompletedCounts {
  const now = new Date();
  const { start, end } = getWeekRange(now);
  let today = 0;
  let week = 0;
  const days = Array(7).fill(0) as number[];
  const records = Array.isArray(data?.completed) ? data.completed : [];

  for (const record of records) {
    const date = validDate(record.completedAt);
    if (!date) continue;
    if (date.toDateString() === now.toDateString()) today += 1;
    if (date >= start && date < end) {
      week += 1;
      days[(date.getDay() + 6) % 7] += 1;
    }
  }
  return { today, week, days };
}
