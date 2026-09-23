// 班次编制表单：登记区域、日期时刻、岗位/值班人/所需资格、必到点。
// 草案提交后由判定层给出是否成立；不成立也保留，便于修正后接班。

import { FormEvent, useMemo, useState } from "react";
import { AREAS, PEOPLE, QUALIFICATIONS, pointsInArea } from "../data/catalog";
import { createShift } from "../domain/actions";
import { useAppState } from "./useAppState";
import { validateShift } from "../domain/rules";
import { Shift } from "../domain/types";
import { todayKey } from "../domain/time";

interface AssignmentRow {
  post: string;
  personId: string;
  requiredQualificationId: string;
}

const emptyRow: AssignmentRow = { post: "", personId: "", requiredQualificationId: "" };

export function ShiftComposer({ onError }: { onError: (message: string) => void }) {
  const state = useAppState();
  const [areaId, setAreaId] = useState<string>(AREAS[0].id);
  const [date, setDate] = useState(todayKey());
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("16:00");
  const [rows, setRows] = useState<AssignmentRow[]>([{ ...emptyRow }]);
  const [pointIds, setPointIds] = useState<string[]>(() => pointsInArea(AREAS[0].id).map((p) => p.id));

  const areaPoints = useMemo(() => pointsInArea(areaId), [areaId]);
  const areaPeople = useMemo(() => PEOPLE.filter((p) => p.areaIds.includes(areaId)), [areaId]);

  function changeArea(nextArea: string) {
    setAreaId(nextArea);
    setRows([{ ...emptyRow }]);
    setPointIds(pointsInArea(nextArea).map((p) => p.id));
  }

  function patchRow(index: number, patch: Partial<AssignmentRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function togglePoint(pointId: string) {
    setPointIds((current) =>
      current.includes(pointId) ? current.filter((id) => id !== pointId) : [...current, pointId]
    );
  }

  const previewShift: Shift = {
    id: "__preview__",
    areaId,
    date,
    start,
    end,
    assignments: rows
      .filter((row) => row.personId)
      .map((row, index) => ({
        id: `preview-${index}`,
        post: row.post || "未命名岗位",
        personId: row.personId,
        requiredQualificationId: row.requiredQualificationId,
        attendance: "on-duty" as const
      })),
    pointIds,
    checks: [],
    phase: "draft",
    version: 1,
    createdAt: new Date().toISOString()
  };
  const previewProblems = validateShift(previewShift, state);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const validRows = rows.filter((row) => row.post.trim() && row.personId && row.requiredQualificationId);
    if (validRows.length === 0) {
      onError("请至少填写一个完整岗位（岗位名、值班人、所需资格）");
      return;
    }
    if (pointIds.length === 0) {
      onError("请至少选择一个必到点");
      return;
    }
    try {
      createShift({ areaId, date, start, end, assignments: validRows, pointIds });
      setRows([{ ...emptyRow }]);
    } catch (error) {
      onError(error instanceof Error ? error.message : "登记失败");
    }
  }

  return (
    <form className="panel composer" onSubmit={handleSubmit}>
      <h2>班次编制登记</h2>
      <p className="hint">登记区域、时刻、值班人、岗位资格与必到点；人员时段重叠或资格过期时整班不成立、不能接班。</p>

      <div className="form-grid">
        <div className="form-row three">
          <label>
            区域
            <select value={areaId} onChange={(e) => changeArea(e.target.value)}>
              {AREAS.map((area) => (
                <option key={area.id} value={area.id}>{area.name}</option>
              ))}
            </select>
          </label>
          <label>
            班次日期
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <div className="time-range">
            <label>
              上班
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
            </label>
            <span className="dash">—</span>
            <label>
              下班
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
            </label>
          </div>
        </div>

        <div className="subhead">值班岗位</div>
        <div className="assignment-rows">
          <div className="assignment-row head">
            <span>岗位</span>
            <span>值班人</span>
            <span>所需资格</span>
            <span />
          </div>
          {rows.map((row, index) => (
            <div className="assignment-row" key={index}>
              <input
                placeholder="如：加油岗"
                value={row.post}
                onChange={(e) => patchRow(index, { post: e.target.value })}
              />
              <select value={row.personId} onChange={(e) => patchRow(index, { personId: e.target.value })}>
                <option value="">选择值班人</option>
                {areaPeople.map((person) => (
                  <option key={person.id} value={person.id}>{person.name}</option>
                ))}
              </select>
              <select
                value={row.requiredQualificationId}
                onChange={(e) => patchRow(index, { requiredQualificationId: e.target.value })}
              >
                <option value="">选择资格</option>
                {QUALIFICATIONS.map((qualification) => (
                  <option key={qualification.id} value={qualification.id}>{qualification.name}</option>
                ))}
              </select>
              <button
                type="button"
                className="danger small"
                disabled={rows.length === 1}
                onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
              >
                移除
              </button>
            </div>
          ))}
          <button type="button" className="secondary small" onClick={() => setRows((current) => [...current, { ...emptyRow }])}>
            + 增加岗位
          </button>
        </div>

        <div className="subhead">必到点</div>
        <div className="point-picker">
          {areaPoints.map((point) => (
            <label className="check-chip" key={point.id}>
              <input
                type="checkbox"
                checked={pointIds.includes(point.id)}
                onChange={() => togglePoint(point.id)}
              />
              <span>{point.name}</span>
            </label>
          ))}
        </div>

        <div className={`preview ${previewProblems.length ? "invalid" : "valid"}`}>
          <strong>编制预检：{previewProblems.length ? `整班不成立（${previewProblems.length} 项问题）` : "整班成立，可以接班"}</strong>
          {previewProblems.length > 0 && (
            <ul>
              {previewProblems.map((problem) => (
                <li key={problem.message}>{problem.message}</li>
              ))}
            </ul>
          )}
        </div>

        <button type="submit" className="primary">登记为草案班次</button>
      </div>
    </form>
  );
}
