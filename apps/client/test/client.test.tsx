import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Batak, Papaz, Pisti, Satranc, Tavla, Kizma, Xiangqi, CinDamasi, Scrabble, OkeyGame, Okey101, Elli1, Amiral, Tombala, Monopoli, Blof, King, tileId, okeyOf, registerDictionary, seededRng, CATALOG } from '@kart/engine';
import fs from 'node:fs';
import path from 'node:path';
import { GameTable } from '../src/games/GameTable';
import { Home } from '../src/screens/Home';
import { useLocalGame } from '../src/lib/local';
import { ResultOverlay } from '../src/screens/Result';

afterEach(cleanup);
const names = ['Sen', 'Bilgisayar 1', 'Bilgisayar 2', 'Bilgisayar 3'];
const av = ['🦊', '🤖', '🤖', '🤖'];

describe('Arayüz', () => {
  it('ana sayfa oynanabilir oyunları ve gelecek oyunları gösterir', () => {
    render(<Home onPick={() => {}} />);
    const ready = CATALOG.filter((c) => c.playable);
    expect(ready.map((c) => c.id)).toEqual(expect.arrayContaining(['pisti', 'batak', 'papaz', 'tavla', 'satranc', 'kizma-birader']));
    for (const c of ready) expect(screen.getAllByText(c.name).length).toBeGreaterThan(0);
    expect(ready).toHaveLength(31);
    fireEvent.click(screen.getByRole('button', { name: 'Kelime' }));
    expect(screen.getAllByRole('button').filter((b) => /Scrabble/.test(b.textContent ?? ''))).toHaveLength(2);
  });

  it('Pişti masası: elde 4 kart, sıra bendeyse kartlar tıklanabilir ve doğru hamleyi gönderir', () => {
    const s = Pisti.setup({ players: 2 }, seededRng(1));
    const s0 = { ...s, turn: 0 };
    const onAction = vi.fn();
    render(<GameTable view={Pisti.view(s0, 0)} names={names} avatars={av} onAction={onAction} />);
    const card = s0.hands[0][0];
    const btns = screen.getAllByRole('button').filter((b) => !(b as HTMLButtonElement).disabled);
    expect(btns).toHaveLength(4);
    fireEvent.click(btns.find((b) => b.getAttribute('aria-label')?.length)!);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'play' }));
    expect(s0.hands[0]).toContain(card);
  });

  it('Batak masası ihalede Pas ve ihale düğmelerini gösterir', () => {
    let s = Batak.setup({ players: 4 }, seededRng(2));
    s = { ...s, turn: 0, bidTurn: 0 };
    const onAction = vi.fn();
    render(<GameTable view={Batak.view(s, 0)} names={names} avatars={av} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pas' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'pass' });
    expect(screen.getByRole('button', { name: '4' })).toBeTruthy();
  });

  it('Papaz masası sıra bendeyse rakibin kapalı kartlarını seçtirir', () => {
    const s = { ...Papaz.setup({ players: 3 }, seededRng(3)), turn: 0 };
    const onAction = vi.fn();
    render(<GameTable view={Papaz.view(s, 0)} names={names} avatars={av} onAction={onAction} />);
    const backs = screen.getAllByRole('button', { name: 'Kapalı kart seç' });
    expect(backs.length).toBe(s.hands[1].length);
    fireEvent.click(backs[0]);
    expect(onAction).toHaveBeenCalledWith({ type: 'draw', index: 0 });
  });

  it('sonuç ekranı kazananı adıyla, Papaz’da kaybedeni yazar', () => {
    render(<ResultOverlay result={{ winners: [2], scores: [1, 2, 9, 0], summary: '' }} names={names} mySeat={0}><span /></ResultOverlay>);
    expect(screen.getByText('Kazanan: Bilgisayar 2')).toBeTruthy();
    cleanup();
    render(<ResultOverlay result={{ winners: [0, 2], scores: [1, 0, 1], summary: '', loser: 1 }} names={names} mySeat={0}><span /></ResultOverlay>);
    expect(screen.getByText('Bilgisayar 1 papazla kaldı')).toBeTruthy();
    cleanup();
    render(<ResultOverlay result={{ winners: [1], scores: [404, 5, 6, 5], summary: '', lowerIsBetter: true }} names={names} mySeat={0}><span /></ResultOverlay>);
    expect(screen.getByText('404 ceza')).toBeTruthy();
    expect(screen.getAllByRole('listitem')[0].textContent).toContain('Bilgisayar 1');
  });
});

