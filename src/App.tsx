// 页面装配层：指标、页签、班次列表与筛选；业务动作全部来自操作层。
import { useMemo, useState } from "react";
import { useAppState } from "./ui/useAppState";
import { ShiftComposer } from "./ui/ShiftComposer";
import { ShiftCard } from "./ui/ShiftCard";
import { TodoBoard } from "./ui/TodoBoard";
import { HandoverLedger } from "./ui/HandoverLedger";
import { VersionHistory } from "./ui/VersionHistory";
import { PersonRoster } from "./ui/PersonRoster";
import { AREAS, areaName } from "./data/catalog";
import { getShiftProblems } from "./domain/actions";
import { store } from "./data/storage";
import { shiftInterval } from "./domain/time";

const TABS = [
  { id: "shifts", label: "班次编制" },
  { id: "handovers", label: "替班交接" },
  { id: "todos", label: "漏检待办" },
  { id: "versions", label: "版本台账" },
  { id: "roster", label: "人员档案" }
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function App() {
  const state = useAppState();
  const [tab, setTab] = useState<TabId>("shifts");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [toast, setToast] = useState<string | null>(null);

  function reportError(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 4200);
  }

  const metrics = useMemo(() => {
    const validDrafts = state.shifts.filter((shift) => shift.phase === "draft" && getShiftProblems(shift, state).length === 0).length;
    const invalidDrafts = state.shifts.filter((shift) => shift.phase === "draft" && getShiftProblems(shift, state).length > 0).length;
    const active = state.shifts.filter((shift) => shift.phase === "frozen").length;
    const pendingHandovers = state.shifts
      .flatMap((shift) => shift.assignments)
      .filter((assignment) => assignment.handover?.status === "pending").length;
    const openTodos = state.todos.filter((todo) => todo.status === "open").length;
    return { validDrafts, invalidDrafts, active, pendingHandovers, openTodos, versions: state.versions.length };
  }, [state]);

  const visibleShifts = useMemo(() => {
    return state.shifts
      .filter((shift) => areaFilter === "all" || shift.areaId === areaFilter)
      .sort((a, b) => shiftInterval(b).start - shiftInterval(a).start);
  }, [state.shifts, areaFilter]);

  return (
    <main className="app">
      <div className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">石油行业 · 班次编制与替班交接台</p>
            <h1>油站班次编制与替班交接台</h1>
            <p className="subtitle">
              每班登记区域、时刻、值班人、资格与必到点；人员时段重叠或资格过期则整班不成立。
              缺岗仅允许同区域本班空闲的合格人员替班，原值班人确认前责任不释放；接班后冻结名单与点位，
              漏检转下班待办，结班后调整须写原因并另建版本。
            </p>
          </div>
          <div className="top-actions">
            <span className="tag">React + TypeScript</span>
            <span className="tag">无新增依赖</span>
            <span className="tag">localStorage 一体存储</span>
            <button className="secondary small" onClick={() => {
              if (window.confirm("恢复为内置示例资料？当前修改将被清除。")) store.reset();
            }}>
              重置示例数据
            </button>
          </div>
        </header>

        <section className="metrics">
          <article className="metric"><span>接班冻结中</span><strong>{metrics.active}</strong></article>
          <article className="metric"><span>成立 / 不成立草案</span><strong>{metrics.validDrafts} / {metrics.invalidDrafts}</strong></article>
          <article className="metric"><span>待确认交接</span><strong>{metrics.pendingHandovers}</strong></article>
          <article className="metric"><span>开放漏检待办</span><strong>{metrics.openTodos}</strong></article>
          <article className="metric"><span>历史版本</span><strong>{metrics.versions}</strong></article>
        </section>

        <nav className="tabs">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`tab ${tab === item.id ? "active" : ""}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              {item.id === "todos" && metrics.openTodos > 0 && <span className="tab-dot">{metrics.openTodos}</span>}
            </button>
          ))}
        </nav>

        {toast && <div className="toast" role="alert">{toast}</div>}

        {tab === "shifts" && (
          <div className="shifts-layout">
            <ShiftComposer onError={reportError} />
            <section className="panel list-panel">
              <div className="toolbar">
                <h2>班次列表</h2>
                <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
                  <option value="all">全部区域</option>
                  {AREAS.map((area) => (
                    <option key={area.id} value={area.id}>{area.name}</option>
                  ))}
                </select>
              </div>
              {visibleShifts.map((shift) => (
                <ShiftCard
                  key={shift.id}
                  shift={state.shifts.find((item) => item.id === shift.id)!}
                  state={state}
                  onError={reportError}
                />
              ))}
              {visibleShifts.length === 0 && <div className="empty">暂无班次，请在左侧登记</div>}
            </section>
          </div>
        )}

        {tab === "handovers" && <HandoverLedger />}
        {tab === "todos" && <TodoBoard onError={reportError} />}
        {tab === "versions" && <VersionHistory />}
        {tab === "roster" && <PersonRoster />}

        <footer className="footer">
          资料（档案/种子）、判定（成立校验/替班资格）、存储（localStorage 发布订阅）、页面（React 组件）四层分离；
          班次、交接、待办、版本在同一次状态写入中保持一致，刷新后仍一致。当前覆盖区域：
          {AREAS.map((area) => areaName(area.id)).join("、")}。
        </footer>
      </div>
    </main>
  );
}
