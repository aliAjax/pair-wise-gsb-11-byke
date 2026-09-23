// React 与存储之间的唯一接缝：useSyncExternalStore 订阅无依赖存储层。
import { useSyncExternalStore } from "react";
import { store } from "../data/storage";
import { AppState } from "../domain/types";

export function useAppState(): AppState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
