// 漏检待办台账：展示结班漏检如何转下班，支持手动关闭。
import { useState } from "react";
import { useAppState } from "./useAppState";
import { resolveTodo } from "../domain/actions";
import { areaName } from "../data/catalog";
import { formatStamp } from "../domain/time";

export function TodoBoard({ onError }: { onError: (message: string) => void }) {
  const state = useAppState();
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const shiftLabel = (id?: string) => {
    if (!id) return "等待同区域下一班";
    const shift = state.shifts.find((item) => item.id === id);
    if (!shift) return id;
    return `${areaName(shift.areaId)} ${shift.date} ${shift.start}-${shift.end}`;
  };

  return (
    <section className="panel">
      <h2>漏检待办（结班转下班）</h2>
      {state.todos.length === 0 && <div className="empty">暂无漏检待办</div>}
      <div className="ledger">
        {state.todos.map((todo) => (
          <article className={`ledger-item ${todo.status}`} key={todo.id}>
            <div className="ledger-main">
              <strong>{todo.pointName}</strong>
              <span className="meta-text">{areaName(todo.areaId)}</span>
              <span className="badge badge-muted">结班漏检于 {formatStamp(todo.createdAt)}</span>
              <span className="meta-text">转入：{shiftLabel(todo.targetShiftId)}</span>
              {todo.status === "done" && (
                <span className="badge badge-ok">已处理 {formatStamp(todo.resolvedAt)}{todo.note ? ` · ${todo.note}` : ""}</span>
              )}
            </div>
            {todo.status === "open" && (
              noteFor === todo.id ? (
                <div className="inline-edit">
                  <input placeholder="处理说明" value={note} onChange={(e) => setNote(e.target.value)} />
                  <button
                    className="small"
                    onClick={() => {
                      try {
                        resolveTodo(todo.id, note);
                        setNoteFor(null);
                        setNote("");
                      } catch (error) {
                        onError(error instanceof Error ? error.message : "操作失败");
                      }
                    }}
                  >
                    关闭待办
                  </button>
                  <button className="secondary small" onClick={() => setNoteFor(null)}>取消</button>
                </div>
              ) : (
                <button className="secondary small" onClick={() => setNoteFor(todo.id)}>标记已处理</button>
              )
            )}
          </article>
        ))}
      </div>
      <p className="hint">
        待办在接班班次登记该点位「正常/异常」时会自动关闭；结班时仍开放的待办会自动改派给同区域下一班。
      </p>
    </section>
  );
}
