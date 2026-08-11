const WEEKDAYS = [
  { key: "mon", label: "周一", jsDay: 1 },
  { key: "tue", label: "周二", jsDay: 2 },
  { key: "wed", label: "周三", jsDay: 3 },
  { key: "thu", label: "周四", jsDay: 4 },
  { key: "fri", label: "周五", jsDay: 5 },
  { key: "sat", label: "周六", jsDay: 6 },
  { key: "sun", label: "周日", jsDay: 0 }
];

const DEFAULT_HEATMAP_CELL_COLOR = "#DBEAFE";
const TASK_BLOCK_GAP = 4;
const TASK_LABEL_LINE_HEIGHT = 14;

export function getWeekRange(anchorDate = new Date()) {
  const anchor = new Date(anchorDate);
  const start = new Date(anchor);
  const offset = (anchor.getDay() + 6) % 7;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - offset);

  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function buildWeeklySummary(records, anchorDate = new Date()) {
  const { start, end } = getWeekRange(anchorDate);
  const cells = {};

  for (const record of Array.isArray(records) ? records : []) {
    const completedAt = new Date(record?.completedAt);
    if (!record?.text || Number.isNaN(completedAt.getTime()) || completedAt < start || completedAt > end) continue;

    const day = WEEKDAYS.find((item) => item.jsDay === completedAt.getDay());
    const hour = `${String(completedAt.getHours()).padStart(2, "0")}:00`;
    const key = `${hour}|${day.key}`;
    const cell = cells[key] || { items: [], tasks: [], count: 0 };
    cell.items.push({ color: record.color, text: record.text });
    cell.tasks.push(record.text);
    cell.color ||= record.color;
    cell.count += 1;
    cells[key] = cell;
  }

  const occupiedDays = new Set(Object.keys(cells).map((key) => key.split("|")[1]));
  const days = WEEKDAYS.filter((day, index) => index < 5 || occupiedDays.has(day.key));
  const hours = [...new Set(Object.keys(cells).map((key) => key.split("|")[0]))].sort();
  const highestCount = Math.max(0, ...Object.values(cells).map((cell) => cell.count));

  return {
    days,
    hours,
    cells,
    chartHeight: Math.max(180, hours.length * Math.max(54, highestCount * 24) + 92)
  };
}

export function buildEChartsHeatmapOption(summary) {
  const heatmapData = [];
  const taskData = [];

  summary.days.forEach((day, dayIndex) => {
    summary.hours.forEach((hour, hourIndex) => {
      const cell = summary.cells[`${hour}|${day.key}`];
      if (cell) {
        const items = getCellItems(cell);
        heatmapData.push({
          value: [dayIndex, hourIndex, cell.count, cell.tasks]
        });
        items.forEach((item, itemIndex) => {
          taskData.push({
            value: [dayIndex, hourIndex, itemIndex, items.length, item.text],
            itemStyle: { color: getHalfAlphaColor(item.color || cell.color) }
          });
        });
      }
    });
  });

  return {
    tooltip: {
      backgroundColor: "#111827",
      borderColor: "transparent",
      borderWidth: 0,
      padding: [8, 10],
      renderMode: "richText",
      textStyle: { color: "#FFFFFF", fontSize: 12, lineHeight: 18 },
      formatter: ({ data: point }) => getPointTasks(point).join("\n")
    },
    grid: { top: 28, right: 18, bottom: 18, left: 58, containLabel: true },
    xAxis: {
      type: "category",
      data: summary.days.map((day) => day.label),
      axisLine: { lineStyle: { color: "#DDE6F2" } },
      axisTick: { show: false },
      axisLabel: { color: "#63718A", fontSize: 12 },
      splitArea: { show: true, areaStyle: { color: ["#FFFFFF", "#F8FAFD"] } }
    },
    yAxis: {
      type: "category",
      data: summary.hours,
      inverse: true,
      axisLine: { lineStyle: { color: "#DDE6F2" } },
      axisTick: { show: false },
      axisLabel: { color: "#63718A", fontSize: 12 },
      splitArea: { show: true, areaStyle: { color: ["#FFFFFF", "#F8FAFD"] } }
    },
    series: [
      {
        type: "heatmap",
        data: heatmapData,
        silent: true,
        tooltip: { show: false },
        itemStyle: { color: "rgba(0, 0, 0, 0)" },
        emphasis: { disabled: true },
        label: { show: false }
      },
      {
        type: "custom",
        coordinateSystem: "cartesian2d",
        data: taskData,
        encode: { x: 0, y: 1 },
        renderItem: renderTaskBlock,
        z: 2,
        emphasis: { itemStyle: { shadowBlur: 8, shadowColor: "rgba(31, 41, 51, 0.16)" } }
      }
    ]
  };
}

