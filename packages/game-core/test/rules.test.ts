import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyCommand,
  createGame,
  DEFAULT_GAME_RULES,
  fillMissing,
  hexDistance,
  parseCell,
  publicView,
  resolveRules,
  runHeadless,
  type GameState,
} from '../src';
import { answerOf, cellStepsBefore, cellsOfType, data, dice, graph, ok, P, rollFrom, targetOfType, tick, toTurn } from './helpers';

const wrongOf = (qid: string) => (answerOf(qid) + 1) % 4;

describe('US-01 mở đầu ván', () => {
  it('AC-01.1 tạo ván đủ 4 người, 30 máu, 10 chìa, câu hỏi có 4 đáp án', () => {
    const st = createGame({ seed: 1, now: 0, data });
    expect(st.players).toHaveLength(4);
    expect(st.players.every((p) => p.hp === 30 && p.keys === 10)).toBe(true);
    expect(st.players.filter((p) => p.isBot)).toHaveLength(3);
    const v = publicView(st, data, 'p0');
    expect(v.activeQuestion?.options).toHaveLength(4);
  });

  it('AC-01.2 BR4 đúng trước sai, nhanh trước chậm, bằng nhau theo ghế; giữ nguyên qua các round', () => {
    let st = createGame({ seed: 2, now: 0, data, humanSeats: [0, 1, 2, 3] });
    const a = answerOf(st.opening!.qid);
    st = ok(st, { type: 'answer_opening', playerId: 'p2', choice: (a + 1) % 4 }, 2000).state;
    st = ok(st, { type: 'answer_opening', playerId: 'p0', choice: a }, 3000).state;
    st = ok(st, { type: 'answer_opening', playerId: 'p3', choice: a }, 5000).state;
    st = ok(st, { type: 'answer_opening', playerId: 'p1', choice: a }, 5000).state;
    expect(st.order).toEqual(['p0', 'p1', 'p3', 'p2']);
    // 3 round trôi qua bằng thời hạn: thứ tự không đổi
    let now = 6000;
    for (let i = 0; i < 400 && st.round < 4; i++) {
      now += 16000;
      st = tick(st, now).state;
    }
    expect(st.round).toBeGreaterThanOrEqual(4);
    expect(st.order).toEqual(['p0', 'p1', 'p3', 'p2']);
  });

  it('AC-01.3 không trả lời trước hạn thì tính sai', () => {
    let st = createGame({ seed: 3, now: 0, data, humanSeats: [0, 1, 2, 3] });
    const a = answerOf(st.opening!.qid);
    for (const id of ['p1', 'p2', 'p3']) st = ok(st, { type: 'answer_opening', playerId: id, choice: a }, 4000).state;
    st = tick(st, 15001).state;
    expect(st.phase).toBe('class_pick');
    expect(st.order[3]).toBe('p0');
  });

  it('AC-01.4 ngân hàng câu hỏi rỗng thì không tạo ván', () => {
    expect(() => createGame({ seed: 1, now: 0, data: { map: data.map, questions: { questions: [] } } })).toThrow();
  });
});

