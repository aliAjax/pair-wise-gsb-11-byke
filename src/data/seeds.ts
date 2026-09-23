// 资料层：演示种子数据。SEED_DATE 与当前业务日保持一致（2026-09-23）。

import {
  Handover,
  InspectionResult,
  QualSnapshot,
  ScheduleState,
  Shift,
  ShiftTodo,
  Assignment,
} from "../domain/types";
import { qualSnapshot } from "../domain/rules";
import { PEOPLE } from "./people";

export const SEED_DATE = "2026-09-23";
const SEED_TIME = "2026-09-23T07:30:00.000Z";

function person(id: string) {
  const found = PEOPLE.find((p) => p.id === id);
  if (!found) throw new Error(`种子人员不存在: ${id}`);
  return found;
}

function snapshotOf(personId: string, area: string, date: string, allowExpired = false): QualSnapshot {
  const p = person(personId);
  const q = allowExpired
    ? p.qualifications.find((item) => item.area === area)
    : qualSnapshot(p, area, date);
  if (!q) throw new Error(`种子资格缺失: ${personId} / ${area} / ${date}`);
  return { area: q.area, title: q.title, expiresAt: q.expiresAt, registeredAt: date };
}

function seedAssignment(
  id: string,
  personId: string,
  area: string,
  date: string,
  pointIds: string[],
  results: Record<string, InspectionResult> = {},
  state: Assignment["state"] = "on_duty",
  allowExpiredQual = false
): Assignment {
  return {
    id,
    personId,
    originalPersonId: personId,
    state,
    pointIds: [...pointIds],
    qualification: snapshotOf(personId, area, date, allowExpiredQual),
    results: Object.fromEntries(pointIds.map((pid) => [pid, results[pid] ?? "未检"])),
  };
}

