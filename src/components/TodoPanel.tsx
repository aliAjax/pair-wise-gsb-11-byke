// 页面：漏检待办。结班漏检转入同区域下一班；下一班也结班则继续顺延。

import { ScheduleState, Shift } from "../domain/types";
import { pointName } from "../data/people";
import { shiftTimeLabel } from "../domain/rules";
import { ScheduleActions } from "../state/useSchedule";

function shiftLabel(shifts: Shift[], id: string | null): string {
  if (!id) return "待排下一班";
  const shift = shifts.find((s) => s.id === id);
  return shift ? `${shift.area} ${shiftTimeLabel(shift)}` : "班次已删除";
}

export function TodoPanel({
  state,
  actions,
}: {
  state: ScheduleState;
  actions: ScheduleActions;
}) {
  const pending = state.todos.filter((t) => t.status === "pending");
  const done = state.todos.filter((t) => t.status === "done");

  return (
    <section className="panel">
      <h2>漏检待办（{pending.length}）</h2>
      {pending.length === 0 && <p className="empty-inline">暂无待补检点位</p>}
      <div className="todo-list">
        {pending.map((todo) => {
          const target = state.shifts.find((s) => s.id === todo.targetShiftId);
          const canComplete = target?.status === "active";
          const title = !todo.targetShiftId
            ? "同区域暂无下一班，待排班后承接"
            : target?.status === "closed"
              ? "承接班次已结班，待办顺延"
              : target?.status === "draft"
                ? "承接班次尚未开班"
                : "在承接班次内补检完成";
          return (
            <div className="todo" key={todo.id}>
              <div>
                <strong>
                  {todo.area} · {pointName(todo.pointId)}
                </strong>
                <span className="todo-meta">
                  源自 {shiftLabel(state.shifts, todo.sourceShiftId)}
                  {todo.generation > 0 && ` · 已顺延${todo.generation}次`}
                  <br />
                  转入：{shiftLabel(state.shifts, todo.targetShiftId)}
                </span>
              </div>
              <button
                type="button"
                disabled={!canComplete}
                title={title}
                onClick={() => actions.completeTodo(todo.id)}
              >
                补检完成
              </button>
            </div>
          );
        })}
      </div>
      {done.length > 0 && (
        <details className="todo-done">
          <summary>已完成 {done.length} 条</summary>
          {done.map((todo) => (
            <p key={todo.id} className="todo-meta">
              {todo.area} · {pointName(todo.pointId)}（{shiftLabel(state.shifts, todo.sourceShiftId)}）
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
