import { chance, nextInt, pick, rngFromSeed, shuffle } from './rng';
import { hexDistance, neighbors, cellId, parseCell } from './hex';
import { resolveRules } from './config';
import {
  CLASS_IDS,
  ITEM_IDS,
  type ActiveQuestion,
  type CellType,
  type ClassId,
  type Command,
  type GameData,
  type GameEvent,
  type GameState,
  type MapCell,
  type Player,
  type Question,
  type QuizPlayer,
  type Result,
  type TurnStep,
} from './types';

/* ------------------------------------------------------------------ đồ thị bản đồ */

interface Graph {
  cells: Map<string, MapCell>;
  next: Map<string, string[]>;
  prev: Map<string, string[]>;
  graves: string[];
  start: string;
}

const graphCache = new WeakMap<GameData['map'], Graph>();

export function buildGraph(data: GameData): Graph {
  const hit = graphCache.get(data.map);
  if (hit) return hit;
  const cells = new Map<string, MapCell>();
  const next = new Map<string, string[]>();
  const prev = new Map<string, string[]>();
  for (const c of data.map.cells) {
    const id = cellId(c.q, c.r);
    cells.set(id, c);
    next.set(id, c.next.map(([q, r]) => cellId(q, r)));
  }
  for (const [id, ns] of next) {
    for (const n of ns) {
      if (!prev.has(n)) prev.set(n, []);
      prev.get(n)!.push(id);
    }
  }
  const graves = data.map.cells.filter((c) => c.type === 'nghiadia').map((c) => cellId(c.q, c.r));
  const startCell = data.map.cells.find((c) => c.type === 'xuatphat');
  if (!startCell) throw new Error('Bản đồ thiếu ô xuất phát');
  const g: Graph = { cells, next, prev, graves, start: cellId(startCell.q, startCell.r) };
  graphCache.set(data.map, g);
  return g;
}