describe('Aşama 3 tahtaları', () => {
  it('Satranç: taşa sonra hedefe dokununca hamle gönderilir; yasal olmayan hedef seçilemez', () => {
    const onAction = vi.fn();
    render(<GameTable view={Satranc.view(Satranc.setup({ players: 2 }, seededRng(1)), 0)} names={names} avatars={av} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'e2 beyaz' }));
    fireEvent.click(screen.getByRole('button', { name: 'e5' }));
    expect(onAction).not.toHaveBeenCalled(); // geçersiz kare seçimi bırakır
    fireEvent.click(screen.getByRole('button', { name: 'e2 beyaz' }));
    fireEvent.click(screen.getByRole('button', { name: 'e4' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'move', from: 12, to: 28 });
  });
  it('Satranç: siyah oyuncu için tahta ters döner', () => {
    render(<GameTable view={Satranc.view(Satranc.setup({ players: 2 }, seededRng(1)), 1)} names={names} avatars={av} onAction={() => {}} />);
    const squares = screen.getAllByRole('button').filter((b) => /^[a-h][1-8]/.test(b.getAttribute('aria-label') ?? ''));
    expect(squares[0].getAttribute('aria-label')).toMatch(/^h1/);
  });
  it('Tavla: zar at düğmesi ve taş seçip hedefe gitme', () => {
    const onAction = vi.fn();
    let s = Tavla.setup({ players: 2 }, seededRng(2));
    s = { ...s, turn: 0, opening: null };
    const { rerender } = render(<GameTable view={Tavla.view(s, 0)} names={names} avatars={av} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Zar at' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'roll' });
    const rolled = Tavla.apply(s, 0, { type: 'roll' }, { int: () => 5 }); // 6-6
    rerender(<GameTable view={Tavla.view(rolled, 0)} names={names} avatars={av} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: /^24\. kapı/ }));
    fireEvent.click(screen.getByRole('button', { name: /^18\. kapı/ }));
    expect(onAction).toHaveBeenLastCalledWith({ type: 'move', from: 23, die: 6 });
  });
  it('Kızma Birader: zar at, oynanabilir taşa dokun', () => {
    const onAction = vi.fn();
    let s = { ...Kizma.setup({ players: 4 }, seededRng(3)), turn: 0 };
    const { rerender } = render(<GameTable view={Kizma.view(s, 0)} names={names} avatars={av} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Zar at' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'roll' });
    s = Kizma.apply(s, 0, { type: 'roll' }, { int: () => 5 });
    rerender(<GameTable view={Kizma.view(s, 0)} names={names} avatars={av} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kırmızı taş 1' }));
    expect(onAction).toHaveBeenLastCalledWith({ type: 'move', token: 0 });
    expect((screen.getByRole('button', { name: 'Sarı taş 1' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Aşama 4 tahtaları', () => {
  it('Xiangqi: arabaya dokun, yasal kareye gönder', () => {
    const onAction = vi.fn();
    render(<GameTable view={Xiangqi.view(Xiangqi.setup({ players: 2 }, seededRng(1)), 0)} names={names} avatars={av} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: '1. sütun 1. sıra kırmızı Araba' }));
    fireEvent.click(screen.getByRole('button', { name: '1. sütun 2. sıra' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'move', from: 0, to: 9 });
  });
  it('Çin Daması: taşa dokununca hedefler çıkar, hedefe dokununca yol gönderilir', () => {
    const onAction = vi.fn();
    const s = { ...CinDamasi.setup({ players: 2 }, seededRng(2)), turn: 0 };
    const v = CinDamasi.view(s, 0);
    const { container } = render(<GameTable view={v} names={names} avatars={av} onAction={onAction} />);
    const move = v.legal[0];
    fireEvent.click(container.querySelector(`[aria-label="delik ${move.path[0]} Kırmızı"]`)!);
    fireEvent.click(container.querySelector(`[aria-label="delik ${move.path[move.path.length - 1]}"]`)!);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'move' }));
    const sent = onAction.mock.calls[0][0];
    expect(sent.path[0]).toBe(move.path[0]);
    expect(sent.path[sent.path.length - 1]).toBe(move.path[move.path.length - 1]);
  });
});

describe('Scrabble tahtası', () => {
  it('taş seç → kareye koy → önizleme → Oyna', () => {
    registerDictionary('en', fs.readFileSync(path.resolve(__dirname, '../public/dict/en.txt'), 'utf8').split('\n'));
    const s = { ...Scrabble.setup({ players: 2, options: { lang: 'en' } }, seededRng(1)), turn: 0 };
    s.racks[0] = [...'CATXQZE'];
    const onAction = vi.fn();
    render(<GameTable view={Scrabble.view(s, 0)} names={names} avatars={av} onAction={onAction} />);
    const put = (letter: string, cell: string) => {
      fireEvent.click(screen.getByRole('button', { name: letter }));
      fireEvent.click(screen.getByRole('button', { name: cell }));
    };
    put('C', 'kare 8-7'); put('A', 'kare 8-8'); put('T', 'kare 8-9');
    expect(screen.getByRole('status').textContent).toContain('CAT · 10 puan');
    fireEvent.click(screen.getByRole('button', { name: 'Oyna' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'place', tiles: [{ i: 111, l: 'C', as: undefined }, { i: 112, l: 'A', as: undefined }, { i: 113, l: 'T', as: undefined }] });
  });
});

describe('Okey masası', () => {
  it('ortadan çek; taş seç ve at; bitir yalnızca geçerliyse etkin', () => {
    const onAction = vi.fn();
    let s = OkeyGame.setup({ players: 4 }, seededRng(5));
    s = { ...s, turn: 0, phase: 'draw', dealer: 3 };
    const { rerender } = render(<GameTable view={OkeyGame.view(s, 0)} names={names} avatars={av} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: /^Ortadan/ }));
    expect(onAction).toHaveBeenCalledWith({ type: 'draw', from: 'pile' });
    s = OkeyGame.apply(s, 0, { type: 'draw', from: 'pile' }, seededRng(1));
    rerender(<GameTable view={OkeyGame.view(s, 0)} names={names} avatars={av} onAction={onAction} />);
    const tile = s.hands[0][0];
    const tiles = screen.getByLabelText('Istakan').querySelectorAll('button');
    expect(tiles.length).toBe(15);
    const btn = [...tiles].find((b) => b.getAttribute('aria-label')!.startsWith(tile >= 104 ? 'Sahte' : ''))!;
    fireEvent.click(btn);
    expect((screen.getByRole('button', { name: 'Bitir' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'At' }));
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'discard' }));
  });
});

