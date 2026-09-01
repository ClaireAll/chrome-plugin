import type {
  ChangeEvent,
  CSSProperties,
  DragEvent,
  FocusEvent,
  KeyboardEvent,
  RefObject
} from "react";
import type { InputRef } from "antd";

export type TodoItem = {
  id: string;
  text: string;
  color?: string;
  reminderAt?: string;
  reminded?: boolean;
  [key: string]: unknown;
};

export type CompletedRecord = {
  text: string;
  completedAt: string;
  recordIndex?: number;
};

export type CompletedData = {
  version: number;
  completed: CompletedRecord[];
};

export type CompletedStatus = {
  bound?: boolean;
  directoryName?: string;
  fileName?: string;
  permission?: string;
  [key: string]: unknown;
};

export type TodoSettings = {
  colorPresets: string[];
  defaultColor: string;
  [key: string]: unknown;
};

export type CompletedCounts = {
  today: number;
  week: number;
  days: number[];
};

export type RuntimeResult = {
  ok: boolean;
  message?: string;
  reason?: string;
  items?: TodoItem[];
  settings?: TodoSettings;
  completedStatus?: CompletedStatus | null;
  data?: CompletedData;
  fileName?: string;
  directoryName?: string;
  permission?: string;
  [key: string]: unknown;
};

export type CssVariables = CSSProperties & {
  "--todo-color"?: string;
  "--choice-color"?: string;
};

export type TodoDropPosition = "before" | "after";
export type InputChangeEvent = ChangeEvent<HTMLInputElement>;
export type InputKeyEvent = KeyboardEvent<HTMLInputElement>;
export type CompletedTextBlurEvent = FocusEvent<HTMLDivElement>;
export type TodoDragEvent = DragEvent<HTMLElement>;
export type InputRefObject = RefObject<InputRef | null>;