function renderTaskBlock(params, api) {
  const center = api.coord([api.value(0), api.value(1)]);
  const cellSize = api.size([1, 1]);
  const itemIndex = Number(api.value(2)) || 0;
  const itemTotal = Math.max(1, Number(api.value(3)) || 1);
  const rawValue = Array.isArray(params.data?.value) ? params.data.value : [];
  const text = String(rawValue[4] || api.value(4) || "");
  const cellWidth = Math.max(42, cellSize[0] - 8);
  const cellHeight = Math.max(24, cellSize[1] - 8);
  const totalGap = TASK_BLOCK_GAP * Math.max(0, itemTotal - 1);
  const blockHeight = Math.max(20, Math.min(36, (cellHeight - totalGap) / itemTotal));
  const totalHeight = blockHeight * itemTotal + totalGap;
  const coordTop = params.coordSys.y + 2;
  const coordBottom = params.coordSys.y + params.coordSys.height - 2;
  const minStackTop = coordTop;
  const maxStackTop = Math.max(coordTop, coordBottom - totalHeight);
  const stackTop = clamp(center[1] - totalHeight / 2, minStackTop, maxStackTop);
  const rect = {
    height: blockHeight,
    width: cellWidth,
    x: center[0] - cellWidth / 2,
    y: stackTop + itemIndex * (blockHeight + TASK_BLOCK_GAP)
  };
  const clipRectByRect = globalThis.echarts?.graphic?.clipRectByRect;
  const shape = clipRectByRect
    ? clipRectByRect(rect, {
      height: params.coordSys.height,
      width: params.coordSys.width,
      x: params.coordSys.x,
      y: params.coordSys.y
    })
    : rect;
  if (!shape) return null;
  const labelWidth = Math.max(16, shape.width - 12);
  const labelHeight = Math.max(10, shape.height - 6);
  const label = formatTaskLabel(text, labelWidth, labelHeight);

  return {
    type: "group",
    children: [
      {
        type: "rect",
        shape: { ...shape, r: 4 },
        style: api.style()
      },
      {
        type: "text",
        style: {
          align: "center",
          fill: "#152033",
          font: "700 12px sans-serif",
          lineHeight: TASK_LABEL_LINE_HEIGHT,
          text: label,
          verticalAlign: "middle",
          width: labelWidth,
          x: shape.x + shape.width / 2,
          y: shape.y + shape.height / 2
        }
      }
    ]
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatTaskLabel(text, width, height) {
  const units = Array.from(text);
  const maxLines = Math.max(1, Math.floor(height / TASK_LABEL_LINE_HEIGHT));
  const maxUnitsPerLine = Math.max(2, Math.floor(width / 8));
  if (units.length <= maxUnitsPerLine) return text;

  const lines = [];
  let cursor = 0;
  while (cursor < units.length && lines.length < maxLines) {
    const isLastLine = lines.length === maxLines - 1;
    const chunk = units.slice(cursor, cursor + maxUnitsPerLine);
    cursor += chunk.length;
    if (isLastLine && cursor < units.length) {
      lines.push(`${chunk.slice(0, Math.max(1, maxUnitsPerLine - 3)).join("")}...`);
      break;
    }
    lines.push(chunk.join(""));
  }
  return lines.join("\n");
}

function getHalfAlphaColor(color) {
  const hex = normalizeHexColor(color) || DEFAULT_HEATMAP_CELL_COLOR;
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, 0.5)`;
}

function normalizeHexColor(color) {
  return /^#[0-9a-f]{6}$/i.test(color || "") ? color.toLowerCase() : "";
}

function getCellItems(cell) {
  if (Array.isArray(cell?.items) && cell.items.length) return cell.items;
  return Array.isArray(cell?.tasks) ? cell.tasks.map((text) => ({ color: cell.color, text })) : [];
}

function getPointTasks(point) {
  const value = Array.isArray(point) ? point : point?.value;
  if (typeof value?.[4] === "string") return [value[4]];
  return Array.isArray(value?.[3]) ? value[3] : [];
}
