// 业务判定层：全部纯函数，不碰存储与页面。
// 所有变更操作返回新的 ScheduleState，规则不满足时抛出 Error（文案供页面提示）。

import {
  Assignment,
  Handover,
  InspectionResult,
  Person,
  Point,
  QualSnapshot,
  ScheduleState,
  Shift,
  ShiftDraftInput,
  ShiftTodo,
} from "./types";

export const RESULT_CYCLE: InspectionResult[] = ["未检", "正常", "异常"];

export function uid(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** 同日两段时间是否重叠 */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
}

export function findPerson(persons: Person[], id: string): Person | undefined {
  return persons.find((p) => p.id === id);
}

export function findPoint(points: Point[], id: string): Point | undefined {
  return points.find((p) => p.id === id);
}

/** 某人在某日对某区域是否持有有效资格 */
export function hasValidQualification(person: Person, area: string, date: string): boolean {
  return person.qualifications.some((q) => q.area === area && q.expiresAt >= date);
}

export function qualSnapshot(person: Person, area: string, date: string): QualSnapshot | null {
  const q = person.qualifications.find((item) => item.area === area && item.expiresAt >= date);
  if (!q) return null;
  return { area: q.area, title: q.title, expiresAt: q.expiresAt, registeredAt: date };
}

export function shiftTimeLabel(shift: Pick<Shift, "date" | "start" | "end">): string {
  return `${shift.date} ${shift.start}–${shift.end}`;
}

function shiftSortKey(shift: Shift): string {
  return `${shift.date} ${shift.start}`;
}

export function sortShifts(shifts: Shift[]): Shift[] {
  return [...shifts].sort((a, b) => shiftSortKey(a).localeCompare(shiftSortKey(b)));
}

// ---------------------------------------------------------------------------
// 班次有效性判定
// ---------------------------------------------------------------------------

export interface ShiftIssue {
  assignmentId: string | null;
  message: string;
}

/** 单条值班登记的问题（时段重叠 / 资格过期 / 点位缺失等） */
export function assignmentIssues(
  shift: Shift,
  assignment: Assignment,
  allShifts: Shift[],
  persons: Person[],
  points: Point[]
): string[] {
  const issues: string[] = [];
  const person = findPerson(persons, assignment.personId);
  const name = person ? person.name : "未知人员";

  if (!person) {
    issues.push("值班人不存在");
  } else if (!hasValidQualification(person, shift.area, shift.date)) {
    issues.push(`${name}的${shift.area}资格已过期或未覆盖本班日期`);
  }

  if (assignment.pointIds.length === 0) {
    issues.push("未登记必到点");
  }
  for (const pid of assignment.pointIds) {
    const point = findPoint(points, pid);
    if (!point) issues.push("必到点不存在");
    else if (point.area !== shift.area) issues.push(`必到点「${point.name}」不属于${shift.area}`);
  }

  // 时段重叠：同一人、同一天、时间相交的其他值班登记（含其他班次）
  for (const other of allShifts) {
    if (other.date !== shift.date) continue;
    for (const otherAssignment of other.assignments) {
      if (otherAssignment.id === assignment.id) continue;
      if (otherAssignment.personId !== assignment.personId) continue;
      if (overlaps(shift.start, shift.end, other.start, other.end)) {
        issues.push(
          `${name}与「${other.area} ${other.start}–${other.end}」班次的值班时段重叠`
        );
      }
    }
  }
  return issues;
}

/** 整班判定：任一登记不成立则整班不成立 */
export function validateShift(
  shift: Shift,
  allShifts: Shift[],
  persons: Person[],
  points: Point[]
): ShiftIssue[] {
  const issues: ShiftIssue[] = [];
  if (shift.assignments.length === 0) {
    issues.push({ assignmentId: null, message: "班次未登记任何值班人" });
  }
  if (toMinutes(shift.start) >= toMinutes(shift.end)) {
    issues.push({ assignmentId: null, message: "班次时刻无效：开始须早于结束" });
  }
  for (const assignment of shift.assignments) {
    for (const message of assignmentIssues(shift, assignment, allShifts, persons, points)) {
      issues.push({ assignmentId: assignment.id, message });
    }
  }
  return issues;
}

