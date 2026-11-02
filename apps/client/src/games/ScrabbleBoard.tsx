import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ALPHABET, PREMIUM, analyzePlacement, generateMoves, hasDictionary, isWord, type PlacedTile, type ScrabbleView } from '@kart/engine';
import { Modal } from '../components/ui';
import { TurnHint, Who, relSeats, type TableProps } from './common';

const PREM_STYLE: Record<string, [string, string]> = {
  TW: ['bg-cay text-fildisi', 'K×3'], DW: ['bg-cay-300 text-ceviz', 'K×2'], TL: ['bg-[#2F5D8A] text-fildisi', 'H×3'], DL: ['bg-[#9CC3E0] text-ceviz', 'H×2'],
};

function Tile({ l, pts, blank, small, tentative }: { l: string; pts: number; blank?: boolean; small?: boolean; tentative?: boolean }) {
  return (
    <span className={`relative flex h-full w-full items-center justify-center rounded-[3px] font-black shadow-[inset_0_-2px_0_rgba(0,0,0,.18)] ${tentative ? 'bg-pirinc-300 text-ceviz' : 'bg-fildisi text-ceviz'} ${small ? 'text-[min(3vw,0.85rem)]' : 'text-xl'}`}>
      <span className={blank ? 'text-cay' : ''}>{l === '?' ? '' : l}</span>
      {!blank && l !== '?' && <span className={`absolute bottom-0 right-0.5 font-bold ${small ? 'text-[min(1.6vw,0.45rem)]' : 'text-[0.6rem]'}`}>{pts}</span>}
    </span>
  );
}

export function WordMeaning({ word, lang }: { word: string; lang: 'tr' | 'en' }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (lang !== 'en') return;
    let alive = true;
    fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word.toLowerCase()))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setText(j?.[0]?.meanings?.[0]?.definitions?.[0]?.definition ?? 'Anlam bulunamadı.'); })
      .catch(() => alive && setText('Anlam için internet bağlantısı gerekir.'));
    return () => { alive = false; };
  }, [word, lang]);
  if (lang === 'tr') return <a className="text-pirinc-300 underline" href={`https://sozluk.gov.tr/?ara=${encodeURIComponent(word.toLocaleLowerCase('tr-TR'))}`} target="_blank" rel="noreferrer">TDK sözlüğünde aç</a>;
  return <p className="text-sm text-fildisi/85">{text ?? 'Yükleniyor…'}</p>;
}

