import { DEFAULT_COLOR_PRESETS } from "./domain.js";

const DEFAULT_BALL_THEME_COLOR = "#2563eb";
export const BALL_SIZE_MIN = 36;
export const BALL_SIZE_MAX = 88;
export const BALL_SIZE_DEFAULT = 44;

export const DEFAULT_SETTINGS = {
  ballPosition: null,
  ballSize: BALL_SIZE_DEFAULT,
  ballThemeColor: DEFAULT_BALL_THEME_COLOR,
  colorPresets: DEFAULT_COLOR_PRESETS,
  defaultColor: "#ffffff",
  recurringTasks: []
};

export function sanitizeSettings(input) {
  const source = input && typeof input === "object" ? input : {};
  const colorPresets = sanitizeColorPresets(source.colorPresets);
  const requestedDefaultColor = normalizeHexColor(source.defaultColor);
  const defaultColor = colorPresets.includes(requestedDefaultColor) ? requestedDefaultColor : colorPresets[0];
  return {
    ballPosition: sanitizeBallPosition(source.ballPosition),
    ballSize: sanitizeBallSize(source.ballSize),
    ballThemeColor: normalizeHexColor(source.ballThemeColor) || DEFAULT_BALL_THEME_COLOR,
    colorPresets,
    defaultColor,
    recurringTasks: sanitizeRecurringTasks(source.recurringTasks)
  };
}

export function sanitizeColorPresets(value) {
  const colors = Array.isArray(value) ? value.map(normalizeHexColor).filter(Boolean) : DEFAULT_COLOR_PRESETS;
  return colors.length ? [...new Set(colors)] : DEFAULT_COLOR_PRESETS;
}

function sanitizeRecurringTasks(value) {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((task) => {
      const type = ["workday", "weekly", "monthly"].includes(task?.type) ? task.type : "";
      const id = String(task?.id || "").trim();
      const text = String(task?.text || "").trim();
      const time = normalizeTime(task?.time);
      if (!type || !id || !text || !time) return null;
      const result = {
        id,
        type,
        text,
        time,
        lastRunKey: String(task?.lastRunKey || "").trim()
      };
      if (type === "workday") return result;
      if (type === "weekly") {
        const weekday = Number(task.weekday);
        if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return null;
        return { ...result, weekday };
      }
      const monthDay = Number(task.monthDay);
      if (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 31) return null;
      return { ...result, monthDay };
    })
    .filter(Boolean);
}

function sanitizeBallPosition(value) {
  if (!value || typeof value !== "object") return null;
  const side = value.side === "left" || value.side === "right" ? value.side : null;
  const leftRatio = Number(value.leftRatio);
  const topRatio = Number(value.topRatio);
  if (Number.isFinite(leftRatio) || Number.isFinite(topRatio)) {
    const edgeSide = side || ratioToSide(leftRatio);
    return {
      leftRatio: edgeSide === "right" ? 1 : 0,
      topRatio: clampRatio(topRatio),
      snapped: true,
      side: edgeSide
    };
  }
  const left = Number(value.left);
  const top = Number(value.top);
  return {
    left: Number.isFinite(left) ? Math.max(0, left) : 0,
    top: Number.isFinite(top) ? Math.max(0, top) : 0,
    snapped: true,
    side
  };
}

// 清洗悬浮球尺寸，保证设置页和内容页都使用同一段可控范围。
function sanitizeBallSize(value) {
  const size = Number(value);
  if (!Number.isFinite(size)) return BALL_SIZE_DEFAULT;
  return Math.round(Math.min(Math.max(size, BALL_SIZE_MIN), BALL_SIZE_MAX));
}

function ratioToSide(value) {
  return clampRatio(value) < 0.5 ? "left" : "right";
}

function clampRatio(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function normalizeHexColor(value) {
  return isHexColor(value) ? value.toLowerCase() : "";
}

function normalizeTime(value) {
  const text = String(value || "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : "";
}

function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}
