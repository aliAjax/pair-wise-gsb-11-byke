// 状态层：页面只调用此处的动作；内部执行判定层纯函数并原子落盘。

import { useCallback, useMemo, useState } from "react";
import {
  ScheduleState,
  Shift,
  ShiftDraftInput,
  InspectionResult,
} from "../domain/types";
import * as rules from "../domain/rules";
import { PEOPLE, POINTS } from "../data/people";
import { loadState, resetState, saveState } from "../storage/store";

export function useSchedule() {
  const [state, setState] = useState<ScheduleState>(loadState);
  const [error, setError] = useState<string | null>(null);

  const commit = useCallback((next: ScheduleState) => {
    saveState(next);
    setState(next);
    setError(null);
  }, []);

  const run = useCallback(
    (fn: () => ScheduleState) => {
      try {
        commit(fn());
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "操作未被规则允许");
        return false;
      }
    },
    [commit]
  );

  const actions = useMemo(
    () => ({
      createShift: (input: ShiftDraftInput) =>
        run(() => rules.createShift(state, input, PEOPLE)),
      startShift: (shiftId: string) =>
        run(() => rules.startShift(state, shiftId, PEOPLE, POINTS)),
      removeShift: (shiftId: string) => run(() => rules.removeShift(state, shiftId)),
      addAssignment: (shiftId: string, personId: string, pointIds: string[]) =>
        run(() => rules.addAssignment(state, shiftId, personId, pointIds, PEOPLE)),
      removeAssignment: (shiftId: string, assignmentId: string) =>
        run(() => rules.removeAssignment(state, shiftId, assignmentId)),
      updateAssignmentPoints: (shiftId: string, assignmentId: string, pointIds: string[]) =>
        run(() => rules.updateAssignmentPoints(state, shiftId, assignmentId, pointIds)),
      markAbsent: (shiftId: string, assignmentId: string) =>
        run(() => rules.markAbsent(state, shiftId, assignmentId)),
      cancelAbsent: (shiftId: string, assignmentId: string) =>
        run(() => rules.cancelAbsent(state, shiftId, assignmentId)),
      takeOver: (shiftId: string, assignmentId: string, substituteId: string) =>
        run(() => rules.takeOver(state, shiftId, assignmentId, substituteId, PEOPLE)),
      confirmHandover: (shiftId: string, handoverId: string) =>
        run(() => rules.confirmHandover(state, shiftId, handoverId)),
      setResult: (
        shiftId: string,
        assignmentId: string,
        pointId: string,
        result: InspectionResult
      ) => run(() => rules.setResult(state, shiftId, assignmentId, pointId, result)),
      completeTodo: (todoId: string) => run(() => rules.completeTodo(state, todoId)),
      closeShift: (shiftId: string) =>
        run(() => rules.closeShift(state, shiftId, PEOPLE, POINTS)),
      adjustClosedResult: (
        shiftId: string,
        assignmentId: string,
        pointId: string,
        result: InspectionResult,
        reason: string
      ) =>
        run(() =>
          rules.adjustClosedResult(state, shiftId, assignmentId, pointId, result, reason)
        ),
      reset: () => {
        setState(resetState());
        setError(null);
      },
      clearError: () => setError(null),
    }),
    [run, state]
  );

  return { state, actions, error };
}

export type ScheduleActions = ReturnType<typeof useSchedule>["actions"];

/** 页面侧查询（不产生新数据） */
export function shiftIssues(state: ScheduleState, shift: Shift) {
  return rules.validateShift(shift, state.shifts, PEOPLE, POINTS);
}