/** Khoảng cách theo số bước đi (BFS theo chiều đường) từ một ô tới mọi ô tới được. */
function pathDistances(g: Graph, from: string): Map<string, number> {
  const dist = new Map<string, number>([[from, 0]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    for (const n of g.next.get(cur) ?? []) {
      if (!dist.has(n)) {
        dist.set(n, dist.get(cur)! + 1);
        queue.push(n);
      }
    }
  }
  return dist;
}

/* ------------------------------------------------------------------ ngữ cảnh xử lý */

interface Ctx {
  st: GameState;
  ev: GameEvent[];
  data: GameData;
  g: Graph;
  now: number;
}

const emit = (c: Ctx, type: string, extra: Record<string, unknown> = {}) => c.ev.push({ type, ...extra });
const player = (c: Ctx, id: string): Player => {
  const p = c.st.players.find((x) => x.id === id);
  if (!p) throw new Error('Không có người chơi ' + id);
  return p;
};
const questionIndex = new WeakMap<GameData['questions'], Map<string, Question>>();

/** Tra câu hỏi theo mã (bảng tra dựng một lần cho mỗi ngân hàng câu hỏi). */
export function questionById(data: GameData, qid: string): Question {
  let idx = questionIndex.get(data.questions);
  if (!idx) {
    idx = new Map(data.questions.questions.map((q) => [q.id, q]));
    questionIndex.set(data.questions, idx);
  }
  const q = idx.get(qid);
  if (!q) throw new Error('Không có câu hỏi ' + qid);
  return q;
}

export const wrongOptions = (q: Question): number[] => q.options.map((_, i) => i).filter((i) => i !== q.answer);

export const freeClasses = (st: GameState): ClassId[] => CLASS_IDS.filter((k) => !st.players.some((p) => p.cls === k));

function drawQuestionIds(c: Ctx, count: number): string[] {
  const all = c.data.questions.questions.map((q) => q.id);
  const used = new Set(c.st.usedQuestions);
  let pool = all.filter((id) => !used.has(id));
  if (pool.length < count) {
    c.st.usedQuestions = [];
    pool = all;
  }
  const chosen = shuffle(c.st.rng, pool).slice(0, count);
  c.st.usedQuestions.push(...chosen);
  return chosen;
}

/* ------------------------------------------------------------------ tạo ván */

export interface CreateOptions {
  seed: number;
  now: number;
  data: GameData;
  rules?: Record<string, unknown>;
  /** các ghế do người thật điều khiển; còn lại là bot */
  humanSeats?: number[];
}

export function createGame(opts: CreateOptions): GameState {
  const rules = resolveRules(opts.rules);
  const g = buildGraph(opts.data);
  const human = opts.humanSeats ?? [0];
  const players: Player[] = [];
  for (let seat = 0; seat < rules.start.players; seat++) {
    const isBot = !human.includes(seat);
    players.push({
      id: `p${seat}`,
      seat,
      name: isBot ? `Bot ${seat}` : 'Bạn',
      isBot,
      hp: rules.start.hp,
      keys: rules.start.keys,
      cups: 0,
      pos: g.start,
      cls: null,
      shield: 0,
      diceRolls: 0,
      items: {},
    });
  }
  const st: GameState = {
    rules,
    rng: rngFromSeed(opts.seed),
    phase: 'opening',
    now: opts.now,
    players,
    order: [],
    round: 0,
    turnIndex: 0,
    opening: null,
    classPick: null,
    turn: null,
    quiz: null,
    owners: {},
    drops: {},
    chest: { cell: null },
    winner: null,
    usedQuestions: [],
  };
  const c: Ctx = { st, ev: [], data: opts.data, g, now: opts.now };
  if (opts.data.questions.questions.length < rules.quiz.count + 1) throw new Error('Ngân hàng câu hỏi quá ít');
  const [qid] = drawQuestionIds(c, 1);
  st.opening = { qid, startedAt: opts.now, deadline: opts.now + rules.timing.openingMs, answers: {} };
  return st;
}

/* ------------------------------------------------------------------ API chính */

/** Chạy một bước trên bản sao trạng thái: xử lý thời hạn đã qua, rồi (nếu có) lệnh, rồi thời hạn lần nữa. */
function run(state: GameState, now: number, data: GameData, cmd?: Command): Result {
  const st = structuredClone(state);
  const c: Ctx = { st, ev: [], data, g: buildGraph(data), now };
  st.now = now;
  expire(c);
  const error = cmd ? (dispatch(c, cmd) ?? undefined) : undefined;
  if (cmd && !error) expire(c);
  return { state: st, events: c.ev, error };
}

export function applyCommand(state: GameState, cmd: Command, now: number, data: GameData): Result {
  return run(state, now, data, cmd);
}

/** Đồng hồ chạy: xử lý mọi thời hạn đã qua tại thời điểm now. Không có thời hạn nào qua thì trả lại nguyên trạng thái. */
export function advanceTime(state: GameState, now: number, data: GameData): Result {
  const due = nextDeadline(state);
  if (due === null || now < due) return { state, events: [] };
  return run(state, now, data);
}

const TURN_COMMANDS = new Set<Command['type']>(['roll_start', 'roll_stop', 'choose_branch', 'answer_cell', 'wizard_hint']);

function dispatch(c: Ctx, cmd: Command): string | null {
  const st = c.st;
  if (st.phase === 'game_over') return 'Ván đã kết thúc';
  if (TURN_COMMANDS.has(cmd.type)) {
    if (st.phase !== 'turn' || !st.turn) return 'Không phải lúc đi quân';
    if (st.turn.playerId !== cmd.playerId) return 'Chưa đến lượt';
  }
  const t = st.turn!;
  switch (cmd.type) {
    case 'answer_opening': {
      if (st.phase !== 'opening' || !st.opening) return 'Không phải lúc trả lời câu mở đầu';
      if (st.opening.answers[cmd.playerId]) return 'Đã trả lời rồi';
      if (!st.players.some((p) => p.id === cmd.playerId)) return 'Người chơi không tồn tại';
      st.opening.answers[cmd.playerId] = { choice: cmd.choice, at: c.now };
      if (st.players.every((p) => st.opening!.answers[p.id])) finishOpening(c);
      return null;
    }
    case 'pick_class': {
      if (st.phase !== 'class_pick' || !st.classPick) return 'Không phải lúc chọn class';
      if (st.order[st.classPick.index] !== cmd.playerId) return 'Chưa đến lượt chọn class';
      if (!CLASS_IDS.includes(cmd.cls)) return 'Class không hợp lệ';
      if (st.players.some((p) => p.cls === cmd.cls)) return 'Class đã có người chọn';
      assignClass(c, cmd.playerId, cmd.cls);
      return null;
    }
    case 'roll_start': {
      if (t.step !== 'await_roll_start') return 'Không thể bắt đầu đổ xúc xắc lúc này';
      t.step = 'rolling';
      emit(c, 'dice_rolling', { playerId: cmd.playerId });
      return null;
    }
    case 'roll_stop': {
      if (t.step !== 'rolling') return 'Chưa bắt đầu đổ xúc xắc';
      const n = rollDice(c, cmd.playerId);
      emit(c, 'dice_stopped', { playerId: cmd.playerId, value: n, purpose: 'move' });
      if (n === 0) {
        endTurn(c);
      } else {
        t.remaining = n;
        continueMove(c);
      }
      return null;
    }
    case 'choose_branch': {
      if (t.step !== 'await_branch') return 'Không có ngã ba để chọn';
      if (!t.branchOptions.includes(cmd.cell)) return 'Nhánh không hợp lệ';
      takeBranch(c, cmd.cell);
      return null;
    }
    case 'answer_cell': {
      if (t.step !== 'await_cell_question' || !t.cellQuestion) return 'Không có câu hỏi ở ô này';
      resolveCellQuestion(c, cmd.choice);
      return null;
    }
    case 'wizard_hint': {
      if (t.step !== 'await_cell_question' || !t.cellQuestion) return 'Chỉ dùng được ở câu hỏi trong ván';
      const p = player(c, cmd.playerId);
      if (p.cls !== 'phapsu') return 'Chỉ Pháp sư dùng được';
      if (t.cellQuestion.hidden.length > 0) return 'Đã dùng cho câu này';
      const cost = st.rules.classes.hintCost;
      if (p.keys < cost) return 'Không đủ chìa';
      const q = questionById(c.data, t.cellQuestion.qid);
      t.cellQuestion.hidden = shuffle(st.rng, wrongOptions(q)).slice(0, 2).sort();
      p.keys -= cost;
      emit(c, 'wizard_hint', { playerId: p.id, hidden: t.cellQuestion.hidden, cost });
      return null;
    }
    case 'quiz_answer': {
      if (st.phase !== 'quiz' || !st.quiz) return 'Không phải lúc đố';
      const qp = st.quiz.perPlayer[cmd.playerId];
      if (!qp) return 'Người chơi không tồn tại';
      if (qp.idx >= st.quiz.qids.length) return 'Đã trả lời hết';
      const qid = qp.order[qp.idx];
      const q = questionById(c.data, qid);
      const ms = c.now - qp.questionStartedAt;
      qp.results.push({ qid, choice: cmd.choice, correct: cmd.choice === q.answer, ms });
      qp.idx += 1;
      qp.questionStartedAt = c.now;
      if (allQuizDone(c)) finishQuiz(c);
      return null;
    }
  }
}

/* ------------------------------------------------------------------ thời hạn */

export function nextDeadline(state: GameState): number | null {
  switch (state.phase) {
    case 'opening':
    case 'class_pick':
    case 'turn': {
      const d = (state.opening ?? state.classPick ?? state.turn)?.deadline;
      return d === undefined ? null : d + 1;
    }
    case 'quiz': {
      if (!state.quiz) return null;
      let best: number | null = null;
      for (const qp of Object.values(state.quiz.perPlayer)) {
        if (qp.idx < state.quiz.qids.length) {
          const d = qp.questionStartedAt + state.quiz.deadlineMs + 1;
          if (best === null || d < best) best = d;
        }
      }
      return best;
    }
    default:
      return null;
  }
}

function expire(c: Ctx): void {
  const st = c.st;
  for (let guard = 0; guard < 200; guard++) {
    let changed = false;
    if (st.phase === 'opening' && st.opening && c.now > st.opening.deadline) {
      finishOpening(c);
      changed = true;
    } else if (st.phase === 'class_pick' && st.classPick && c.now > st.classPick.deadline) {
      assignClass(c, st.order[st.classPick.index], pick(st.rng, freeClasses(st)));
      changed = true;
    } else if (st.phase === 'turn' && st.turn && c.now > st.turn.deadline) {
      const t = st.turn;
      if (t.step === 'await_roll_start' || t.step === 'rolling') {
        emit(c, 'turn_lost', { playerId: t.playerId });
        endTurn(c);
      } else if (t.step === 'await_branch') {
        takeBranch(c, t.branchOptions[0]);
      } else if (t.step === 'await_cell_question') {
        resolveCellQuestion(c, -1);
      }
      changed = true;
    } else if (st.phase === 'quiz' && st.quiz) {
      const q = st.quiz;
      for (const qp of Object.values(q.perPlayer)) {
        while (qp.idx < q.qids.length && c.now > qp.questionStartedAt + q.deadlineMs) {
          qp.results.push({ qid: qp.order[qp.idx], choice: null, correct: false, ms: q.deadlineMs });
          qp.idx += 1;
          qp.questionStartedAt += q.deadlineMs;
          changed = true;
        }
      }
      if (changed && allQuizDone(c)) finishQuiz(c);
    }
    if (!changed) return;
  }
}

/* ------------------------------------------------------------------ mở đầu và chọn class */

function finishOpening(c: Ctx): void {
  const st = c.st;
  const op = st.opening!;
  const q = questionById(c.data, op.qid);
  const rows = st.players.map((p) => {
    const a = op.answers[p.id];
    const correct = !!a && a.choice === q.answer;
    return { id: p.id, seat: p.seat, correct, ms: a ? a.at - op.startedAt : Infinity };
  });
  rows.sort((a, b) => Number(b.correct) - Number(a.correct) || a.ms - b.ms || a.seat - b.seat);
  st.order = rows.map((r) => r.id);
  emit(c, 'opening_result', { order: st.order, correctIndex: q.answer });
  st.opening = null;
  st.phase = 'class_pick';
  st.classPick = { index: 0, deadline: c.now + st.rules.timing.classPickMs };
}

function assignClass(c: Ctx, playerId: string, cls: ClassId): void {
  const st = c.st;
  player(c, playerId).cls = cls;
  emit(c, 'class_picked', { playerId, cls });
  const cp = st.classPick!;
  cp.index += 1;
  cp.deadline = c.now + st.rules.timing.classPickMs;
  if (cp.index >= st.order.length) {
    st.classPick = null;
    st.round = 1;
    st.turnIndex = 0;
    spawnChest(c);
    startTurn(c);
  }
}

/* ------------------------------------------------------------------ lượt đi */

function startTurn(c: Ctx): void {
  const st = c.st;
  st.phase = 'turn';
  const playerId = st.order[st.turnIndex];
  st.turn = {
    playerId,
    startedAt: c.now,
    deadline: c.now + st.rules.timing.turnMs,
    step: 'await_roll_start',
    remaining: 0,
    branchOptions: [],
    monsterDice: null,
    cellQuestion: null,
    cellKind: null,
  };
  emit(c, 'turn_started', { playerId, round: st.round });
}

function endTurn(c: Ctx): void {
  const st = c.st;
  st.turn = null;
  st.turnIndex += 1;
  if (st.turnIndex >= st.order.length) startQuiz(c);
  else startTurn(c);
}

/** Rút số xúc xắc ở thời điểm dừng. Kết quả không phụ thuộc thời điểm bấm. Mỗi lần rút tính một lượt xúc xắc cho Hiệp sĩ. */
function rollDice(c: Ctx, playerId: string): number {
  const st = c.st;
  const n = nextInt(st.rng, st.rules.dice.min, st.rules.dice.max);
  const p = player(c, playerId);
  p.diceRolls += 1;
  if (p.cls === 'hiepsi' && p.diceRolls % st.rules.classes.shieldEvery === 0) {
    p.shield = 1;
    emit(c, 'shield_gained', { playerId });
  }
  return n;
}

function continueMove(c: Ctx): void {
  const st = c.st;
  const t = st.turn!;
  const p = player(c, t.playerId);
  while (t.remaining > 0) {
    const ns = c.g.next.get(p.pos) ?? [];
    if (ns.length > 1) {
      t.step = 'await_branch';
      t.branchOptions = ns;
      t.deadline = c.now + st.rules.timing.branchMs;
      emit(c, 'need_branch', { playerId: p.id, options: ns });
      return;
    }
    if (ns.length === 0) {
      t.remaining = 0;
      break;
    }
    p.pos = ns[0];
    t.remaining -= 1;
    if (t.remaining > 0 && tryOpenChest(c, p.id)) return;
  }
  emit(c, 'moved', { playerId: p.id, to: p.pos });
  resolveCell(c, p.id);
}

function takeBranch(c: Ctx, cell: string): void {
  const t = c.st.turn!;
  const p = player(c, t.playerId);
  p.pos = cell;
  t.remaining -= 1;
  t.branchOptions = [];
  t.step = 'rolling';
  if (t.remaining > 0 && tryOpenChest(c, p.id)) return;
  continueMove(c);
}

/* ------------------------------------------------------------------ xử lý ô */

function resolveCell(c: Ctx, pid: string): void {
  const st = c.st;
  const t = st.turn!;
  const p = player(c, pid);
  t.step = 'rolling';
  const cell = c.g.cells.get(p.pos)!;

  // 1. Nhặt chìa rơi trên ô (Q29 A): hết phần của người khác, giữ phần của mình.
  const here = st.drops[p.pos];
  if (here) {
    let got = 0;
    for (const [owner, n] of Object.entries(here)) {
      if (owner !== pid) {
        got += n;
        delete here[owner];
      }
    }
    if (got > 0) {
      p.keys += got;
      emit(c, 'keys_picked', { playerId: pid, amount: got, cell: p.pos });
    }
    if (Object.keys(here).length === 0) delete st.drops[p.pos];
  }

  // 2. Vùng chiếm
  const owner = st.owners[p.pos];
  if (cell.type === 'chiem' && !owner) {
    claimZone(c, pid);
  } else if (owner && owner !== pid) {
    const amount = nextInt(st.rng, st.rules.capture.taxMin, st.rules.capture.taxMax);
    const pay = Math.min(amount, p.keys);
    p.keys -= pay;
    player(c, owner).keys += pay;
    emit(c, 'tax_paid', { playerId: pid, owner, amount: pay });
  }

  // 3. Sự kiện cố định
  switch (cell.type as CellType) {
    case 'cauhoi':
      askCellQuestion(c, 'cauhoi');
      return;
    case 'quaivat': {
      t.monsterDice = rollDice(c, pid);
      emit(c, 'dice_stopped', { playerId: pid, value: t.monsterDice, purpose: 'monster' });
      askCellQuestion(c, 'quaivat');
      return;
    }
    case 'bay': {
      const v = rollDice(c, pid);
      emit(c, 'dice_stopped', { playerId: pid, value: v, purpose: 'trap' });
      if (v >= st.rules.trap.successMin) {
        emit(c, 'trap_disarmed', { playerId: pid });
        thiefBonus(c, pid);
      } else {
        emit(c, 'trap_failed', { playerId: pid });
        damage(c, pid, st.rules.trap.hpLoss);
      }
      break;
    }
    case 'hoimau': {
      const before = p.hp;
      p.hp = Math.min(st.rules.start.maxHp, p.hp + st.rules.heal.amount);
      emit(c, 'healed', { playerId: pid, amount: p.hp - before });
      break;
    }
    case 'cohoi':
      drawCard(c, pid);
      break;
    default:
      break;
  }
  afterCell(c, pid);
}

function afterCell(c: Ctx, pid: string): void {
  if (tryOpenChest(c, pid)) return;
  endTurn(c);
}

/**
 * Mở rương khi quân đang ở ô rương (dừng hoặc đi qua, Q31 A) và có đủ chìa: trừ chìa, +1 cúp, rương chờ round sau.
 * Trả về true khi người này vừa đủ cúp thắng: ván kết thúc ngay, không đi tiếp.
 */
function tryOpenChest(c: Ctx, pid: string): boolean {
  const st = c.st;
  const p = player(c, pid);
  if (!st.chest.cell || p.pos !== st.chest.cell || p.keys < st.rules.chest.keysCost) return false;
  p.keys -= st.rules.chest.keysCost;
  p.cups += 1;
  st.chest.cell = null;
  emit(c, 'chest_opened', { playerId: pid, cups: p.cups });
  if (p.cups < st.rules.chest.cupsToWin) return false;
  st.winner = pid;
  st.phase = 'game_over';
  st.turn = null;
  emit(c, 'game_over', { winner: pid });
  return true;
}

function claimZone(c: Ctx, pid: string): void {
  const st = c.st;
  const center = parseCell(player(c, pid).pos);
  const zone = st.rules.capture.radius >= 1 ? [center, ...neighbors(center)] : [center];
  const claimed: string[] = [];
  for (const z of zone) {
    const id = cellId(z.q, z.r);
    if (c.g.cells.has(id) && !st.owners[id]) {
      st.owners[id] = pid;
      claimed.push(id);
    }
  }
  emit(c, 'zone_claimed', { playerId: pid, cells: claimed });
}

function dropKeys(c: Ctx, pid: string, amount: number): void {
  const p = player(c, pid);
  const n = Math.min(amount, p.keys);
  if (n <= 0) return;
  p.keys -= n;
  const here = (c.st.drops[p.pos] ??= {});
  here[pid] = (here[pid] ?? 0) + n;
  emit(c, 'keys_dropped', { playerId: pid, amount: n, cell: p.pos });
}

/** Bị thương: trừ máu (Hiệp sĩ có chắn thì chặn máu), rơi 4 đến 6 chìa; máu về 0 thì chết (BR15, BR16). */
function damage(c: Ctx, pid: string, hpLoss: number): void {
  const st = c.st;
  const p = player(c, pid);
  if (p.shield > 0) {
    p.shield -= 1;
    emit(c, 'shield_blocked', { playerId: pid, blocked: hpLoss });
  } else {
    p.hp -= hpLoss;
    emit(c, 'damaged', { playerId: pid, amount: hpLoss });
  }
  if (p.hp <= 0) {
    die(c, pid);
  } else {
    dropKeys(c, pid, nextInt(st.rng, st.rules.keysDrop.min, st.rules.keysDrop.max));
  }
}

function die(c: Ctx, pid: string): void {
  const st = c.st;
  const p = player(c, pid);
  const half = Math.floor(p.keys * st.rules.death.dropFraction);
  dropKeys(c, pid, half);
  const here = parseCell(p.pos);
  let best = c.g.graves[0];
  let bestD = -1;
  for (const gv of c.g.graves) {
    const d = hexDistance(here, parseCell(gv));
    if (d > bestD) {
      bestD = d;
      best = gv;
    }
  }
  p.pos = best;
  p.hp = st.rules.start.maxHp;
  emit(c, 'died', { playerId: pid, respawn: best });
}

function thiefBonus(c: Ctx, pid: string): void {
  const p = player(c, pid);
  if (p.cls === 'daochich' && chance(c.st.rng, c.st.rules.classes.thiefChance)) {
    p.keys += 1;
    emit(c, 'thief_bonus', { playerId: pid });
  }
}

function giveItem(c: Ctx, pid: string): void {
  const p = player(c, pid);
  const item = pick(c.st.rng, ITEM_IDS);
  p.items[item] = (p.items[item] ?? 0) + 1;
  emit(c, 'item_gained', { playerId: pid, item });
}

function drawCard(c: Ctx, pid: string): void {
  const st = c.st;
  const p = player(c, pid);
  const card = pick(st.rng, st.rules.cards.list);
  emit(c, 'card', { playerId: pid, text: card.text });
  if (card.kind === 'keys') {
    if (card.value >= 0) p.keys += card.value;
    else p.keys -= Math.min(p.keys, -card.value);
  } else if (card.kind === 'hp') {
    if (card.value >= 0) p.hp = Math.min(st.rules.start.maxHp, p.hp + card.value);
    else {
      p.hp += card.value;
      if (p.hp <= 0) die(c, pid);
    }
  } else if (card.kind === 'move') {
    for (let i = 0; i < Math.abs(card.value); i++) {
      const ns = card.value > 0 ? c.g.next.get(p.pos) : c.g.prev.get(p.pos);
      if (ns && ns.length > 0) p.pos = ns[0];
    }
    emit(c, 'moved', { playerId: pid, to: p.pos });
  }
}

/* ------------------------------------------------------------------ câu hỏi ở ô */

function askCellQuestion(c: Ctx, kind: 'cauhoi' | 'quaivat'): void {
  const st = c.st;
  const t = st.turn!;
  const [qid] = drawQuestionIds(c, 1);
  const aq: ActiveQuestion = {
    qid,
    deadline: c.now + st.rules.timing.cellQuestionMs,
    hidden: [],
  };
  t.cellQuestion = aq;
  t.cellKind = kind;
  t.step = 'await_cell_question';
  t.deadline = aq.deadline;
  emit(c, 'cell_question', { playerId: t.playerId, kind });
}

function resolveCellQuestion(c: Ctx, choice: number): void {
  const st = c.st;
  const t = st.turn!;
  const pid = t.playerId;
  const q = questionById(c.data, t.cellQuestion!.qid);
  const correct = choice === q.answer;
  emit(c, 'cell_question_result', { playerId: pid, correct, correctIndex: q.answer });
  if (t.cellKind === 'cauhoi') {
    if (correct) {
      if (chance(st.rng, st.rules.cellQuestion.keysChance)) {
        player(c, pid).keys += st.rules.cellQuestion.keys;
        emit(c, 'keys_gained', { playerId: pid, amount: st.rules.cellQuestion.keys });
      } else {
        giveItem(c, pid);
      }
    }
  } else {
    const diceOk = (t.monsterDice ?? 0) >= st.rules.monster.diceMin;
    if (correct && diceOk) {
      emit(c, 'monster_defeated', { playerId: pid });
    } else {
      emit(c, 'monster_won', { playerId: pid, diceOk, correct });
      damage(c, pid, st.rules.monster.hpLoss);
    }
  }
  t.cellQuestion = null;
  t.cellKind = null;
  t.monsterDice = null;
  afterCell(c, pid);
}

/* ------------------------------------------------------------------ rương */

function spawnChest(c: Ctx): void {
  const st = c.st;
  const dists = st.players.map((p) => pathDistances(c.g, p.pos));
  const rows: { id: string; min: number; max: number }[] = [];
  for (const id of c.g.cells.keys()) {
    const type = c.g.cells.get(id)!.type;
    if (type === 'nghiadia' || type === 'xuatphat') continue;
    const ds = dists.map((d) => d.get(id));
    if (ds.some((d) => d === undefined || d === 0)) continue;
    const nums = ds as number[];
    rows.push({ id, min: Math.min(...nums), max: Math.max(...nums) });
  }
  for (let spread = st.rules.chest.spreadMax; spread < 200; spread++) {
    const ok = rows.filter((r) => r.max - r.min <= spread);
    if (ok.length === 0) continue;
    const bestMin = Math.max(...ok.map((r) => r.min));
    const top = ok.filter((r) => r.min === bestMin);
    st.chest.cell = pick(st.rng, top).id;
    emit(c, 'chest_spawned', { cell: st.chest.cell });
    return;
  }
}

/* ------------------------------------------------------------------ đố 10 câu cuối round */

function startQuiz(c: Ctx): void {
  const st = c.st;
  const qids = drawQuestionIds(c, st.rules.quiz.count);
  const perPlayer: Record<string, QuizPlayer> = {};
  for (const p of st.players) {
    perPlayer[p.id] = { order: shuffle(st.rng, qids), idx: 0, questionStartedAt: c.now, results: [] };
  }
  st.phase = 'quiz';
  st.quiz = { qids, perPlayer, deadlineMs: st.rules.timing.quizQuestionMs };
  emit(c, 'quiz_started', { round: st.round });
}

function allQuizDone(c: Ctx): boolean {
  const q = c.st.quiz!;
  return Object.values(q.perPlayer).every((qp) => qp.idx >= q.qids.length);
}

function finishQuiz(c: Ctx): void {
  const st = c.st;
  const q = st.quiz!;
  const rows = st.players.map((p) => {
    const res = q.perPlayer[p.id].results;
    return {
      id: p.id,
      seat: p.seat,
      correct: res.filter((r) => r.correct).length,
      total: res.reduce((s, r) => s + r.ms, 0),
    };
  });
  rows.sort((a, b) => b.correct - a.correct || a.total - b.total || a.seat - b.seat);
  const ranks: Record<string, number> = {};
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    ranks[r.id] = prev && prev.correct === r.correct && prev.total === r.total ? ranks[prev.id] : i + 1;
  });
  for (const r of rows) {
    const rank = ranks[r.id];
    const keys = st.rules.quiz.keys[rank - 1] ?? 0;
    const p = player(c, r.id);
    p.keys += keys;
    if (rank <= st.rules.quiz.itemTopRanks) giveItem(c, r.id);
    thiefBonus(c, r.id);
  }
  emit(c, 'quiz_result', { ranks, rows });
  st.quiz = null;
  st.round += 1;
  st.turnIndex = 0;
  if (!st.chest.cell) spawnChest(c);
  startTurn(c);
}

