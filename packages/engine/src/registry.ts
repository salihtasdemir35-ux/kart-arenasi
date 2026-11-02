import type { GameModule } from './types';
import { Pisti } from './games/pisti';
import { Batak } from './games/batak';
import { Papaz } from './games/papaz';
import { Satranc } from './games/satranc';
import { Tavla } from './games/tavla';
import { Kizma } from './games/kizma';
import { CinDamasi } from './games/cindamasi';
import { Xiangqi } from './games/xiangqi';
import { Scrabble } from './games/scrabble';
import { OkeyGame } from './games/okey';
import { Okey101 } from './games/okey101';
import { Elli1 } from './games/elli1';
import { Amiral } from './games/amiral';
import { Tombala } from './games/tombala';
import { Monopoli } from './games/monopoli';
import { Blof } from './games/blof';
import { King } from './games/king';
import { PisYedili, DostKazigi, Yanik } from './games/kartatma';
import { Bric } from './games/bric';
import { Poker } from './games/poker';
import { Blackjack } from './games/blackjack';

export const MODULES: Record<string, GameModule> = { pisti: Pisti, batak: Batak, papaz: Papaz, satranc: Satranc, tavla: Tavla, kizma: Kizma, cindamasi: CinDamasi, xiangqi: Xiangqi, scrabble: Scrabble, okey: OkeyGame, okey101: Okey101, elli1: Elli1, amiral: Amiral, tombala: Tombala, monopoli: Monopoli, blof: Blof, king: King, pisyedili: PisYedili, kazik: DostKazigi, yanik: Yanik, bric: Bric, poker: Poker, blackjack: Blackjack };

export function getModule(id: string): GameModule | undefined {
  return MODULES[id];
}
