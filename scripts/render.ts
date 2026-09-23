// 页面渲染冒烟：用 react-dom/server 将 App 渲染为静态标记，校验关键区块都在。
// 运行：npx esbuild scripts/render.ts --bundle --platform=node --format=esm --outfile=scripts/.render.mjs && node scripts/.render.mjs
import { strict as assert } from "node:assert";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const memory = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) => (memory.has(key) ? memory.get(key)! : null),
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
  clear: () => memory.clear(),
  key: () => null,
  length: 0
} as Storage;
crypto.randomUUID = () => `render-${Math.random().toString(36).slice(2)}`;

import App from "../src/App";

const html = renderToStaticMarkup(React.createElement(App));

assert.match(html, /班次编制与替班交接台/);
assert.match(html, /班次编制登记/);
assert.match(html, /接班（冻结名单点位）/);
assert.match(html, /整班不成立/);
assert.match(html, /时段重叠/);
assert.match(html, /资格已过期/);
assert.match(html, /下班转入待办/);
assert.match(html, /防溢流报警器/);
assert.match(html, /当前没有同区域合格且空闲的替班人/);
assert.match(html, /历史版本/);
console.log("页面渲染冒烟通过：关键区块均已输出，HTML 长度", html.length);