describe('US-02 chọn class', () => {
  it('AC-02.1 mỗi người một class, không trùng; trước khi chọn chưa có khả năng', () => {
    let st = createGame({ seed: 4, now: 0, data, humanSeats: [0, 1, 2, 3] });
    for (let i = 0; i < 4; i++) st = ok(st, { type: 'answer_opening', playerId: `p${i}`, choice: 0 }, 100 + i).state;
    expect(st.players.every((p) => p.cls === null)).toBe(true);
    const classes = ['thaytu', 'hiepsi', 'daochich', 'phapsu'] as const;
    for (let i = 0; i < 4; i++) st = ok(st, { type: 'pick_class', playerId: st.order[i], cls: classes[i] }, 200 + i).state;
    expect(new Set(st.players.map((p) => p.cls)).size).toBe(4);
    expect(st.phase).toBe('turn');
  });

  it('AC-02.2 chọn class đã bị lấy thì bị từ chối, lượt chọn giữ nguyên', () => {
    let st = createGame({ seed: 4, now: 0, data, humanSeats: [0, 1, 2, 3] });
    for (let i = 0; i < 4; i++) st = ok(st, { type: 'answer_opening', playerId: `p${i}`, choice: 0 }, 100 + i).state;
    st = ok(st, { type: 'pick_class', playerId: st.order[0], cls: 'hiepsi' }, 200).state;
    const r = applyCommand(st, { type: 'pick_class', playerId: st.order[1], cls: 'hiepsi' }, 300, data);
    expect(r.error).toBeTruthy();
    expect(r.state.classPick!.index).toBe(1);
    expect(P(r.state, st.order[0]).cls).toBe('hiepsi');
  });

  it('AC-02.3 hết giờ chọn thì được gán class còn trống', () => {
    let st = createGame({ seed: 5, now: 0, data, humanSeats: [0, 1, 2, 3] });
    for (let i = 0; i < 4; i++) st = ok(st, { type: 'answer_opening', playerId: `p${i}`, choice: 0 }, 100 + i).state;
    st = tick(st, 103 + 15001).state;
    expect(P(st, st.order[0]).cls).not.toBeNull();
    expect(st.classPick!.index).toBe(1);
  });
});

describe('US-03 lượt đi', () => {
  it('AC-03.1 đổ ra 4 thì đi đúng 4 ô và chuyển lượt', () => {
    const { target, from } = targetOfType('thuong', 4);
    const st = toTurn(dice(4));
    const r = rollFrom(st, from);
    expect(P(r.state, 'p0').pos).toBe(target);
    expect(r.state.turn!.playerId).toBe('p1');
  });

  it('AC-03.2 ra 0 thì đứng yên, không xử lý ô; ra 9 thì đi đủ 9 ô', () => {
    const heal = cellsOfType('hoimau')[0];
    let st = toTurn(dice(0));
    P(st, 'p0').hp = 20;
    const r0 = rollFrom(st, heal);
    expect(P(r0.state, 'p0').pos).toBe(heal);
    expect(P(r0.state, 'p0').hp).toBe(20);
    const { target, from } = targetOfType('thuong', 9);
    st = toTurn(dice(9));
    expect(P(rollFrom(st, from).state, 'p0').pos).toBe(target);
  });

  it('AC-03.3 tới ngã ba thì chọn nhánh; hết giờ thì đi nhánh mặc định', () => {
    const fork = [...graph.next.entries()].find(([, ns]) => ns.length > 1)!;
    const before = cellStepsBefore(fork[0], 1);
    let st = toTurn(dice(2));
    let r = rollFrom(st, before);
    expect(r.state.turn!.step).toBe('await_branch');
    r = ok(r.state, { type: 'choose_branch', playerId: 'p0', cell: fork[1][1] }, 11000);
    expect(P(r.state, 'p0').pos).toBe(fork[1][1]);
    st = toTurn(dice(2));
    r = rollFrom(st, before);
    r = tick(r.state, 10500 + 10001);
    expect(P(r.state, 'p0').pos).toBe(fork[1][0]);
  });

  it('AC-03.4 BR2 dừng ở đúng 20,0 giây được nhận; sau 20,0 giây mất lượt', () => {
    const { from } = targetOfType('thuong', 3);
    let st = toTurn(dice(3));
    const t0 = st.turn!.startedAt;
    P(st, 'p0').pos = from;
    st = ok(st, { type: 'roll_start', playerId: 'p0' }, t0 + 1000).state;
    const okAt = applyCommand(st, { type: 'roll_stop', playerId: 'p0' }, t0 + 20000, data);
    expect(okAt.error).toBeUndefined();
    const late = applyCommand(st, { type: 'roll_stop', playerId: 'p0' }, t0 + 20001, data);
    expect(late.error).toBeTruthy();
    expect(P(late.state, 'p0').pos).toBe(from);
    expect(late.state.turn!.playerId).toBe('p1');
  });

  it('AC-03.5 bấm dừng khi chưa bắt đầu, hoặc bấm lần ba, bị bỏ qua', () => {
    const st = toTurn(dice(3));
    const r = applyCommand(st, { type: 'roll_stop', playerId: 'p0' }, 3000, data);
    expect(r.error).toBeTruthy();
    expect(r.state.turn!.step).toBe('await_roll_start');
    const done = rollFrom(st, targetOfType('thuong', 3).from);
    const again = applyCommand(done.state, { type: 'roll_stop', playerId: 'p0' }, 12000, data);
    expect(again.error).toBeTruthy();
  });

  it('AC-03.7 BR3 kết quả không phụ thuộc thời điểm bấm', () => {
    const roll = (stopAfter: number) => {
      let st = toTurn({}, undefined, 99);
      const pid = st.turn!.playerId;
      st = ok(st, { type: 'roll_start', playerId: pid }, 3000).state;
      const r = ok(st, { type: 'roll_stop', playerId: pid }, 3000 + stopAfter);
      return r.events.find((e) => e.type === 'dice_stopped')!.value;
    };
    expect(roll(100)).toBe(roll(7777));
  });
});

