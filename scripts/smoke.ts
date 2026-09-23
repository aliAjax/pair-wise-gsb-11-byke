// 领域规则与操作层冒烟测试。
// 运行：npx esbuild scripts/smoke.ts --bundle --platform=node --format=esm --outfile=scripts/.smoke.mjs && node scripts/.smoke.mjs
import { strict as assert } from "node:assert";
import { buildSeedState } from "../src/data/catalog";
import {
  validateShift,
  replacementCandidates,
  initChecks,
  missedPoints,
  findTargetShiftId,
  responsibleId
} from "../src/domain/rules";
import { shiftDayKey } from "../src/domain/time";
import { store } from "../src/data/storage";
import {
  createShift,
  startShift,
  markAbsent,
  requestHandover,
  confirmHandover,
  cancelHandover,
  closeShift,
  adjustClosedShift,
  setCheck,
  resolveTodo
} from "../src/domain/actions";

// ---- localStorage 垫片（storage 模块加载时即访问） ----
const memory = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) => (memory.has(key) ? memory.get(key)! : null),
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
  clear: () => memory.clear(),
  key: () => null,
  length: 0
} as Storage;
crypto.randomUUID = () => `test-${Math.random().toString(36).slice(2)}`;

let passed = 0;
function ok(name: string) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

// ============ 1. 种子数据判定 ============
store.reset();
let state = store.getState();
const s2 = state.shifts.find((s) => s.id === "seed-shift-2")!;
assert.equal(validateShift(s2, state).length, 0, "接班冻结中的油罐区班应成立");
ok("种子：接班冻结中的班次成立（含缺岗岗位不占用原值班人）");

const s3 = state.shifts.find((s) => s.id === "seed-shift-3")!;
const s4 = state.shifts.find((s) => s.id === "seed-shift-4")!;
const p3msg = validateShift(s3, state).map((p) => p.message).join("|");
const p4msg = validateShift(s4, state).map((p) => p.message).join("|");
assert.match(p3msg, /时段重叠/, "孙丽加油区班应与收银区班重叠");
assert.match(p4msg, /时段重叠/, "孙丽收银区班应与加油区班重叠");
ok("种子：人员时段重叠 → 两班均不成立");

const s5 = state.shifts.find((s) => s.id === "seed-shift-5")!;
const p5msg = validateShift(s5, state).map((p) => p.message).join("|");
assert.match(p5msg, /过期/, "刘洋上岗证过期应报错");
ok("种子：资格过期 → 整班不成立");

// 不成立的班不能接班
assert.throws(() => startShift(s3.id), /整班不成立/);
ok("不成立草案禁止接班");

// ============ 2. 新建成立的班并接班 ============
createShift({
  areaId: "fuel",
  date: shiftDayKey(2),
  start: "08:00",
  end: "16:00",
  assignments: [
    { post: "加油岗", personId: "p3", requiredQualificationId: "fuel-op" },
    { post: "巡查岗", personId: "p4", requiredQualificationId: "fuel-op" }
  ],
  pointIds: ["cp-f1", "cp-f2", "cp-f3"]
});
state = store.getState();
const fresh = state.shifts[0];
assert.equal(validateShift(fresh, state).length, 0);
startShift(fresh.id);
state = store.getState();
const started = state.shifts.find((s) => s.id === fresh.id)!;
assert.equal(started.phase, "frozen");
assert.equal(started.checks.length, 3);
assert.deepEqual(started.checks.map((c) => c.status), ["pending", "pending", "pending"]);
assert.ok(state.versions.some((v) => v.shiftId === fresh.id && v.version === 1 && v.reason === "接班冻结基线"));
ok("成立草案接班 → 冻结、初始化未检清单、生成 v1 基线版本");

// ============ 3. 缺岗与替班资格 ============
const gas = started.assignments[0];
markAbsent(started.id, gas.id);
state = store.getState();
let gasLive = state.shifts.find((s) => s.id === started.id)!.assignments.find((a) => a.id === gas.id)!;
assert.equal(gasLive.attendance, "absent");