export function ScrabbleBoard({ view: v, names, avatars, offline, onAction }: TableProps<ScrabbleView>) {
  const [placed, setPlaced] = useState<(PlacedTile & { r: number })[]>([]);
  const [order, setOrder] = useState<number[]>(() => v.rack.map((_, i) => i));
  const [sel, setSel] = useState<number | null>(null);
  const [blankAt, setBlankAt] = useState<{ i: number; r: number } | null>(null);
  const [swap, setSwap] = useState<Set<number> | null>(null);
  const [meaning, setMeaning] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const mine = v.me !== null && v.turn === v.me && v.phase !== 'over';
  const rackKey = v.rack.join('');
  useEffect(() => { setPlaced([]); setSel(null); setSwap(null); setOrder(v.rack.map((_, i) => i)); setHint(null); }, [rackKey, v.history.length, v.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const usedRack = new Set(placed.map((p) => p.r));
  const pendingSet = new Map((v.pending?.tiles ?? []).map((t) => [t.i, t]));

  const preview = useMemo(() => {
    if (!placed.length) return null;
    try {
      const r = analyzePlacement(v.board, v.lang, placed.map(({ i, l, as }) => ({ i, l, as })));
      const bad = hasDictionary(v.lang) && v.mode === 'otomatik' ? r.words.filter((w) => !isWord(v.lang, w.word)).map((w) => w.word) : [];
      return { ok: bad.length === 0, text: `${r.words.map((w) => w.word).join(', ')} · ${r.score} puan`, bad };
    } catch (e: any) { return { ok: false, text: e.message, bad: [] }; }
  }, [placed, v.board, v.lang, v.mode]);

  const clickCell = (i: number) => {
    if (!mine || v.phase !== 'play') return;
    const existing = placed.find((p) => p.i === i);
    if (existing) { setPlaced(placed.filter((p) => p.i !== i)); return; }
    if (v.board[i] || sel === null) return;
    const l = v.rack[sel];
    if (l === '?') { setBlankAt({ i, r: sel }); return; }
    setPlaced([...placed, { i, l, r: sel }]);
    setSel(null);
  };
  const others = relSeats(v.n, v.me).slice(1);
  const last = v.history[v.history.length - 1];

  return (
    <div className="flex h-full flex-col items-center gap-2">
      <div className="flex flex-wrap justify-center gap-2">
        {others.map((s) => <Who key={s} seat={s} names={names} avatars={avatars} offline={offline} active={v.turn === s && v.phase !== 'over'} sub={`${v.scores[s]} puan · ${v.rackCounts[s]} taş`} />)}
      </div>
      <div className="w-full max-w-[min(96vw,34rem)] rounded-xl bg-[#3E6B55] p-1 shadow-2xl ring-4 ring-pirinc-700">
        <div className="grid aspect-square grid-cols-[repeat(15,1fr)] grid-rows-[repeat(15,1fr)] gap-[1px]" role="grid" aria-label="Scrabble tahtası">
          {Array.from({ length: 225 }).map((_, i) => {
            const c = v.board[i];
            const tent = placed.find((p) => p.i === i);
            const pend = pendingSet.get(i);
            const prem = PREMIUM[i];
            return (
              <button key={i} onClick={() => clickCell(i)} aria-label={`kare ${Math.floor(i / 15) + 1}-${(i % 15) + 1}${c ? ' ' + c.l : ''}`}
                className={`relative flex items-center justify-center rounded-[2px] text-[min(1.7vw,0.5rem)] font-bold ${c || tent || pend ? '' : prem ? PREM_STYLE[prem][0] : 'bg-[#E7DDC6]'}`}>
                {c ? <Tile l={c.l} pts={v.points[c.l]} blank={c.blank} small />
                  : tent ? <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="h-full w-full"><Tile l={tent.as ?? tent.l} pts={v.points[tent.l]} blank={tent.l === '?'} small tentative /></motion.span>
                  : pend ? <span className="h-full w-full opacity-80 ring-2 ring-cay"><Tile l={pend.as ?? pend.l} pts={v.points[pend.l]} blank={pend.l === '?'} small tentative /></span>
                  : i === 112 ? <span className="text-[min(3vw,0.9rem)]">★</span> : prem ? PREM_STYLE[prem][1] : ''}
              </button>
            );
          })}
        </div>
      </div>

      {preview && <p role="status" className={`text-center text-sm ${preview.ok ? 'text-cuha-200' : 'text-cay-300'}`}>{preview.bad.length ? `Sözlükte yok: ${preview.bad.join(', ')}` : preview.text}</p>}
      {last && !preview && (
        <p className="text-center text-xs text-fildisi/70">
          {names[last.seat]}: {last.kind === 'kelime' ? <>{last.words.map((w) => <button key={w.word + w.cells[0]} className="mx-0.5 underline decoration-dotted" onClick={() => setMeaning(w.word)}>{w.word}</button>)} (+{last.score})</> : last.note ?? (last.kind === 'pas' ? 'pas geçti' : '')}
        </p>
      )}

      {mine && v.phase === 'challenge' && v.pending && (
        <div className="panel flex flex-col items-center gap-2 p-3">
          <p className="text-sm">{names[v.pending.seat]} şunları oynadı: <b>{v.pending.words.map((w) => w.word).join(', ')}</b> ({v.pending.score} puan)</p>
          <div className="flex gap-2">
            <button className="btn-brass" onClick={() => onAction({ type: 'accept' })}>Kabul et</button>
            <button className="btn-red" onClick={() => onAction({ type: 'challenge' })}>İtiraz et</button>
          </div>
          <p className="text-xs text-fildisi/60">Kelime geçerliyse itiraz eden sırasını kaybeder.</p>
        </div>
      )}

      <TurnHint mine={mine} text={v.phase === 'over' ? 'Oyun bitti' : !mine ? `${names[v.turn]} ${v.phase === 'challenge' ? 'karar veriyor…' : 'düşünüyor…'}` : v.phase === 'challenge' ? 'Kelimeyi kabul et ya da itiraz et' : swap ? 'Değiştirilecek taşları seç' : sel === null ? 'Bir taş seç, sonra kareye dokun' : 'Şimdi bir kareye dokun'} />

      <div className="flex items-center gap-1.5" role="group" aria-label="Rafın">
        {order.map((r) => {
          const l = v.rack[r];
          if (l === undefined) return null;
          const used = usedRack.has(r);
          const chosen = swap ? swap.has(r) : sel === r;
          return (
            <motion.button layout key={r + l} disabled={used || !mine} onClick={() => {
              if (swap) { const n = new Set(swap); n.has(r) ? n.delete(r) : n.add(r); setSwap(n); } else setSel(sel === r ? null : r);
            }} aria-label={l === '?' ? 'joker' : l}
              className={`h-[min(11vw,3rem)] w-[min(11vw,3rem)] transition ${used ? 'opacity-20' : ''} ${chosen ? '-translate-y-2 ring-4 ring-pirinc' : ''}`}>
              <Tile l={l} pts={v.points[l]} blank={l === '?'} />
            </motion.button>
          );
        })}
      </div>

      {mine && v.phase === 'play' && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {!swap ? (
            <>
              <button className="btn-brass px-5" disabled={!preview?.ok} onClick={() => onAction({ type: 'place', tiles: placed.map(({ i, l, as }) => ({ i, l, as })) })}>Oyna</button>
              <button className="btn-ghost px-3" disabled={!placed.length} onClick={() => setPlaced([])}>Geri al</button>
              <button className="btn-ghost px-3" onClick={() => setOrder((o) => [...o].sort(() => Math.random() - 0.5))}>Karıştır</button>
              <button className="btn-ghost px-3" disabled={v.bagCount < 7} onClick={() => { setPlaced([]); setSwap(new Set()); }}>Değiştir</button>
              <button className="btn-ghost px-3" onClick={() => onAction({ type: 'pass' })}>Pas</button>
              {v.learning && hasDictionary(v.lang) && (
                <button className="btn-ghost px-3" onClick={() => {
                  const m = generateMoves(v.board, v.lang, v.rack, 2000)[0];
                  setHint(m ? `${m.words[0].word} (${m.score} puan)` : 'Bu elle oynanacak kelime yok, harf değiştirmeyi dene.');
                }}>İpucu</button>
              )}
            </>
          ) : (
            <>
              <button className="btn-brass" disabled={!swap.size} onClick={() => onAction({ type: 'exchange', letters: [...swap].map((r) => v.rack[r]) })}>{swap.size} taşı değiştir</button>
              <button className="btn-ghost" onClick={() => setSwap(null)}>Vazgeç</button>
            </>
          )}
        </div>
      )}
      {hint && <p className="text-center text-sm text-pirinc-300">İpucu: {hint}</p>}
      {v.me !== null && <Who seat={v.me} names={names} avatars={avatars} active={mine} sub={`${v.scores[v.me]} puan · torbada ${v.bagCount} taş`} />}

      <Modal open={!!blankAt} onClose={() => setBlankAt(null)} title="Joker hangi harf olsun?">
        <div className="grid grid-cols-6 gap-1.5">
          {ALPHABET[v.lang].map((l) => (
            <button key={l} className="btn-ghost h-11 text-lg font-black" onClick={() => { setPlaced([...placed, { i: blankAt!.i, l: '?', as: l, r: blankAt!.r }]); setBlankAt(null); setSel(null); }}>{l}</button>
          ))}
        </div>
      </Modal>
      <Modal open={!!meaning} onClose={() => setMeaning(null)} title={meaning ?? ''}>
        {meaning && <WordMeaning word={meaning} lang={v.lang} />}
      </Modal>
    </div>
  );
}
