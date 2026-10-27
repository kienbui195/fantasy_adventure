import type { RngState } from './rng';
import type { GameRules } from './config';

export type CellType =
  | 'thuong'
  | 'cauhoi'
  | 'bay'
  | 'quaivat'
  | 'hoimau'
  | 'cohoi'
  | 'chiem'
  | 'nghiadia'
  | 'xuatphat';

export type ClassId = 'hiepsi' | 'phapsu' | 'daochich' | 'thaytu';
export const CLASS_IDS: readonly ClassId[] = ['hiepsi', 'phapsu', 'daochich', 'thaytu'];

export type ItemId =
  | 'sungngam'
  | 'shotgun'
  | 'phitieu'
  | 'bomdichuyen'
  | 'binhdoc'
  | 'cachua'
  | 'tenlua'
  | 'binhmau'
  | 'cuonphep';
export const ITEM_IDS: readonly ItemId[] = [
  'sungngam',
  'shotgun',
  'phitieu',
  'bomdichuyen',
  'binhdoc',
  'cachua',
  'tenlua',
  'binhmau',
  'cuonphep',
];

export interface MapCell {
  q: number;
  r: number;
  type: CellType;
  ring: string | null;
  next: [number, number][];
}
export interface MapData {
  cells: MapCell[];
}

export interface Question {
  id: string;
  grade: number;
  subject: string;
  question: string;
  options: string[];
  answer: number;
}
export interface QuestionBank {
  questions: Question[];
}

/** Câu hỏi đang hiển thị: phần đáp án đúng chỉ nằm trong trạng thái đầy đủ (xem publicView). */
export interface ActiveQuestion {
  qid: string;
  deadline: number;
  /** chỉ số các đáp án đã bị Pháp sư loại bỏ */
  hidden: number[];
}

export interface Player {
  id: string;
  seat: number;
  name: string;
  isBot: boolean;
  hp: number;
  keys: number;
  cups: number;
  pos: string;
  cls: ClassId | null;
  shield: number;
  diceRolls: number;
  items: Partial<Record<ItemId, number>>;
}

export type Phase = 'opening' | 'class_pick' | 'turn' | 'quiz' | 'game_over';

export type TurnStep =
  | 'await_roll_start'
  | 'rolling'
  | 'await_branch'
  | 'await_cell_question';

export interface TurnState {
  playerId: string;
  startedAt: number;
  deadline: number;
  step: TurnStep;
  /** số ô còn phải đi khi dừng ở ngã ba */
  remaining: number;
  branchOptions: string[];
  /** ô quái vật: kết quả xúc xắc đã rút, cần trả lời đúng mới thắng */
  monsterDice: number | null;
  cellQuestion: ActiveQuestion | null;
  cellKind: 'cauhoi' | 'quaivat' | null;
}

export interface OpeningState {
  qid: string;
  deadline: number;
  startedAt: number;
  answers: Record<string, { choice: number; at: number }>;
}

export interface ClassPickState {
  index: number;
  deadline: number;
}

export interface QuizPlayer {
  order: string[];
  idx: number;
  questionStartedAt: number;
  results: { qid: string; choice: number | null; correct: boolean; ms: number }[];
}
export interface QuizState {
  qids: string[];
  perPlayer: Record<string, QuizPlayer>;
  deadlineMs: number;
}

export interface ChestState {
  /** null khi chưa xuất hiện (đang chờ) */
  cell: string | null;
}

export interface GameState {
  rules: GameRules;
  rng: RngState;
  phase: Phase;
  now: number;
  players: Player[];
  /** thứ tự lượt (mã người chơi), cố định sau câu hỏi mở đầu */
  order: string[];
  round: number;
  turnIndex: number;
  opening: OpeningState | null;
  classPick: ClassPickState | null;
  turn: TurnState | null;
  quiz: QuizState | null;
  owners: Record<string, string>;
  /** chìa rơi: ô -> (người làm rơi -> số chìa) */
  drops: Record<string, Record<string, number>>;
  chest: ChestState;
  winner: string | null;
  usedQuestions: string[];
}

export type Command =
  | { type: 'answer_opening'; playerId: string; choice: number }
  | { type: 'pick_class'; playerId: string; cls: ClassId }
  | { type: 'roll_start'; playerId: string }
  | { type: 'roll_stop'; playerId: string }
  | { type: 'choose_branch'; playerId: string; cell: string }
  | { type: 'answer_cell'; playerId: string; choice: number }
  | { type: 'wizard_hint'; playerId: string }
  | { type: 'quiz_answer'; playerId: string; choice: number };

export type GameEvent = { type: string; [k: string]: unknown };

export interface Result {
  state: GameState;
  events: GameEvent[];
  error?: string;
}

export interface GameData {
  map: MapData;
  questions: QuestionBank;
}
