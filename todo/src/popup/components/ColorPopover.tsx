import { DEFAULT_COLOR_PRESETS } from "../../shared/domain.ts";
import type { CssVariables, TodoItem } from "../types";
import { normalizePickerColor } from "../utils";

type ColorPopoverProps = {
  colors: string[];
  item: TodoItem;
  onSelect: (id: string, color: string) => void | Promise<void>;
};

export function ColorPopover({ colors, item, onSelect }: ColorPopoverProps) {
  const availableColors = Array.isArray(colors) && colors.length ? colors : DEFAULT_COLOR_PRESETS;
  const activeColor = normalizePickerColor(item.color);

  return (
    <div className="color-popover" role="menu" aria-label="选择任务颜色">
      {availableColors.map((color) => {
        const normalized = normalizePickerColor(color);
        return (
          <button
            aria-label={normalized}
            className={`color-choice${normalized === activeColor ? " is-active" : ""}`}
            key={normalized}
            onClick={() => onSelect(item.id, normalized)}
            style={{ "--choice-color": normalized } as CssVariables}
            type="button"
          />
        );
      })}
    </div>
  );
}
