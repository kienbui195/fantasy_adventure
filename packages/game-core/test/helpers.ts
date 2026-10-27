import {
  applyCommand,
  advanceTime,
  buildGraph,
  createGame,
  DEFAULT_DATA,
  type ClassId,
  type Command,
  type GameData,
  type GameState,
  type Result,
} from '../src';

export const data: GameData = DEFAULT_DATA;
export const graph = buildGraph(data);

/** Gửi lệnh và bắt buộc thành công. */
export function ok(st: GameState, cmd: Command, now: number): Result {
  const r = applyCommand(st, cmd, now, data);
  if (r.error) throw new Error(`Lệnh ${cmd.type} bị từ chối: ${r.error}`);
  return r;
}

export const tick = (st: GameState, now: number) => advanceTime(st, now, data);

export const answerOf = (qid: string) => data.questions.questions.find((q) => q.id === qid)!.answer;

/**
 * Đưa ván tới lượt đầu tiên với 4 người thật (không bot). Thứ tự lượt là p0, p1, p2, p3
 * (mọi người trả lời đúng, p0 nhanh nhất). Class gán theo danh sách classes.
 */
export function toTurn(
  rules: Record<string, unknown> = {},
  classes: ClassId[] = ['hiepsi', 'phapsu', 'daochich', 'thaytu'],
  seed = 7,
): GameState {
  let st = createGame({ seed, now: 0, data, humanSeats: [0, 1, 2, 3], rules });
  const a = answerOf(st.opening!.qid);
  for (let i = 0; i < 4; i++) st = ok(st, { type: 'answer_opening', playerId: `p${i}`, choice: a }, 1000 + i).state;
  for (let i = 0; i < 4; i++) st = ok(st, { type: 'pick_class', playerId: st.order[i], cls: classes[i] }, 2000 + i).state;
  return st;
}

/** Ô đứng trước target đúng n bước theo một đường không có ngã ba. */
export function cellStepsBefore(target: string, n: number): string {
  let cur = target;
  for (let i = 0; i < n; i++) {
    const prevs = (graph.prev.get(cur) ?? []).filter((p) => (graph.next.get(p) ?? []).length === 1);
    if (prevs.length === 0) throw new Error('Không lùi được từ ' + cur);
    cur = prevs[0];
  }
  // kiểm tra đi tới n bước không gặp ngã ba và tới đúng target
  let f = cur;
  for (let i = 0; i < n; i++) {
    const ns = graph.next.get(f)!;
    if (ns.length !== 1) throw new Error('Đường có ngã ba');
    f = ns[0];
  }
  if (f !== target) throw new Error('Không tới đúng ô');
  return cur;
}

export const cellsOfType = (type: string) =>
  [...graph.cells.entries()].filter(([, c]) => c.type === type).map(([id]) => id);

/** Tìm một ô loại type đứng sau n ô thẳng (không ngã ba). */
export function targetOfType(type: string, n: number): { target: string; from: string } {
  for (const t of cellsOfType(type)) {
    try {
      return { target: t, from: cellStepsBefore(t, n) };
    } catch {
      /* thử ô khác */
    }
  }
  throw new Error(`Không có ô ${type} cách ${n} bước thẳng`);
}

/** Đặt người đang tới lượt ở ô from, rồi đổ xúc xắc (giá trị cố định nhờ rules.dice). */
export function rollFrom(st: GameState, from: string, now = 10000): Result {
  const pid = st.turn!.playerId;
  st.players.find((p) => p.id === pid)!.pos = from;
  st = ok(st, { type: 'roll_start', playerId: pid }, now).state;
  return ok(st, { type: 'roll_stop', playerId: pid }, now + 500);
}

export const P = (st: GameState, id: string) => st.players.find((p) => p.id === id)!;
export const dice = (n: number) => ({ dice: { min: n, max: n } });
