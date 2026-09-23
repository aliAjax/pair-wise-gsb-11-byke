// 纯时间工具：日期键、时刻拼接、区间重叠、资格有效期判定。
// 不依赖 React / 存储，可被判定层与数据层共用。

/** 今天的日期键 YYYY-MM-DD（本地时区） */
export function todayKey(date: Date = new Date()): string {
  return toDayKey(date);
}

export function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function shiftDayKey(offsetDays = 0, base: Date = new Date()): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + offsetDays);
  return toDayKey(d);
}

/** 资格到期日（YYYY-MM-DD）相对今天的偏移天数；负数表示已过期 */
export function daysUntil(dayKey: string, base: Date = new Date()): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const baseDay = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  return Math.round((target.getTime() - baseDay.getTime()) / 86400000);
}

/** 资格在指定日期是否有效（到期当天仍有效） */
export function isValidOn(expiresAt: string, dayKey: string): boolean {
  return daysUntil(expiresAt, new Date(`${dayKey}T00:00:00`)) >= 0;
}

/** 班次生效的时刻戳（毫秒），跨日按自然区间比较 */
export function shiftTimestamp(date: string, time: string): number {
  const [h, m] = time.split(":").map(Number);
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(y, mo - 1, d, h, m).getTime();
}

export interface Interval {
  start: number;
  end: number;
}

/** 半开区间是否重叠；区间相等或相切均判定为冲突 */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function shiftInterval(shift: { date: string; start: string; end: string }): Interval {
  return {
    start: shiftTimestamp(shift.date, shift.start),
    end: shiftTimestamp(shift.date, shift.end)
  };
}

export function formatStamp(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
