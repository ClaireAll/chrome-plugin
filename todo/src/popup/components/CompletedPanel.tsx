import CheckOutlined from "@ant-design/icons/CheckOutlined";
import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import SearchOutlined from "@ant-design/icons/SearchOutlined";
import { Button, Input, Tooltip } from "antd";
import type { CompletedTextBlurEvent, CompletedData, CompletedRecord } from "../types";
import { formatCompletedAt, getCompletedCounts } from "../utils";
import { WeeklyTrend } from "./WeeklyTrend";

type CompletedPanelProps = {
  completedData: CompletedData;
  completedError: string;
  completedRecords: CompletedRecord[];
  completedSearch: string;
  deleteCompletedRecord: (recordIndex: number) => void | Promise<void>;
  onCompletedSearchChange: (value: string) => void;
  onUpdateCompletedText: (event: CompletedTextBlurEvent, recordIndex: number) => void | Promise<void>;
};

export function CompletedPanel({
  completedData,
  completedError,
  completedRecords,
  completedSearch,
  deleteCompletedRecord,
  onCompletedSearchChange,
  onUpdateCompletedText
}: CompletedPanelProps) {
  const counts = getCompletedCounts(completedData);
  const filteredRecords = completedRecords
    .map((record, recordIndex) => ({ ...record, recordIndex }))
    .filter((record) => record.text.toLowerCase().includes(completedSearch.trim().toLowerCase()))
    .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt));

  return (
    <section className="tab-panel completed-panel">
      <div className="completed-scroll">
        <div className="completed-records-section">
          <div className="completed-list-toolbar">
            <Input
              className="search-field"
              placeholder="搜索完成记录"
              prefix={<SearchOutlined />}
              value={completedSearch}
              onChange={(event) => onCompletedSearchChange(event.target.value)}
            />
          </div>
          <div className="completed-list" aria-live="polite">
            {!filteredRecords.length ? (
              <div className="completed-empty">
                {completedError ? "绑定配置文件后显示完成记录" : completedSearch.trim() ? "没有匹配的完成记录" : "还没有完成记录"}
              </div>
            ) : filteredRecords.map((record) => (
              <article className="todo-row completed-todo-row" key={`${record.recordIndex}-${record.completedAt}`}>
                <span className="completed-check" aria-hidden="true"><CheckOutlined /></span>
                <div className="todo-row-main">
                  <div
                    className="completed-record-text"
                    contentEditable
                    onBlur={(event) => onUpdateCompletedText(event, record.recordIndex)}
                    suppressContentEditableWarning
                  >
                    {record.text}
                  </div>
                  <time className="completed-time" dateTime={record.completedAt}>{formatCompletedAt(record.completedAt)}</time>
                </div>
                <Tooltip title="删除">
                  <Button
                    aria-label={`删除 ${record.text}`}
                    className="todo-icon-button completed-delete-button"
                    icon={<DeleteOutlined />}
                    onClick={() => deleteCompletedRecord(record.recordIndex)}
                    type="text"
                  />
                </Tooltip>
              </article>
            ))}
          </div>
        </div>
        <WeeklyTrend counts={counts} />
      </div>
    </section>
  );
}