function buildSeeds(): ScheduleState {
  // 进行中：加油区白班，李强缺岗（灭火器点位待替班），王芳的 2 号机尚未巡检
  const sFuel: Shift = {
    id: "s-fuel-d23",
    area: "加油区",
    date: SEED_DATE,
    start: "08:00",
    end: "16:00",
    status: "active",
    frozenAt: null,
    createdAt: SEED_TIME,
    startedAt: SEED_TIME,
    closedAt: null,
    assignments: [
      seedAssignment("a-fuel-he", "p-he", "加油区", SEED_DATE, ["pt-fuel-1", "pt-fuel-fire"], {
        "pt-fuel-1": "正常",
        "pt-fuel-fire": "正常",
      }),
      seedAssignment("a-fuel-wang", "p-wang", "加油区", SEED_DATE, ["pt-fuel-2"]),
      seedAssignment(
        "a-fuel-li",
        "p-li",
        "加油区",
        SEED_DATE,
        ["pt-fuel-fire"],
        {},
        "absent"
      ),
    ],
    handovers: [],
    version: 1,
    versions: [],
  };

  // 进行中：油罐区夜班，李强缺岗由何鑫接班，交接尚未确认（责任仍在原值班人，名单已冻结）
  const tankAssignment = seedAssignment(
    "a-tank-li",
    "p-he",
    "油罐区",
    SEED_DATE,
    ["pt-tank-seal", "pt-tank-gauge", "pt-tank-valve"],
    {},
    "substituted"
  );
  tankAssignment.originalPersonId = "p-li";
  const handover: Handover = {
    id: "h-tank-1",
    assignmentId: "a-tank-li",
    fromPersonId: "p-li",
    toPersonId: "p-he",
    pointIds: ["pt-tank-seal", "pt-tank-gauge", "pt-tank-valve"],
    status: "taken",
    takenAt: "2026-09-23T16:05:00.000Z",
    confirmedAt: null,
  };
  const sTank: Shift = {
    id: "s-tank-d23",
    area: "油罐区",
    date: SEED_DATE,
    start: "16:00",
    end: "24:00",
    status: "active",
    frozenAt: "2026-09-23T16:05:00.000Z",
    createdAt: SEED_TIME,
    startedAt: SEED_TIME,
    closedAt: null,
    assignments: [tankAssignment],
    handovers: [handover],
    version: 1,
    versions: [],
  };

  // 编制中：次日班次（漏检待办的承接班次）
  const sFuelNext: Shift = {
    id: "s-fuel-d24",
    area: "加油区",
    date: "2026-09-24",
    start: "08:00",
    end: "16:00",
    status: "draft",
    frozenAt: null,
    createdAt: SEED_TIME,
    startedAt: null,
    closedAt: null,
    assignments: [
      seedAssignment("a-fuelnext-he", "p-he", "加油区", "2026-09-24", [
        "pt-fuel-1",
        "pt-fuel-fire",
      ]),
      seedAssignment("a-fuelnext-wang", "p-wang", "加油区", "2026-09-24", ["pt-fuel-2"]),
    ],
    handovers: [],
    version: 1,
    versions: [],
  };

  const sTankNext: Shift = {
    id: "s-tank-d24",
    area: "油罐区",
    date: "2026-09-24",
    start: "08:00",
    end: "16:00",
    status: "draft",
    frozenAt: null,
    createdAt: SEED_TIME,
    startedAt: null,
    closedAt: null,
    assignments: [
      seedAssignment("a-tanknext-li", "p-li", "油罐区", "2026-09-24", [
        "pt-tank-seal",
        "pt-tank-gauge",
        "pt-tank-valve",
      ]),
    ],
    handovers: [],
    version: 1,
    versions: [],
  };

  // 编制中（不成立示例）：9-25 上午何鑫两个互相时段重叠的班，两个班都不成立
  const sOverlapA: Shift = {
    id: "s-tank-d25a",
    area: "油罐区",
    date: "2026-09-25",
    start: "08:00",
    end: "12:00",
    status: "draft",
    frozenAt: null,
    createdAt: SEED_TIME,
    startedAt: null,
    closedAt: null,
    assignments: [
      seedAssignment("a-overlap-a", "p-he", "油罐区", "2026-09-25", [
        "pt-tank-seal",
        "pt-tank-gauge",
      ]),
    ],
    handovers: [],
    version: 1,
    versions: [],
  };

  const sOverlapB: Shift = {
    id: "s-tank-d25b",
    area: "油罐区",
    date: "2026-09-25",
    start: "11:00",
    end: "15:00",
    status: "draft",
    frozenAt: null,
    createdAt: SEED_TIME,
    startedAt: null,
    closedAt: null,
    assignments: [
      seedAssignment("a-overlap-b", "p-he", "油罐区", "2026-09-25", [
        "pt-tank-valve",
      ]),
    ],
    handovers: [],
    version: 1,
    versions: [],
  };

  // 编制中：当晚收银班（陈静合格）
  const sCash: Shift = {
    id: "s-cash-d23",
    area: "收银区",
    date: SEED_DATE,
    start: "16:00",
    end: "24:00",
    status: "draft",
    frozenAt: null,
    createdAt: SEED_TIME,
    startedAt: null,
    closedAt: null,
    assignments: [
      seedAssignment("a-cash-chen", "p-chen", "收银区", SEED_DATE, [
        "pt-cash-pos",
        "pt-cash-cam",
      ]),
    ],
    handovers: [],
    version: 1,
    versions: [],
  };

  // 编制中（不成立示例）：赵敏收银资格 2026-04-30 已过期
  const sCashExpired: Shift = {
    id: "s-cash-d24",
    area: "收银区",
    date: "2026-09-24",
    start: "08:00",
    end: "16:00",
    status: "draft",
    frozenAt: null,
    createdAt: SEED_TIME,
    startedAt: null,
    closedAt: null,
    assignments: [
      seedAssignment(
        "a-expired-zhao",
        "p-zhao",
        "收银区",
        "2026-09-24",
        ["pt-cash-pos", "pt-cash-safe"],
        {},
        "on_duty",
        true // 故意登记过期资格，整班判定将其标为不成立
      ),
    ],
    handovers: [],
    version: 1,
    versions: [],
  };

  // 已结班：含一次结班后调整（v1 快照留存），监控主机漏检转入当晚收银班
  const closedSnapshot: Shift = {
    id: "s-cash-d22",
    area: "收银区",
    date: "2026-09-22",
    start: "16:00",
    end: "24:00",
    status: "closed",
    frozenAt: "2026-09-22T16:10:00.000Z",
    createdAt: "2026-09-22T15:30:00.000Z",
    startedAt: "2026-09-22T16:00:00.000Z",
    closedAt: "2026-09-23T00:05:00.000Z",
    assignments: [
      seedAssignment(
        "a-cash22-wang",
        "p-wang",
        "收银区",
        "2026-09-22",
        ["pt-cash-pos", "pt-cash-cam"],
        { "pt-cash-pos": "正常", "pt-cash-cam": "未检" }
      ),
      seedAssignment(
        "a-cash22-chen",
        "p-chen",
        "收银区",
        "2026-09-22",
        ["pt-cash-safe"],
        { "pt-cash-safe": "正常" }
      ),
    ],
    handovers: [],
    version: 1,
    versions: [],
  };
  const sCashClosed: Shift = {
    ...closedSnapshot,
    assignments: closedSnapshot.assignments.map((a) =>
      a.id === "a-cash22-chen"
        ? { ...a, results: { ...a.results, "pt-cash-safe": "异常" } }
        : a
    ),
    version: 2,
    versions: [
      {
        id: "v-cash22-1",
        version: 1,
        reason: "复核查验：投币记录缺页，保险柜项由正常改记异常",
        createdAt: "2026-09-23T08:20:00.000Z",
        snapshot: closedSnapshot,
      },
    ],
  };

  const todoCamera: ShiftTodo = {
    id: "t-cash-cam",
    area: "收银区",
    pointId: "pt-cash-cam",
    sourceShiftId: "s-cash-d22",
    targetShiftId: "s-cash-d23",
    status: "pending",
    generation: 0,
    createdAt: "2026-09-23T00:05:00.000Z",
    completedAt: null,
  };

  return {
    shifts: [
      sFuel,
      sTank,
      sFuelNext,
      sTankNext,
      sOverlapA,
      sOverlapB,
      sCash,
      sCashExpired,
      sCashClosed,
    ],
    todos: [todoCamera],
  };
}

export const SEED_STATE: ScheduleState = buildSeeds();
