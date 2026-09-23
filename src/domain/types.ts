// 领域模型：班次、替班交接、漏检待办、版本
// 该文件只描述资料结构，不写判定逻辑，也不接触 localStorage 与 React。

export type Phase = "draft" | "frozen" | "closed";

/** 区域 */
export interface Area {
  id: string;
  name: string;
}

/** 资格类型（如加油作业证、卸油作业证） */
export interface Qualification {
  id: string;
  name: string;
}

/** 人员可服务多个区域，持有多种带有效期的资格 */
export interface Person {
  id: string;
  name: string;
  areaIds: string[];
  qualifications: { qualificationId: string; expiresAt: string }[];
}

/** 必到点（巡检点位，归属区域） */
export interface Checkpoint {
  id: string;
  areaId: string;
  name: string;
}

export type Attendance = "on-duty" | "absent";

/** 替班交接单：原值班人确认前责任不释放 */
export interface Handover {
  id: string;
  substituteId: string;
  reason: string;
  requestedAt: string;
  status: "pending" | "confirmed" | "cancelled";
  requestedBy: string;
  confirmedAt?: string;
}

/** 班内岗位：岗位名、值班人、所需资格、出勤与交接状态 */
export interface Assignment {
  id: string;
  post: string;
  personId: string;
  requiredQualificationId: string;
  attendance: Attendance;
  handover?: Handover;
}

export type CheckStatus = "pending" | "ok" | "abnormal";

export interface PointCheck {
  pointId: string;
  status: CheckStatus;
  note: string;
}

export interface Shift {
  id: string;
  areaId: string;
  /** 班次日期 YYYY-MM-DD */
  date: string;
  /** 起止时刻 HH:MM */
  start: string;
  end: string;
  assignments: Assignment[];
  pointIds: string[];
  checks: PointCheck[];
  phase: Phase;
  version: number;
  frozenAt?: string;
  closedAt?: string;
  createdAt: string;
}

/** 漏检待办：结班时未检点位转给同区域下一班 */
export interface Todo {
  id: string;
  areaId: string;
  sourceShiftId: string;
  pointId: string;
  pointName: string;
  createdAt: string;
  targetShiftId?: string;
  status: "open" | "done";
  resolvedAt?: string;
  note?: string;
}

/** 结班后调整必须写原因，并另存一个版本快照 */
export interface ShiftVersion {
  id: string;
  shiftId: string;
  /** 该版本号，等于调整后班次的 version */
  version: number;
  reason: string;
  createdAt: string;
  summary: string;
  snapshot: Shift;
}

export interface AppState {
  shifts: Shift[];
  todos: Todo[];
  versions: ShiftVersion[];
}
