// 单个班次卡片：随班次阶段（草案/接班冻结/已结班）呈现不同操作。
// 所有动作均委托操作层；组件只负责展示与收集输入。

import { useState } from "react";
import { Assignment, Shift } from "../domain/types";
import { AppState } from "../domain/types";
import {
  QUALIFICATIONS,
  PEOPLE,
  areaName,
  personName,
  pointName,
  pointsInArea,
  qualificationName
} from "../data/catalog";
import {
  addDraftAssignment,
  adjustClosedShift,
  cancelAbsent,
  cancelHandover,
  closeShift,
  confirmHandover,
  deleteDraft,
  getShiftProblems,
  markAbsent,
  removeDraftAssignment,
  requestHandover,
  setCheck,
  startShift,
  updateDraft,
  updateDraftAssignment
} from "../domain/actions";
import { isActiveHandover, replacementCandidates, responsibleId } from "../domain/rules";
import { daysUntil, formatStamp } from "../domain/time";

const PHASE_LABEL: Record<Shift["phase"], string> = {
  draft: "编制草案",
  frozen: "接班冻结中",
  closed: "已结班封存"
};

const CHECK_LABEL = { pending: "未检", ok: "正常", abnormal: "异常" } as const;

export function ShiftCard({
  shift,
  state,
  onError
}: {
  shift: Shift;
  state: AppState;
  onError: (message: string) => void;
}) {
  const problems = getShiftProblems(shift, state);
  const valid = problems.length === 0;
  const carriedTodos = state.todos.filter((todo) => todo.targetShiftId === shift.id && todo.status === "open");

  function run(action: () => void) {
    try {
      action();
    } catch (error) {
      onError(error instanceof Error ? error.message : "操作失败");
    }
  }

  return (
    <article className={`shift-card phase-${shift.phase} ${valid ? "" : "invalid"}`}>
      <header className="shift-head">
        <div>
          <h3>
            {areaName(shift.areaId)} · {shift.date} {shift.start}-{shift.end}
          </h3>
          <p className="shift-meta">
            <span className={`badge badge-${shift.phase}`}>{PHASE_LABEL[shift.phase]}</span>
            <span className="badge badge-version">v{shift.version}</span>
            {shift.phase === "draft" && (
              <span className={`badge ${valid ? "badge-ok" : "badge-bad"}`}>
                {valid ? "整班成立" : "整班不成立"}
              </span>
            )}
            {shift.frozenAt && <span className="meta-text">接班 {formatStamp(shift.frozenAt)}</span>}
            {shift.closedAt && <span className="meta-text">结班 {formatStamp(shift.closedAt)}</span>}
          </p>
        </div>
        <div className="shift-head-actions">
          {shift.phase === "draft" && (
            <>
              <button
                className="primary"
                disabled={!valid}
                title={valid ? "" : "整班不成立时不能接班"}
                onClick={() => run(() => startShift(shift.id))}
              >
                接班（冻结名单点位）
              </button>
              <button className="danger small" onClick={() => run(() => deleteDraft(shift.id))}>删除草案</button>
            </>
          )}
          {shift.phase === "frozen" && (
            <button className="primary" onClick={() => run(() => closeShift(shift.id))}>结班（漏检转待办）</button>
          )}
        </div>
      </header>

      {shift.phase === "draft" && problems.length > 0 && (
        <div className="problem-box">
          <strong>整班不成立，修正后才能接班：</strong>
          <ul>{problems.map((problem) => <li key={problem.message}>{problem.message}</li>)}</ul>
        </div>
      )}

      <section className="card-section">
        <h4>值班名单</h4>
        <div className="assignment-list">
          {shift.assignments.map((assignment) => (
            <AssignmentRow key={assignment.id} shift={shift} assignment={assignment} state={state} onError={onError} run={run} />
          ))}
        </div>
        {shift.phase === "draft" && (
          <AddAssignmentRow shift={shift} onError={onError} run={run} />
        )}
      </section>

      <section className="card-section">
        <h4>
          必到点（{shift.pointIds.length}）
          {shift.phase !== "draft" && (
            <span className="section-extra">
              已检 {shift.checks.filter((c) => c.status !== "pending").length}/{shift.checks.length}
            </span>
          )}
        </h4>
        {shift.phase === "draft" ? (
          <DraftPoints shift={shift} onError={onError} run={run} />
        ) : (
          <FrozenPoints shift={shift} onError={onError} run={run} />
        )}
      </section>

      {carriedTodos.length > 0 && (
        <section className="card-section carried">
          <h4>下班转入待办（{carriedTodos.length}）</h4>
          <ul className="todo-mini">
            {carriedTodos.map((todo) => (
              <li key={todo.id}>
                {todo.pointName}
                <span className="meta-text">来自 {todo.sourceShiftId.startsWith("seed") ? "上一班" : todo.sourceShiftId}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

type Run = (action: () => void) => void;

function AssignmentRow({
  shift,
  assignment,
  state,
  onError,
  run
}: {
  shift: Shift;
  assignment: Assignment;
  state: AppState;
  onError: (message: string) => void;
  run: Run;
}) {
  const [editing, setEditing] = useState(false);
  const responsible = responsibleId(assignment);
  const expiry = PEOPLE.find((p) => p.id === assignment.personId)?.qualifications
    .find((q) => q.qualificationId === assignment.requiredQualificationId)?.expiresAt;
  const remaining = expiry ? daysUntil(expiry, new Date(`${shift.date}T00:00:00`)) : undefined;

  return (
    <div className={`assignment-item ${assignment.attendance === "absent" ? "absent" : ""}`}>
      <div className="assignment-main">
        <div className="assignment-post">
          <strong>{assignment.post}</strong>
          <span className="meta-text">需 {qualificationName(assignment.requiredQualificationId)}</span>
        </div>
        <div className="assignment-person">
          {shift.phase === "draft" && editing ? (
            <DraftAssignmentEdit shift={shift} assignment={assignment} onError={onError} run={run} done={() => setEditing(false)} />
          ) : (
            <>
              <span className="person-name">{personName(assignment.personId)}</span>
              {remaining !== undefined && (
                <span className={`badge ${remaining < 0 ? "badge-bad" : remaining <= 15 ? "badge-warn" : "badge-ok"}`}>
                  {remaining < 0 ? `资格已过期 ${-remaining} 天` : `资格有效至 ${expiry}`}
                </span>
              )}
              {assignment.attendance === "absent" && <span className="badge badge-bad">缺岗</span>}
              {assignment.handover?.status === "pending" && (
                <span className="badge badge-warn">替班待 {personName(assignment.personId)} 确认</span>
              )}
              {assignment.handover?.status === "confirmed" && (
                <span className="badge badge-ok">已由 {personName(assignment.handover.substituteId)} 替班接岗</span>
              )}
              {assignment.handover?.status === "cancelled" && (
                <span className="badge badge-muted">交接已撤回</span>
              )}
              {!assignment.handover && assignment.attendance === "on-duty" && (
                <span className="meta-text">责任人：{responsible ? personName(responsible) : "空缺"}</span>
              )}
            </>
          )}
        </div>
        <div className="assignment-actions">
          {shift.phase === "draft" && (
            <button className="secondary small" onClick={() => setEditing((v) => !v)}>
              {editing ? "收起" : "改派"}
            </button>
          )}
          {shift.phase !== "closed" && assignment.attendance === "on-duty" && !isActiveHandover(assignment) && (
            <button className="secondary small" onClick={() => run(() => markAbsent(shift.id, assignment.id))}>
              登记缺岗
            </button>
          )}
          {shift.phase !== "closed" && assignment.attendance === "absent" &&
            assignment.handover?.status !== "pending" &&
            assignment.handover?.status !== "confirmed" && (
            <button className="secondary small" onClick={() => run(() => cancelAbsent(shift.id, assignment.id))}>
              撤销缺岗
            </button>
          )}
        </div>
      </div>

      {assignment.attendance === "absent" && (
        <HandoverBox shift={shift} assignment={assignment} state={state} onError={onError} run={run} />
      )}
    </div>
  );
}

function DraftAssignmentEdit({
  shift,
  assignment,
  onError,
  run,
  done
}: {
  shift: Shift;
  assignment: Assignment;
  onError: (message: string) => void;
  run: Run;
  done: () => void;
}) {
  const [personId, setPersonId] = useState(assignment.personId);
  const [qualificationId, setQualificationId] = useState(assignment.requiredQualificationId);
  const [post, setPost] = useState(assignment.post);
  const areaPeople = PEOPLE.filter((p) => p.areaIds.includes(shift.areaId));

  return (
    <div className="inline-edit">
      <input value={post} onChange={(e) => setPost(e.target.value)} aria-label="岗位名" />
      <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
        {areaPeople.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
      </select>
      <select value={qualificationId} onChange={(e) => setQualificationId(e.target.value)}>
        {QUALIFICATIONS.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
      </select>
      <button
        className="small"
        onClick={() =>
          run(() => {
            updateDraftAssignment(shift.id, assignment.id, { post, personId, requiredQualificationId: qualificationId });
            done();
          })
        }
      >
        保存
      </button>
      <button className="danger small" onClick={() => run(() => removeDraftAssignment(shift.id, assignment.id))}>
        删除
      </button>
    </div>
  );
}

function AddAssignmentRow({ shift, onError, run }: { shift: Shift; onError: (m: string) => void; run: Run }) {
  const [open, setOpen] = useState(false);
  const [post, setPost] = useState("");
  const [personId, setPersonId] = useState("");
  const [qualificationId, setQualificationId] = useState("");
  const areaPeople = PEOPLE.filter((p) => p.areaIds.includes(shift.areaId));

  if (!open) return <button className="secondary small" onClick={() => setOpen(true)}>+ 增加岗位</button>;

  return (
    <div className="inline-edit add-row">
      <input placeholder="岗位名" value={post} onChange={(e) => setPost(e.target.value)} />
      <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
        <option value="">值班人</option>
        {areaPeople.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
      </select>
      <select value={qualificationId} onChange={(e) => setQualificationId(e.target.value)}>
        <option value="">所需资格</option>
        {QUALIFICATIONS.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
      </select>
      <button
        className="small"
        onClick={() =>
          run(() => {
            if (!post.trim() || !personId || !qualificationId) {
              onError("请填写完整岗位信息");
              return;
            }
            addDraftAssignment(shift.id, { post: post.trim(), personId, requiredQualificationId: qualificationId });
            setPost("");
            setPersonId("");
            setQualificationId("");
            setOpen(false);
          })
        }
      >
        添加
      </button>
      <button className="secondary small" onClick={() => setOpen(false)}>取消</button>
    </div>
  );
}

function HandoverBox({
  shift,
  assignment,
  state,
  onError,
  run
}: {
  shift: Shift;
  assignment: Assignment;
  state: AppState;
  onError: (message: string) => void;
  run: Run;
}) {
  const [substituteId, setSubstituteId] = useState("");
  const [reason, setReason] = useState("");
  const handover = assignment.handover;
  const candidates = replacementCandidates(shift, assignment.requiredQualificationId, state);

  if (handover?.status === "pending") {
    return (
      <div className="handover-box pending">
        <p>
          替班申请：<strong>{personName(handover.substituteId)}</strong>（{handover.reason}）
          ，发起于 {formatStamp(handover.requestedAt)}
        </p>
        <p className="hint">原值班人 {personName(assignment.personId)} 确认交接前，岗位责任不释放。</p>
        <div className="row-actions">
          <button className="small" onClick={() => run(() => confirmHandover(shift.id, assignment.id))}>
            {personName(assignment.personId)} 确认交接
          </button>
          <button className="secondary small" onClick={() => run(() => cancelHandover(shift.id, assignment.id))}>
            撤回交接
          </button>
        </div>
      </div>
    );
  }

  if (handover?.status === "confirmed") {
    return (
      <div className="handover-box done">
        <p>
          已于 {formatStamp(handover.confirmedAt)} 完成交接：{personName(assignment.personId)} →{" "}
          <strong>{personName(handover.substituteId)}</strong>
        </p>
        {shift.phase !== "closed" && (
          <button className="secondary small" onClick={() => run(() => cancelHandover(shift.id, assignment.id))}>
            撤销交接（恢复缺岗）
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="handover-box">
      <p className="hint">缺岗只能由同区域、持有效岗位资格且本班空闲的合格人员替班。</p>
      <div className="inline-edit">
        <select value={substituteId} onChange={(e) => setSubstituteId(e.target.value)}>
          <option value="">选择合格替班人</option>
          {candidates.map((candidate) => (
            <option key={candidate.person.id} value={candidate.person.id}>
              {candidate.person.name}（资格有效至 {candidate.expiresAt}）
            </option>
          ))}
        </select>
        <input placeholder="替班原因，如：突发病假" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button
          className="small"
          disabled={!substituteId}
          onClick={() =>
            run(() => {
              requestHandover(shift.id, assignment.id, substituteId, reason);
              setSubstituteId("");
              setReason("");
            })
          }
        >
          发起替班
        </button>
      </div>
      {candidates.length === 0 && <p className="hint warn">当前没有同区域合格且空闲的替班人。</p>}
    </div>
  );
}

function DraftPoints({ shift, onError, run }: { shift: Shift; onError: (m: string) => void; run: Run }) {
  const areaPoints = pointsInArea(shift.areaId);
  return (
    <div className="point-picker">
      {areaPoints.map((point) => {
        const checked = shift.pointIds.includes(point.id);
        return (
          <label className={`check-chip ${checked ? "on" : ""}`} key={point.id}>
            <input
              type="checkbox"
              checked={checked}
              onChange={() =>
                run(() =>
                  updateDraft(shift.id, {
                    pointIds: checked
                      ? shift.pointIds.filter((id) => id !== point.id)
                      : [...shift.pointIds, point.id]
                  })
                )
              }
            />
            <span>{point.name}</span>
          </label>
        );
      })}
    </div>
  );
}

function FrozenPoints({ shift, onError, run }: { shift: Shift; onError: (m: string) => void; run: Run }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"ok" | "abnormal">("ok");
  const [reason, setReason] = useState("");

  return (
    <div className="check-list">
      {shift.checks.map((check) => {
        const isEditing = editingId === check.pointId;
        return (
          <div className={`check-item status-${check.status}`} key={check.pointId}>
            <div className="check-main">
              <strong>{pointName(check.pointId)}</strong>
              <span className={`badge badge-check-${check.status}`}>{CHECK_LABEL[check.status]}</span>
              {check.note && <span className="meta-text">{check.note}</span>}
            </div>
            {!isEditing ? (
              <button
                className="secondary small"
                onClick={() => {
                  setEditingId(check.pointId);
                  setStatus(check.status === "abnormal" ? "abnormal" : "ok");
                  setNote(check.note);
                  setReason("");
                }}
              >
                {check.status === "pending" ? "登记结果" : "修改结果"}
              </button>
            ) : (
              <div className="check-edit">
                <select value={status} onChange={(e) => setStatus(e.target.value as "ok" | "abnormal")}>
                  <option value="ok">正常</option>
                  <option value="abnormal">异常</option>
                </select>
                <input placeholder="现场说明" value={note} onChange={(e) => setNote(e.target.value)} />
                {shift.phase === "closed" && (
                  <input
                    placeholder="结班后调整必须填写原因"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                )}
                <button
                  className="small"
                  onClick={() =>
                    run(() => {
                      if (shift.phase === "closed") {
                        adjustClosedShift(shift.id, check.pointId, status, note, reason);
                      } else {
                        setCheck(shift.id, check.pointId, status, note);
                      }
                      setEditingId(null);
                    })
                  }
                >
                  保存{shift.phase === "closed" ? "并另建版本" : ""}
                </button>
                <button className="secondary small" onClick={() => setEditingId(null)}>取消</button>
              </div>
            )}
          </div>
        );
      })}
      {shift.phase === "closed" && (
        <p className="hint">本班已封存：调整检查结果必须写原因，系统会保存调整前快照并升版本号。</p>
      )}
    </div>
  );
}
