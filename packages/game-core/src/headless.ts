import { BotDriver } from './bot';
import { advanceTime, applyCommand, createGame, nextDeadline } from './engine';
import { rngFromSeed } from './rng';
import type { GameData, GameState } from './types';

/** Chạy một ván toàn bot với đồng hồ ảo (không cần trình duyệt). Dùng để kiểm thử và cân bằng. */
export function runHeadless(seed: number, data: GameData, opts: { maxSteps?: number; rules?: Record<string, unknown> } = {}) {
  const driver = new BotDriver(rngFromSeed(seed ^ 0x9e3779b9));
  let now = 0;
  let st: GameState = createGame({ seed, now, data, humanSeats: [], rules: opts.rules });
  const maxSteps = opts.maxSteps ?? 200000;
  let steps = 0;
  let errors = 0;
  while (st.phase !== 'game_over' && steps < maxSteps) {
    steps++;
    const cmds = driver.due(st, data, now);
    if (cmds.length > 0) {
      for (const cmd of cmds) {
        const r = applyCommand(st, cmd, now, data);
        if (r.error) errors++;
        st = r.state;
      }
      continue;
    }
    const candidates = [driver.nextAt(), nextDeadline(st)].filter((x): x is number => x !== null);
    if (candidates.length === 0) break;
    now = Math.max(now, Math.min(...candidates));
    st = advanceTime(st, now, data).state;
  }
  return { state: st, steps, errors, elapsedMs: now };
}
