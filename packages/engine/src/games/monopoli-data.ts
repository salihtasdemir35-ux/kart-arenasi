/** Kart Arenası Monopoli: özgün Türkiye tahtası. Fiyat/kira tablosu klasik oyun mekaniğidir. */

export type SquareKind = 'baslangic' | 'mulk' | 'gar' | 'idare' | 'sans' | 'fon' | 'vergi' | 'hapis' | 'otopark' | 'hapse-gir';
export interface Square {
  name: string;
  kind: SquareKind;
  price?: number;
  group?: number; // renk grubu 0–7; garlar 8, idareler 9
  rents?: number[]; // [arsa, 1 ev, 2, 3, 4, otel]
  house?: number;
  tax?: number;
}

export const GROUP_COLORS = ['#8B5A2B', '#7EC8E3', '#D4588C', '#E8913A', '#C8352B', '#E8C547', '#2E8B57', '#2B4BA0', '#555', '#999'];
export const GROUP_NAMES = ['Kahverengi', 'Açık mavi', 'Pembe', 'Turuncu', 'Kırmızı', 'Sarı', 'Yeşil', 'Lacivert', 'Garlar', 'İdareler'];

const m = (name: string, group: number, price: number, house: number, rents: number[]): Square => ({ name, kind: 'mulk', group, price, house, rents });
const gar = (name: string): Square => ({ name, kind: 'gar', group: 8, price: 200 });
const idare = (name: string): Square => ({ name, kind: 'idare', group: 9, price: 150 });

export const BOARD: Square[] = [
  { name: 'Başlangıç', kind: 'baslangic' },
  m('Tarlabaşı', 0, 60, 50, [2, 10, 30, 90, 160, 250]),
  { name: 'Kamu Fonu', kind: 'fon' },
  m('Dolapdere', 0, 60, 50, [4, 20, 60, 180, 320, 450]),
  { name: 'Gelir Vergisi', kind: 'vergi', tax: 200 },
  gar('Haydarpaşa Garı'),
  m('Balat', 1, 100, 50, [6, 30, 90, 270, 400, 550]),
  { name: 'Şans', kind: 'sans' },
  m('Fener', 1, 100, 50, [6, 30, 90, 270, 400, 550]),
  m('Kuzguncuk', 1, 120, 50, [8, 40, 100, 300, 450, 600]),
  { name: 'Hapis / Ziyaret', kind: 'hapis' },
  m('Moda', 2, 140, 100, [10, 50, 150, 450, 625, 750]),
  idare('Elektrik İdaresi'),
  m('Üsküdar', 2, 140, 100, [10, 50, 150, 450, 625, 750]),
  m('Beşiktaş', 2, 160, 100, [12, 60, 180, 500, 700, 900]),
  gar('Sirkeci Garı'),
  m('Alsancak', 3, 180, 100, [14, 70, 200, 550, 750, 950]),
  { name: 'Kamu Fonu', kind: 'fon' },
  m('Karşıyaka', 3, 180, 100, [14, 70, 200, 550, 750, 950]),
  m('Bornova', 3, 200, 100, [16, 80, 220, 600, 800, 1000]),
  { name: 'Ücretsiz Otopark', kind: 'otopark' },
  m('Kızılay', 4, 220, 150, [18, 90, 250, 700, 875, 1050]),
  { name: 'Şans', kind: 'sans' },
  m('Bahçelievler', 4, 220, 150, [18, 90, 250, 700, 875, 1050]),
  m('Çankaya', 4, 240, 150, [20, 100, 300, 750, 925, 1100]),
  gar('Ankara Garı'),
  m('Nilüfer', 5, 260, 150, [22, 110, 330, 800, 975, 1150]),
  m('Mudanya', 5, 260, 150, [22, 110, 330, 800, 975, 1150]),
  idare('Su İdaresi'),
  m('Uludağ', 5, 280, 150, [24, 120, 360, 850, 1025, 1200]),
  { name: 'Hapse Gir', kind: 'hapse-gir' },
  m('Konyaaltı', 6, 300, 200, [26, 130, 390, 900, 1100, 1275]),
  m('Lara', 6, 300, 200, [26, 130, 390, 900, 1100, 1275]),
  { name: 'Kamu Fonu', kind: 'fon' },
  m('Kaleiçi', 6, 320, 200, [28, 150, 450, 1000, 1200, 1400]),
  gar('Basmane Garı'),
  { name: 'Şans', kind: 'sans' },
  m('Bebek', 7, 350, 200, [35, 175, 500, 1100, 1300, 1500]),
  { name: 'Lüks Vergisi', kind: 'vergi', tax: 100 },
  m('Nişantaşı', 7, 400, 200, [50, 200, 600, 1400, 1700, 2000]),
];

