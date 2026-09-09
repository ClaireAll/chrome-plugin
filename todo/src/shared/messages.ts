export const MESSAGE_TYPES = {
  GET_STATE: "TODO_GET_STATE",
  ADD_TODO: "TODO_ADD_TODO",
  UPDATE_TODO_TEXT: "TODO_UPDATE_TODO_TEXT",
  UPDATE_TODO_COLOR: "TODO_UPDATE_TODO_COLOR",
  UPDATE_TODO_REMINDER: "TODO_UPDATE_TODO_REMINDER",
  CLEAR_TODO_REMINDER: "TODO_CLEAR_TODO_REMINDER",
  DELETE_TODO: "TODO_DELETE_TODO",
  REORDER_TODOS: "TODO_REORDER_TODOS",
  COMPLETE_TODO: "TODO_COMPLETE_TODO",
  UPDATE_SETTINGS: "TODO_UPDATE_SETTINGS",
  REMINDER_DUE: "TODO_REMINDER_DUE",
  GET_COMPLETED_STATUS: "TODO_GET_COMPLETED_STATUS",
  READ_COMPLETED_DATA: "TODO_READ_COMPLETED_DATA",
  WRITE_COMPLETED_DATA: "TODO_WRITE_COMPLETED_DATA",
  UPDATE_COMPLETED_RECORD: "TODO_UPDATE_COMPLETED_RECORD",
  DELETE_COMPLETED_RECORD: "TODO_DELETE_COMPLETED_RECORD"
} as const;

export type MessageType = typeof MESSAGE_TYPES[keyof typeof MESSAGE_TYPES];
export type RuntimeResponse = {
  ok: boolean;
  reason?: string;
  message?: string;
  [key: string]: any;
};

export function success(payload: Record<string, any> = {}): RuntimeResponse {
  return { ok: true, ...payload };
}

export function failure(reason: string, message: string, extra: Record<string, any> = {}): RuntimeResponse {
  return { ok: false, reason, message, ...extra };
}
