// 操作层：所有状态变更入口与业务守卫。
// 调用判定层做校验，调用存储层整棵落盘；本层不出现任何 React 与 DOM。

import { AppState, Assignment, CheckStatus, PointCheck, Shift, ShiftVersion, Todo } from "../domain/types";
import {
  findTargetShiftId,
  initChecks,
  isShiftValid,
  missedPoints,
  replacementCandidates,
  validateShift
} from "../domain/rules";
import { pointName, personName } from "../data/catalog";
import { makeId, store } from "../data/storage";

export class GuardError extends Error {}

function commit(next: AppState) {
  store.setState(next);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function withShift(state: AppState, shiftId: string): { state: AppState; shift: Shift } {
  const next = clone(state);
  const shift = next.shifts.find((item) => item.id === shiftId);
  if (!shift) throw new GuardError("班次不存在");
  return { state: next, shift };
}

function snapshotVersion(
  shift: Shift,
  reason: string,
  summary: string,
  createdAt: string = new Date().toISOString()
): ShiftVersion {
  return {
    id: makeId("ver"),
    shiftId: shift.id,
    version: shift.version,
    reason,
    createdAt,
    summary,
    snapshot: clone(shift)
  };
}

export interface NewShiftInput {
  areaId: string;
  date: string;
  start: string;
  end: string;
  assignments: { post: string; personId: string; requiredQualificationId: string }[];
  pointIds: string[];
}

/** 草案可以先登记成「不成立」的班，但会保留全部问题供修正；不能接班 */
export function createShift(input: NewShiftInput): void {
  const state = store.getState();
  const shift: Shift = {
    id: makeId("shift"),
    areaId: input.areaId,
    date: input.date,
    start: input.start,
    end: input.end,
    assignments: input.assignments.map((item) => ({
      id: makeId("asn"),
      post: item.post,
      personId: item.personId,
      requiredQualificationId: item.requiredQualificationId,
      attendance: "on-duty"
    })),
    pointIds: [...input.pointIds],
    checks: [],
    phase: "draft",
    version: 1,
    createdAt: new Date().toISOString()
  };
  commit({ ...state, shifts: [shift, ...state.shifts] });
}

/** 只有草案可以调整编制内容 */
export function updateDraft(shiftId: string, patch: Partial<Pick<Shift, "date" | "start" | "end" | "pointIds">>): void {
  const { state, shift } = withShift(store.getState(), shiftId);
  if (shift.phase !== "draft") throw new GuardError("接班后名单与点位已冻结，草案编辑不可用");
  Object.assign(shift, patch);
  if (patch.pointIds) {
    shift.pointIds = [...new Set(patch.pointIds)];
  }
  commit(state);
}

export function updateDraftAssignment(
  shiftId: string,
  assignmentId: string,
  patch: Partial<Pick<Assignment, "post" | "personId" | "requiredQualificationId">>
): void {
  const { state, shift } = withShift(store.getState(), shiftId);
  if (shift.phase !== "draft") throw new GuardError("接班后值班人已冻结，草案编辑不可用");
  const assignment = shift.assignments.find((item) => item.id === assignmentId);
  if (!assignment) throw new GuardError("岗位不存在");
  Object.assign(assignment, patch);
  commit(state);
}

export function addDraftAssignment(
  shiftId: string,
  item: { post: string; personId: string; requiredQualificationId: string }
): void {
  const { state, shift } = withShift(store.getState(), shiftId);
  if (shift.phase !== "draft") throw new GuardError("接班后名单已冻结，不能新增岗位");
  shift.assignments.push({ id: makeId("asn"), ...item, attendance: "on-duty" });
  commit(state);
}

export function removeDraftAssignment(shiftId: string, assignmentId: string): void {
  const { state, shift } = withShift(store.getState(), shiftId);
  if (shift.phase !== "draft") throw new GuardError("接班后名单已冻结，不能删除岗位");
  shift.assignments = shift.assignments.filter((item) => item.id !== assignmentId);
  commit(state);
}

export function deleteDraft(shiftId: string): void {
  const { state } = withShift(store.getState(), shiftId);
  const shift = state.shifts.find((item) => item.id === shiftId)!;
  if (shift.phase !== "draft") throw new GuardError("已接班的班次不能删除");
  state.shifts = state.shifts.filter((item) => item.id !== shiftId);
  commit(state);
}

/** 接班：整班成立才允许；接班后冻结名单与点位，固化检查清单与基线版本 */
export function startShift(shiftId: string): void {
  const current = store.getState();
  const original = current.shifts.find((item) => item.id === shiftId);
  if (!original) throw new GuardError("班次不存在");
  if (original.phase !== "draft") throw new GuardError("只有编制中的草案可以接班");
  const problems = validateShift(original, current);
  if (problems.length > 0) {
    throw new GuardError(`整班不成立，不能接班：${problems.map((p) => p.message).join("；")}`);
  }

  const { state, shift } = withShift(current, shiftId);
  shift.phase = "frozen";
  shift.frozenAt = new Date().toISOString();
  shift.checks = initChecks(shift);

  const baseline: ShiftVersion = {
    id: makeId("ver"),
    shiftId: shift.id,
    version: 1,
    reason: "接班冻结基线",
    createdAt: shift.frozenAt,
    summary: `接班后冻结名单与点位：值班岗位 ${shift.assignments.length} 个，必到点 ${shift.pointIds.length} 个`,
    snapshot: clone(shift)
  };
  state.versions = [baseline, ...state.versions];
  commit(state);
}

/** 登记缺岗：不删除值班人，岗位进入空缺，等待同区域合格空闲人员替班 */
export function markAbsent(shiftId: string, assignmentId: string): void {
  const { state, shift } = withShift(store.getState(), shiftId);
  if (shift.phase === "closed") throw new GuardError("班次已结班，不能再变更出勤");
  const assignment = shift.assignments.find((item) => item.id === assignmentId);
  if (!assignment) throw new GuardError("岗位不存在");
  if (assignment.handover && assignment.handover.status !== "cancelled") {
    throw new GuardError("已有进行中的交接，请先处理交接单");
  }
  assignment.attendance = "absent";
  commit(state);
}

export function cancelAbsent(shiftId: string, assignmentId: string): void {
  const { state, shift } = withShift(store.getState(), shiftId);
  if (shift.phase === "closed") throw new GuardError("班次已结班");
  const assignment = shift.assignments.find((item) => item.id === assignmentId);
  if (!assignment) throw new GuardError("岗位不存在");
  if (isPending(assignment)) throw new GuardError("交接待原值班人确认，不能直接销缺");
  assignment.attendance = "on-duty";
  commit(state);
}

function isPending(assignment: Assignment): boolean {
  return !!assignment.handover && assignment.handover.status === "pending";
}

/** 发起替班：只能选择同区域、资格有效、本班空闲的人员；交接单待确认 */
export function requestHandover(
  shiftId: string,
  assignmentId: string,
  substituteId: string,
  reason: string
): void {
  const current = store.getState();
  const original = current.shifts.find((item) => item.id === shiftId);
  if (!original) throw new GuardError("班次不存在");
  if (original.phase === "closed") throw new GuardError("班次已结班，不能发起交接");
  const assignment = original.assignments.find((item) => item.id === assignmentId);
  if (!assignment) throw new GuardError("岗位不存在");
  if (assignment.attendance !== "absent") throw new GuardError("只有缺岗岗位才能发起替班");
  if (isPending(assignment)) throw new GuardError("该岗位已有待确认的交接");
  if (!reason.trim()) throw new GuardError("请填写替班原因");

  const candidates = replacementCandidates(original, assignment.requiredQualificationId, current);
  if (!candidates.some((candidate) => candidate.person.id === substituteId)) {
    throw new GuardError(`${personName(substituteId)} 不是同区域合格且本班空闲的人员，不能替班`);
  }

  const { state, shift } = withShift(current, shiftId);
  const target = shift.assignments.find((item) => item.id === assignmentId)!;
  target.handover = {
    id: makeId("hov"),
    substituteId,
    reason: reason.trim(),
    requestedAt: new Date().toISOString(),
    requestedBy: "值班班长",
    status: "pending"
  };
  commit(state);
}

/** 原值班人确认交接：确认前责任不释放，确认后替班人接岗 */
export function confirmHandover(shiftId: string, assignmentId: string): void {
  const { state, shift } = withShift(store.getState(), shiftId);
  if (shift.phase === "closed") throw new GuardError("班次已结班");
  const assignment = shift.assignments.find((item) => item.id === assignmentId);
  if (!assignment?.handover || assignment.handover.status !== "pending") {
    throw new GuardError("没有待确认的交接");
  }
  assignment.handover.status = "confirmed";
  assignment.handover.confirmedAt = new Date().toISOString();
  commit(state);
}

/** 原值班人/班长撤回交接申请，岗位回到缺岗空缺 */
export function cancelHandover(shiftId: string, assignmentId: string): void {
  const { state, shift } = withShift(store.getState(), shiftId);
  if (shift.phase === "closed") throw new GuardError("班次已结班");
  const assignment = shift.assignments.find((item) => item.id === assignmentId);
  if (!assignment?.handover) throw new GuardError("没有交接记录");
  assignment.handover.status = "cancelled";
  commit(state);
}

function checkSummary(before: PointCheck, after: PointCheck): string {
  const label: Record<CheckStatus, string> = { pending: "未检", ok: "正常", abnormal: "异常" };
  return `${pointName(before.pointId)}：${label[before.status]} → ${label[after.status]}${after.note ? `（${after.note}）` : ""}`;
}

/** 接班冻结期间登记巡检结果；完成补检会自动关闭对应待办 */
export function setCheck(
  shiftId: string,
  pointId: string,
  status: CheckStatus,
  note: string
): void {
  const { state, shift } = withShift(store.getState(), shiftId);
  if (shift.phase !== "frozen") throw new GuardError("只有接班后的班次才能登记巡检结果");
  const check = shift.checks.find((item) => item.pointId === pointId);
  if (!check) throw new GuardError("该点位不在本班冻结名单内");
  check.status = status;
  check.note = note;
  if (status !== "pending") {
    for (const todo of state.todos) {
      if (todo.pointId === pointId && todo.targetShiftId === shiftId && todo.status === "open") {
        todo.status = "done";
        todo.resolvedAt = new Date().toISOString();
        todo.note = "接班后完成漏检补检";
      }
    }
  }
  commit(state);
}

/** 结班：未检点位转为漏检待办，分派给同区域下一班，班次封存 */
export function closeShift(shiftId: string): void {
  const current = store.getState();
  const original = current.shifts.find((item) => item.id === shiftId);
  if (!original) throw new GuardError("班次不存在");
  if (original.phase !== "frozen") throw new GuardError("只有接班冻结中的班次可以结班");

  const { state, shift } = withShift(current, shiftId);
  shift.phase = "closed";
  shift.closedAt = new Date().toISOString();

  const newTodos: Todo[] = missedPoints(shift).map((pointId) => ({
    id: makeId("todo"),
    areaId: shift.areaId,
    sourceShiftId: shift.id,
    pointId,
    pointName: pointName(pointId),
    createdAt: shift.closedAt!,
    status: "open"
  }));

  // 重新分派所有仍开放且没有冻结中接办班的待办
  for (const todo of newTodos) {
    state.todos.unshift(todo);
  }
  for (const todo of state.todos.filter((item) => item.status === "open")) {
    const target = state.shifts.find((s) => s.id === todo.targetShiftId);
    if (!target || target.phase === "closed") {
      todo.targetShiftId = findTargetShiftId(todo, state);
    }
  }
  commit(state);
}

/**
 * 结班后调整：必须写原因，先把调整前整班存为新版本快照，再改数据。
 * 补录为已检/异常同样会关闭对应漏检待办。
 */
export function adjustClosedShift(
  shiftId: string,
  pointId: string,
  status: CheckStatus,
  note: string,
  reason: string
): void {
  if (!reason.trim()) throw new GuardError("结班后调整必须填写原因");
  const current = store.getState();
  const original = current.shifts.find((item) => item.id === shiftId);
  if (!original) throw new GuardError("班次不存在");
  if (original.phase !== "closed") throw new GuardError("只有结班后的班次才走版本化调整");

  const before = original.checks.find((item) => item.pointId === pointId);
  if (!before) throw new GuardError("该点位不在本班名单内");
  if (before.status === status && before.note === note) {
    throw new GuardError("检查结果没有变化，无需另建版本");
  }

  const { state, shift } = withShift(current, shiftId);
  // 调整前快照存为当前（旧）版本；班次本体升为新版本
  state.versions.unshift(snapshotVersion(shift, reason, checkSummary(before, { pointId, status, note })));
  const target = shift.checks.find((item) => item.pointId === pointId)!;
  target.status = status;
  target.note = note;
  shift.version += 1;

  if (status !== "pending") {
    for (const todo of state.todos) {
      if (todo.pointId === pointId && (todo.targetShiftId === shiftId || todo.sourceShiftId === shiftId) && todo.status === "open") {
        todo.status = "done";
        todo.resolvedAt = new Date().toISOString();
        todo.note = `结班后补录（原因：${reason.trim()}）`;
      }
    }
  }
  commit(state);
}

/** 手动关闭待办（接办班确认已处理，但暂不登记具体检查结果时） */
export function resolveTodo(todoId: string, note: string): void {
  const next = clone(store.getState());
  const todo = next.todos.find((item) => item.id === todoId);
  if (!todo) throw new GuardError("待办不存在");
  if (todo.status === "done") throw new GuardError("待办已关闭");
  todo.status = "done";
  todo.resolvedAt = new Date().toISOString();
  todo.note = note.trim() || "已处理";
  commit(next);
}

export function getShiftProblems(shift: Shift, state: AppState) {
  return validateShift(shift, state);
}

export function shiftStillValid(shift: Shift, state: AppState): boolean {
  return isShiftValid(shift, state);
}