let candidates = replacementCandidates(
  state.shifts.find((s) => s.id === started.id)!,
  "fuel-op",
  state
).map((c) => c.person.id);
assert.ok(!candidates.includes("p4"), "本班已在岗的周杰不能替班");
assert.ok(candidates.includes("p5"), "孙丽同区域有有效加油证且该时段空闲，应为候选人");
ok("替班候选人：同区域、资格有效、本班空闲");

assert.throws(
  () => requestHandover(started.id, gas.id, "p2", "病了"),
  /不是同区域合格且本班空闲/,
  "赵磊无加油作业证不能替加油岗"
);
ok("非合格人员发起替班被拒绝");

assert.throws(() => requestHandover(started.id, gas.id, "p5", "  "), /替班原因/);
requestHandover(started.id, gas.id, "p5", "突发身体不适");
state = store.getState();
gasLive = state.shifts.find((s) => s.id === started.id)!.assignments.find((a) => a.id === gas.id)!;
assert.equal(gasLive.handover?.status, "pending");
assert.equal(gasLive.handover?.substituteId, "p5");
ok("发起替班 → 交接待确认");

// 待确认期间：替班人时段已被预定，新班排孙丽冲突
const conflictShift = {
  id: "other", areaId: "fuel", date: shiftDayKey(2), start: "10:00", end: "12:00",
  assignments: [{ id: "x", post: "加油岗", personId: "p5", requiredQualificationId: "fuel-op", attendance: "on-duty" as const }],
  pointIds: ["cp-f1"], checks: [], phase: "draft" as const, version: 1, createdAt: ""
};
assert.ok(validateShift(conflictShift, state).some((p) => p.message.includes("时段重叠")));
ok("待确认交接：替班人时段已被预定，新班冲突");

// 原值班人确认前责任不释放：责任仍是陈敏 p3
assert.equal(responsibleId(gasLive), "p3");
confirmHandover(started.id, gas.id);
state = store.getState();
gasLive = state.shifts.find((s) => s.id === started.id)!.assignments.find((a) => a.id === gas.id)!;
assert.equal(gasLive.handover?.status, "confirmed");
assert.equal(responsibleId(gasLive), "p5");
ok("原值班人确认 → 责任转给替班人；确认前责任仍是原值班人");

// 撤回交接 → 恢复缺岗
cancelHandover(started.id, gas.id);
state = store.getState();
gasLive = state.shifts.find((s) => s.id === started.id)!.assignments.find((a) => a.id === gas.id)!;
assert.equal(gasLive.handover?.status, "cancelled");
assert.equal(gasLive.attendance, "absent");
ok("撤回交接 → 岗位恢复缺岗");

// 重新发起并确认，供后续结班使用
requestHandover(started.id, gas.id, "p5", "身体不适");
confirmHandover(started.id, gas.id);

// ============ 4. 点位登记、结班漏检转待办 ============
state = store.getState();
setCheck(started.id, "cp-f1", "ok", "正常");
setCheck(started.id, "cp-f2", "abnormal", "油枪渗油");
closeShift(started.id);
state = store.getState();
const closed = state.shifts.find((s) => s.id === started.id)!;
assert.equal(closed.phase, "closed");
const miss = state.todos.filter((t) => t.sourceShiftId === started.id);
assert.equal(miss.length, 1);
assert.equal(miss[0].pointId, "cp-f3");
assert.equal(miss[0].status, "open");
ok("结班 → 未检点位生成漏检待办");

// 种子待办（油罐区防溢流报警器，目标 seed-shift-2）仍在
const tankTodo = state.todos.find((t) => t.id === "seed-todo-1")!;
assert.equal(tankTodo.status, "open");
assert.equal(tankTodo.targetShiftId, "seed-shift-2");

// ============ 5. 结班后调整必须写原因 + 版本快照 + 自动关待办 ============
assert.throws(() => adjustClosedShift(started.id, "cp-f3", "ok", "补检正常", ""), /必须填写原因/);
assert.throws(() => adjustClosedShift(started.id, "cp-f3", "ok", "补检正常", "   "), /必须填写原因/);
ok("结班后调整不写原因被拒绝");

