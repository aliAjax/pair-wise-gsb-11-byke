// 判定层：班次是否成立、资格是否有效、时段是否重叠、谁有资格替班、漏检如何转待办。
// 全部为纯函数：入参是资料档案 + 当前状态，不修改数据，不接触 React 与存储。

import { AppState, Assignment, Person, Shift } from "./types";
import { isValidOn, overlaps, shiftInterval } from "./time";
import {
  PEOPLE,
  personHas,
  personQualificationExpiry,
  peopleInArea,
  pointsInArea
} from "../data/catalog";

export type ProblemCode =
  | "NO_ASSIGNMENT"
  | "PERSON_NOT_FOUND"
  | "QUALIFICATION_MISSING"
  | "QUALIFICATION_EXPIRED"
  | "PERSON_CONFLICT"
  | "NO_POINT"
  | "INVALID_TIME"
  | "POINTS_OUT_OF_AREA"
  | "POST_VACANT";

export interface ShiftProblem {
  code: ProblemCode;
  message: string;
}

export function validateShift(shift: Shift, state: AppState): ShiftProblem[] {
  const problems: ShiftProblem[] = [];

  if (shift.end <= shift.start) {
    problems.push({ code: "INVALID_TIME", message: "下班时刻必须晚于上班时刻" });
  }

  if (shift.assignments.length === 0) {
    problems.push({ code: "NO_ASSIGNMENT", message: "至少登记一个值班岗位" });
  }

  if (shift.pointIds.length === 0) {
    problems.push({ code: "NO_POINT", message: "至少登记一个必到点" });
  } else if (shift.pointIds.some((id) => !pointsInArea(shift.areaId).some((point) => point.id === id))) {
    problems.push({ code: "POINTS_OUT_OF_AREA", message: "必到点必须属于本班区域" });
  }

  const seenPeople = new Set<string>();
  for (const assignment of shift.assignments) {
    // 已登记缺岗且无生效中交接：岗位空缺。
    // 草案期必须补齐替班才能接班；接班后的班次成立结论不再被中途缺岗推翻。
    if (assignment.attendance === "absent" && !isActiveHandover(assignment)) {
      if (shift.phase === "draft") {
        problems.push({
          code: "POST_VACANT",
          message: `岗位「${assignment.post}」缺岗且未完成替班交接，不能接班`
        });
      }
      continue;
    }

    // 资格校验对象：交接已发起后是替班人（原值班人确认前责任不释放，但实际到岗人为替班人）；
    // 否则为登记值班人。
    const effectivePersonId = assignment.handover
      ? assignment.handover.substituteId
      : assignment.personId;
    const person = PEOPLE.find((item) => item.id === effectivePersonId);
    if (!person) {
      problems.push({
        code: "PERSON_NOT_FOUND",
        message: `岗位「${assignment.post}」的值班人不存在`
      });
      continue;
    }
    if (!personHas(person.id, assignment.requiredQualificationId)) {
      problems.push({
        code: "QUALIFICATION_MISSING",
        message: `${person.name} 不具备岗位「${assignment.post}」所需资格`
      });
    } else {
      const expiry = personQualificationExpiry(person.id, assignment.requiredQualificationId);
      if (expiry && !isValidOn(expiry, shift.date)) {
        problems.push({
          code: "QUALIFICATION_EXPIRED",
          message: `${person.name} 的岗位资格已于 ${expiry} 过期，本班日期为 ${shift.date}`
        });
      }
    }

    // 班内同一实际到岗人重复占岗
    if (seenPeople.has(effectivePersonId)) {
      problems.push({
        code: "PERSON_CONFLICT",
        message: `${person.name} 在本班内同时承担多个岗位`
      });
    }
    seenPeople.add(effectivePersonId);
  }

  // 时段重叠：与其他班次（任何状态）中同人的在班占用冲突。
  // 缺岗且无生效交接的岗位不占人；待确认交接同时预定原值班人与替班人。
  const interval = shiftInterval(shift);
  const otherShifts = state.shifts.filter((item) => item.id !== shift.id);
  for (const assignment of shift.assignments) {
    if (assignment.attendance === "absent" && !isActiveHandover(assignment)) continue;
    const watchIds = isActiveHandover(assignment)
      ? [assignment.personId, assignment.handover!.substituteId]
      : assignment.handover?.status === "confirmed"
        ? [assignment.handover.substituteId]
        : [assignment.personId];
    for (const personId of watchIds) {
      for (const other of otherShifts) {
        if (!overlaps(interval, shiftInterval(other))) continue;
        const occupied = occupiedPeople(other);
        if (occupied.has(personId)) {
          const role = occupied.get(personId)!;
          problems.push({
            code: "PERSON_CONFLICT",
            message: `${personLabel(personId)} 与 ${other.date} ${other.start}-${other.end} 的${role}时段重叠`
          });
        }
      }
    }
  }

  return dedupe(problems);
}

