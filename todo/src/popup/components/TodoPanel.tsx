import PlusOutlined from "@ant-design/icons/PlusOutlined";
import { Button, Input } from "antd";
import type {
  CompletedCounts,
  CssVariables,
  InputChangeEvent,
  InputKeyEvent,
  InputRefObject,
  TodoDropPosition,
  TodoItem
} from "../types";
import { TodoRow } from "./TodoRow";
import { SummaryStrip } from "./SummaryStrip";

type TodoPanelProps = {
  activeColorTodoId: string;
  activeReminderTodoId: string;
  colorPresets: string[];
  counts: CompletedCounts;
  draggedTodoId: string;
  draftColor: string;
  editInputRef: InputRefObject;
  editingTodoId: string;
  editingTodoText: string;
  items: TodoItem[];
  newTodoDraft: string | null;
  newTodoInputRef: InputRefObject;
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
  onNewTodoChange: (event: InputChangeEvent) => void;
  onNewTodoCommit: () => void | Promise<void>;
  onNewTodoKeyDown: (event: InputKeyEvent) => void;
  onStartNewTodo: () => void;
};

export function TodoPanel({
  activeColorTodoId,
  activeReminderTodoId,
  colorPresets,
  counts,
  draggedTodoId,
  draftColor,
  editInputRef,
  editingTodoId,
  editingTodoText,
  items,
  newTodoDraft,
  newTodoInputRef,
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
  onEditStart,
  onNewTodoChange,
  onNewTodoCommit,
  onNewTodoKeyDown,
  onStartNewTodo
}: TodoPanelProps) {
  return (
    <section className="tab-panel overview-panel">
      <Button className="add-todo-button" icon={<PlusOutlined />} onClick={onStartNewTodo} type="text">
        新增待办
      </Button>
      <div className="todo-list" aria-live="polite">
        {newTodoDraft !== null ? (
          <article className="todo-row todo-row--draft" style={{ "--todo-color": draftColor } as CssVariables}>
            <span className="todo-draft-marker" aria-hidden="true"><PlusOutlined /></span>
            <div className="todo-row-main">
              <Input
                ref={newTodoInputRef}
                autoFocus
                className="todo-edit-input"
                maxLength={200}
                placeholder="输入待办内容"
                value={newTodoDraft}
                onBlur={onNewTodoCommit}
                onChange={onNewTodoChange}
                onKeyDown={onNewTodoKeyDown}
              />
            </div>
            <span aria-hidden="true"></span>
          </article>
        ) : null}
        {items.map((item) => (
          <TodoRow
            key={item.id}
            colorPresets={colorPresets}
            draggedTodoId={draggedTodoId}
            item={item}
            activeColorTodoId={activeColorTodoId}
            activeReminderTodoId={activeReminderTodoId}
            editInputRef={editInputRef}
            editingTodoId={editingTodoId}
            editingTodoText={editingTodoText}
            onColorOpen={onColorOpen}
            onColorSelect={onColorSelect}
            onCompleteTodo={onCompleteTodo}
            onDeleteTodo={onDeleteTodo}
            onDragEnd={onDragEnd}
            onDragStart={onDragStart}
            onMoveTodo={onMoveTodo}
            onReminderChange={onReminderChange}
            onReminderOpen={onReminderOpen}
            onEditChange={onEditChange}
            onEditCommit={onEditCommit}
            onEditKeyDown={onEditKeyDown}
            onEditStart={onEditStart}
          />
        ))}
        {!items.length && newTodoDraft === null ? <p className="empty-state">还没有待办，先记下一件小事吧</p> : null}
      </div>
      <SummaryStrip counts={counts} />
    </section>
  );
}