export function isShiftValid(
  shift: Shift,
  allShifts: Shift[],
  persons: Person[],
  points: Point[]
): boolean {
  return validateShift(shift, allShifts, persons, points).length === 0;
}

// ---------------------------------------------------------------------------
// 替班资格判定
// ---------------------------------------------------------------------------

export interface SubstituteCandidate {
  person: Person;
  reason: string | null; // null 表示可替班
}

/**
 * 缺岗替班候选人判定：须同区域、资格覆盖本班、且本班空闲
 * （本班未排班、无时段相交的其他值班，且不是被替下的原值班人）。
 */
export function eligibleSubstitutes(
  shift: Shift,
  assignment: Assignment,
  allShifts: Shift[],
  persons: Person[]
): SubstituteCandidate[] {
  return persons.map((person) => {
    let reason: string | null = null;
    if (person.id === assignment.originalPersonId) {
      reason = "原值班人，不能替自己的班";
    } else if (!hasValidQualification(person, shift.area, shift.date)) {
      reason = `无${shift.area}有效资格或资格已过期`;
    } else if (shift.assignments.some((a) => a.personId === person.id)) {
      reason = "本班已有值班安排";
    } else {
      const busy = allShifts.some(
        (other) =>
          other.date === shift.date &&
          overlaps(shift.start, shift.end, other.start, other.end) &&
          other.assignments.some((a) => a.personId === person.id)
      );
      if (busy) reason = "本班时段已有其他值班，不空闲";
    }
    return { person, reason };
  });
}

// ---------------------------------------------------------------------------
// 班次生命周期操作
// ---------------------------------------------------------------------------

function buildAssignment(
  person: Person,
  area: string,
  date: string,
  pointIds: string[]
): Assignment {
  const snapshot = qualSnapshot(person, area, date);
  if (!snapshot) throw new Error(`${person.name}在${date}无${area}有效资格，无法登记`);
  return {
    id: uid("asg"),
    personId: person.id,
    originalPersonId: person.id,
    state: "on_duty",
    pointIds: [...pointIds],
    qualification: snapshot,
    results: Object.fromEntries(pointIds.map((pid) => [pid, "未检" as InspectionResult])),
  };
}

function replaceShift(state: ScheduleState, next: Shift): ScheduleState {
  return { ...state, shifts: state.shifts.map((s) => (s.id === next.id ? next : s)) };
}

function getShift(state: ScheduleState, shiftId: string): Shift {
  const shift = state.shifts.find((s) => s.id === shiftId);
  if (!shift) throw new Error("班次不存在");
  return shift;
}

/** 名单与点位是否可编辑：未接班（未冻结）且未结班 */
export function rosterEditable(shift: Shift): boolean {
  return shift.status !== "closed" && shift.frozenAt === null;
}

/** 新建班次（草稿）。登记时做资格快照，重叠与资格问题由 validateShift 判定展示。 */
export function createShift(
  state: ScheduleState,
  input: ShiftDraftInput,
  persons: Person[]
): ScheduleState {
  if (!input.area) throw new Error("请选择区域");
  if (!input.date) throw new Error("请选择日期");
  if (toMinutes(input.start) >= toMinutes(input.end)) throw new Error("开始时刻须早于结束时刻");
  if (input.rows.length === 0) throw new Error("至少登记一名值班人");

  const assignments = input.rows.map((row) => {
    const person = findPerson(persons, row.personId);
    if (!person) throw new Error("值班人不存在");
    return buildAssignment(person, input.area, input.date, row.pointIds);
  });

  const shift: Shift = {
    id: uid("shift"),
    area: input.area,
    date: input.date,
    start: input.start,
    end: input.end,
    status: "draft",
    frozenAt: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    closedAt: null,
    assignments,
    handovers: [],
    version: 1,
    versions: [],
  };
  return { ...state, shifts: sortShifts([...state.shifts, shift]) };
}

