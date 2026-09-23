import { useMemo, useState } from "react";
import { AREAS } from "./data/people";
import { useSchedule, shiftIssues } from "./state/useSchedule";
import { sortShifts } from "./domain/rules";
import { ShiftForm } from "./components/ShiftForm";
import { PeoplePanel } from "./components/PeoplePanel";
import { TodoPanel } from "./components/TodoPanel";
import { ShiftCardView } from "./components/ShiftCard";

type AreaFilter = "全部区域" | (typeof AREAS)[number];
type StatusFilter = "全部状态" | "编制中" | "进行中" | "已结班";

export default function App() {
  const { state, actions, error } = useSchedule();
  const [areaFilter, setAreaFilter] = useState<AreaFilter>("全部区域");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("全部状态");

  const metrics = useMemo(() => {
    const total = state.shifts.length;
    const invalid = state.shifts.filter(
      (s) => shiftIssues(state, s).length > 0
    ).length;
    const pendingTodos = state.todos.filter((t) => t.status === "pending").length;
    const pendingHandovers = state.shifts.reduce(
      (n, s) => n + s.handovers.filter((h) => h.status === "taken").length,
      0
    );
    return [
      { label: "班次总数", value: total },
      { label: "不成立班次", value: invalid },
      { label: "漏检待办", value: pendingTodos },
      { label: "待确认交接", value: pendingHandovers },
    ];
  }, [state]);

  const visibleShifts = useMemo(() => {
    const statusMap = { 编制中: "draft", 进行中: "active", 已结班: "closed" } as const;
    return sortShifts(state.shifts)
      .filter((s) => areaFilter === "全部区域" || s.area === areaFilter)
      .filter((s) => statusFilter === "全部状态" || s.status === statusMap[statusFilter]);
  }, [state, areaFilter, statusFilter]);

  const validityCounts = useMemo(() => {
    const rows = ["编制中", "进行中", "已结班", "不成立"].map((label) => {
      const map = { 编制中: "draft", 进行中: "active", 已结班: "closed" } as const;
      const list =
        label === "不成立"
          ? state.shifts.filter((s) => shiftIssues(state, s).length > 0)
          : state.shifts.filter((s) => s.status === map[label as keyof typeof map]);
      return { label, value: list.length };
    });
    return rows;
  }, [state]);
  const maxCount = Math.max(1, ...validityCounts.map((r) => r.value));

  return (
    <main className="app">
      <div className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">石油行业 · 班次编制与替班交接台</p>
            <h1>油站班次编排与交接</h1>
            <p className="subtitle">
              每班登记区域、时刻、值班人、资格与必到点；人员时段重叠或资格过期则整班不成立。
              缺岗仅允许同区域且本班空闲的合格人员替班，原值班人确认交接前责任不释放；
              接班后冻结名单与点位，漏检转下班待办，结班后调整须写原因并另建版本。
            </p>
          </div>
          <div className="stack">
            <span className="tag">React</span>
            <span className="tag">TypeScript</span>
            <span className="tag">localStorage 原子存储</span>
            <span className="tag">资料 / 判定 / 存储 / 页面分离</span>
          </div>
        </header>

        <section className="metrics">
          {metrics.map((metric) => (
            <article className="metric" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </article>
          ))}
        </section>

        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button type="button" className="secondary tiny" onClick={actions.clearError}>
              知道了
            </button>
          </div>
        )}

        <section className="workspace workspace-wide">
          <div className="side-col">
            <ShiftForm actions={actions} />
            <TodoPanel state={state} actions={actions} />
            <PeoplePanel />
          </div>

          <section className="list-panel">
            <div className="toolbar">
              <h2>班次列表</h2>
              <div className="filters">
                <select
                  value={areaFilter}
                  onChange={(e) => setAreaFilter(e.target.value as AreaFilter)}
                >
                  {["全部区域", ...AREAS].map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                >
                  {(["全部状态", "编制中", "进行中", "已结班"] as StatusFilter[]).map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <button type="button" className="secondary" onClick={actions.reset}>
                  恢复演示数据
                </button>
              </div>
            </div>

            <div className="record-grid">
              {visibleShifts.length === 0 ? (
                <div className="empty">暂无匹配班次</div>
              ) : (
                visibleShifts.map((shift) => (
                  <ShiftCardView
                    key={shift.id}
                    state={state}
                    shift={shift}
                    actions={actions}
                  />
                ))
              )}
            </div>

            <div className="mini-chart">
              {validityCounts.map((row) => (
                <div className="bar" key={row.label}>
                  <span>{row.label}</span>
                  <div className="bar-track">
                    <div
                      className={`bar-fill ${row.label === "不成立" ? "bar-fill-warn" : ""}`}
                      style={{ width: `${(row.value / maxCount) * 100}%` }}
                    />
                  </div>
                  <strong>{row.value}</strong>
                </div>
              ))}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
