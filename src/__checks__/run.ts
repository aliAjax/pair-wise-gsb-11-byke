import { SEED_STATE, SEED_DATE } from "../data/seeds";
import { PEOPLE, POINTS } from "../data/people";
import * as rules from "../domain/rules";
import type { ScheduleState } from "../domain/types";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name} ${extra}`);
  } else {
    console.log(`ok: ${name}`);
  }
}
function expectThrow(name: string, fn: () => unknown, fragment?: string) {
  try {
    fn();
    failures++;
    console.error(`FAIL: ${name} (expected throw)`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (fragment && !msg.includes(fragment)) {
      failures++;
      console.error(`FAIL: ${name} message="${msg}" expected "${fragment}"`);
    } else console.log(`ok: ${name}`);
  }
}

let state: ScheduleState = structuredClone(SEED_STATE);
const find = (id: string) => state.shifts.find((s) => s.id === id)!;

// 1. 种子：三个不成立班（一对时段重叠 + 一个资格过期），其他有效
// 注：加油白班有缺岗登记，但缺岗不等于班次不成立（替班交接是开班后的动作）
const invalidIds = state.shifts
  .filter((s) => rules.validateShift(s, state.shifts, PEOPLE, POINTS).length > 0)
  .map((s) => s.id);
check("three invalid seed shifts", invalidIds.length === 3, JSON.stringify(invalidIds));
check("overlap pair invalid", invalidIds.includes("s-tank-d25a") && invalidIds.includes("s-tank-d25b"));
check("expired qual shift invalid", invalidIds.includes("s-cash-d24"));
check(
  "active fuel shift valid even with absence",
  rules.isShiftValid(find("s-fuel-d23"), state.shifts, PEOPLE, POINTS)
);

// 2. 不成立班次不能开班
expectThrow(
  "cannot start invalid shift",
  () => (state = rules.startShift(state, "s-tank-d25a", PEOPLE, POINTS)),
  "不成立"
);

// 3. 王芳 16:00 后可替油罐夜班？王芳无油罐资格；何鑫替班油罐（已接班种子）
const tank = find("s-tank-d23");
const tankAsg = tank.assignments[0];
const candidates = rules.eligibleSubstitutes(tank, tankAsg, state.shifts, PEOPLE);
check("no free substitute for frozen tank shift", candidates.every((c) => c.reason !== null));

// 4. 加油白班缺岗（李强）：陈静合格且空闲，王芳本班忙，李强本人不可
const fuel = find("s-fuel-d23");
const liAsg = fuel.assignments.find((a) => a.state === "absent")!;
const cmap = new Map(rules.eligibleSubstitutes(fuel, liAsg, state.shifts, PEOPLE).map((c) => [c.person.id, c.reason]));
check("chen jing eligible", cmap.get("p-chen") === null);
check("wang fang busy", (cmap.get("p-wang") ?? "").includes("本班已有"));
check("li qiang self excluded", (cmap.get("p-li") ?? "").includes("不能替自己"));
check("zhou lei lacks qual", (cmap.get("p-zhou") ?? "").includes("资格"));

// 5. 接班：冻结名单、责任人改为陈静、交接待确认、增列被拒
state = rules.takeOver(state, "s-fuel-d23", liAsg.id, "p-chen", PEOPLE);
const fuelAfter = find("s-fuel-d23");
check("frozen after takeover", fuelAfter.frozenAt !== null);
const asgAfter = fuelAfter.assignments.find((a) => a.id === liAsg.id)!;
check("substitute assigned", asgAfter.personId === "p-chen" && asgAfter.state === "substituted");
const hov = fuelAfter.handovers[0];
check("handover taken", hov?.status === "taken");
expectThrow("roster locked after freeze", () =>
  rules.addAssignment(state, "s-fuel-d23", "p-wang", [], PEOPLE)
);
// 责任确认前仍提示原值班人
const note = rules.responsibilityNote(fuelAfter, asgAfter, PEOPLE) ?? "";
check("responsibility held until confirm", note.includes("责任不释放"));
state = rules.confirmHandover(state, "s-fuel-d23", hov.id);
const fuelConfirmed = find("s-fuel-d23");
const asgConfirmed = fuelConfirmed.assignments.find((a) => a.id === liAsg.id)!;
const note2 = rules.responsibilityNote(fuelConfirmed, asgConfirmed, PEOPLE) ?? "";
check("responsibility released", note2.includes("移交") && !note2.includes("不释放"));

// 6. 检查结果流转
state = rules.setResult(state, "s-fuel-d23", fuelAfter.assignments[1].id, "pt-fuel-2", "正常");
check(
  "result recorded",
  find("s-fuel-d23").assignments[1].results["pt-fuel-2"] === "正常"
);

// 7. 结班：加油白班全部已检（灭火器：何鑫正常 + 替班陈静的灭火器已随何鑫? 验证待办逻辑）
// 陈静替班携带 pt-fuel-fire 未检（种子 absent 时无 results 初始？buildAssignment 有）
state = rules.setResult(state, "s-fuel-d23", asgAfter.id, "pt-fuel-fire", "正常");
const todosBefore = state.todos.filter((t) => t.status === "pending").length;
state = rules.closeShift(state, "s-fuel-d23", PEOPLE, POINTS);
const fuelTodos = state.todos.filter((t) => t.sourceShiftId === "s-fuel-d23");
check("no todos when all checked", fuelTodos.length === 0, `got ${fuelTodos.length}`);
check("seed todo targets tonight cash shift", state.todos.find((t) => t.id === "t-cash-cam")?.targetShiftId === "s-cash-d23");

// 8. 结班油罐（有未检点）→ 漏检转入次日油罐草稿（d24 成立）
state = rules.closeShift(state, "s-tank-d23", PEOPLE, POINTS);
const tankTodos = state.todos.filter((t) => t.sourceShiftId === "s-tank-d23");
check("tank miss todos created", tankTodos.length === 3, `got ${tankTodos.length}`);
check("tank todos roll to next shift", tankTodos.every((t) => t.targetShiftId === "s-tank-d24"));

// 9. 漏检待办只可在承接班进行中补检；结班收银晚班时未完成则顺延
// d24 收银班资格过期不成立，不能作为承接班，待办进入待排队列
expectThrow("cannot complete todo before target starts", () =>
  rules.completeTodo(state, "t-cash-cam")
);
state = rules.startShift(state, "s-cash-d23", PEOPLE, POINTS);
state = rules.completeTodo(state, "t-cash-cam");
check("todo completed in active shift", state.todos.find((t) => t.id === "t-cash-cam")?.status === "done");
state = rules.closeShift(state, "s-cash-d23", PEOPLE, POINTS);
const rolled = state.todos.find((t) => t.id === "t-cash-cam")!;
check("completed todo not rolled", rolled.status === "done" && rolled.generation === 0);
// 油罐待办转入草稿班，草稿期不可补检
const tankTodo0 = state.todos.find((t) => t.sourceShiftId === "s-tank-d23")!;
expectThrow("cannot complete while target is draft", () => rules.completeTodo(state, tankTodo0.id));

// 9b. 油罐 d24 开班但不补检直接结班：待办顺延；后续 d25 油罐班均不成立 → 待排队列
state = rules.startShift(state, "s-tank-d24", PEOPLE, POINTS);
state = rules.closeShift(state, "s-tank-d24", PEOPLE, POINTS);
const rolledTank = state.todos.filter((t) => t.sourceShiftId === "s-tank-d23");
check("tank todos rolled onward", rolledTank.every((t) => t.targetShiftId === null && t.generation === 1),
  JSON.stringify(rolledTank.map(t => [t.targetShiftId, t.generation])));

// 10. 结班后调整必须写原因，版本快照正确
const closed = find("s-cash-d22");
expectThrow("adjust needs reason", () =>
  rules.adjustClosedResult(state, "s-cash-d22", closed.assignments[0].id, "pt-cash-pos", "异常", "  ")
);
state = rules.adjustClosedResult(
  state,
  "s-cash-d22",
  "a-cash22-wang",
  "pt-cash-pos",
  "异常",
  "复核确认POS小票缺登记"
);
const adj = find("s-cash-d22");
check("version bumped", adj.version === 3);
check("version snapshot kept", adj.versions.length === 2 && adj.versions[1].version === 2);
check("snapshot is pre-adjust", adj.versions[1].snapshot.assignments[0].results["pt-cash-pos"] === "正常");
check("current result changed", adj.assignments[0].results["pt-cash-pos"] === "异常");
expectThrow("cannot edit roster of closed", () =>
  rules.addAssignment(state, "s-cash-d22", "p-chen", [], PEOPLE)
);

// 11. 新建班次：缺资格直接拒绝登记
expectThrow("create rejects missing qual", () =>
  rules.createShift(
    state,
    { area: "收银区", date: SEED_DATE, start: "08:00", end: "10:00", rows: [{ personId: "p-li", pointIds: ["pt-cash-pos"] }] },
    PEOPLE
  )
);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} FAILURES`);
if (failures > 0) process.exit(1);
