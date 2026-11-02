export type Category = 'iskambil' | 'tas' | 'masa' | 'strateji' | 'kelime' | 'aile';

export const CATEGORY_NAMES: Record<Category, string> = {
  iskambil: 'İskambil', tas: 'Taş oyunları', masa: 'Klasik masa', strateji: 'Strateji', kelime: 'Kelime', aile: 'Şans ve aile',
};

export interface CatalogEntry {
  id: string;
  name: string;
  category: Category;
  players: string;
  /** Oyunun geleceği geliştirme aşaması. */
  phase: number;
  /** Motoru hazır ve testlerden geçti mi? */
  playable: boolean;
  /** Motoru başka bir oyunun ayarı olarak sunuluyorsa. */
  engine?: string;
  presetOptions?: Record<string, unknown>;
  presetPlayers?: number;
  blurb: string;
}

export const CATALOG: CatalogEntry[] = [
  { id: 'batak', name: 'Batak', category: 'iskambil', players: '4', phase: 2, playable: true, presetPlayers: 4, blurb: 'İhaleyi al, kozu seç, sözünü tut.' },
  { id: 'ihaleli-batak', name: 'İhaleli Batak', category: 'iskambil', players: '4', phase: 2, playable: true, engine: 'batak', presetPlayers: 4, blurb: 'Klasik ihaleli tekli batak.' },
  { id: 'esli-batak', name: 'Eşli Batak', category: 'iskambil', players: '4', phase: 7, playable: true, engine: 'batak', presetOptions: { esli: true }, presetPlayers: 4, blurb: 'Karşılıklı eşlerle ihale.' },
  { id: 'koz-maca', name: 'Koz Maça', category: 'iskambil', players: '4', phase: 7, playable: true, engine: 'batak', presetOptions: { variant: 'kozmaca' }, presetPlayers: 4, blurb: 'Koz her zaman maça.' },
  { id: 'gommeli-batak', name: 'Gömmeli Batak', category: 'iskambil', players: '3', phase: 7, playable: true, engine: 'batak', presetOptions: { variant: 'gommeli' }, presetPlayers: 3, blurb: 'Üç kişilik, gömü kartlı batak.' },
  { id: 'pisti', name: 'Pişti', category: 'iskambil', players: '2', phase: 2, playable: true, presetPlayers: 2, blurb: 'Yerdekini al, piştiyi yakala.' },
  { id: 'esli-pisti', name: 'Eşli Pişti', category: 'iskambil', players: '4', phase: 2, playable: true, engine: 'pisti', presetPlayers: 4, blurb: 'Karşılıklı eşlerle pişti.' },
  { id: 'pis-yedili', name: 'Pis Yedili', category: 'iskambil', players: '2–5', phase: 7, playable: true, engine: 'pisyedili', blurb: 'Yedi çek, as atla, kartını bitir.' },
  { id: 'king', name: 'King', category: 'iskambil', players: '4', phase: 7, playable: true, blurb: 'Cezalar ve kozlar, 20 el.' },
  { id: 'bric', name: 'Briç', category: 'iskambil', players: '4', phase: 7, playable: true, blurb: 'Kontrat briç, eşli deklarasyon.' },
  { id: '51', name: '51', category: 'iskambil', players: '2–4', phase: 5, playable: true, engine: 'elli1', blurb: 'Per aç, işle, elini bitir.' },
  { id: 'yanik', name: 'Yanık', category: 'iskambil', players: '2–4', phase: 5, playable: true, blurb: 'Ceza puanlı el bitirme oyunu.' },
  { id: 'blof', name: 'Blöf', category: 'iskambil', players: '3–6', phase: 7, playable: true, blurb: 'Kapalı at, yalanı yakala.' },
  { id: 'dost-kazigi', name: 'Dost Kazığı', category: 'iskambil', players: '2–5', phase: 7, playable: true, engine: 'kazik', blurb: 'Kartını en önce bitiren kazanır.' },
  { id: 'papaz', name: 'Papaz Kaçtı', category: 'iskambil', players: '2–6', phase: 2, playable: true, blurb: 'Çiftleri at, papazda kalma.' },
  { id: 'poker', name: 'Poker', category: 'iskambil', players: '2–6', phase: 8, playable: true, presetOptions: { variant: 'draw' }, blurb: 'Sanal puanla 5 kart poker.' },
  { id: 'texas-holdem', name: "Texas Hold'em", category: 'iskambil', players: '2–8', phase: 8, playable: true, engine: 'poker', presetOptions: { variant: 'holdem' }, blurb: 'İki kapalı, beş ortak kart.' },
  { id: 'omaha', name: 'Omaha', category: 'iskambil', players: '2–8', phase: 8, playable: true, engine: 'poker', presetOptions: { variant: 'omaha' }, blurb: 'Dört kapalı kartla hold’em.' },
  { id: 'blackjack', name: 'Blackjack', category: 'iskambil', players: '1–7', phase: 8, playable: true, blurb: '21’i geçmeden kasayı yen.' },
  { id: 'okey', name: 'Klasik Okey', category: 'tas', players: '4', phase: 5, playable: true, blurb: 'Gösterge, okey taşı, per ve çift.' },
  { id: '101-okey', name: '101 Okey', category: 'tas', players: '4', phase: 5, playable: true, engine: 'okey101', blurb: '101 ile el aç, işle, bitir.' },
  { id: 'tavla', name: 'Tavla', category: 'tas', players: '2', phase: 3, playable: true, blurb: 'Kapı al, kır, topla, mars et.' },
  { id: 'monopoli', name: 'Monopoli', category: 'masa', players: '2–6', phase: 6, playable: true, blurb: 'Mülk, kira, ev, otel ve takas.' },
  { id: 'satranc', name: 'Satranç', category: 'masa', players: '2', phase: 3, playable: true, blurb: 'Tam kurallı satranç ve saat.' },
  { id: 'kizma-birader', name: 'Kızma Birader', category: 'masa', players: '2–4', phase: 3, playable: true, engine: 'kizma', blurb: 'Zar at, taşını eve götür.' },
  { id: 'amiral-batti', name: 'Amiral Battı', category: 'strateji', players: '2', phase: 6, playable: true, engine: 'amiral', blurb: 'Gemileri gizle, koordinatla vur.' },
  { id: 'cin-damasi', name: 'Çin Daması', category: 'strateji', players: '2, 3, 4, 6', phase: 4, playable: true, engine: 'cindamasi', blurb: 'Yıldız tahtada zincirleme atlama.' },
  { id: 'xiangqi', name: 'Çin Satrancı (Xiangqi)', category: 'strateji', players: '2', phase: 4, playable: true, blurb: 'Nehir, saray, top ve general.' },
  { id: 'scrabble-tr', name: 'Scrabble Türkçe', category: 'kelime', players: '2–4', phase: 4, playable: true, engine: 'scrabble', presetOptions: { lang: 'tr' }, blurb: 'Türk alfabesiyle kelime kur.' },
  { id: 'scrabble-en', name: 'Scrabble İngilizce', category: 'kelime', players: '2–4', phase: 4, playable: true, engine: 'scrabble', presetOptions: { lang: 'en' }, blurb: 'İngilizce kelime ve öğrenme modu.' },
  { id: 'tombala', name: 'Tombala', category: 'aile', players: '2–20', phase: 6, playable: true, blurb: 'Çinko, çinko, tombala!' },
];

export const catalogById = (id: string) => CATALOG.find((c) => c.id === id);
