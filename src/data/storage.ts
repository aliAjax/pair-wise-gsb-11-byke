// 存储层：localStorage 持久化 + 极简发布订阅。
// 不引入任何第三方依赖；该文件不包含业务判定，只负责读写与状态广播。

import { AppState } from "../domain/types";
import { buildSeedState } from "./catalog";

const STORAGE_KEY = "dfwlfront-10-shift-desk:v1";

function cloneSeed(): AppState {
  return JSON.parse(JSON.stringify(buildSeedState())) as AppState;
}

function loadInitial(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneSeed();
    const parsed = JSON.parse(raw) as AppState;
    if (!Array.isArray(parsed.shifts) || !Array.isArray(parsed.todos) || !Array.isArray(parsed.versions)) {
      return cloneSeed();
    }
    return parsed;
  } catch {
    return cloneSeed();
  }
}

let state: AppState = loadInitial();
const listeners = new Set<() => void>();

function persist(next: AppState) {
  state = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时仍保留内存态，页面功能不中断
  }
  listeners.forEach((listener) => listener());
}

export const store = {
  getState(): AppState {
    return state;
  },
  /** 以整棵新状态替换并落盘，保证班次、交接、待办、版本一次写入保持一致 */
  setState(next: AppState) {
    persist(next);
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  reset() {
    persist(cloneSeed());
  }
};

export function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