/** 开班：仅草稿且整班成立时可开 */
export function startShift(
  state: ScheduleState,
  shiftId: string,
  persons: Person[],
  points: Point[]
): ScheduleState {
  const shift = getShift(state, shiftId);
  if (shift.status !== "draft") throw new Error("仅编制中的班次可以开班");
  const issues = validateShift(shift, state.shifts, persons, points);
  if (issues.length > 0) throw new Error(`班次不成立，无法开班：${issues[0].message}`);
  return replaceShift(state, { ...shift, status: "active", startedAt: new Date().toISOString() });
}

/** 删除班次：仅编制中可删 */
export function removeShift(state: ScheduleState, shiftId: string): ScheduleState {
  const shift = getShift(state, shiftId);
  if (shift.status !== "draft") throw new Error("仅编制中的班次可以删除");
  return { ...state, shifts: state.shifts.filter((s) => s.id !== shiftId) };
}

/** 接班前（未冻结）可调整名单与点位；调整后点位结果重置为未检 */
export function updateAssignmentPoints(
  state: ScheduleState,
  shiftId: string,
  assignmentId: string,
  pointIds: string[]
): ScheduleState {
  const shift = getShift(state, shiftId);
  if (!rosterEditable(shift)) throw new Error("名单与点位已冻结，不可调整");
  const assignments = shift.assignments.map((a) => {
    if (a.id !== assignmentId) return a;
    return {
      ...a,
      pointIds: [...pointIds],
      results: Object.fromEntries(pointIds.map((pid) => [pid, "未检" as InspectionResult])),
    };
  });
  return replaceShift(state, { ...shift, assignments });
}

/** 接班前（未冻结）可增列值班人 */
export function addAssignment(
  state: ScheduleState,
  shiftId: string,
  personId: string,
  pointIds: string[],
  persons: Person[]
): ScheduleState {
  const shift = getShift(state, shiftId);
  if (!rosterEditable(shift)) throw new Error("名单与点位已冻结，不可调整");
  const person = findPerson(persons, personId);
  if (!person) throw new Error("值班人不存在");
  const assignment = buildAssignment(person, shift.area, shift.date, pointIds);
  return replaceShift(state, { ...shift, assignments: [...shift.assignments, assignment] });
}

/** 接班前（未冻结）可移除值班人 */
export function removeAssignment(
  state: ScheduleState,
  shiftId: string,
  assignmentId: string
): ScheduleState {
  const shift = getShift(state, shiftId);
  if (!rosterEditable(shift)) throw new Error("名单与点位已冻结，不可调整");
  return replaceShift(state, {
    ...shift,
    assignments: shift.assignments.filter((a) => a.id !== assignmentId),
  });
}

// ---------------------------------------------------------------------------
// 缺岗、替班与交接
// ---------------------------------------------------------------------------

/** 登记缺岗：仅进行中、尚未发生替班的值班人可标记 */
export function markAbsent(state: ScheduleState, shiftId: string, assignmentId: string): ScheduleState {
  const shift = getShift(state, shiftId);
  if (shift.status !== "active") throw new Error("仅进行中的班次可以登记缺岗");
  const assignments = shift.assignments.map((a) => {
    if (a.id !== assignmentId) return a;
    if (a.state !== "on_duty") throw new Error("该值班人已不在岗或已安排替班");
    return { ...a, state: "absent" as const };
  });
  return replaceShift(state, { ...shift, assignments });
}

/** 撤销缺岗（尚未安排替班时） */
export function cancelAbsent(state: ScheduleState, shiftId: string, assignmentId: string): ScheduleState {
  const shift = getShift(state, shiftId);
  const assignments = shift.assignments.map((a) => {
    if (a.id !== assignmentId) return a;
    if (a.state !== "absent") throw new Error("仅缺岗且未替班的登记可以撤销");
    return { ...a, state: "on_duty" as const };
  });
  return replaceShift(state, { ...shift, assignments });
}

/**
 * 替班人接班：替班人须同区域、本班空闲且资格有效。
 * 接班即冻结整班名单与点位；原值班人在确认交接前责任不释放。
 */