adjustClosedShift(started.id, "cp-f3", "ok", "补检正常", "下午现场补检");
state = store.getState();
const adjusted = state.shifts.find((s) => s.id === started.id)!;
assert.equal(adjusted.version, 2);
const vSnap = state.versions.find((v) => v.shiftId === started.id && v.reason === "下午现场补检");
assert.ok(vSnap, "调整前快照存档并记录原因");
assert.equal(vSnap!.version, 1);
assert.equal(vSnap!.snapshot.checks.find((c) => c.pointId === "cp-f3")!.status, "pending");
assert.equal(adjusted.checks.find((c) => c.pointId === "cp-f3")!.status, "ok");
const closedTodo = state.todos.find((t) => t.id === miss[0].id)!;
assert.equal(closedTodo.status, "done");
assert.match(closedTodo.note ?? "", /结班后补录/);
ok("结班后调整 → 保存调整前快照、版本号 +1、漏检待办自动关闭");

// ============ 6. 接班班次补检自动关待办 ============
state = store.getState();
setCheck("seed-shift-2", "cp-t3", "ok", "报警器测试通过");
state = store.getState();
const doneTodo = state.todos.find((t) => t.id === "seed-todo-1")!;
assert.equal(doneTodo.status, "done");
ok("接班班次登记漏检点位 → 转入待办自动关闭");

// ============ 7. 手动关闭待办 + 无下一班时待分派 ============
createShift({
  areaId: "cash",
  date: shiftDayKey(5),
  start: "08:00", end: "12:00",
  assignments: [{ post: "收银岗", personId: "p5", requiredQualificationId: "cashier-cert" }],
  pointIds: ["cp-c1", "cp-c2"]
});
state = store.getState();
const cashDraft = state.shifts[0];
startShift(cashDraft.id);
closeShift(cashDraft.id);
state = store.getState();
const cashTodos = state.todos.filter((t) => t.sourceShiftId === cashDraft.id);
assert.equal(cashTodos.length, 2);
assert.equal(cashTodos[0].targetShiftId, undefined);
ok("无同区域下一班时待办保持待分派");
resolveTodo(cashTodos[0].id, "电话核实已处理");
state = store.getState();
assert.equal(state.todos.find((t) => t.id === cashTodos[0].id)!.status, "done");
ok("手动关闭待办");

// ============ 8. 待办分派选择器：同区域下一班 ============
createShift({
  areaId: "cash",
  date: shiftDayKey(6),
  start: "08:00", end: "12:00",
  assignments: [{ post: "收银岗", personId: "p5", requiredQualificationId: "cashier-cert" }],
  pointIds: ["cp-c1"]
});
state = store.getState();
const nextCash = state.shifts[0];
const openCash = state.todos.find((t) => t.id === cashTodos[1].id)!;
assert.equal(findTargetShiftId(openCash, state), nextCash.id, "同区域下一班应被选为接办班");
ok("待办分派选择器选中同区域下一班");

// ============ 9. 纯函数小工具 ============
const checks = initChecks({ pointIds: ["cp-f1", "cp-f2"], checks: [] });
assert.deepEqual(checks.map((c) => c.status), ["pending", "pending"]);
assert.deepEqual(missedPoints({ checks }), ["cp-f1", "cp-f2"]);
ok("initChecks / missedPoints 纯函数行为");

// ============ 10. 持久化一致性：刷新等价于重读 storage ============
const raw = JSON.parse(memory.get("dfwlfront-10-shift-desk:v1")!);
assert.ok(Array.isArray(raw.shifts) && Array.isArray(raw.todos) && Array.isArray(raw.versions));
assert.equal(raw.todos.length, store.getState().todos.length);
assert.equal(raw.versions.length, store.getState().versions.length);
ok("班次/交接/待办/版本同键一体持久化");

console.log(`\n全部 ${passed} 项冒烟测试通过`);
