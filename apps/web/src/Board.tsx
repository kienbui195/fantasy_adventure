import { useEffect, useMemo, useRef } from 'react';
import { axialToPixel, cellId, type GameData, type PublicView } from '@fa/game-core';
import { PLAYER_COLORS } from './text';

const FILL: Record<string, [string, string, string]> = {
  thuong: ['#ffffff', '#94a3b8', ''],
  cauhoi: ['#dbeafe', '#2563eb', '?'],
  bay: ['#fee2e2', '#dc2626', '!'],
  quaivat: ['#ede9fe', '#7c3aed', 'M'],
  hoimau: ['#dcfce7', '#16a34a', '+'],
  cohoi: ['#fef3c7', '#d97706', '*'],
  chiem: ['#ffedd5', '#ea580c', '★'],
  nghiadia: ['#e2e8f0', '#334155', '†'],
  xuatphat: ['#c7d2fe', '#4338ca', 'S'],
};

interface Props {
  view: PublicView;
  data: GameData;
  highlight: string[];
  onPick?: (cell: string) => void;
}

const SIZE = 18;
const TOKEN_OFFSET = [
  [-6, -6],
  [6, -6],
  [-6, 6],
  [6, 6],
];

/** Vẽ bản đồ ô lục giác bằng Canvas 2D: loại ô, chủ ô chiếm, chìa rơi, rương, quân. */
export function Board({ view, data, highlight, onPick }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const layout = useRef<{ scale: number; ox: number; oy: number; size: number }>({ scale: 1, ox: 0, oy: 0, size: SIZE });
  // Toạ độ điểm ảnh của mọi ô chỉ phụ thuộc bản đồ: tính một lần.
  const px = useMemo(() => new Map(data.map.cells.map((c) => [cellId(c.q, c.r), axialToPixel(c, SIZE)])), [data]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    cv.width = w * dpr;
    cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const size = SIZE;
    const pts = [...px.values()];
    const minX = Math.min(...pts.map((p) => p.x)) - size * 1.5;
    const maxX = Math.max(...pts.map((p) => p.x)) + size * 1.5;
    const minY = Math.min(...pts.map((p) => p.y)) - size * 1.5;
    const maxY = Math.max(...pts.map((p) => p.y)) + size * 1.5;
    const scale = Math.min(w / (maxX - minX), h / (maxY - minY));
    const ox = (w - (maxX - minX) * scale) / 2 - minX * scale;
    const oy = (h - (maxY - minY) * scale) / 2 - minY * scale;
    layout.current = { scale, ox, oy, size };
    const tx = (x: number) => ox + x * scale;
    const ty = (y: number) => oy + y * scale;
    const seatOf = (id: string) => view.players.find((p) => p.id === id)!.seat;

    const hex = (x: number, y: number, r: number) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i - 30);
        const px = x + r * Math.cos(a);
        const py = y + r * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };

    // mũi tên chiều đi
    ctx.fillStyle = '#64748b';
    for (const c of data.map.cells) {
      const a = px.get(cellId(c.q, c.r))!;
      for (const [q, r] of c.next) {
        const b = px.get(cellId(q, r))!;
        const mx = tx((a.x + b.x) / 2);
        const my = ty((a.y + b.y) / 2);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const L = 5 * scale;
        ctx.beginPath();
        ctx.moveTo(mx + L * Math.cos(ang), my + L * Math.sin(ang));
        ctx.lineTo(mx + L * Math.cos(ang + 2.5), my + L * Math.sin(ang + 2.5));
        ctx.lineTo(mx + L * Math.cos(ang - 2.5), my + L * Math.sin(ang - 2.5));
        ctx.fill();
      }
    }

    for (const c of data.map.cells) {
      const id = cellId(c.q, c.r);
      const p = px.get(id)!;
      const x = tx(p.x);
      const y = ty(p.y);
      const [fill, stroke, label] = FILL[c.type];
      hex(x, y, size * 0.9 * scale);
      ctx.fillStyle = fill;
      ctx.fill();
      const owner = view.owners[id];
      ctx.lineWidth = owner ? 3 * scale : 1.4 * scale;
      ctx.strokeStyle = owner ? PLAYER_COLORS[seatOf(owner)] : stroke;
      ctx.stroke();
      if (highlight.includes(id)) {
        hex(x, y, size * 1.05 * scale);
        ctx.lineWidth = 3 * scale;
        ctx.strokeStyle = '#f59e0b';
        ctx.stroke();
      }
      if (label) {
        ctx.fillStyle = stroke;
        ctx.font = `bold ${11 * scale}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y);
      }
      const drops = view.drops[id];
      if (drops) {
        const n = Object.values(drops).reduce((a, b) => a + b, 0);
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(x + 9 * scale, y - 9 * scale, 6 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#713f12';
        ctx.font = `bold ${8 * scale}px Arial`;
        ctx.fillText(String(n), x + 9 * scale, y - 9 * scale);
      }
      if (view.chest.cell === id) {
        ctx.font = `${20 * scale}px Arial`;
        ctx.fillText('🎁', x, y);
      }
    }

    // quân
    view.players.forEach((pl, i) => {
      const p = px.get(pl.pos)!;
      const off = TOKEN_OFFSET[i];
      const x = tx(p.x) + off[0] * scale;
      const y = ty(p.y) + off[1] * scale;
      ctx.beginPath();
      ctx.arc(x, y, 6.5 * scale, 0, Math.PI * 2);
      ctx.fillStyle = PLAYER_COLORS[pl.seat];
      ctx.fill();
      ctx.lineWidth = view.turn?.playerId === pl.id ? 2.5 * scale : 1 * scale;
      ctx.strokeStyle = view.turn?.playerId === pl.id ? '#0f172a' : '#ffffff';
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${7 * scale}px Arial`;
      ctx.fillText(String(pl.seat + 1), x, y + 0.5);
    });
  }, [view, data, highlight, px]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onPick || highlight.length === 0) return;
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const { scale, ox, oy, size } = layout.current;
    let best: string | null = null;
    let bd = Infinity;
    for (const id of highlight) {
      const p = px.get(id)!;
      const d = Math.hypot(ox + p.x * scale - (e.clientX - r.left), oy + p.y * scale - (e.clientY - r.top));
      if (d < bd) {
        bd = d;
        best = id;
      }
    }
    if (best && bd < size * scale * 1.2) onPick(best);
  };

  return <canvas ref={ref} className="board" onClick={onClick} />;
}