describe('US-04 xử lý ô', () => {
  it('AC-04.1/04.9 BR10 ô thường không đổi gì; hai người dừng cùng một ô đều chịu sự kiện', () => {
    const { from } = targetOfType('thuong', 2);
    let st = toTurn(dice(2));
    const before = { ...P(st, 'p0') };
    let r = rollFrom(st, from);
    expect(P(r.state, 'p0').hp).toBe(before.hp);
    expect(P(r.state, 'p0').keys).toBe(before.keys);
    const h = targetOfType('hoimau', 2);
    st = toTurn(dice(2));
    P(st, 'p0').hp = 10;
    P(st, 'p1').hp = 10;
    r = rollFrom(st, h.from);
    r = rollFrom(r.state, h.from, 12000);
    expect(P(r.state, 'p0').hp).toBe(20);
    expect(P(r.state, 'p1').hp).toBe(20);
    expect(P(r.state, 'p0').pos).toBe(P(r.state, 'p1').pos);
  });

  it('AC-04.2 BR13 hồi máu 25 lên 30, 30 giữ 30', () => {
    const { from } = targetOfType('hoimau', 1);
    let st = toTurn(dice(1));
    P(st, 'p0').hp = 25;
    expect(P(rollFrom(st, from).state, 'p0').hp).toBe(30);
    st = toTurn(dice(1));
    expect(P(rollFrom(st, from).state, 'p0').hp).toBe(30);
  });

  it('AC-04.3 BR11 bẫy: ra 6 phá được; ra 5 mất máu và chìa', () => {
    const rules = (n: number) => ({ ...dice(n), keysDrop: { min: 5, max: 5 } });
    let t = targetOfType('bay', 6);
    let r = rollFrom(toTurn(rules(6), ['thaytu', 'phapsu', 'daochich', 'hiepsi']), t.from);
    expect(P(r.state, 'p0').hp).toBe(30);
    expect(P(r.state, 'p0').keys).toBe(10);
    t = targetOfType('bay', 5);
    r = rollFrom(toTurn(rules(5), ['thaytu', 'phapsu', 'daochich', 'hiepsi']), t.from);
    expect(P(r.state, 'p0').hp).toBe(26);
    expect(P(r.state, 'p0').keys).toBe(5);
    expect(r.state.drops[t.target].p0).toBe(5);
  });

  it('AC-04.4 BR12 quái vật: phải đạt xúc xắc VÀ trả lời đúng', () => {
    const run = (n: number, correct: boolean) => {
      const t = targetOfType('quaivat', n);
      let r = rollFrom(toTurn(dice(n), ['thaytu', 'phapsu', 'daochich', 'hiepsi']), t.from);
      const qid = r.state.turn!.cellQuestion!.qid;
      r = ok(r.state, { type: 'answer_cell', playerId: 'p0', choice: correct ? answerOf(qid) : wrongOf(qid) }, 12000);
      return P(r.state, 'p0').hp;
    };
    expect(run(5, true)).toBe(30);
    expect(run(5, false)).toBe(24);
    expect(run(3, true)).toBe(24);
    // hết giờ cũng là thất bại
    const t = targetOfType('quaivat', 5);
    const r = tick(rollFrom(toTurn(dice(5), ['thaytu', 'phapsu', 'daochich', 'hiepsi']), t.from).state, 10500 + 15001);
    expect(P(r.state, 'p0').hp).toBe(24);
  });

  it('AC-04.5 ô câu hỏi: đúng thì có thưởng, sai thì không', () => {
    const t = targetOfType('cauhoi', 2);
    const rules = { ...dice(2), cellQuestion: { keysChance: 1, keys: 3 } };
    let r = rollFrom(toTurn(rules), t.from);
    const qid = r.state.turn!.cellQuestion!.qid;
    const good = ok(r.state, { type: 'answer_cell', playerId: 'p0', choice: answerOf(qid) }, 12000);
    expect(P(good.state, 'p0').keys).toBe(13);
    const bad = ok(r.state, { type: 'answer_cell', playerId: 'p0', choice: wrongOf(qid) }, 12000);
    expect(P(bad.state, 'p0').keys).toBe(10);
    r = rollFrom(toTurn({ ...dice(2), cellQuestion: { keysChance: 0, keys: 3 } }), t.from);
    const item = ok(r.state, { type: 'answer_cell', playerId: 'p0', choice: answerOf(r.state.turn!.cellQuestion!.qid) }, 12000);
    expect(Object.values(P(item.state, 'p0').items).reduce((a, b) => a + (b ?? 0), 0)).toBe(1);
  });

  it('AC-04.6 BR7 Pháp sư: 3 chìa không dùng được, 4 chìa dùng được và còn 2 đáp án; không dùng ở câu mở đầu', () => {
    const open = createGame({ seed: 1, now: 0, data, humanSeats: [0, 1, 2, 3] });
    expect(applyCommand(open, { type: 'wizard_hint', playerId: 'p0' }, 10, data).error).toBeTruthy();
    const t = targetOfType('cauhoi', 2);
    const st = toTurn(dice(2), ['phapsu', 'hiepsi', 'daochich', 'thaytu']);
    P(st, 'p0').keys = 3;
    let r = rollFrom(st, t.from);
    expect(applyCommand(r.state, { type: 'wizard_hint', playerId: 'p0' }, 11000, data).error).toBeTruthy();
    P(r.state, 'p0').keys = 4;
    r = ok(r.state, { type: 'wizard_hint', playerId: 'p0' }, 11000);
    const hidden = r.state.turn!.cellQuestion!.hidden;
    expect(hidden).toHaveLength(2);
    expect(hidden).not.toContain(answerOf(r.state.turn!.cellQuestion!.qid));
    expect(P(r.state, 'p0').keys).toBe(0);
  });

  it('AC-04.7 BR8 Đạo chích phá bẫy: chắc chắn được thì +1, chắc chắn không thì không', () => {
    const t = targetOfType('bay', 7);
    const run = (p: number) =>
      P(rollFrom(toTurn({ ...dice(7), classes: { thiefChance: p } }, ['daochich', 'hiepsi', 'phapsu', 'thaytu']), t.from).state, 'p0').keys;
    expect(run(1)).toBe(11);
    expect(run(0)).toBe(10);
  });

  it('AC-04.8 BR6 Hiệp sĩ: lá chắn sau lượt xúc xắc thứ 4, chặn máu nhưng chìa vẫn rơi', () => {
    let st = toTurn({ ...dice(0), keysDrop: { min: 5, max: 5 } });
    for (let i = 0; i < 3; i++) {
      P(st, 'p0').diceRolls = i;
    }
    P(st, 'p0').diceRolls = 2;
    st = rollFrom(st, P(st, 'p0').pos).state; // lượt thứ 3
    expect(P(st, 'p0').shield).toBe(0);
    // lượt xúc xắc thứ 4 là lần đổ ở ô bẫy: đi 1 ô (lượt 4 sinh chắn), ô bẫy đổ lần 5
    const t = targetOfType('bay', 1);
    st = toTurn({ ...dice(1), keysDrop: { min: 5, max: 5 } });
    P(st, 'p0').diceRolls = 3;
    const r = rollFrom(st, t.from);
    expect(P(r.state, 'p0').hp).toBe(30);
    expect(P(r.state, 'p0').keys).toBe(5);
    expect(P(r.state, 'p0').shield).toBe(0);
  });
});

