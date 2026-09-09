import { DEFAULT_COLOR_PRESETS } from "./domain.ts";

const DEFAULT_BALL_THEME_COLOR = "#2563eb";
export const MAX_COLOR_PRESETS = 20;

export type BallPosition = {
  leftRatio?: number;
  topRatio?: number;
  left?: number;
  top?: number;
  snapped: boolean;
  side: "left" | "right" | null;
};

export type TodoSettings = {
  ballPosition: BallPosition | null;
  ballThemeColor: string;
  colorPresets: string[];
  defaultColor: string;
};

export const DEFAULT_SETTINGS: TodoSettings = {
  ballPosition: null,
  ballThemeColor: DEFAULT_BALL_THEME_COLOR,
  colorPresets: DEFAULT_COLOR_PRESETS,
  defaultColor: DEFAULT_COLOR_PRESETS[0]
};

export function sanitizeSettings(input: unknown): TodoSettings {
  const source = input && typeof input === "object" ? input as Record<string, any> : {};
  const colorPresets = sanitizeColorPresets(source.colorPresets);
  const requestedDefaultColor = normalizeHexColor(source.defaultColor);
  const defaultColor = colorPresets.includes(requestedDefaultColor) ? requestedDefaultColor : colorPresets[0];
  return {
    ballPosition: sanitizeBallPosition(source.ballPosition),
    ballThemeColor: normalizeHexColor(source.ballThemeColor) || DEFAULT_BALL_THEME_COLOR,
    colorPresets,
    defaultColor
  };
}

export function sanitizeColorPresets(value: unknown): string[] {
  const colors = Array.isArray(value) ? value.map(normalizeHexColor).filter(Boolean) : DEFAULT_COLOR_PRESETS;
  return colors.length ? [...new Set(colors)].slice(0, MAX_COLOR_PRESETS) : DEFAULT_COLOR_PRESETS;
}

function sanitizeBallPosition(value: unknown): BallPosition | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, any>;
  const side = source.side === "left" || source.side === "right" ? source.side : null;
  const leftRatio = Number(source.leftRatio);
  const topRatio = Number(source.topRatio);
  if (Number.isFinite(leftRatio) || Number.isFinite(topRatio)) {
    const edgeSide = side || ratioToSide(leftRatio);
    return {
      leftRatio: edgeSide === "right" ? 1 : 0,
      topRatio: clampRatio(topRatio),
      snapped: true,
      side: edgeSide
    };
  }
  const left = Number(source.left);
  const top = Number(source.top);
  return {
    left: Number.isFinite(left) ? Math.max(0, left) : 0,
    top: Number.isFinite(top) ? Math.max(0, top) : 0,
    snapped: true,
    side
  };
}

function ratioToSide(value: number): "left" | "right" {
  return clampRatio(value) < 0.5 ? "left" : "right";
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function normalizeHexColor(value: unknown): string {
  return isHexColor(value) ? value.toLowerCase() : "";
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}
