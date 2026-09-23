// 资料层：区域、资格、人员、必到点等基础档案，以及首次进入时的示例班次。
// 这里只提供数据，不做任何排班是否成立、能否替班的判定。

import { AppState, Area, Checkpoint, Person, Qualification, Shift, ShiftVersion, Todo } from "../domain/types";
import { shiftDayKey, todayKey } from "../domain/time";

export const AREAS: Area[] = [
  { id: "fuel", name: "加油区" },
  { id: "tank", name: "油罐区" },
  { id: "cash", name: "收银区" }
];

export const QUALIFICATIONS: Qualification[] = [
  { id: "fuel-op", name: "加油作业证" },
  { id: "unload-op", name: "卸油作业证" },
  { id: "cashier-cert", name: "收银上岗证" },
  { id: "safety", name: "安全员证" }
];

export const PEOPLE: Person[] = [
  {
    id: "p1",
    name: "何鑫",
    areaIds: ["fuel", "tank"],
    qualifications: [
      { qualificationId: "fuel-op", expiresAt: shiftDayKey(120) },
      { qualificationId: "unload-op", expiresAt: shiftDayKey(-3) }
    ]
  },
  {
    id: "p2",
    name: "赵磊",
    areaIds: ["tank", "fuel"],
    qualifications: [
      { qualificationId: "unload-op", expiresAt: shiftDayKey(40) },
      { qualificationId: "safety", expiresAt: shiftDayKey(200) }
    ]
  },
  {
    id: "p3",
    name: "陈敏",
    areaIds: ["fuel"],
    qualifications: [{ qualificationId: "fuel-op", expiresAt: shiftDayKey(15) }]
  },
  {
    id: "p4",
    name: "周杰",
    areaIds: ["fuel"],
    qualifications: [{ qualificationId: "fuel-op", expiresAt: shiftDayKey(80) }]
  },
  {
    id: "p5",
    name: "孙丽",
    areaIds: ["cash", "fuel"],
    qualifications: [
      { qualificationId: "cashier-cert", expiresAt: shiftDayKey(55) },
      { qualificationId: "fuel-op", expiresAt: shiftDayKey(10) }
    ]
  },
  {
    id: "p6",
    name: "王芳",
    areaIds: ["cash"],
    qualifications: [{ qualificationId: "cashier-cert", expiresAt: shiftDayKey(3) }]
  },
  {
    id: "p7",
    name: "刘洋",
    areaIds: ["cash"],
    qualifications: [{ qualificationId: "cashier-cert", expiresAt: shiftDayKey(-10) }]
  }
];

export const CHECKPOINTS: Checkpoint[] = [
  { id: "cp-f1", areaId: "fuel", name: "加油机1号" },
  { id: "cp-f2", areaId: "fuel", name: "加油机2号" },
  { id: "cp-f3", areaId: "fuel", name: "消防沙箱" },
  { id: "cp-t1", areaId: "tank", name: "卸油口密封" },
  { id: "cp-t2", areaId: "tank", name: "量油孔" },
  { id: "cp-t3", areaId: "tank", name: "防溢流报警器" },
  { id: "cp-c1", areaId: "cash", name: "收银监控" },
  { id: "cp-c2", areaId: "cash", name: "烟感报警器" }
];

export function peopleInArea(areaId: string) {
  return PEOPLE.filter((person) => person.areaIds.includes(areaId));
}

export function pointsInArea(areaId: string) {
  return CHECKPOINTS.filter((point) => point.areaId === areaId);
}

export function areaName(areaId: string): string {
  return AREAS.find((area) => area.id === areaId)?.name ?? areaId;
}

export function personName(personId: string): string {
  return PEOPLE.find((person) => person.id === personId)?.name ?? personId;
}

export function qualificationName(qualificationId: string): string {
  return QUALIFICATIONS.find((qualification) => qualification.id === qualificationId)?.name ?? qualificationId;
}

export function pointName(pointId: string): string {
  return CHECKPOINTS.find((point) => point.id === pointId)?.name ?? pointId;
}

export function personHas(personId: string, qualificationId: string): boolean {
  return PEOPLE.find((person) => person.id === personId)?.qualifications
    .some((item) => item.qualificationId === qualificationId) ?? false;
}

export function personQualificationExpiry(personId: string, qualificationId: string): string | undefined {
  return PEOPLE.find((person) => person.id === personId)?.qualifications
    .find((item) => item.qualificationId === qualificationId)?.expiresAt;
}

let seedSeq = 0;
function stampedIso(): string {
  // 让示例数据时间戳稳定递增且早于当前操作时间
  return new Date(Date.now() - (100 - seedSeq--) * 60000).toISOString();
}

