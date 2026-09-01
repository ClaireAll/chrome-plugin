import { Button } from "antd";
import type { TodoItem } from "../types";
import { toDateTimeLocal } from "../utils";

type ReminderPopoverProps = {
  item: TodoItem;
  onChange: (id: string, value: string) => void | Promise<void>;
  onClear: (id: string, value: string) => void | Promise<void>;
  onClose: () => void;
};

export function ReminderPopover({ item, onChange, onClear, onClose }: ReminderPopoverProps) {
  return (
    <div className="reminder-popover">
      <label htmlFor={`reminder-${item.id}`}>提醒时间</label>
      <input
        id={`reminder-${item.id}`}
        type="datetime-local"
        value={toDateTimeLocal(item.reminderAt)}
        onChange={(event) => onChange(item.id, event.target.value)}
      />
      <div className="reminder-popover-footer">
        <Button type="text" onClick={() => onClear(item.id, "")}>清除提醒</Button>
        <Button type="text" onClick={onClose}>完成</Button>
      </div>
    </div>
  );
}