describe('101 Okey masası', () => {
  it('Per kur → Öneri → El aç (101 ve üstü)', () => {
    const onAction = vi.fn();
    const s = Okey101.setup({ players: 4 }, seededRng(5));
    const t = (c: number, n: number) => tileId(c, n);
    const st = { ...s, indicator: tileId(3, 7), okey: okeyOf(tileId(3, 7)), turn: 0, phase: 'play' as const, taken: null };
    st.hands[0] = [t(0, 10), t(0, 11), t(0, 12), t(0, 13), t(1, 13), t(2, 13), t(3, 13), t(1, 9), t(1, 10), t(1, 11), t(2, 2)];
    render(<GameTable view={Okey101.view(st, 0)} names={names} avatars={av} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Per kur' }));
    expect((screen.getByRole('button', { name: 'El aç' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Öneri: en iyi per' }));
    expect(screen.getByText(/Toplam 115/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'El aç' }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'open' }));
    expect(onAction.mock.calls[0][0].melds.flat()).toHaveLength(10);
  });
});

describe('51 masası', () => {
  it('Per kur → Öneri → El aç (51 ve üstü)', () => {
    const onAction = vi.fn();
    const c = (suit: number, rank: number) => suit * 13 + rank - 1;
    const s = { ...Elli1.setup({ players: 2 }, seededRng(5)), turn: 0, phase: 'play' as const, taken: null };
    s.hands[0] = [c(0, 10), c(0, 11), c(0, 12), c(1, 13), c(2, 13), c(3, 13), c(2, 2)];
    render(<GameTable view={Elli1.view(s, 0)} names={names} avatars={av} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Per kur' }));
    fireEvent.click(screen.getByRole('button', { name: 'Öneri: en iyi per' }));
    expect(screen.getByText(/Toplam 60/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'El aç' }));
    expect(onAction.mock.calls[0][0].type).toBe('open');
  });
});

describe('Aşama 6 masaları', () => {
  it('Amiral Battı: rastgele diz → Hazırım; savaşta radar karesine dokununca ateş', () => {
    const onAction = vi.fn();
    const s = Amiral.setup({ players: 2 }, seededRng(1));
    const { rerender } = render(<GameTable view={Amiral.view(s, 0)} names={names} avatars={av} onAction={onAction} />);
    expect((screen.getByRole('button', { name: 'Hazırım' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Rastgele diz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hazırım' }));
    const placed = onAction.mock.calls[0][0];
    expect(placed.type).toBe('place');
    let t = Amiral.apply(s, 0, placed, seededRng(2));
    t = Amiral.apply(t, 1, Amiral.ai(Amiral.view(t, 1), 1, 'orta', seededRng(3)) as any, seededRng(3));
    t = { ...t, turn: 0 };
    rerender(<GameTable view={Amiral.view(t, 0)} names={names} avatars={av} onAction={onAction} />);
    fireEvent.click(screen.getByRole('grid', { name: 'Rakip alanı (radar)' }).querySelector('[aria-label="C4"]')!);
    expect(onAction).toHaveBeenLastCalledWith({ type: 'fire', cell: 23 });
  });
  it('Tombala: kart 15 numara gösterir, masayı açan "Numara çek" ile çeker', () => {
    const onAction = vi.fn();
    const s = Tombala.setup({ players: 4, options: { cards: 2 } }, seededRng(4));
    render(<GameTable view={Tombala.view(s, 0)} names={names} avatars={av} onAction={onAction} />);
    expect(screen.getAllByLabelText(/^Kartın/)).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Numara çek' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'draw' });
    cleanup();
    render(<GameTable view={Tombala.view(s, 2)} names={names} avatars={av} onAction={onAction} />);
    expect(screen.queryByRole('button', { name: 'Numara çek' })).toBeNull();
  });
});

describe('Monopoli masası', () => {
  it('Zar at; satın alma kararı; mülk paneli ve takas penceresi', () => {
    const onAction = vi.fn();
    let s = { ...Monopoli.setup({ players: 3 }, seededRng(1)), turn: 0 };
    const { rerender } = render(<GameTable view={Monopoli.view(s, 0)} names={names} avatars={av} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Zar at' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'roll' });
    s = Monopoli.apply(s, 0, { type: 'roll' }, { int: (() => { let k = 0; return () => (k++ % 2 ? 1 : 0); })() }); // 1+2 = 3
    rerender(<GameTable view={Monopoli.view(s, 0)} names={names} avatars={av} onAction={onAction} />);
    expect(screen.getByText(/Dolapdere/, { selector: 'b' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Satın al' }));
    expect(onAction).toHaveBeenLastCalledWith({ type: 'buy' });
    s = Monopoli.apply(s, 0, { type: 'buy' }, seededRng(1));
    s.owner[1] = 0;
    rerender(<GameTable view={Monopoli.view(s, 0)} names={names} avatars={av} onAction={onAction} />);
    expect(screen.getAllByRole('button', { name: /Ev kur/ })).toHaveLength(2); // iki mülkte de ev kurulabilir
    fireEvent.click(screen.getAllByRole('button', { name: /Ev kur/ })[0]);
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'build' }));
    fireEvent.click(screen.getByRole('button', { name: 'Takas teklif et' }));
    expect(screen.getByRole('dialog', { name: 'Takas teklifi' })).toBeTruthy();
  });
});

describe('Aşama 7 masaları', () => {
  it('Blöf: kart seç, iddia düğmesi; karar düğmeleri', () => {
    const onAction = vi.fn();
    const s = { ...Blof.setup({ players: 3 }, seededRng(1)), turn: 0, rank: 11 };
    s.hands[0] = ['S2', 'H5', 'D9'];
    const { rerender } = render(<GameTable view={Blof.view(s, 0)} names={names} avatars={av} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Maça 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kupa 5' }));
    fireEvent.click(screen.getByRole('button', { name: '2 kartı “Vale” diye at' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'play', cards: ['S2', 'H5'] });
    const t = Blof.apply(s, 0, { type: 'play', cards: ['S2', 'H5'] }, seededRng(1));
    rerender(<GameTable view={Blof.view(t, 1)} names={names} avatars={av} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Blöf!' }));
    expect(onAction).toHaveBeenLastCalledWith({ type: 'challenge' });
  });
  it('King: oyun seçim paneli ve kozlu seçimi', () => {
    const onAction = vi.fn();
    const s = { ...King.setup({ players: 4 }, seededRng(2)), chooser: 0, turn: 0 };
    render(<GameTable view={King.view(s, 0)} names={names} avatars={av} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rıfkı' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'choose', game: 'rifki' });
    fireEvent.click(screen.getByRole('button', { name: 'Kozlu Kupa' }));
    expect(onAction).toHaveBeenLastCalledWith({ type: 'choose', game: 'koz', trump: 'H' });
  });
});

describe('Tüm masalar', () => {
  it('31 oyunun her masası oyuncu ve seyirci görünümüyle hatasız çizilir', async () => {
    const { getModule } = await import('@kart/engine');
    for (const entry of CATALOG) {
      const mod = getModule(entry.engine ?? entry.id)!;
      const players = entry.presetPlayers ?? mod.playerCounts[Math.min(1, mod.playerCounts.length - 1)];
      const s = mod.setup({ players, options: { ...(entry.presetOptions ?? {}) } }, seededRng(3));
      for (const seat of [0, null]) {
        const { container } = render(<GameTable view={mod.view(s, seat)} names={names.concat(names, names, names, names)} avatars={av.concat(av, av, av, av)} onAction={() => {}} />);
        expect(container.textContent!.length, entry.id).toBeGreaterThan(5);
        expect(container.textContent).not.toContain('Oyun yükleniyor');
        cleanup();
      }
    }
  });
});

describe('Bilgisayara karşı oyun yöneticisi', () => {
  function Harness({ onState }: { onState: (g: any) => void }) {
    const g = useLocalGame({ gameId: 'pisti', engineId: 'pisti', players: 2, options: {}, difficulty: 'zor' }, 0);
    onState(g);
    return null;
  }
  it('Pişti’yi baştan sona oynar, yapay zekâ sırasındaki dokunuşu yok sayar, istatistik kaydeder', async () => {
    vi.useFakeTimers();
    let g: any;
    render(<Harness onState={(x) => (g = x)} />);
    for (let i = 0; i < 400 && !g.over; i++) {
      if (g.view.turn === 0) act(() => g.act(g.view.legal[0]));
      else {
        const before = JSON.stringify(g.view);
        act(() => g.act({ type: 'play', card: g.view.hand[0] ?? 'S2' })); // sırası değil
        expect(g.error).toBeNull();
        expect(JSON.stringify(g.view)).toBe(before);
        await act(async () => { vi.advanceTimersByTime(5); });
      }
    }
    expect(g.over).toBe(true);
    expect(g.result.winners.length).toBeGreaterThan(0);
    const stats = JSON.parse(localStorage.getItem('ka:localStats')!);
    expect(stats.games.pisti.played).toBe(1);
    vi.useRealTimers();
  });
});
