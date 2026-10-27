/**
 * Luật chơi mặc định. Giá trị khởi tạo nằm trong code; khi có BE sẽ lưu ở bảng game_config (một dòng, rules JSON, version).
 * Mỗi nhóm có trường desc giải thích ý nghĩa; game bỏ qua desc. Khóa thiếu được bổ sung bằng fillMissing mà không
 * ghi đè giá trị đã chỉnh (BR23). Cùng mẫu với dự án game_hoc_tieng_anh.
 */
export const DEFAULT_GAME_RULES = {
  start: {
    desc: 'KHỞI ĐẦU: số người chơi cố định 4. hp là máu lúc đầu cũng là máu tối đa; keys là chìa khóa lúc đầu.',
    players: 4,
    hp: 30,
    maxHp: 30,
    keys: 10,
  },
  timing: {
    desc: [
      'THỜI GIAN (mili giây). turnMs: tổng thời gian một lượt, tính từ lúc đến lượt tới lúc bấm dừng xúc xắc; quá hạn thì mất lượt.',
      'branchMs: thời gian chọn nhánh ở ngã ba, hết giờ đi nhánh mặc định. openingMs, classPickMs, cellQuestionMs, quizQuestionMs: thời hạn trả lời / chọn class.',
    ].join('\n'),
    turnMs: 20000,
    branchMs: 10000,
    openingMs: 15000,
    classPickMs: 15000,
    cellQuestionMs: 15000,
    quizQuestionMs: 15000,
  },
  dice: {
    desc: 'XÚC XẮC: kết quả là một lần rút ngẫu nhiên trong [min, max] của host khi nhận lệnh dừng, không phụ thuộc thời điểm bấm.',
    min: 0,
    max: 9,
  },
  trap: {
    desc: 'Ô BẪY: đổ xúc xắc, từ successMin trở lên thì phá được; nếu không thì mất hpLoss máu và rơi chìa theo keysDrop.',
    successMin: 6,
    hpLoss: 4,
  },
  monster: {
    desc: 'Ô QUÁI VẬT: phải đạt xúc xắc từ diceMin trở lên VÀ trả lời đúng câu hỏi trong thời hạn; thiếu một thì mất hpLoss máu và rơi chìa theo keysDrop.',
    diceMin: 4,
    hpLoss: 6,
  },
  keysDrop: {
    desc: 'CHÌA RƠI KHI BỊ THƯƠNG: số chìa rơi cố định ngẫu nhiên trong [min, max] mỗi lần, không phụ thuộc sát thương. Chìa không đủ thì rơi hết số đang có.',
    min: 4,
    max: 6,
  },
  heal: {
    desc: 'Ô HỒI MÁU: hồi amount máu mỗi lần dừng vào, không vượt maxHp.',
    amount: 10,
  },
  capture: {
    desc: 'Ô CHIẾM: người đầu tiên dừng vào thành chủ ô và các ô kề trong bán kính radius. Người khác dừng vào ô có chủ mất taxMin đến taxMax chìa chuyển cho chủ, không mất máu.',
    radius: 1,
    taxMin: 2,
    taxMax: 3,
  },
  death: {
    desc: 'CHẾT: máu về 0 thì về nghĩa địa xa nhất (theo số ô), hồi đủ máu, rơi dropFraction tổng chìa (làm tròn xuống) tại ô chết.',
    dropFraction: 0.5,
  },
  chest: {
    desc: 'RƯƠNG: mở khi dừng hoặc đi qua ô rương mà có từ keysCost chìa; trừ keysCost, nhận 1 cúp. Đủ cupsToWin cúp thì thắng. spreadMax: chênh lệch quãng đường tối đa giữa người xa nhất và gần nhất tới ô rương (nới thêm 1 ô cho tới khi có ô thỏa).',
    keysCost: 40,
    cupsToWin: 3,
    spreadMax: 2,
  },
  quiz: {
    desc: 'ĐỐ CUỐI ROUND: count câu, cùng bộ câu cho mọi người, thứ tự xáo riêng. keys[i] là chìa thưởng cho hạng i+1; hạng 1 đến itemTopRanks nhận thêm 1 item ngẫu nhiên.',
    count: 10,
    keys: [5, 3, 1, 0],
    itemTopRanks: 2,
  },
  cellQuestion: {
    desc: 'Ô CÂU HỎI: trả lời đúng nhận thưởng; keysChance là xác suất nhận keys chìa, ngược lại nhận 1 item.',
    keysChance: 0.5,
    keys: 3,
  },
  classes: {
    desc: [
      'KHẢ NĂNG CLASS. Hiệp sĩ: cứ shieldEvery lượt xúc xắc của chính mình có 1 lá chắn chặn sát thương máu một lần (không chặn rơi chìa).',
      'Pháp sư: đổi hintCost chìa để loại 2 đáp án sai ở câu hỏi trong ván. Đạo chích: thiefChance cơ hội nhận thêm 1 chìa sau mini game và sau khi phá bẫy thành công.',
    ].join('\n'),
    shieldEvery: 4,
    hintCost: 4,
    thiefChance: 0.25,
  },
  cards: {
    desc: 'THẺ CƠ HỘI: kind là keys (đổi chìa), hp (đổi máu, không rơi chìa), move (tiến dương, lùi âm số ô). Rút ngẫu nhiên một thẻ.',
    list: [
      { kind: 'keys', value: 2, text: 'Nhặt được 2 chìa' },
      { kind: 'keys', value: -2, text: 'Đánh rơi 2 chìa' },
      { kind: 'hp', value: 5, text: 'Hồi 5 máu' },
      { kind: 'hp', value: -5, text: 'Mất 5 máu' },
      { kind: 'move', value: 2, text: 'Tiến 2 ô' },
      { kind: 'move', value: -2, text: 'Lùi 2 ô' },
    ],
  },
};

export type GameRules = typeof DEFAULT_GAME_RULES;

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Thêm khóa còn thiếu từ bộ mặc định vào target, không ghi đè giá trị đã có. Trả về số khóa đã thêm. */
export function fillMissing(target: Record<string, unknown>, defaults: Record<string, unknown>): number {
  let added = 0;
  for (const [key, def] of Object.entries(defaults)) {
    if (!(key in target)) {
      target[key] = structuredClone(def);
      added += 1;
    } else if (isPlain(target[key]) && isPlain(def)) {
      added += fillMissing(target[key] as Record<string, unknown>, def);
    }
  }
  return added;
}

/** Trộn cấu hình tùy chỉnh (một phần) lên bộ mặc định: khóa thiếu lấy từ mặc định, khóa có lấy giá trị đã chỉnh. */
export function resolveRules(custom?: Record<string, unknown>): GameRules {
  const rules = structuredClone(custom ?? {}) as Record<string, unknown>;
  fillMissing(rules, DEFAULT_GAME_RULES as unknown as Record<string, unknown>);
  return rules as unknown as GameRules;
}