describe('US-05 ô chiếm', () => {
  const t = () => targetOfType('chiem', 2);

  it('AC-05.1 dừng vào ô chiếm chưa chủ: thành chủ ô và các ô kề; không đổi chủ', () => {
    const { target, from } = t();
    let st = toTurn(dice(2));
    let r = rollFrom(st, from);
    const zone = Object.entries(r.state.owners).filter(([, o]) => o === 'p0').map(([c]) => c);
    expect(zone).toContain(target);
    expect(zone.every((c) => hexDistance(parseCell(c), parseCell(target)) <= 1)).toBe(true);
    r = rollFrom(r.state, from, 12000);
    expect(r.state.owners[target]).toBe('p0');
  });

  it('AC-05.2/05.3/05.4 BR14 người khác dừng vào thì mất chìa cho chủ; chủ không mất; thiếu chìa thì mất số đang có', () => {
    const { from } = t();
    let st = toTurn({ ...dice(2), capture: { taxMin: 3, taxMax: 3 } });
    let r = rollFrom(st, from);
    r = rollFrom(r.state, from, 12000);
    expect(P(r.state, 'p1').keys).toBe(7);
    expect(P(r.state, 'p0').keys).toBe(13);
    expect(P(r.state, 'p1').hp).toBe(30);
    P(r.state, 'p2').keys = 2;
    r = rollFrom(r.state, from, 14000);
    expect(P(r.state, 'p2').keys).toBe(0);
    expect(P(r.state, 'p0').keys).toBe(15);
    st = toTurn({ ...dice(2), capture: { taxMin: 3, taxMax: 3 } });
    r = rollFrom(st, from);
    // tới lượt p0 ở round sau: tự dừng vào ô của mình
    r.state.turn!.playerId = 'p0';
    const own = rollFrom(r.state, from, 13000);
    expect(P(own.state, 'p0').keys).toBe(10);
  });

  it('AC-05.5 bản đồ có 8 ô chiếm, vùng không chồng nhau', () => {
    const caps = cellsOfType('chiem');
    expect(caps).toHaveLength(8);
    for (const a of caps) for (const b of caps) if (a !== b) expect(hexDistance(parseCell(a), parseCell(b))).toBeGreaterThanOrEqual(3);
  });
});

