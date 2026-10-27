import type { ClassId, GameEvent, GameRules, ItemId } from '@fa/game-core';

export const CLASS_NAME: Record<ClassId, string> = {
  hiepsi: 'Hiệp sĩ',
  phapsu: 'Pháp sư',
  daochich: 'Đạo chích',
  thaytu: 'Thầy tu',
};

/** Mô tả class lấy số liệu từ luật đang dùng, để chỉnh cấu hình thì chữ trên màn hình đổi theo. */
export function classDesc(cls: ClassId, rules: GameRules): string {
  const k = rules.classes;
  switch (cls) {
    case 'hiepsi':
      return `Cứ ${k.shieldEvery} lượt xúc xắc có 1 lá chắn chặn sát thương máu một lần (vẫn rơi chìa).`;
    case 'phapsu':
      return `Đổi ${k.hintCost} chìa để loại 2 đáp án sai ở câu hỏi trong ván.`;
    case 'daochich':
      return `${Math.round(k.thiefChance * 100)}% nhận thêm 1 chìa sau mỗi mini game và mỗi lần phá bẫy thành công.`;
    case 'thaytu':
      return 'Giảm 1/4 sát thương máu từ tầm gần (dưới 3 ô). Có tác dụng khi có vũ khí (Đợt 2).';
  }
}

export const ITEM_NAME: Record<ItemId, string> = {
  sungngam: 'Súng ngắm',
  shotgun: 'Shotgun',
  phitieu: 'Phi tiêu',
  bomdichuyen: 'Bom di chuyển',
  binhdoc: 'Bình độc',
  cachua: 'Quả cà chua',
  tenlua: 'Tên lửa',
  binhmau: 'Bình máu',
  cuonphep: 'Cuộn phép',
};

export const PLAYER_COLORS = ['#16a34a', '#2563eb', '#dc2626', '#ca8a04'];

export function eventText(e: GameEvent, name: (id: string) => string): string | null {
  const p = e.playerId ? name(e.playerId as string) : '';
  switch (e.type) {
    case 'opening_result':
      return `Thứ tự lượt: ${(e.order as string[]).map(name).join(' → ')}`;
    case 'class_picked':
      return `${p} chọn ${CLASS_NAME[e.cls as ClassId]}`;
    case 'turn_started':
      return `Round ${e.round}: lượt của ${p}`;
    case 'dice_stopped':
      return `${p} đổ được ${e.value}${e.purpose === 'trap' ? ' (phá bẫy)' : e.purpose === 'monster' ? ' (đánh quái vật)' : ''}`;
    case 'turn_lost':
      return `${p} hết giờ, mất lượt`;
    case 'keys_picked':
      return `${p} nhặt ${e.amount} chìa`;
    case 'tax_paid':
      return `${p} mất ${e.amount} chìa cho ${name(e.owner as string)} (ô chiếm)`;
    case 'zone_claimed':
      return `${p} chiếm ${(e.cells as string[]).length} ô`;
    case 'trap_disarmed':
      return `${p} phá bẫy thành công`;
    case 'trap_failed':
      return `${p} phá bẫy thất bại`;
    case 'monster_defeated':
      return `${p} thắng quái vật`;
    case 'monster_won':
      return `${p} thua quái vật`;
    case 'healed':
      return `${p} hồi ${e.amount} máu`;
    case 'card':
      return `${p} rút thẻ cơ hội: ${e.text}`;
    case 'damaged':
      return `${p} mất ${e.amount} máu`;
    case 'shield_gained':
      return `${p} có lá chắn`;
    case 'shield_blocked':
      return `Lá chắn của ${p} chặn ${e.blocked} máu`;
    case 'keys_dropped':
      return `${p} đánh rơi ${e.amount} chìa`;
    case 'died':
      return `${p} gục ngã, hồi sinh ở nghĩa địa`;
    case 'thief_bonus':
      return `${p} (Đạo chích) nhận thêm 1 chìa`;
    case 'item_gained':
      return `${p} nhận ${ITEM_NAME[e.item as ItemId]}`;
    case 'keys_gained':
      return `${p} nhận ${e.amount} chìa`;
    case 'wizard_hint':
      return `${p} (Pháp sư) loại 2 đáp án sai`;
    case 'cell_question_result':
      return `${p} trả lời ${e.correct ? 'đúng' : 'sai'}`;
    case 'chest_spawned':
      return 'Rương báu xuất hiện';
    case 'chest_opened':
      return `${p} mở rương, có ${e.cups} cúp`;
    case 'quiz_started':
      return 'Hết round: đố vui cuối round';
    case 'quiz_result': {
      const ranks = e.ranks as Record<string, number>;
      return 'Kết quả đố: ' + Object.entries(ranks).sort((a, b) => a[1] - b[1]).map(([id, r]) => `${r}. ${name(id)}`).join(', ');
    }
    case 'game_over':
      return `${name(e.winner as string)} thắng ván!`;
    default:
      return null;
  }
}
