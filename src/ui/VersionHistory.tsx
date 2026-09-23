// 版本台账：接班冻结基线 + 结班后每次调整的快照与原因。
import { useState } from "react";
import { ShiftVersion } from "../domain/types";
import { useAppState } from "./useAppState";
import { areaName, personName, pointName } from "../data/catalog";
import { formatStamp } from "../domain/time";

export function VersionHistory() {
  const state = useAppState();
  const [openId, setOpenId] = useState<string | null>(null);
  const versions = [...state.versions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <section className="panel">
      <h2>版本台账（接班基线 / 结班后调整）</h2>
      {versions.length === 0 && <div className="empty">暂无版本记录</div>}
      <div className="ledger">
        {versions.map((version) => {
          const shift = state.shifts.find((item) => item.id === version.shiftId);
          const label = shift
            ? `${areaName(shift.areaId)} ${shift.date} ${shift.start}-${shift.end}`
            : version.shiftId;
          return (
            <article className="ledger-item" key={version.id}>
              <div className="ledger-main">
                <strong>{label}</strong>
                <span className="badge badge-version">v{version.version} 快照</span>
                <span>{version.summary}</span>
                <span className="meta-text">原因：{version.reason}</span>
                <span className="meta-text">{formatStamp(version.createdAt)}</span>
              </div>
              <button className="secondary small" onClick={() => setOpenId(openId === version.id ? null : version.id)}>
                {openId === version.id ? "收起快照" : "查看快照"}
              </button>
              {openId === version.id && <VersionSnapshot version={version} />}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function VersionSnapshot({ version }: { version: ShiftVersion }) {
  const shift = version.snapshot;
  return (
    <div className="snapshot">
      <p className="meta-text">
        阶段：{shift.phase === "draft" ? "草案" : shift.phase === "frozen" ? "接班冻结" : "已结班"} · 版本 v{shift.version}
      </p>
      <div className="snapshot-grid">
        <div>
          <strong>名单</strong>
          <ul>
            {shift.assignments.map((assignment) => (
              <li key={assignment.id}>
                {assignment.post}：{personName(assignment.personId)}
                {assignment.attendance === "absent" ? "（缺岗）" : ""}
                {assignment.handover?.status === "pending" ? `（交接待确认 → ${personName(assignment.handover.substituteId)}）` : ""}
                {assignment.handover?.status === "confirmed" ? `（已由 ${personName(assignment.handover.substituteId)} 替班）` : ""}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <strong>点位结果</strong>
          <ul>
            {shift.checks.map((check) => (
              <li key={check.pointId}>
                {pointName(check.pointId)}：
                {check.status === "pending" ? "未检" : check.status === "ok" ? "正常" : "异常"}
                {check.note ? `（${check.note}）` : ""}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
