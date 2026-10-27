import map from './data/map.json';
import questions from './data/questions.json';
import type { GameData, MapData, QuestionBank } from './types';

/** Dữ liệu mặc định: bản đồ mẫu đã duyệt và ngân hàng 100 câu hỏi. */
export const DEFAULT_DATA: GameData = {
  map: map as unknown as MapData,
  questions: questions as unknown as QuestionBank,
};