describe('US-06 máu, chết, chìa rơi', () => {
  it('AC-06.1/06.2 BR15 rơi chìa cố định không theo sát thương; thiếu chìa thì rơi hết', () => {
    const t = targetOfType('bay', 1);
    const run = (hpLoss: number, keys: number) => {
      const st = toTurn({ ...dice(1), trap: { successMin: 6, hpLoss }, keysDrop: { min: 5, max: 5 } }, ['thaytu', 'phapsu', 'daochich', 'hiepsi']);
      P(st, 'p0').keys = keys;
      return P(rollFrom(st, t.from).state, 'p0');
    };
    expect(run(1, 20).keys).toBe(15);
    expect(run(8, 20).keys).toBe(15);
    expect(run(8, 3).keys).toBe(0);
  });

  it('AC-06.3 BR16 chết: rơi 1/2 chìa (làm tròn xuống), về nghĩa địa xa nhất, đủ máu, không rơi thêm', () => {
    const t = targetOfType('bay', 1);
    const run = (keys: number) => {
      const st = toTurn({ ...dice(1), keysDrop: { min: 5, max: 5 } }, ['thaytu', 'phapsu', 'daochich', 'hiepsi']);
      P(st, 'p0').keys = keys;
      P(st, 'p0').hp = 2;
      return rollFrom(st, t.from).state;
    };
    const s = run(11);
    expect(P(s, 'p0').keys).toBe(6);
    expect(s.drops[t.target].p0).toBe(5);
    expect(P(s, 'p0').hp).toBe(30);
    const graves = cellsOfType('nghiadia');
    const far = graves.reduce((a, b) => (hexDistance(parseCell(b), parseCell(t.target)) > hexDistance(parseCell(a), parseCell(t.target)) ? b : a));
    expect(P(s, 'p0').pos).toBe(far);
    expect(P(run(1), 'p0').keys).toBe(1);
  });

  it('AC-06.4/06.5/06.6 BR17 nhặt hết chìa trừ phần của mình; đi qua không nhặt', () => {
    const { target, from } = targetOfType('thuong', 2);
    let st = toTurn(dice(2));
    st.drops[target] = { p1: 3, p2: 4, p0: 5 };
    let r = rollFrom(st, from);
    expect(P(r.state, 'p0').keys).toBe(17);
    expect(r.state.drops[target]).toEqual({ p0: 5 });
    r = rollFrom(r.state, from, 12000); // p1 dừng
    expect(P(r.state, 'p1').keys).toBe(15);
    expect(r.state.drops[target]).toBeUndefined();
    // đi qua
    st = toTurn(dice(3));
    st.drops[target] = { p1: 3 };
    r = rollFrom(st, from);
    expect(r.state.drops[target]).toEqual({ p1: 3 });
  });
});

