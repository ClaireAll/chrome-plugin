const WEEKDAYS = [
  { key: "mon", label: "周一", jsDay: 1 },
  { key: "tue", label: "周二", jsDay: 2 },
  { key: "wed", label: "周三", jsDay: 3 },
  { key: "thu", label: "周四", jsDay: 4 },
  { key: "fri", label: "周五", jsDay: 5 },
  { key: "sat", label: "周六", jsDay: 6 },
  { key: "sun", label: "周日", jsDay: 0 }
];

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
    const cell = cells[key] || { tasks: [], count: 0 };
    cell.tasks.push(record.text);
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
  const data = [];

  summary.days.forEach((day, dayIndex) => {
    summary.hours.forEach((hour, hourIndex) => {
      const cell = summary.cells[`${hour}|${day.key}`];
      if (cell) data.push([dayIndex, hourIndex, cell.count, cell.tasks]);
    });
  });

  return {
    tooltip: {
      renderMode: "richText",
      formatter: ({ data: point }) => point?.[3]?.join("\n") || ""
    },
    grid: { top: 28, right: 16, bottom: 16, left: 58, containLabel: true },
    xAxis: { type: "category", data: summary.days.map((day) => day.label), splitArea: { show: true } },
    yAxis: { type: "category", data: summary.hours, inverse: true, splitArea: { show: true } },
    visualMap: { min: 0, max: Math.max(1, ...data.map((point) => point[2])), show: false },
    series: [{
      type: "heatmap",
      data,
      label: {
        show: true,
        formatter: ({ data: point }) => point?.[3]?.join("\n") || ""
      },
      emphasis: { itemStyle: { shadowBlur: 8, shadowColor: "rgba(31, 41, 51, 0.22)" } }
    }]
  };
}