/** 首次使用时的示例资料：一个已结班（含漏检待办与历史版本）、一个已接班冻结、两组重叠/过期草案 */
export function buildSeedState(): AppState {
  const yesterday = shiftDayKey(-1);
  const today = todayKey();

  const s1: Shift = {
    id: "seed-shift-1",
    areaId: "tank",
    date: yesterday,
    start: "08:00",
    end: "16:00",
    assignments: [
      { id: "a11", post: "卸油岗", personId: "p2", requiredQualificationId: "unload-op", attendance: "on-duty" },
      { id: "a12", post: "安全岗", personId: "p2", requiredQualificationId: "safety", attendance: "on-duty" }
    ],
    pointIds: ["cp-t1", "cp-t2", "cp-t3"],
    checks: [
      { pointId: "cp-t1", status: "ok", note: "密封完好" },
      { pointId: "cp-t2", status: "ok", note: "读数正常" }
    ],
    phase: "closed",
    version: 2,
    frozenAt: new Date(yesterday + "T08:00:00").toISOString(),
    closedAt: new Date(yesterday + "T16:05:00").toISOString(),
    createdAt: new Date(yesterday + "T07:30:00").toISOString()
  };

  const s1Baseline: Shift = {
    ...s1,
    checks: [
      { pointId: "cp-t1", status: "ok", note: "密封完好" },
      { pointId: "cp-t2", status: "pending", note: "" }
    ],
    version: 1,
    closedAt: undefined
  };

  const s2: Shift = {
    id: "seed-shift-2",
    areaId: "tank",
    date: today,
    start: "08:00",
    end: "16:00",
    assignments: [
      { id: "a21", post: "卸油岗", personId: "p1", requiredQualificationId: "unload-op", attendance: "absent" },
      { id: "a22", post: "安全岗", personId: "p2", requiredQualificationId: "safety", attendance: "on-duty" }
    ],
    pointIds: ["cp-t1", "cp-t2", "cp-t3"],
    checks: [
      { pointId: "cp-t1", status: "ok", note: "复核通过" },
      { pointId: "cp-t2", status: "pending", note: "" },
      { pointId: "cp-t3", status: "pending", note: "" }
    ],
    phase: "frozen",
    version: 1,
    frozenAt: new Date(today + "T08:00:00").toISOString(),
    createdAt: new Date(today + "T07:20:00").toISOString()
  };

  // 人员时段重叠示例：孙丽同时被排进加油区与收银区同班次
  const s3: Shift = {
    id: "seed-shift-3",
    areaId: "fuel",
    date: today,
    start: "16:00",
    end: "23:00",
    assignments: [
      { id: "a31", post: "加油岗", personId: "p5", requiredQualificationId: "fuel-op", attendance: "on-duty" }
    ],
    pointIds: ["cp-f1", "cp-f2"],
    checks: [],
    phase: "draft",
    version: 1,
    createdAt: stampedIso()
  };

  const s4: Shift = {
    id: "seed-shift-4",
    areaId: "cash",
    date: today,
    start: "16:00",
    end: "23:00",
    assignments: [
      { id: "a41", post: "收银岗", personId: "p5", requiredQualificationId: "cashier-cert", attendance: "on-duty" }
    ],
    pointIds: ["cp-c1", "cp-c2"],
    checks: [],
    phase: "draft",
    version: 1,
    createdAt: stampedIso()
  };

  // 资格过期示例：刘洋持有的收银上岗证已过期
  const s5: Shift = {
    id: "seed-shift-5",
    areaId: "cash",
    date: today,
    start: "08:00",
    end: "12:00",
    assignments: [
      { id: "a51", post: "收银岗", personId: "p7", requiredQualificationId: "cashier-cert", attendance: "on-duty" }
    ],
    pointIds: ["cp-c1"],
    checks: [],
    phase: "draft",
    version: 1,
    createdAt: stampedIso()
  };

  const shifts = [s2, s3, s4, s5, s1];

  const todos: Todo[] = [
    {
      id: "seed-todo-1",
      areaId: "tank",
      sourceShiftId: s1.id,
      pointId: "cp-t3",
      pointName: "防溢流报警器",
      createdAt: new Date(yesterday + "T16:05:00").toISOString(),
      targetShiftId: s2.id,
      status: "open"
    }
  ];

  const versions: ShiftVersion[] = [
    {
      id: "seed-version-1",
      shiftId: s1.id,
      version: 1,
      reason: "接班冻结基线",
      createdAt: new Date(yesterday + "T08:00:00").toISOString(),
      summary: "接班后冻结名单与点位：卸油岗/安全岗共 2 人，必到点 3 个",
      snapshot: s1Baseline
    },
    {
      id: "seed-version-2",
      shiftId: s1.id,
      version: 2,
      reason: "补录昨日量油孔检查结果",
      createdAt: new Date(yesterday + "T17:20:00").toISOString(),
      summary: "量油孔：未检 → 正常（读数正常）",
      snapshot: s1
    }
  ];

  return { shifts, todos, versions };
}