describe('US-07 rương, cúp, thắng', () => {
  it('AC-07.1 BR18 rương xuất hiện, chênh lệch quãng đường không quá 2 ô', () => {
    const st = toTurn();
    expect(st.chest.cell).toBeTruthy();
    const dists = st.players.map((p) => {
      const seen = new Map([[p.pos, 0]]);
      const q = [p.pos];
      for (let i = 0; i < q.length; i++) for (const n of graph.next.get(q[i]) ?? []) if (!seen.has(n)) (seen.set(n, seen.get(q[i])! + 1), q.push(n));
      return seen.get(st.chest.cell!)!;
    });
    expect(Math.max(...dists) - Math.min(...dists)).toBeLessThanOrEqual(2);
  });

  it('AC-07.2/07.3/07.4 dừng đúng ô: 40 chìa mở, 39 không; đi qua (Q31 A): đủ chìa thì mở, thiếu thì không; rương chưa xuất hiện thì ô thường', () => {
    const { target, from } = targetOfType('thuong', 2);
    const setup = (keys: number, d = 2) => {
      const st = toTurn(dice(d));
      st.chest.cell = target;
      P(st, 'p0').keys = keys;
      return rollFrom(st, from).state;
    };
    let s = setup(40);
    expect(P(s, 'p0').cups).toBe(1);
    expect(P(s, 'p0').keys).toBe(0);
    expect(s.chest.cell).toBeNull();
    s = setup(39);
    expect(P(s, 'p0').cups).toBe(0);
    expect(s.chest.cell).toBe(target);
    s = setup(45, 3);
    expect(P(s, 'p0').cups).toBe(1);
    expect(P(s, 'p0').keys).toBe(5);
    expect(P(s, 'p0').pos).not.toBe(target);
    s = setup(39, 3);
    expect(P(s, 'p0').cups).toBe(0);
    expect(s.chest.cell).toBe(target);
    const st = toTurn(dice(2));
    st.chest.cell = null;
    P(st, 'p0').keys = 50;
    expect(P(rollFrom(st, from).state, 'p0').cups).toBe(0);
  });

  it('AC-07.5 mở rương lần 3 thì ván kết thúc ngay', () => {
    const { target, from } = targetOfType('thuong', 2);
    const st = toTurn(dice(2));
    st.chest.cell = target;
    P(st, 'p0').keys = 40;
    P(st, 'p0').cups = 2;
    const s = rollFrom(st, from).state;
    expect(s.phase).toBe('game_over');
    expect(s.winner).toBe('p0');
    expect(applyCommand(s, { type: 'roll_start', playerId: 'p1' }, 20000, data).error).toBeTruthy();
  });
});

