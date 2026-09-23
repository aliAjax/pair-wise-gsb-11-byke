// 页面：新建班次表单。登记区域、时刻、值班人、必到点；提交前实时预判班次是否成立。

import { FormEvent, useMemo, useState } from "react";
import { AREAS, PEOPLE, pointsOfArea } from "../data/people";
import { SEED_DATE } from "../data/seeds";
import { ShiftDraftInput } from "../domain/types";
import { hasValidQualification, toMinutes } from "../domain/rules";
import { ScheduleActions } from "../state/useSchedule";

interface Row {
  personId: string;
  pointIds: string[];
}

export function ShiftForm({ actions }: { actions: ScheduleActions }) {
  const [area, setArea] = useState<string>(AREAS[0]);
  const [date, setDate] = useState(SEED_DATE);
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("16:00");
  const [rows, setRows] = useState<Row[]>([{ personId: "", pointIds: [] }]);

  const areaPoints = useMemo(() => pointsOfArea(area), [area]);

  // 实时预判：资格是否覆盖班次日期、时段是否自洽（重叠在提交后由整班判定提示）
  const previewIssues = useMemo(() => {
    const issues: string[] = [];
    if (toMinutes(start) >= toMinutes(end)) issues.push("开始时刻须早于结束时刻");
    rows.forEach((row, index) => {
      if (!row.personId) return;
      const person = PEOPLE.find((p) => p.id === row.personId);
      if (person && !hasValidQualification(person, area, date)) {
        issues.push(`第${index + 1}位值班人 ${person.name} 的${area}资格未覆盖 ${date}`);
      }
      if (row.pointIds.length === 0) issues.push(`第${index + 1}位值班人尚未选择必到点`);
    });
    const picked = rows.map((r) => r.personId).filter(Boolean);
    if (new Set(picked).size !== picked.length) issues.push("同一值班人被重复登记");
    return issues;
  }, [area, date, start, end, rows]);

  function updateRow(index: number, patch: Partial<Row>) {
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function togglePoint(index: number, pointId: string) {
    const row = rows[index];
    const next = row.pointIds.includes(pointId)
      ? row.pointIds.filter((id) => id !== pointId)
      : [...row.pointIds, pointId];
    updateRow(index, { pointIds: next });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: ShiftDraftInput = {
      area,
      date,
      start,
      end,
      rows: rows.filter((r) => r.personId).map((r) => ({ personId: r.personId, pointIds: r.pointIds })),
    };
    if (actions.createShift(input)) {
      setRows([{ personId: "", pointIds: [] }]);
    }
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h2>新建班次</h2>
      <div className="form-grid">
        <label>
          区域
          <select
            value={area}
            onChange={(e) => {
              setArea(e.target.value);
              setRows(rows.map((r) => ({ ...r, pointIds: [] })));
            }}
          >
            {AREAS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label>
          日期
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <div className="time-row">
          <label>
            开始
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
          </label>
          <label>
            结束
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </label>
        </div>

        <div className="roster-editor">
          <div className="roster-head">
            <span>值班登记（人 / 必到点）</span>
            <button
              type="button"
              className="secondary"
              onClick={() => setRows([...rows, { personId: "", pointIds: [] }])}
            >
              + 值班人
            </button>
          </div>
          {rows.map((row, index) => (
            <div className="roster-row" key={index}>
              <div className="roster-row-head">
                <select
                  value={row.personId}
                  onChange={(e) => updateRow(index, { personId: e.target.value })}
                  required
                >
                  <option value="">选择值班人</option>
                  {PEOPLE.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {rows.length > 1 && (
                  <button
                    type="button"
                    className="danger"
                    onClick={() => setRows(rows.filter((_, i) => i !== index))}
                  >
                    移除
                  </button>
                )}
              </div>
              <div className="point-picks">
                {areaPoints.map((point) => (
                  <label className="point-pick" key={point.id}>
                    <input
                      type="checkbox"
                      checked={row.pointIds.includes(point.id)}
                      onChange={() => togglePoint(index, point.id)}
                    />
                    {point.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {previewIssues.length > 0 && (
          <ul className="issue-list">
            {previewIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}

        <button type="submit">登记班次</button>
        <p className="hint">登记后进入「编制中」；开班时若有时段重叠或资格过期，整班不成立。</p>
      </div>
    </form>
  );
}
