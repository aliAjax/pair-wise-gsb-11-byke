// 替班交接台账：跨班次汇总所有交接单及其责任状态。
import { useAppState } from "./useAppState";
import { areaName, personName, qualificationName } from "../data/catalog";
import { formatStamp } from "../domain/time";

const STATUS_TEXT = {
  pending: "待原值班人确认（责任未释放）",
  confirmed: "已确认，责任转给替班人",
  cancelled: "已撤回，岗位恢复缺岗"
} as const;

export function HandoverLedger() {
  const state = useAppState();
  const records = state.shifts.flatMap((shift) =>
    shift.assignments
      .filter((assignment) => assignment.handover)
      .map((assignment) => ({ shift, assignment, handover: assignment.handover! }))
  );

  return (
    <section className="panel">
      <h2>替班交接台账</h2>
      {records.length === 0 && <div className="empty">暂无替班交接</div>}
      <div className="ledger">
        {records.map(({ shift, assignment, handover }) => (
          <article className={`ledger-item handover-${handover.status}`} key={handover.id}>
            <div className="ledger-main">
              <strong>{assignment.post}</strong>
              <span className="meta-text">
                {areaName(shift.areaId)} · {shift.date} {shift.start}-{shift.end}
              </span>
              <span className="meta-text">所需资格：{qualificationName(assignment.requiredQualificationId)}</span>
              <span>
                {personName(assignment.personId)} → <strong>{personName(handover.substituteId)}</strong>
              </span>
              <span className="meta-text">原因：{handover.reason}</span>
              <span className={`badge ${handover.status === "pending" ? "badge-warn" : handover.status === "confirmed" ? "badge-ok" : "badge-muted"}`}>
                {STATUS_TEXT[handover.status]}
              </span>
              <span className="meta-text">
                发起 {formatStamp(handover.requestedAt)}
                {handover.confirmedAt ? ` · 确认 ${formatStamp(handover.confirmedAt)}` : ""}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
