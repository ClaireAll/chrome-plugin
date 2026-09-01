import CalendarOutlined from "@ant-design/icons/CalendarOutlined";
import CheckOutlined from "@ant-design/icons/CheckOutlined";
import ClockCircleOutlined from "@ant-design/icons/ClockCircleOutlined";
import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import { Button, Input, Popover, Tooltip } from "antd";
import type { DragEvent } from "react";
import { ColorPopover } from "./ColorPopover";
import { ReminderPopover } from "./ReminderPopover";
import type {
  CssVariables,
  InputChangeEvent,
  InputKeyEvent,
  InputRefObject,
  TodoDropPosition,
  TodoItem
} from "../types";
import { formatReminder, normalizePickerColor, validDate } from "../utils";

type TodoRowProps = {
  activeColorTodoId: string;
  activeReminderTodoId: string;
  colorPresets: string[];
  draggedTodoId: string;
  editInputRef: InputRefObject;
  editingTodoId: string;
  editingTodoText: string;
  item: TodoItem;
  onColorOpen: (id: string) => void;
  onColorSelect: (id: string, color: string) => void | Promise<void>;
  onCompleteTodo: (id: string) => void | Promise<void>;
  onDeleteTodo: (id: string) => void | Promise<void>;
  onDragEnd: () => void;
  onDragStart: (id: string) => void;
  onMoveTodo: (sourceId: string, targetId: string, position: TodoDropPosition) => void | Promise<void>;
  onReminderChange: (id: string, value: string) => void | Promise<void>;
  onReminderOpen: (id: string) => void;
  onEditChange: (event: InputChangeEvent) => void;
  onEditCommit: (item: TodoItem) => void | Promise<void>;
  onEditKeyDown: (event: InputKeyEvent, item: TodoItem) => void;
  onEditStart: (item: TodoItem) => void;
};

export function TodoRow({
  activeColorTodoId,
  activeReminderTodoId,
  colorPresets,
  draggedTodoId,
  editInputRef,
  editingTodoId,
  editingTodoText,
  item,
  onColorOpen,
  onColorSelect,
  onCompleteTodo,
  onDeleteTodo,
  onDragEnd,
  onDragStart,
  onMoveTodo,
  onReminderChange,
  onReminderOpen,
  onEditChange,
  onEditCommit,
  onEditKeyDown,
  onEditStart
}: TodoRowProps) {
  const color = normalizePickerColor(item.color);
  const reminder = validDate(item.reminderAt);
  const reminderLabel = reminder ? formatReminder(item.reminderAt) : "";
  const isOverdue = Boolean(reminder && reminder.getTime() < Date.now());
  const isDragging = draggedTodoId === item.id;

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const sourceId = draggedTodoId || event.dataTransfer?.getData("text/plain");
    if (!sourceId || sourceId === item.id) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    onMoveTodo(sourceId, item.id, position);
  }

  return (
    <article
      className={`todo-row${isDragging ? " is-dragging" : ""}`}
      draggable
      onDragEnd={onDragEnd}
      onDragOver={(event) => event.preventDefault()}
      onDragStart={(event) => {
        onDragStart(item.id);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", item.id);
      }}
      onDrop={handleDrop}
      style={{ "--todo-color": color } as CssVariables}
    >
      <Button
        aria-label={`完成 ${item.text}`}
        className="todo-complete-button"
        icon={<CheckOutlined />}
        onClick={() => onCompleteTodo(item.id)}
        type="text"
      />
      <div className="todo-row-main">
        {editingTodoId === item.id ? (
          <Input
            ref={editInputRef}
            autoFocus
            className="todo-edit-input"
            maxLength={200}
            value={editingTodoText}
            onBlur={() => onEditCommit(item)}
            onChange={onEditChange}
            onKeyDown={(event) => onEditKeyDown(event, item)}
          />
        ) : (
          <div className="todo-text" onDoubleClick={() => onEditStart(item)} title="双击编辑">
            {item.text}
          </div>
        )}
        {reminderLabel ? (
          <div className="todo-meta">
            <span className={`todo-reminder-chip${isOverdue ? " is-overdue" : ""}`} title={new Date(item.reminderAt || "").toLocaleString()}>
              <CalendarOutlined />
              <span>{reminderLabel}</span>
            </span>
          </div>
        ) : null}
      </div>
      <div className="todo-row-actions">
        <Popover
          arrow={{ pointAtCenter: true }}
          classNames={{ root: "todo-popover" }}
          content={<ColorPopover colors={colorPresets} item={item} onSelect={onColorSelect} />}
          destroyOnHidden
          getPopupContainer={() => document.body}
          onOpenChange={(open) => onColorOpen(open ? item.id : "")}
          open={activeColorTodoId === item.id}
          placement="topRight"
          trigger="click"
          zIndex={1100}
        >
          <Tooltip title="选择颜色">
            <Button
              aria-label={`选择颜色 ${color}`}
              className="todo-color-button"
              style={{ "--todo-color": color } as CssVariables}
              type="text"
            >
              <span className="todo-color-dot" aria-hidden="true"></span>
            </Button>
          </Tooltip>
        </Popover>
        <Popover
          arrow={{ pointAtCenter: true }}
          classNames={{ root: "todo-popover" }}
          content={<ReminderPopover item={item} onChange={onReminderChange} onClear={onReminderChange} onClose={() => onReminderOpen("")} />}
          destroyOnHidden
          getPopupContainer={() => document.body}
          onOpenChange={(open) => onReminderOpen(open ? item.id : "")}
          open={activeReminderTodoId === item.id}
          placement="topRight"
          trigger="click"
          zIndex={1100}
        >
          <Tooltip title="设置提醒">
            <Button
              aria-label="设置提醒"
              className="todo-reminder-button"
              icon={<ClockCircleOutlined />}
              type="text"
            />
          </Tooltip>
        </Popover>
        <Tooltip title="删除">
          <Button
            aria-label={`删除 ${item.text}`}
            className="todo-icon-button"
            icon={<DeleteOutlined />}
            onClick={() => onDeleteTodo(item.id)}
            type="text"
          />
        </Tooltip>
      </div>
    </article>
  );
}
