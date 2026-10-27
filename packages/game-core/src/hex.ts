/** Toạ độ ô lục giác dạng axial (q, r), đỉnh nhọn lên. */
export interface Axial {
  q: number;
  r: number;
}

export const cellId = (q: number, r: number): string => `${q},${r}`;

export const parseCell = (id: string): Axial => {
  const [q, r] = id.split(',').map(Number);
  return { q, r };
};

export const HEX_DIRS: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

/** Khoảng cách theo số ô trên lưới lục giác. */
export function hexDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

export function neighbors(a: Axial): Axial[] {
  return HEX_DIRS.map((d) => ({ q: a.q + d.q, r: a.r + d.r }));
}

/** Đổi sang toạ độ màn hình (đơn vị size = bán kính ô). */
export function axialToPixel(a: Axial, size: number): { x: number; y: number } {
  return { x: size * Math.sqrt(3) * (a.q + a.r / 2), y: size * 1.5 * a.r };
}