export function takeOver(
  state: ScheduleState,
  shiftId: string,
  assignmentId: string,
  substituteId: string,
  persons: Person[]
): ScheduleState {
  const shift = getShift(state, shiftId);
  if (shift.status !== "active") throw new Error("仅进行中的班次可以安排替班");
  const target = shift.assignments.find((a) => a.id === assignmentId);
  if (!target) throw new Error("值班登记不存在");
  if (target.state !== "absent") throw new Error("仅缺岗的值班登记可以安排替班");

  const substitute = findPerson(persons, substituteId);
  if (!substitute) throw new Error("替班人不存在");
  const candidate = eligibleSubstitutes(shift, target, state.shifts, persons).find(
    (c) => c.person.id === substituteId
  );
  if (!candidate || candidate.reason) {
    throw new Error(candidate?.reason ?? "该人员不符合替班条件");
  }

  const snapshot = qualSnapshot(substitute, shift.area, shift.date);
  if (!snapshot) throw new Error("替班人资格无效");

  const now = new Date().toISOString();
  const handover: Handover = {
    id: uid("hov"),
    assignmentId,
    fromPersonId: target.originalPersonId,
    toPersonId: substituteId,
    pointIds: [...target.pointIds],
    status: "taken",
    takenAt: now,
    confirmedAt: null,
  };
  const assignments = shift.assignments.map((a) =>
    a.id === assignmentId
      ? { ...a, personId: substituteId, state: "substituted" as const, qualification: snapshot }
      : a
  );
  return replaceShift(state, {
    ...shift,
    assignments,
    handovers: [...shift.handovers, handover],
    frozenAt: shift.frozenAt ?? now, // 接班后冻结名单与点位
  });
}

/** 原值班人确认交接：确认后责任才释放 */
export function confirmHandover(state: ScheduleState, shiftId: string, handoverId: string): ScheduleState {
  const shift = getShift(state, shiftId);
  const handover = shift.handovers.find((h) => h.id === handoverId);
  if (!handover) throw new Error("交接记录不存在");
  if (handover.status !== "taken") throw new Error("该交接已确认");
  const handovers = shift.handovers.map((h) =>
    h.id === handoverId ? { ...h, status: "confirmed" as const, confirmedAt: new Date().toISOString() } : h
  );
  return replaceShift(state, { ...shift, handovers });
}

// ---------------------------------------------------------------------------
// 检查与结班
// ---------------------------------------------------------------------------

/** 登记必到点检查结果（未检 / 正常 / 异常） */
export function setResult(
  state: ScheduleState,
  shiftId: string,
  assignmentId: string,
  pointId: string,
  result: InspectionResult
): ScheduleState {
  const shift = getShift(state, shiftId);
  if (shift.status !== "active") throw new Error("仅进行中的班次可以登记检查结果");
  const assignments = shift.assignments.map((a) => {
    if (a.id !== assignmentId) return a;
    if (!(pointId in a.results)) throw new Error("该必到点不在此值班登记内");
    return { ...a, results: { ...a.results, [pointId]: result } };
  });
  return replaceShift(state, { ...shift, assignments });
}

/** 完成一条挂在本班的漏检待办：承接班次必须正在进行 */
export function completeTodo(state: ScheduleState, todoId: string): ScheduleState {
  const todo = state.todos.find((t) => t.id === todoId);
  if (!todo) throw new Error("待办不存在");
  if (todo.status !== "pending") throw new Error("待办已处理");
  if (!todo.targetShiftId) throw new Error("同区域尚无承接班次，待排班后补检");
  const target = state.shifts.find((s) => s.id === todo.targetShiftId);
  if (!target) throw new Error("承接班次不存在");
  if (target.status === "closed") throw new Error("承接班次已结班，待办须再转下一班");
  if (target.status !== "active") throw new Error("承接班次尚未开班，开班后才可补检");
  const todos = state.todos.map((t) =>
    t.id === todoId ? { ...t, status: "done" as const, completedAt: new Date().toISOString() } : t
  );
  return { ...state, todos };
}

function pendingPointsOf(shift: Shift): string[] {
  const ids = new Set<string>();
  for (const assignment of shift.assignments) {
    for (const [pointId, result] of Object.entries(assignment.results)) {
      if (result === "未检") ids.add(pointId);
    }
  }
  return [...ids];
}

/**
 * 同区域下一班：晚于本班开始、未结班且整班成立的最早班次。
 * 不成立（重叠/资格问题）的班次不能作为漏检待办承接班。
 */
