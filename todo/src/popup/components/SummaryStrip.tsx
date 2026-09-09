import BarChartOutlined from "@ant-design/icons/BarChartOutlined";
import CheckOutlined from "@ant-design/icons/CheckOutlined";
import type { CompletedCounts } from "../types";

type SummaryStripProps = {
  counts: CompletedCounts;
};

export function SummaryStrip({ counts }: SummaryStripProps) {
  return (
    <div className="summary-strip" aria-label="完成统计">
      <div className="summary-stat">
        <span className="summary-icon summary-icon--today" aria-hidden="true"><CheckOutlined /></span>
        <span><strong>{counts.today}</strong><small>今日完成</small></span>
      </div>
      <span className="summary-divider" aria-hidden="true"></span>
      <div className="summary-stat">
        <span className="summary-icon summary-icon--week" aria-hidden="true"><BarChartOutlined /></span>
        <span><strong>{counts.week}</strong><small>本周完成</small></span>
      </div>
    </div>
  );
}
