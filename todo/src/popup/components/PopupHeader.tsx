type PopupHeaderProps = {
  itemCount: number;
  weeklyCompleted: number;
};

export function PopupHeader({ itemCount, weeklyCompleted }: PopupHeaderProps) {
  return (
    <header className="popup-header">
      <div className="popup-brand">
        <div>
          <div className="popup-title-row">
            <h1>我的待办</h1>
            <span className="todo-count">{itemCount}</span>
          </div>
          <p>{weeklyCompleted ? `本周已经完成 ${weeklyCompleted} 项，继续保持` : "今天也保持一点点进展"}</p>
        </div>
      </div>
    </header>
  );
}
