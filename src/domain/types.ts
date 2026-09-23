// 领域模型：班次、值班登记、交接、待办、版本

/** 巡检结果（必到点状态） */
export type InspectionResult = "未检" | "正常" | "异常";

/** 人员资格：按区域登记，附有效期 */
export interface Qualification {
  area: string;
  title: string;
  expiresAt: string; // YYYY-MM-DD
}

export interface Person {
  id: string;
  name: string;
  qualifications: Qualification[];
}

/** 必到点资料，归属某个区域 */
export interface Point {
  id: string;
  name: string;
  area: string;
}

/** 排班时对资格的快照（登记后不随后续资料变更而改变） */
export interface QualSnapshot {
  area: string;
  title: string;
  expiresAt: string;
  registeredAt: string;
}

export type AssignmentState = "on_duty" | "absent" | "substituted";

/** 一条值班登记：值班人 + 必到点 + 资格快照 + 各点检查结果 */
export interface Assignment {
  id: string;
  /** 当前值班人；替班接班后为替班人 */
  personId: string;
  /** 原值班人，始终保留 */
  originalPersonId: string;
  state: AssignmentState;
  pointIds: string[];
  qualification: QualSnapshot;
  results: Record<string, InspectionResult>;
}

export type HandoverStatus = "taken" | "confirmed";

/** 替班交接：接班后冻结，原值班人确认前责任不释放 */
export interface Handover {
  id: string;
  assignmentId: string;
  fromPersonId: string;
  toPersonId: string;
  pointIds: string[];
  status: HandoverStatus;
  takenAt: string;
  confirmedAt: string | null;
}

export type ShiftStatus = "draft" | "active" | "closed";

/** 结班后调整留下的历史版本，snapshot 为调整前整班快照 */
export interface ShiftVersion {
  id: string;
  version: number;
  reason: string;
  createdAt: string;
  snapshot: Shift;
}

export interface Shift {
  id: string;
  area: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM，允许 24:00
  status: ShiftStatus;
  frozenAt: string | null;
  createdAt: string;
  startedAt: string | null;
  closedAt: string | null;
  assignments: Assignment[];
  handovers: Handover[];
  version: number;
  versions: ShiftVersion[];
}

export interface ShiftDraftInput {
  area: string;
  date: string;
  start: string;
  end: string;
  rows: { personId: string; pointIds: string[] }[];
}

export type TodoStatus = "pending" | "done";

/** 漏检待办：结班时生成，转入同区域下一班 */
export interface ShiftTodo {
  id: string;
  area: string;
  pointId: string;
  sourceShiftId: string;
  targetShiftId: string | null; // 暂无下班时为空，进入待排队列
  status: TodoStatus;
  generation: number; // 被顺延的次数
  createdAt: string;
  completedAt: string | null;
}

export interface ScheduleState {
  shifts: Shift[];
  todos: ShiftTodo[];
}
