import { Collapse } from "antd";
import type { CompletedCounts } from "../types";
import { WEEKDAY_LABELS } from "../utils";

type WeeklyTrendProps = {
  counts: CompletedCounts;
};

export function WeeklyTrend({ counts }: WeeklyTrendProps) {
  const max = Math.max(1, ...counts.days);

  return (
    <Collapse
      defaultActiveKey={["trend"]}
      className="trend-details"
      expandIconPosition="end"
      items={[{
        key: "trend",
        label: "本周完成趋势",
        children: (
          <div className="trend-grid">
            {counts.days.map((count, index) => {
              const height = count ? Math.max(8, Math.round((count / max) * 68)) : 4;
              return (
                <div className="trend-day" key={WEEKDAY_LABELS[index]} title={`${WEEKDAY_LABELS[index]}完成 ${count} 项`}>
                  <span className="trend-count">{count}</span>
                  <span className="trend-bar-track"><span className="trend-bar" style={{ height }}></span></span>
                  <span>{WEEKDAY_LABELS[index]}</span>
                </div>
              );
            })}
          </div>
        )
      }]}
    />
  );
}
