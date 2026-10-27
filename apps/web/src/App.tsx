import { useCallback, useEffect, useMemo, useState } from 'react';
import { CLASS_IDS, DEFAULT_DATA, DEFAULT_GAME_RULES, type ClassId, type ItemId, type PublicView, type ViewQuestion } from '@fa/game-core';
import { Host, type HostSnapshot } from './host';
import { Board } from './Board';
import { CLASS_NAME, ITEM_NAME, PLAYER_COLORS, classDesc, eventText } from './text';

const data = DEFAULT_DATA;
const LETTERS = ['A', 'B', 'C', 'D'];

function secondsLeft(deadline: number | undefined) {
  if (!deadline) return null;
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

export function App() {
  const [host, setHost] = useState<Host | null>(null);
  const [snap, setSnap] = useState<HostSnapshot | null>(null);

  const newGame = useCallback(() => {
    host?.stop();
    const h = new Host(data);
    h.subscribe(setSnap);
    h.start();
    setHost(h);
  }, [host]);

  useEffect(() => () => host?.stop(), [host]);

  if (!host || !snap) {
    return (
      <div className="start">
        <h1>Fantasy Adventure</h1>
        <p>
          Bàn cờ ô lục giác cho 4 người: bạn và 3 bot. Gom {DEFAULT_GAME_RULES.chest.keysCost} chìa để mở rương lấy cúp, đủ {DEFAULT_GAME_RULES.chest.cupsToWin} cúp thì thắng.
        </p>
        <button className="primary" onClick={newGame}>
          Bắt đầu ván
        </button>
      </div>
    );
  }
  return <Game host={host} snap={snap} onNew={newGame} />;
}

function Game({ host, snap, onNew }: { host: Host; snap: HostSnapshot; onNew: () => void }) {
  const v = snap.view;
  const me = v.players.find((p) => p.id === host.viewerId)!;
  const name = (id: string) => v.players.find((p) => p.id === id)?.name ?? id;
  const myTurn = v.phase === 'turn' && v.turn?.playerId === me.id;
  const q = v.activeQuestion;
  // Đồng hồ đếm ngược tự cập nhật mỗi 250 ms; host chỉ phát snapshot khi trạng thái đổi.
  const [, setClock] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setClock((x) => x + 1), 250);
    return () => clearInterval(id);
  }, []);

  const answer = useCallback(
    (choice: number) => {
      if (!q) return;
      if (q.kind === 'opening') host.send({ type: 'answer_opening', playerId: me.id, choice });
      else if (q.kind === 'quiz') host.send({ type: 'quiz_answer', playerId: me.id, choice });
      else host.send({ type: 'answer_cell', playerId: me.id, choice });
    },
    [host, me.id, q],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (!myTurn || !v.turn) return;
        if (v.turn.step === 'await_roll_start') host.send({ type: 'roll_start', playerId: me.id });
        else if (v.turn.step === 'rolling') host.send({ type: 'roll_stop', playerId: me.id });
        return;
      }
      const i = LETTERS.findIndex((l, n) => e.key.toUpperCase() === l || e.key === String(n + 1));
      if (i >= 0 && q && !q.hidden.includes(i)) answer(i);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [host, me.id, myTurn, v.turn, q, answer]);

  const lastDice = useMemo(() => [...snap.events].reverse().find((e) => e.type === 'dice_stopped'), [snap.events]);
  const log = useMemo(
    () =>
      snap.events
        .map((e) => eventText(e, name))
        .filter((x): x is string => !!x)
        .slice(-14)
        .reverse(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap.events],
  );
  const branch = myTurn && v.turn?.step === 'await_branch' ? v.turn.branchOptions : [];

  return (
    <div className="layout">
      <header>
        <strong>Fantasy Adventure</strong>
        <span>Round {v.round || '-'}</span>
        <span>{phaseLabel(v)}</span>
        <button onClick={onNew}>Ván mới</button>
      </header>
      <main>
        <section className="board-wrap">
          <Board view={v} data={data} highlight={branch} onPick={(cell) => host.send({ type: 'choose_branch', playerId: me.id, cell })} />
        </section>
        <aside>
          <Players view={v} />
          <div className="panel">
            {v.phase === 'game_over' && (
              <div className="over">
                <h2>{name(v.winner!)} thắng ván!</h2>
                <button className="primary" onClick={onNew}>
                  Chơi ván mới
                </button>
              </div>
            )}
            {v.phase === 'class_pick' && <ClassPick view={v} meId={me.id} onPick={(cls) => host.send({ type: 'pick_class', playerId: me.id, cls })} />}
            {q && (
              <QuestionCard
                q={q}
                onAnswer={answer}
                hintCost={q.kind !== 'opening' && q.kind !== 'quiz' && me.cls === 'phapsu' && me.keys >= v.rules.classes.hintCost && q.hidden.length === 0 ? v.rules.classes.hintCost : null}
                onHint={() => host.send({ type: 'wizard_hint', playerId: me.id })}
              />
            )}
            {v.phase === 'opening' && !q && <p>Đã trả lời, chờ người khác…</p>}
            {v.phase === 'quiz' && !q && <p>Bạn đã xong phần đố, chờ người khác…</p>}
            {v.phase === 'turn' && v.turn && !q && (
              <TurnPanel view={v} myTurn={myTurn} lastDice={lastDice?.value as number | undefined} name={name} branch={branch} onBranch={(cell) => host.send({ type: 'choose_branch', playerId: me.id, cell })} />
            )}
            {snap.error && <p className="err">{snap.error}</p>}
          </div>
          <div className="panel log">
            <div className="title">Diễn biến</div>
            {log.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}

function phaseLabel(v: PublicView) {
  switch (v.phase) {
    case 'opening':
      return 'Câu hỏi mở đầu';
    case 'class_pick':
      return 'Chọn class';
    case 'turn':
      return 'Đi quân';
    case 'quiz':
      return 'Đố cuối round';
    default:
      return 'Kết thúc';
  }
}

function Players({ view }: { view: PublicView }) {
  const ordered = view.order.length ? view.order.map((id) => view.players.find((p) => p.id === id)!) : view.players;
  return (
    <div className="panel players">
      {ordered.map((p) => (
        <div key={p.id} className={`player ${view.turn?.playerId === p.id ? 'active' : ''}`}>
          <span className="dot" style={{ background: PLAYER_COLORS[p.seat] }}>
            {p.seat + 1}
          </span>
          <div className="pinfo">
            <div>
              <b>{p.name}</b> {p.cls ? `· ${CLASS_NAME[p.cls]}` : ''} {p.shield > 0 ? '🛡️' : ''}
            </div>
            <div className="bar">
              <div style={{ width: `${(p.hp / view.rules.start.maxHp) * 100}%` }} />
            </div>
            <div className="stats">
              ❤️ {p.hp} · 🔑 {p.keys} · 🏆 {p.cups}
              <Items items={p.items} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Items({ items }: { items: Partial<Record<ItemId, number>> }) {
  const list = Object.entries(items) as [ItemId, number][];
  if (list.length === 0) return null;
  return (
    <span className="items" title={list.map(([k, n]) => `${ITEM_NAME[k]} x${n}`).join(', ')}>
      {' '}
      · 🎒 {list.reduce((a, [, n]) => a + n, 0)}
    </span>
  );
}

function ClassPick({ view, meId, onPick }: { view: PublicView; meId: string; onPick: (c: ClassId) => void }) {
  const picker = view.order[view.classPick?.index ?? 0];
  const mine = picker === meId;
  return (
    <div>
      <div className="title">{mine ? `Chọn class của bạn (${secondsLeft(view.classPick?.deadline)} giây)` : `${view.players.find((p) => p.id === picker)?.name} đang chọn class…`}</div>
      <div className="classes">
        {CLASS_IDS.map((c) => {
          const taken = view.players.find((p) => p.cls === c);
          return (
            <button key={c} disabled={!mine || !!taken} onClick={() => onPick(c)} className="class">
              <b>{CLASS_NAME[c]}</b>
              <span>{classDesc(c, view.rules)}</span>
              {taken && <em>Đã chọn: {taken.name}</em>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function QuestionCard({ q, onAnswer, hintCost, onHint }: { q: ViewQuestion; onAnswer: (i: number) => void; hintCost: number | null; onHint: () => void }) {
  const label = q.kind === 'opening' ? 'Câu hỏi mở đầu: quyết định thứ tự lượt' : q.kind === 'quiz' ? `Đố cuối round: câu ${(q.index ?? 0) + 1}/${q.total}` : q.kind === 'quaivat' ? 'Quái vật! Trả lời đúng để thắng' : 'Ô câu hỏi';
  return (
    <div className="question">
      <div className="title">
        {label} · còn {secondsLeft(q.deadline)} giây
      </div>
      <p>{q.question}</p>
      <div className="options">
        {q.options.map((o, i) => (
          <button key={i} disabled={q.hidden.includes(i)} onClick={() => onAnswer(i)}>
            <b>{LETTERS[i]}.</b> {o}
          </button>
        ))}
      </div>
      {hintCost !== null && (
        <button className="hint" onClick={onHint}>
          Pháp sư: đổi {hintCost} chìa để loại 2 đáp án sai
        </button>
      )}
    </div>
  );
}

function TurnPanel({ view, myTurn, lastDice, name, branch, onBranch }: { view: PublicView; myTurn: boolean; lastDice?: number; name: (id: string) => string; branch: string[]; onBranch: (c: string) => void }) {
  const t = view.turn!;
  const [face, setFace] = useState(0);
  useEffect(() => {
    if (t.step !== 'rolling') return;
    // Hiệu ứng quay số: chỉ để nhìn, không liên quan kết quả (kết quả do host rút lúc dừng).
    const id = setInterval(() => setFace((f) => (f + 1) % 10), 45);
    return () => clearInterval(id);
  }, [t.step]);
  const left = t.step === 'await_roll_start' || t.step === 'rolling' || t.step === 'await_branch' ? secondsLeft(t.deadline) : null;
  return (
    <div>
      <div className="title">
        {myTurn ? 'Lượt của bạn' : `Lượt của ${name(t.playerId)}`} {left !== null ? `· còn ${left} giây` : ''}
      </div>
      <div className={`dice ${t.step === 'rolling' ? 'rolling' : ''}`}>🎲 {t.step === 'rolling' ? face : lastDice ?? '-'}</div>
      {myTurn && t.step === 'await_roll_start' && <p>Bấm <kbd>Space</kbd> để đổ xúc xắc.</p>}
      {myTurn && t.step === 'rolling' && <p>Bấm <kbd>Space</kbd> lần nữa để dừng.</p>}
      {myTurn && branch.length > 0 && (
        <div>
          <p>Ngã ba: chọn nhánh (bấm ô sáng trên bản đồ hoặc nút).</p>
          {branch.map((b, i) => (
            <button key={b} onClick={() => onBranch(b)}>
              {i === 0 ? 'Đi tiếp trên vòng' : 'Qua cầu sang vòng khác'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