describe('US-07 rương khi đi qua (Q31 A)', () => {
  it('AC-07.6 đi qua ô rương và nhận cúp thứ 3 thì ván kết thúc ngay, quân dừng ở ô rương', () => {
    const { target, from } = targetOfType('thuong', 2);
    const st = toTurn(dice(5));
    st.chest.cell = target;
    P(st, 'p0').keys = 40;
    P(st, 'p0').cups = 2;
    const s = rollFrom(st, from).state;
    expect(s.phase).toBe('game_over');
    expect(s.winner).toBe('p0');
    expect(P(s, 'p0').pos).toBe(target);
  });
});

describe('US-08 đố 10 câu', () => {
  const toQuiz = (rules: Record<string, unknown> = {}, classes?: Parameters<typeof toTurn>[1]): GameState => {
    let st = toTurn({ ...dice(0), ...rules }, classes);
    for (let i = 0; i < 4; i++) st = rollFrom(st, P(st, st.turn!.playerId).pos, 5000 + i * 1000).state;
    expect(st.phase).toBe('quiz');
    return st;
  };

  it('AC-08.1 cùng 10 câu không trùng, thứ tự xáo riêng', () => {
    const st = toQuiz();
    const q = st.quiz!;
    expect(new Set(q.qids).size).toBe(10);
    for (const p of Object.values(q.perPlayer)) expect([...p.order].sort()).toEqual([...q.qids].sort());
    const orders = new Set(Object.values(q.perPlayer).map((p) => p.order.join()));
    expect(orders.size).toBeGreaterThan(1);
  });

  it('AC-08.2/08.3/08.4 BR19 BR20 xếp hạng, đồng hạng nhận thưởng hạng cao hơn, thưởng 5/3/1/0 + item hạng 1-2', () => {
    let st = toQuiz();
    const start = 9000;
    // p0: 10 đúng nhanh; p1 và p2: 7 đúng, cùng thời gian; p3: 0 đúng
    const plan: Record<string, { correct: number; ms: number }> = {
      p0: { correct: 10, ms: 1000 },
      p1: { correct: 7, ms: 2000 },
      p2: { correct: 7, ms: 2000 },
      p3: { correct: 0, ms: 1000 },
    };
    let last = st;
    for (let i = 0; i < 10; i++) {
      for (const [pid, pl] of Object.entries(plan)) {
        const qp = st.quiz!.perPlayer[pid];
        const qid = qp.order[qp.idx];
        const choice = i < pl.correct ? answerOf(qid) : wrongOf(qid);
        const r = ok(st, { type: 'quiz_answer', playerId: pid, choice }, qp.questionStartedAt + pl.ms);
        st = r.state;
        last = st;
      }
    }
    void start;
    expect(last.phase).toBe('turn');
    expect(P(last, 'p0').keys).toBe(15);
    expect(P(last, 'p1').keys).toBe(13);
    expect(P(last, 'p2').keys).toBe(13);
    expect(P(last, 'p3').keys).toBe(10);
    const items = (id: string) => Object.values(P(last, id).items).reduce((a, b) => a + (b ?? 0), 0);
    expect([items('p0'), items('p1'), items('p2'), items('p3')]).toEqual([1, 1, 1, 0]);
    expect(last.order).toEqual(['p0', 'p1', 'p2', 'p3']);
    expect(last.round).toBe(2);
  });

  it('AC-08.5 câu hết giờ tính sai và tính thời gian tối đa', () => {
    let st = toQuiz();
    const t0 = st.quiz!.perPlayer.p0.questionStartedAt;
    st = tick(st, t0 + 15001).state;
    const res = st.quiz!.perPlayer.p0.results[0];
    expect(res.correct).toBe(false);
    expect(res.ms).toBe(15000);
  });

  it('AC-08.6 BR8 Đạo chích sau đố: chắc chắn được +1, chắc chắn không thì không', () => {
    const finish = (p: number) => {
      let st = toQuiz({ classes: { thiefChance: p } }, ['daochich', 'hiepsi', 'phapsu', 'thaytu']);
      st = tick(st, st.quiz!.perPlayer.p0.questionStartedAt + 10 * 15000 + 10).state;
      expect(st.phase).toBe('turn');
      return P(st, 'p0').keys;
    };
    // tất cả hết giờ: đồng hạng 1 (5 chìa)
    expect(finish(1)).toBe(16);
    expect(finish(0)).toBe(15);
  });
});

