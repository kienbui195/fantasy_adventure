/** Bộ rút số ngẫu nhiên có seed (mulberry32). Trạng thái là một số nguyên nên lưu được cùng trạng thái ván. */
export interface RngState {
  s: number;
}

export function rngFromSeed(seed: number): RngState {
  return { s: seed >>> 0 };
}

/** Rút một số thực trong [0, 1) và đẩy trạng thái tới bước kế. */
export function nextFloat(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Rút số nguyên trong [min, max], gồm cả hai đầu. */
export function nextInt(r: RngState, min: number, max: number): number {
  return min + Math.floor(nextFloat(r) * (max - min + 1));
}

export function chance(r: RngState, p: number): boolean {
  return nextFloat(r) < p;
}

export function pick<T>(r: RngState, list: readonly T[]): T {
  return list[nextInt(r, 0, list.length - 1)];
}

/** Xáo trộn Fisher-Yates, trả về mảng mới. */
export function shuffle<T>(r: RngState, list: readonly T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = nextInt(r, 0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