/* ------------------------------------------------------------------ việc đang chờ */

export interface PendingAction {
  playerId: string;
  kind: 'opening' | 'class' | 'roll_start' | 'roll_stop' | 'branch' | 'cell_question' | 'quiz';
  /** đổi khi tình huống đổi, để bot biết kế hoạch cũ đã hết hiệu lực */
  key: string;
}

const STEP_KIND: Record<TurnStep, PendingAction['kind']> = {
  await_roll_start: 'roll_start',
  rolling: 'roll_stop',
  await_branch: 'branch',
  await_cell_question: 'cell_question',
};

export function pendingActions(st: GameState): PendingAction[] {
  switch (st.phase) {
    case 'opening':
      return st.opening
        ? st.players
            .filter((p) => !st.opening!.answers[p.id])
            .map((p) => ({ playerId: p.id, kind: 'opening' as const, key: `opening:${p.id}` }))
        : [];
    case 'class_pick': {
      if (!st.classPick) return [];
      const playerId = st.order[st.classPick.index];
      return [{ playerId, kind: 'class', key: `class:${st.classPick.index}` }];
    }
    case 'turn': {
      const t = st.turn;
      if (!t) return [];
      const base = `${st.round}:${st.turnIndex}:${t.step}:${t.remaining}:${t.cellQuestion?.qid ?? ''}`;
      return [{ playerId: t.playerId, kind: STEP_KIND[t.step], key: `turn:${base}` }];
    }
    case 'quiz': {
      const quiz = st.quiz;
      if (!quiz) return [];
      return Object.entries(quiz.perPlayer)
        .filter(([, qp]) => qp.idx < quiz.qids.length)
        .map(([playerId, qp]) => ({ playerId, kind: 'quiz' as const, key: `quiz:${st.round}:${playerId}:${qp.idx}` }));
    }
    default:
      return [];
  }
}

