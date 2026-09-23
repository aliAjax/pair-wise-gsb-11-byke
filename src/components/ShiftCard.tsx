// 页面：班次卡。覆盖值班登记、缺岗替班、交接确认、点位检查、
// 接班冻结、开班/结班、结班后调整与历史版本查看。

import { useState } from "react";
import {
  Assignment,
  InspectionResult,
  ScheduleState,
  Shift,
} from "../domain/types";
import {
  RESULT_CYCLE,
  eligibleSubstitutes,
  hasValidQualification,
  responsibilityNote,
  rosterEditable,
  shiftTimeLabel,
  validateShift,
} from "../domain/rules";
import { PEOPLE, POINTS, personName, pointName, pointsOfArea } from "../data/people";
import { ScheduleActions } from "../state/useSchedule";

const STATUS_LABEL: Record<Shift["status"], string> = {
  draft: "编制中",
  active: "进行中",
  closed: "已结班",
};

const RESULT_CLASS: Record<InspectionResult, string> = {
  未检: "result-pending",
  正常: "result-ok",
  异常: "result-bad",
};

function resultClass(result: InspectionResult): string {
  return `result ${RESULT_CLASS[result]}`;
}

export function ShiftCardView({
  state,
  shift,
  actions,
}: {
  state: ScheduleState;
  shift: Shift;
  actions: ScheduleActions;
}) {
  const [snapshotVersion, setSnapshotVersion] = useState<number | null>(null);
  const issues = validateShift(shift, state.shifts, PEOPLE, POINTS);
  const valid = issues.length === 0;

  const versionSnap = snapshotVersion
    ? shift.versions.find((v) => v.version === snapshotVersion)?.snapshot ?? null
    : null;

  if (versionSnap) {
    return (
      <article className="record shift-card snapshot-card">
        <div className="record-head">
          <div>
            <p className="record-title">
              {versionSnap.area} {shiftTimeLabel(versionSnap)}
            </p>
            <p className="snapshot-tag">
              只读快照 · v{snapshotVersion}（当前为 v{shift.version}）
            </p>
          </div>
          <button type="button" className="secondary" onClick={() => setSnapshotVersion(null)}>
            返回当前版本
          </button>
        </div>
        <ReadOnlyBody state={state} shift={versionSnap} />
      </article>
    );
  }

  const editable = rosterEditable(shift);
  const pendingHandovers = shift.handovers.filter((h) => h.status === "taken");

  return (
    <article className={`record shift-card ${valid ? "" : "shift-invalid"}`}>
      <div className="record-head">
        <div>
          <p className="record-title">
            {shift.area} {shiftTimeLabel(shift)}
          </p>
          <p className="shift-meta">
            {shift.status === "closed" && <>版本 v{shift.version} · </>}
            {shift.frozenAt ? "名单与点位已冻结" : editable ? "名单可调整" : ""}
          </p>
        </div>
        <div className="head-badges">
          {!valid && <span className="status status-invalid">整班不成立</span>}
          <span className={`status status-${shift.status}`}>{STATUS_LABEL[shift.status]}</span>
        </div>
      </div>

      {!valid && (
        <ul className="issue-list">
          {issues.map((issue, i) => (
            <li key={i}>{issue.message}</li>
          ))}
        </ul>
      )}

      <div className="assignments">
        {shift.assignments.map((assignment) => (
          <AssignmentBlock
            key={assignment.id}
            state={state}
            shift={shift}
            assignment={assignment}
            actions={actions}
          />
        ))}
      </div>

      {editable && <AddAssignment shift={shift} actions={actions} />}

      {shift.handovers.length > 0 && (
        <div className="handovers">
          <p className="section-label">交接记录</p>
          {shift.handovers.map((h) => (
            <div className="handover" key={h.id}>
              <span>
                {personName(h.fromPersonId)} → {personName(h.toPersonId)}（
                {h.pointIds.map(pointName).join("、")}）
              </span>
              {h.status === "taken" ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => actions.confirmHandover(shift.id, h.id)}
                >
                  原值班人确认交接（当前责任未释放）
                </button>
              ) : (
                <span className="status status-confirmed">已确认，责任已移交</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="shift-actions">
        {shift.status === "draft" && (
          <>
            <button type="button" disabled={!valid} onClick={() => actions.startShift(shift.id)}>
              开班
            </button>
            <button type="button" className="danger" onClick={() => actions.removeShift(shift.id)}>
              删除班次
            </button>
          </>
        )}
        {shift.status === "active" && (
          <>
            <button type="button" onClick={() => actions.closeShift(shift.id)}>
              结班（漏检转下班）
            </button>
            {pendingHandovers.length > 0 && (
              <span className="warn-inline">有 {pendingHandovers.length} 起交接待原值班人确认</span>
            )}
          </>
        )}
        {shift.status === "closed" && (
          <VersionHistory shift={shift} onView={setSnapshotVersion} />
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------

function AssignmentBlock({
  state,
  shift,
  assignment,
  actions,
}: {
  state: ScheduleState;
  shift: Shift;
  assignment: Assignment;
  actions: ScheduleActions;
}) {
  const person = PEOPLE.find((p) => p.id === assignment.personId);
  const qualValid = person ? hasValidQualification(person, shift.area, shift.date) : false;
  const editable = rosterEditable(shift);
  const note = responsibilityNote(shift, assignment, PEOPLE);
  const areaPoints = pointsOfArea(shift.area);

  return (
    <div className="assignment">
      <div className="assignment-head">
        <div>
          <strong>{personName(assignment.personId)}</strong>
          {assignment.state === "substituted" &&
            assignment.originalPersonId !== assignment.personId && (
              <span className="sub-tag">（替 {personName(assignment.originalPersonId)}）</span>
            )}
          <span className={`qual-line ${qualValid ? "" : "qual-bad"}`}>
            {assignment.qualification.title} · 登记有效期至 {assignment.qualification.expiresAt}
          </span>
        </div>
        <span className={`status state-${assignment.state}`}>
          {assignment.state === "on_duty" && "在岗"}
          {assignment.state === "absent" && "缺岗"}
          {assignment.state === "substituted" && "已替班"}
        </span>
      </div>

      <div className="point-list">
        {assignment.pointIds.map((pointId) => (
          <div className="point-row" key={pointId}>
            <span className="point-name">{pointName(pointId)}</span>
            {shift.status === "active" ? (
              <button
                type="button"
                className={resultClass(assignment.results[pointId] ?? "未检")}
                onClick={() => {
                  const current = assignment.results[pointId] ?? "未检";
                  const next =
                    RESULT_CYCLE[(RESULT_CYCLE.indexOf(current) + 1) % RESULT_CYCLE.length];
                  actions.setResult(shift.id, assignment.id, pointId, next);
                }}
              >
                {assignment.results[pointId] ?? "未检"}（点击切换）
              </button>
            ) : shift.status === "closed" ? (
              <ClosedResultEditor
                shift={shift}
                assignment={assignment}
                pointId={pointId}
                actions={actions}
              />
            ) : (
              <span className="hint">开班后登记</span>
            )}
          </div>
        ))}
      </div>

      {editable && (
        <div className="point-picks">
          {areaPoints.map((point) => {
            const checked = assignment.pointIds.includes(point.id);
            return (
              <label className="point-pick" key={point.id}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? assignment.pointIds.filter((id) => id !== point.id)
                      : [...assignment.pointIds, point.id];
                    actions.updateAssignmentPoints(shift.id, assignment.id, next);
                  }}
                />
                {point.name}
              </label>
            );
          })}
          <button
            type="button"
            className="danger tiny"
            onClick={() => actions.removeAssignment(shift.id, assignment.id)}
          >
            移除该值班人
          </button>
        </div>
      )}

      {assignment.state === "absent" && shift.status === "active" && (
        <SubstitutePicker state={state} shift={shift} assignment={assignment} actions={actions} />
      )}

      {assignment.state === "on_duty" && shift.status === "active" && (
        <button
          type="button"
          className="secondary tiny"
          onClick={() => actions.markAbsent(shift.id, assignment.id)}
        >
          登记缺岗
        </button>
      )}
      {assignment.state === "absent" && shift.status === "active" && (
        <button
          type="button"
          className="secondary tiny"
          onClick={() => actions.cancelAbsent(shift.id, assignment.id)}
        >
          撤销缺岗
        </button>
      )}
      {note && <p className="responsibility">{note}</p>}
    </div>
  );
}

function SubstitutePicker({
  state,
  shift,
  assignment,
  actions,
}: {
  state: ScheduleState;
  shift: Shift;
  assignment: Assignment;
  actions: ScheduleActions;
}) {
  const candidates = eligibleSubstitutes(shift, assignment, state.shifts, PEOPLE);
  const eligible = candidates.filter((c) => !c.reason);
  const [picked, setPicked] = useState("");

  return (
    <div className="substitute-box">
      <p className="section-label">安排替班（须同区域、资格有效且本班空闲）</p>
      <select value={picked} onChange={(e) => setPicked(e.target.value)}>
        <option value="">选择替班人</option>
        {eligible.map((c) => (
          <option key={c.person.id} value={c.person.id}>
            {c.person.name}（可替班）
          </option>
        ))}
        {candidates
          .filter((c) => c.reason)
          .map((c) => (
            <option key={c.person.id} value={c.person.id} disabled>
              {c.person.name}（{c.reason}）
            </option>
          ))}
      </select>
      <button
        type="button"
        className="tiny"
        disabled={!picked}
        onClick={() => actions.takeOver(shift.id, assignment.id, picked)}
      >
        接班（冻结名单与点位）
      </button>
      {eligible.length === 0 && <p className="warn-inline">当前没有符合条件的替班人</p>}
    </div>
  );
}

function AddAssignment({ shift, actions }: { shift: Shift; actions: ScheduleActions }) {
  const [personId, setPersonId] = useState("");
  const [pointIds, setPointIds] = useState<string[]>([]);
  const areaPoints = pointsOfArea(shift.area);

  return (
    <div className="add-assignment">
      <p className="section-label">增列值班人（接班前可调整）</p>
      <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
        <option value="">选择值班人</option>
        {PEOPLE.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <div className="point-picks">
        {areaPoints.map((point) => (
          <label className="point-pick" key={point.id}>
            <input
              type="checkbox"
              checked={pointIds.includes(point.id)}
              onChange={() =>
                setPointIds(
                  pointIds.includes(point.id)
                    ? pointIds.filter((id) => id !== point.id)
                    : [...pointIds, point.id]
                )
              }
            />
            {point.name}
          </label>
        ))}
      </div>
      <button
        type="button"
        className="tiny secondary"
        disabled={!personId}
        onClick={() => {
          if (actions.addAssignment(shift.id, personId, pointIds)) {
            setPersonId("");
            setPointIds([]);
          }
        }}
      >
        加入本班
      </button>
    </div>
  );
}

function ClosedResultEditor({
  shift,
  assignment,
  pointId,
  actions,
}: {
  shift: Shift;
  assignment: Assignment;
  pointId: string;
  actions: ScheduleActions;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<InspectionResult>("正常");
  const [reason, setReason] = useState("");
  const current = assignment.results[pointId] ?? "未检";

  if (!open) {
    return (
      <span className="closed-edit">
        <span className={resultClass(current)}>{current}</span>
        <button type="button" className="secondary tiny" onClick={() => setOpen(true)}>
          申请调整（另建版本）
        </button>
      </span>
    );
  }

  return (
    <span className="adjust-form">
      <select value={result} onChange={(e) => setResult(e.target.value as InspectionResult)}>
        {RESULT_CYCLE.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      <input
        placeholder="调整原因（必填）"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <button
        type="button"
        className="tiny"
        onClick={() => {
          if (actions.adjustClosedResult(shift.id, assignment.id, pointId, result, reason)) {
            setOpen(false);
            setReason("");
          }
        }}
      >
        确认调整
      </button>
      <button type="button" className="tiny secondary" onClick={() => setOpen(false)}>
        取消
      </button>
    </span>
  );
}

function VersionHistory({
  shift,
  onView,
}: {
  shift: Shift;
  onView: (version: number) => void;
}) {
  if (shift.versions.length === 0) {
    return <span className="hint">当前 v{shift.version}，暂无调整记录</span>;
  }
  return (
    <div className="versions">
      <p className="section-label">结班后调整记录（当前 v{shift.version}）</p>
      {shift.versions.map((v) => (
        <div className="version-row" key={v.id}>
          <span>
            v{v.version} · {new Date(v.createdAt).toLocaleString("zh-CN")}
            <em>{v.reason}</em>
          </span>
          <button type="button" className="secondary tiny" onClick={() => onView(v.version)}>
            查看快照
          </button>
        </div>
      ))}
    </div>
  );
}

function ReadOnlyBody({ state, shift }: { state: ScheduleState; shift: Shift }) {
  return (
    <div className="assignments">
      {shift.assignments.map((a) => (
        <div className="assignment" key={a.id}>
          <div className="assignment-head">
            <strong>{personName(a.personId)}</strong>
            <span className={`status state-${a.state}`}>
              {a.state === "on_duty" ? "在岗" : a.state === "absent" ? "缺岗" : "已替班"}
            </span>
          </div>
          <div className="point-list">
            {a.pointIds.map((pid) => (
              <div className="point-row" key={pid}>
                <span className="point-name">{pointName(pid)}</span>
                <span className={resultClass(a.results[pid] ?? "未检")}>{a.results[pid] ?? "未检"}</span>
              </div>
            ))}
          </div>
          {responsibilityNote(shift, a, PEOPLE) && <p className="responsibility">{responsibilityNote(shift, a, PEOPLE)}</p>}
        </div>
      ))}
      {shift.handovers.length > 0 && (
        <p className="hint">
          交接：{shift.handovers.map((h) => `${personName(h.fromPersonId)}→${personName(h.toPersonId)}（${h.status === "confirmed" ? "已确认" : "待确认"}）`).join("；")}
        </p>
      )}
      {state.todos.filter((t) => t.sourceShiftId === shift.id).length > 0 && (
        <p className="hint">
          本班漏检待办：
          {state.todos
            .filter((t) => t.sourceShiftId === shift.id)
            .map((t) => `${pointName(t.pointId)}·${t.status === "done" ? "已补检" : "待补检"}`)
            .join("、")}
        </p>
      )}
    </div>
  );
}
