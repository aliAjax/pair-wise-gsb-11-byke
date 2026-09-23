// 资料层：区域、人员资格、必到点等静态资料。
// 判定层只读这些资料，不反向修改。

import { Person, Point } from "../domain/types";

export const AREAS = ["加油区", "油罐区", "收银区"] as const;

export const POINTS: Point[] = [
  { id: "pt-fuel-1", name: "1号加油机", area: "加油区" },
  { id: "pt-fuel-2", name: "2号加油机", area: "加油区" },
  { id: "pt-fuel-fire", name: "加油岛灭火器", area: "加油区" },
  { id: "pt-tank-seal", name: "卸油口密封", area: "油罐区" },
  { id: "pt-tank-gauge", name: "液位仪读数", area: "油罐区" },
  { id: "pt-tank-valve", name: "紧急切断阀", area: "油罐区" },
  { id: "pt-cash-pos", name: "收银台POS机", area: "收银区" },
  { id: "pt-cash-cam", name: "监控录像主机", area: "收银区" },
  { id: "pt-cash-safe", name: "保险柜与投币记录", area: "收银区" },
];

export const PEOPLE: Person[] = [
  {
    id: "p-he",
    name: "何鑫",
    qualifications: [
      { area: "加油区", title: "加油作业证", expiresAt: "2027-03-31" },
      { area: "油罐区", title: "卸油作业证", expiresAt: "2026-12-15" },
    ],
  },
  {
    id: "p-wang",
    name: "王芳",
    qualifications: [
      { area: "加油区", title: "加油作业证", expiresAt: "2027-06-30" },
      { area: "收银区", title: "收银上岗证", expiresAt: "2027-01-20" },
    ],
  },
  {
    id: "p-li",
    name: "李强",
    qualifications: [
      { area: "油罐区", title: "卸油作业证", expiresAt: "2027-05-10" },
      { area: "加油区", title: "加油作业证", expiresAt: "2026-10-08" },
    ],
  },
  {
    id: "p-zhao",
    name: "赵敏",
    qualifications: [{ area: "收银区", title: "收银上岗证", expiresAt: "2026-04-30" }],
  },
  {
    id: "p-chen",
    name: "陈静",
    qualifications: [
      { area: "收银区", title: "收银上岗证", expiresAt: "2028-02-28" },
      { area: "加油区", title: "加油作业证", expiresAt: "2027-09-15" },
    ],
  },
  {
    id: "p-zhou",
    name: "周磊",
    qualifications: [{ area: "油罐区", title: "卸油作业证", expiresAt: "2026-08-31" }],
  },
];

export function pointsOfArea(area: string): Point[] {
  return POINTS.filter((p) => p.area === area);
}

export function personName(id: string): string {
  return PEOPLE.find((p) => p.id === id)?.name ?? "未知人员";
}

export function pointName(id: string): string {
  return POINTS.find((p) => p.id === id)?.name ?? "已删除点位";
}