/* ------------------------------------------------------------------ góc nhìn công khai */

export interface ViewQuestion {
  qid: string;
  kind: 'opening' | 'cauhoi' | 'quaivat' | 'quiz';
  question: string;
  options: string[];
  hidden: number[];
  deadline: number;
  index?: number;
  total?: number;
}

/**
 * Trạng thái để giao diện hiển thị, liệt kê tường minh (allowlist): không có seed, không có đáp án đúng,
 * không có câu trả lời và thứ tự câu đố của người khác. Luật chơi gửi đủ vì không có gì bí mật.
 */
export function publicView(st: GameState, data: GameData, viewerId: string) {
  const q = (id: string) => questionById(data, id);
  let active: ViewQuestion | null = null;
  if (st.phase === 'opening' && st.opening && !st.opening.answers[viewerId]) {
    const qq = q(st.opening.qid);
    active = { qid: qq.id, kind: 'opening', question: qq.question, options: qq.options, hidden: [], deadline: st.opening.deadline };
  } else if (st.phase === 'turn' && st.turn?.cellQuestion && st.turn.playerId === viewerId) {
    const aq = st.turn.cellQuestion;
    const qq = q(aq.qid);
    active = { qid: qq.id, kind: st.turn.cellKind!, question: qq.question, options: qq.options, hidden: aq.hidden, deadline: aq.deadline };
  } else if (st.phase === 'quiz' && st.quiz) {
    const qp = st.quiz.perPlayer[viewerId];
    if (qp && qp.idx < st.quiz.qids.length) {
      const qq = q(qp.order[qp.idx]);
      active = {
        qid: qq.id,
        kind: 'quiz',
        question: qq.question,
        options: qq.options,
        hidden: [],
        deadline: qp.questionStartedAt + st.quiz.deadlineMs,
        index: qp.idx,
        total: st.quiz.qids.length,
      };
    }
  }
  const t = st.turn;
  return {
    rules: st.rules,
    phase: st.phase,
    players: st.players,
    order: st.order,
    round: st.round,
    classPick: st.classPick,
    turn: t && { playerId: t.playerId, step: t.step, deadline: t.deadline, branchOptions: t.branchOptions },
    owners: st.owners,
    drops: st.drops,
    chest: st.chest,
    winner: st.winner,
    activeQuestion: active,
  };
}

export type PublicView = ReturnType<typeof publicView>;
