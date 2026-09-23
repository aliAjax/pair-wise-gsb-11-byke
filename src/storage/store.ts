// 存储层：整个排班台账（班次 + 待办）作为单一键原子读写。
// 读取损坏时回退到种子数据，避免页面拿到半截结构。

import { ScheduleState, Shift, ShiftTodo } from "../domain/types";
import { SEED_STATE } from "../data/seeds";

export const STORAGE_KEY = "dfwlfront-10-shift-console-v1";

function isState(value: unknown): value is ScheduleState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.shifts) && Array.isArray(v.todos);
}

export function loadState(): ScheduleState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(SEED_STATE);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isState(parsed)) throw new Error("bad shape");
    return sanitize(parsed);
  } catch {
    return structuredClone(SEED_STATE);
  }
}

export function saveState(state: ScheduleState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState(): ScheduleState {
  const fresh = structuredClone(SEED_STATE);
  saveState(fresh);
  return fresh;
}

// 容错：补齐历史数据可能缺失的字段，保持“刷新后四者一致”
function sanitize(state: ScheduleState): ScheduleState {
  const shifts: Shift[] = state.shifts.map((s) => ({
    ...s,
    assignments: s.assignments ?? [],
    handovers: s.handovers ?? [],
    versions: s.versions ?? [],
    version: s.version ?? 1,
    frozenAt: s.frozenAt ?? null,
    startedAt: s.startedAt ?? null,
    closedAt: s.closedAt ?? null,
  }));
  const todos: ShiftTodo[] = state.todos.map((t) => ({
    ...t,
    targetShiftId: t.targetShiftId ?? null,
    generation: t.generation ?? 0,
    completedAt: t.completedAt ?? null,
  }));
  return { shifts, todos };
}