export function findNextShift(
  shifts: Shift[],
  from: Shift,
  persons: Person[],
  points: Point[]
): Shift | null {
  const key = shiftSortKey(from);
  const candidates = shifts
    .filter((s) => s.id !== from.id && s.area === from.area && s.status !== "closed")
    .filter((s) => shiftSortKey(s) > key)
    .filter((s) => isShiftValid(s, shifts, persons, points))
    .sort((a, b) => shiftSortKey(a).localeCompare(shiftSortKey(b)));
  return candidates[0] ?? null;
}

/**
 * 结班：未检点位生成漏检待办并转入同区域下一班；
 * 本班遗留的待办若仍未完成，一并顺延到下一班。
 */
export function closeShift(
  state: ScheduleState,
  shiftId: string,
  persons: Person[],
  points: Point[]
): ScheduleState {
  const shift = getShift(state, shiftId);
  if (shift.status !== "active") throw new Error("仅进行中的班次可以结班");

  const next = findNextShift(state.shifts, shift, persons, points);
  const now = new Date().toISOString();
  let todos = [...state.todos];

  // 本班漏检 → 新待办（同点不重复生成）
  for (const pointId of pendingPointsOf(shift)) {
    const exists = todos.some(
      (t) => t.status === "pending" && t.sourceShiftId === shift.id && t.pointId === pointId
    );
    if (exists) continue;
    todos.push({
      id: uid("todo"),
      area: shift.area,
      pointId,
      sourceShiftId: shift.id,
      targetShiftId: next ? next.id : null,
      status: "pending",
      generation: 0,
      createdAt: now,
      completedAt: null,
    });
  }

  // 本班承接的待办仍未完成 → 顺延到下一班
  todos = todos.map((t) => {
    if (t.status !== "pending" || t.targetShiftId !== shift.id) return t;
    return { ...t, targetShiftId: next ? next.id : null, generation: t.generation + 1 };
  });

  return {
    shifts: state.shifts.map((s) =>
      s.id === shift.id ? { ...s, status: "closed" as const, closedAt: now } : s
    ),
    todos,
  };
}

/**
 * 结班后调整：必须填写原因，调整前整班快照存入历史版本，版本号 +1。
 * 仅允许修正检查结果（名单、点位与时刻在结班后不可再改）。
 */
export function adjustClosedResult(
  state: ScheduleState,
  shiftId: string,
  assignmentId: string,
  pointId: string,
  result: InspectionResult,
  reason: string
): ScheduleState {
  const shift = getShift(state, shiftId);
  if (shift.status !== "closed") throw new Error("仅已结班的班次需要走结班后调整");
  if (!reason.trim()) throw new Error("结班后调整必须填写原因");
  const assignment = shift.assignments.find((a) => a.id === assignmentId);
  if (!assignment || !(pointId in assignment.results)) throw new Error("调整目标不存在");

  const snapshot = clone(shift);
  const version: Shift["versions"][number] = {
    id: uid("ver"),
    version: shift.version,
    reason: reason.trim(),
    createdAt: new Date().toISOString(),
    snapshot,
  };
  const assignments = shift.assignments.map((a) =>
    a.id === assignmentId ? { ...a, results: { ...a.results, [pointId]: result } } : a
  );
  return replaceShift(state, {
    ...shift,
    assignments,
    version: shift.version + 1,
    versions: [...shift.versions, version],
  });
}

// ---------------------------------------------------------------------------
// 页面辅助判定
// ---------------------------------------------------------------------------

/** 该值班登记当前的责任人提示（替班后、确认前责任仍在原值班人） */
export function responsibilityNote(shift: Shift, assignment: Assignment, persons: Person[]): string | null {
  if (assignment.state !== "substituted") return null;
  const handover = shift.handovers.find((h) => h.assignmentId === assignment.id);
  if (!handover) return null;
  const from = findPerson(persons, handover.fromPersonId)?.name ?? "原值班人";
  const to = findPerson(persons, handover.toPersonId)?.name ?? "替班人";
  return handover.status === "confirmed"
    ? `交接已确认，责任由${from}移交${to}`
    : `待${from}确认交接，确认前责任不释放`;
}
