/** Rastgele sayı kaynağı. Sunucuda kriptografik, testlerde tohumlu. */
export interface Rng { int(maxExclusive: number): number }

export type Difficulty = 'kolay' | 'orta' | 'zor';

export interface GameConfig {
  players: number;
  options?: Record<string, unknown>;
}

export interface GameResult {
  /** Kazanan koltuk numaraları (takım oyunlarında takımın tüm oyuncuları). */
  winners: number[];
  /** Koltuk bazlı son puanlar. */
  scores: number[];
  summary: string;
  /** Kaybeden tek oyuncu (Papaz Kaçtı gibi oyunlarda). */
  loser?: number;
  /** Puanlar ceza ise (101 Okey gibi) düşük olan iyidir. */
  lowerIsBetter?: boolean;
}

export interface OptionDef {
  key: string;
  label: string;
  choices: { value: string | number | boolean; label: string }[];
  default: string | number | boolean;
}

/**
 * Her oyun bu sözleşmeye uyar. Durum yalnızca apply() ile değişir.
 * view(), gizli bilgiyi (rakip eli, deste sırası) süzer.
 * ai() yalnızca view alır: yapay zekâ gizli bilgiyi göremez, hile yapamaz.
 */
export interface GameModule<S = any, A = any, V = any> {
  id: string;
  name: string;
  playerCounts: number[];
  options: OptionDef[];
  setup(cfg: GameConfig, rng: Rng): S;
  /** Şu an hamle yapması gereken koltuklar. */
  toAct(state: S): number[];
  legalActions(state: S, seat: number): A[];
  /** Geçersizse hata fırlatır; geçerliyse yeni durum döner (girdi değiştirilmez). */
  apply(state: S, seat: number, action: A, rng: Rng): S;
  view(state: S, seat: number | null): V;
  isOver(state: S): boolean;
  result(state: S): GameResult | null;
  ai(view: V, seat: number, difficulty: Difficulty, rng: Rng): A;
  /** İki kişilik oyunlarda teslim olma / süre bitimi (varsa oyun saati desteklenir). */
  resign?(state: S, seat: number, reason: string): S;
}

export class IllegalMoveError extends Error {
  constructor(msg: string) { super(msg); this.name = 'IllegalMoveError'; }
}