export const GROUP_SQUARES: number[][] = Array.from({ length: 10 }, (_, g) => BOARD.map((s, i) => (s.group === g ? i : -1)).filter((i) => i >= 0));
export const JAIL = 10;

export type CardEffect =
  | { t: 'git'; to: number }
  | { t: 'enYakin'; kind: 'gar' | 'idare' }
  | { t: 'geri'; n: number }
  | { t: 'hapis' }
  | { t: 'hapisKart' }
  | { t: 'para'; amount: number }
  | { t: 'herkestenAl'; amount: number }
  | { t: 'herkeseOde'; amount: number }
  | { t: 'tamir'; house: number; hotel: number };
export interface Card { text: string; e: CardEffect }

export const SANS: Card[] = [
  { text: 'Başlangıç’a ilerle (200 TL al).', e: { t: 'git', to: 0 } },
  { text: 'Çankaya’ya ilerle. Başlangıç’tan geçersen 200 TL al.', e: { t: 'git', to: 24 } },
  { text: 'Moda’ya ilerle. Başlangıç’tan geçersen 200 TL al.', e: { t: 'git', to: 11 } },
  { text: 'Nişantaşı’na ilerle.', e: { t: 'git', to: 39 } },
  { text: 'Haydarpaşa Garı’na git. Başlangıç’tan geçersen 200 TL al.', e: { t: 'git', to: 5 } },
  { text: 'En yakın gara ilerle. Sahibi varsa iki kat kira öde.', e: { t: 'enYakin', kind: 'gar' } },
  { text: 'En yakın gara ilerle. Sahibi varsa iki kat kira öde.', e: { t: 'enYakin', kind: 'gar' } },
  { text: 'En yakın idareye ilerle. Sahibi varsa zarın 10 katını öde.', e: { t: 'enYakin', kind: 'idare' } },
  { text: 'Banka sana 50 TL kâr payı ödüyor.', e: { t: 'para', amount: 50 } },
  { text: 'Hapisten çıkış kartı. Saklayabilirsin.', e: { t: 'hapisKart' } },
  { text: '3 kare geri git.', e: { t: 'geri', n: 3 } },
  { text: 'Doğruca hapse gir. Başlangıç’tan geçme.', e: { t: 'hapis' } },
  { text: 'Mülklerini tamir ettir: her ev için 25 TL, her otel için 100 TL öde.', e: { t: 'tamir', house: 25, hotel: 100 } },
  { text: 'Hız cezası: 15 TL öde.', e: { t: 'para', amount: -15 } },
  { text: 'Yönetim kurulu başkanı seçildin: her oyuncuya 50 TL öde.', e: { t: 'herkeseOde', amount: 50 } },
  { text: 'Yatırımın getiri sağladı: 150 TL al.', e: { t: 'para', amount: 150 } },
];
export const FON: Card[] = [
  { text: 'Başlangıç’a ilerle (200 TL al).', e: { t: 'git', to: 0 } },
  { text: 'Banka hatası lehine: 200 TL al.', e: { t: 'para', amount: 200 } },
  { text: 'Doktor masrafı: 50 TL öde.', e: { t: 'para', amount: -50 } },
  { text: 'Hisse satışından 50 TL al.', e: { t: 'para', amount: 50 } },
  { text: 'Hapisten çıkış kartı. Saklayabilirsin.', e: { t: 'hapisKart' } },
  { text: 'Doğruca hapse gir. Başlangıç’tan geçme.', e: { t: 'hapis' } },
  { text: 'Tatil fonun doldu: 100 TL al.', e: { t: 'para', amount: 100 } },
  { text: 'Vergi iadesi: 20 TL al.', e: { t: 'para', amount: 20 } },
  { text: 'Doğum günün: her oyuncudan 10 TL al.', e: { t: 'herkestenAl', amount: 10 } },
  { text: 'Hayat sigortan doldu: 100 TL al.', e: { t: 'para', amount: 100 } },
  { text: 'Hastane masrafı: 100 TL öde.', e: { t: 'para', amount: -100 } },
  { text: 'Okul taksiti: 50 TL öde.', e: { t: 'para', amount: -50 } },
  { text: 'Danışmanlık ücreti: 25 TL al.', e: { t: 'para', amount: 25 } },
  { text: 'Sokak onarımı: her ev için 40 TL, her otel için 115 TL öde.', e: { t: 'tamir', house: 40, hotel: 115 } },
  { text: 'Güzellik yarışmasında ikinci oldun: 10 TL al.', e: { t: 'para', amount: 10 } },
  { text: 'Miras kaldı: 100 TL al.', e: { t: 'para', amount: 100 } },
];
