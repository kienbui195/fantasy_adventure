import {
  advanceTime,
  applyCommand,
  BotDriver,
  createGame,
  publicView,
  rngFromSeed,
  type Command,
  type GameData,
  type GameEvent,
  type GameState,
  type PublicView,
} from '@fa/game-core';

export interface HostSnapshot {
  view: PublicView;
  events: GameEvent[];
  error: string | null;
}

/**
 * Host chạy trong trình duyệt ở prototype: giữ đồng hồ, seed và trạng thái đầy đủ trong trường riêng (#),
 * nhận lệnh của người chơi và bot, gọi game-core, phát góc nhìn công khai cho giao diện.
 * Khi online, NestJS thay lớp này; game-core giữ nguyên.
 */
export class Host {
  #state: GameState;
  #data: GameData;
  #driver: BotDriver;
  #listeners = new Set<(s: HostSnapshot) => void>();
  #timer: ReturnType<typeof setInterval> | null = null;
  #events: GameEvent[] = [];
  #error: string | null = null;
  readonly viewerId = 'p0';

  constructor(data: GameData) {
    this.#data = data;
    const [seed, botSeed] = crypto.getRandomValues(new Uint32Array(2));
    this.#state = createGame({ seed, now: Date.now(), data });
    this.#driver = new BotDriver(rngFromSeed(botSeed));
  }

  start() {
    this.#timer ??= setInterval(() => this.#pump(), 100);
    this.#emit();
  }

  stop() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  subscribe(fn: (s: HostSnapshot) => void) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  send(cmd: Command) {
    const r = applyCommand(this.#state, cmd, Date.now(), this.#data);
    this.#state = r.state;
    this.#push(r.events);
    this.#error = r.error ?? null;
    this.#emit();
  }

  /** Mỗi 100 ms: xử lý thời hạn và lệnh bot đến hạn; chỉ phát snapshot mới khi trạng thái đổi. */
  #pump() {
    const now = Date.now();
    const before = this.#state;
    const t = advanceTime(this.#state, now, this.#data);
    this.#state = t.state;
    this.#push(t.events);
    for (const cmd of this.#driver.due(this.#state, this.#data, now)) {
      const r = applyCommand(this.#state, cmd, now, this.#data);
      this.#state = r.state;
      this.#push(r.events);
    }
    if (this.#state !== before) this.#emit();
    if (this.#state.phase === 'game_over') this.stop();
  }

  #push(evs: GameEvent[]) {
    if (evs.length) this.#events = [...this.#events, ...evs].slice(-200);
  }

  #emit() {
    const snap: HostSnapshot = {
      view: publicView(this.#state, this.#data, this.viewerId),
      events: this.#events,
      error: this.#error,
    };
    for (const fn of this.#listeners) fn(snap);
  }
}
