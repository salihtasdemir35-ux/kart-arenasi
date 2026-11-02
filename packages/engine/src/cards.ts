/** Kart kimliği: takım harfi + değer. Örn. "S14" = Maça As, "H11" = Kupa Vale. */
export type Suit = 'S' | 'H' | 'D' | 'C';
export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const SUIT_NAMES: Record<Suit, string> = { S: 'Maça', H: 'Kupa', D: 'Karo', C: 'Sinek' };
export const SUIT_SYMBOLS: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const RANK_LABELS: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};
export const RANK_NAMES: Record<number, string> = {
  11: 'Vale', 12: 'Kız', 13: 'Papaz', 14: 'As',
};

export const suitOf = (c: string) => c[0] as Suit;
export const rankOf = (c: string) => Number(c.slice(1));
export const isRed = (c: string) => c[0] === 'H' || c[0] === 'D';

export function makeDeck(): string[] {
  const d: string[] = [];
  for (const s of SUITS) for (let r = 2; r <= 14; r++) d.push(s + r);
  return d;
}

export function cardName(c: string): string {
  const r = rankOf(c);
  return `${SUIT_NAMES[suitOf(c)]} ${RANK_NAMES[r] ?? RANK_LABELS[r]}`;
}

/** Eli takıma ve değere göre sıralar (görsel düzen için). */
export function sortHand(hand: string[]): string[] {
  const order: Record<Suit, number> = { S: 0, H: 1, C: 2, D: 3 };
  return hand.slice().sort((a, b) => order[suitOf(a)] - order[suitOf(b)] || rankOf(a) - rankOf(b));
}