describe('US-10 bot', () => {
  it('AC-10.1/10.2 100 ván toàn bot với 100 seed đều kết thúc, không lệnh lỗi', () => {
    const rounds: number[] = [];
    for (let seed = 1; seed <= 100; seed++) {
      const r = runHeadless(seed, data);
      expect(r.state.phase, `seed ${seed}`).toBe('game_over');
      expect(r.errors, `seed ${seed}`).toBe(0);
      rounds.push(r.state.round);
    }
    rounds.sort((a, b) => a - b);
    const avg = rounds.reduce((a, b) => a + b, 0) / rounds.length;
    console.log(`[AC-10.2] 100 ván: round trung bình ${avg.toFixed(1)}, trung vị ${rounds[50]}, ít nhất ${rounds[0]}, nhiều nhất ${rounds[99]}`);
  }, 600000);
});

describe('US-11 game-core độc lập', () => {
  it('AC-11.1 game-core không dùng DOM, React hay Canvas', () => {
    const dir = join(__dirname, '../src');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/\b(window|document|react|HTMLCanvas|Math\.random|Date\.now)\b/);
    }
  });

  it('AC-11.2 BR22 cùng seed và cùng chuỗi lệnh cho cùng trạng thái', () => {
    const a = runHeadless(42, data);
    const b = runHeadless(42, data);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });

  it('AC-11.3 lệnh của người không đến lượt bị từ chối, trạng thái người chơi không đổi', () => {
    const st = toTurn();
    const r = applyCommand(st, { type: 'roll_start', playerId: 'p2' }, 3000, data);
    expect(r.error).toBeTruthy();
    expect(r.state.players).toEqual(st.players);
    expect(r.state.turn!.step).toBe('await_roll_start');
  });

  it('AC-11.4 BR23 khóa thiếu được bổ sung, giá trị đã chỉnh giữ nguyên; đổi ngưỡng bẫy đổi hành vi', () => {
    const custom: Record<string, unknown> = { trap: { successMin: 7 } };
    const added = fillMissing(custom, DEFAULT_GAME_RULES as unknown as Record<string, unknown>);
    expect(added).toBeGreaterThan(0);
    expect((custom.trap as { successMin: number; hpLoss: number }).successMin).toBe(7);
    expect((custom.trap as { hpLoss: number }).hpLoss).toBe(DEFAULT_GAME_RULES.trap.hpLoss);
    expect(resolveRules({ trap: { successMin: 7 } }).timing.turnMs).toBe(20000);
    const t = targetOfType('bay', 6);
    const six = rollFrom(toTurn({ ...dice(6), trap: { successMin: 7 } }, ['thaytu', 'phapsu', 'daochich', 'hiepsi']), t.from).state;
    expect(P(six, 'p0').hp).toBeLessThan(30);
    const t7 = targetOfType('bay', 7);
    const seven = rollFrom(toTurn({ ...dice(7), trap: { successMin: 7 } }, ['thaytu', 'phapsu', 'daochich', 'hiepsi']), t7.from).state;
    expect(P(seven, 'p0').hp).toBe(30);
  });

  it('AC-11.5 góc nhìn công khai không có seed và không có đáp án câu đang hỏi', () => {
    const st = createGame({ seed: 5, now: 0, data });
    const v = publicView(st, data, 'p0');
    expect('rng' in v).toBe(false);
    expect(JSON.stringify(v.activeQuestion)).not.toMatch(/"answer"/);
  });
});