export function isShiftValid(shift: Shift, state: AppState): boolean {
  return validateShift(shift, state).length === 0;
}

/**
 * 岗位上的实际责任人：
 * - 待原值班人确认的交接：责任不释放，仍是原值班人
 * - 已确认交接：责任转给替班人
 * - 已登记缺岗且无生效中交接：岗位空缺
 */
export function responsibleId(assignment: Assignment): string | undefined {
  if (assignment.handover?.status === "confirmed") return assignment.handover.substituteId;
  if (assignment.handover?.status === "pending") return assignment.personId;
  if (assignment.attendance === "absent") return undefined;
  return assignment.personId;
}

export function isActiveHandover(assignment: Assignment): boolean {
  return !!assignment.handover && assignment.handover.status === "pending";
}

function occupiedPeople(shift: Shift): Map<string, string> {
  const map = new Map<string, string>();
  for (const assignment of shift.assignments) {
    if (assignment.handover?.status === "confirmed") {
      map.set(assignment.handover.substituteId, `「${assignment.post}」替班`);
      continue;
    }
    if (assignment.handover?.status === "pending") {
      // 交接未确认：原值班人责任不释放，替班人时段也已被预定
      map.set(assignment.personId, `「${assignment.post}」(交接待确认)`);
      map.set(assignment.handover.substituteId, `「${assignment.post}」替班待确认`);
      continue;
    }
    if (assignment.attendance === "absent") continue;
    if (!map.has(assignment.personId)) map.set(assignment.personId, `「${assignment.post}」`);
  }
  return map;
}

function personLabel(personId: string): string {
  const person = PEOPLE.find((item) => item.id === personId);
  return person ? person.name : personId;
}

function dedupe(problems: ShiftProblem[]): ShiftProblem[] {
  const seen = new Set<string>();
  return problems.filter((problem) => {
    if (seen.has(problem.message)) return false;
    seen.add(problem.message);
    return true;
  });
}

export interface ReplacementCandidate {
  person: Person;
  expiresAt: string;
}

/**
 * 替班候选人：同区域、持有岗位所需且在本班日期有效的资格、本班时段空闲
 * （不能在自己的其他在班岗位上，也不能是本班其他岗位待确认的替班人）。
 */
export function replacementCandidates(
  shift: Shift,
  requiredQualificationId: string,
  state: AppState
): ReplacementCandidate[] {
  const interval = shiftInterval(shift);
  const pendingSubstitutes = new Set(
    shift.assignments
      .filter((item) => isActiveHandover(item))
      .map((item) => item.handover!.substituteId)
  );

  return peopleInArea(shift.areaId)
    .filter((person) => {
      const expiry = person.qualifications.find((item) => item.qualificationId === requiredQualificationId)?.expiresAt;
      if (!expiry || !isValidOn(expiry, shift.date)) return false;
      if (pendingSubstitutes.has(person.id)) return false;
      // 本班内已占岗（含原值班人）不能再替
      if (shift.assignments.some((a) => responsibleId(a) === person.id)) return false;
      // 与其他班次在班时段冲突则不空闲
      const clash = state.shifts
        .filter((other) => other.id !== shift.id && overlaps(interval, shiftInterval(other)))
        .some((other) => occupiedPeople(other).has(person.id));
      return !clash;
    })
    .map((person) => ({
      person,
      expiresAt: person.qualifications.find((item) => item.qualificationId === requiredQualificationId)!.expiresAt
    }));
}

/** 接班时按冻结后的点位初始化检查清单（漏检状态待检） */
export function initChecks(shift: Shift) {
  return shift.pointIds.map((pointId) => {
    const existing = shift.checks.find((check) => check.pointId === pointId);
    return existing ?? { pointId, status: "pending" as const, note: "" };
  });
}

/** 结班时仍为未检的点位，生成待转给下一班的待办 */
export function missedPoints(shift: Shift): string[] {
  return shift.checks.filter((check) => check.status === "pending").map((check) => check.pointId);
}

/**
 * 为待办寻找同区域的接班班次：取开始时间不早于源班次结束时间的
 * 非结班班次中最早的一班（草案或接班冻结中均可先承接）；没有则留空，等待后续建班。
 */
export function findTargetShiftId(todo: { areaId: string; sourceShiftId: string }, state: AppState): string | undefined {
  const source = state.shifts.find((shift) => shift.id === todo.sourceShiftId);
  const later = state.shifts
    .filter((shift) => shift.areaId === todo.areaId && shift.id !== todo.sourceShiftId && shift.phase !== "closed")
    .filter((shift) => (source ? shiftInterval(shift).start >= shiftInterval(source).end : true))
    .sort((a, b) => shiftInterval(a).start - shiftInterval(b).start);
  return later[0]?.id;
}
