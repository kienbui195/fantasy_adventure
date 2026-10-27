import { nextFloat, nextInt, pick, type RngState } from './rng';
import { freeClasses, pendingActions, questionById, wrongOptions, type PendingAction } from './engine';
import type { Command, GameData, GameState, Question } from './types';

/**
 * Bot dùng RNG riêng, tách khỏi RNG của ván, để hành vi bot không làm lệch kết quả luật.
 * Bot chạy ở phía host nên được đọc trạng thái đầy đủ (để mô phỏng tỉ lệ trả lời đúng);
 * lệnh của bot đi cùng đường với lệnh của người chơi.
 */
function answer(r: RngState, q: Question, pCorrect: number): number {
  return nextFloat(r) < pCorrect ? q.answer : pick(r, wrongOptions(q));
}

export function botDecision(st: GameState, data: GameData, pa: PendingAction, r: RngState): { delayMs: number; cmd: Command } {
  const playerId = pa.playerId;
  switch (pa.kind) {
    case 'opening':
      return { delayMs: nextInt(r, 1500, 7000), cmd: { type: 'answer_opening', playerId, choice: answer(r, questionById(data, st.opening!.qid), 0.65) } };
    case 'class':
      return { delayMs: nextInt(r, 800, 2000), cmd: { type: 'pick_class', playerId, cls: pick(r, freeClasses(st)) } };
    case 'roll_start':
      return { delayMs: nextInt(r, 600, 1800), cmd: { type: 'roll_start', playerId } };
    case 'roll_stop':
      return { delayMs: nextInt(r, 700, 2000), cmd: { type: 'roll_stop', playerId } };
    case 'branch':
      return { delayMs: nextInt(r, 800, 2500), cmd: { type: 'choose_branch', playerId, cell: pick(r, st.turn!.branchOptions) } };
    case 'cell_question':
      return { delayMs: nextInt(r, 1500, 6000), cmd: { type: 'answer_cell', playerId, choice: answer(r, questionById(data, st.turn!.cellQuestion!.qid), 0.6) } };
    case 'quiz': {
      const qp = st.quiz!.perPlayer[playerId];
      return { delayMs: nextInt(r, 2000, 8000), cmd: { type: 'quiz_answer', playerId, choice: answer(r, questionById(data, qp.order[qp.idx]), 0.7) } };
    }
  }
}

/** Lập lịch lệnh cho các bot: mỗi việc đang chờ của bot có một kế hoạch (thời điểm, lệnh); kế hoạch cũ bị bỏ khi tình huống đổi. */
export class BotDriver {
  private plans = new Map<string, { at: number; cmd: Command }>();

  constructor(private rng: RngState) {}

  /** Trả về các lệnh bot đến hạn tại now. */
  due(st: GameState, data: GameData, now: number): Command[] {
    const bots = new Set(st.players.filter((p) => p.isBot).map((p) => p.id));
    const pending = pendingActions(st).filter((pa) => bots.has(pa.playerId));
    const live = new Set(pending.map((pa) => pa.key));
    for (const k of this.plans.keys()) if (!live.has(k)) this.plans.delete(k);
    for (const pa of pending) {
      if (!this.plans.has(pa.key)) {
        const d = botDecision(st, data, pa, this.rng);
        this.plans.set(pa.key, { at: now + d.delayMs, cmd: d.cmd });
      }
    }
    const out: Command[] = [];
    for (const [k, p] of this.plans) {
      if (p.at <= now) {
        out.push(p.cmd);
        this.plans.delete(k);
      }
    }
    return out;
  }

  nextAt(): number | null {
    let best: number | null = null;
    for (const p of this.plans.values()) if (best === null || p.at < best) best = p.at;
    return best;
  }
}
