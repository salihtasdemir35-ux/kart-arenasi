import { useState } from 'react';
import { CATALOG, CATEGORY_NAMES, type CatalogEntry, type Category } from '@kart/engine';

const SUIT = ['♠', '♥', '♣', '♦'];

export function Home({ onPick }: { onPick: (e: CatalogEntry) => void }) {
  const [cat, setCat] = useState<Category | 'hepsi'>('hepsi');
  const list = CATALOG.filter((c) => c.playable && (cat === 'hepsi' || c.category === cat));
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pb-8 pt-4">
      <header className="flex items-center gap-3">
        <img src="./icon-192.png" alt="" className="h-14 w-14 rounded-2xl shadow-lg" />
        <div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Kart Arenası</h1>
          <p className="text-fildisi/70">{CATALOG.filter((c) => c.playable).length} oyun · masaya otur, arkadaşlarını çağır.</p>
        </div>
      </header>
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Kategori">
        {(['hepsi', ...Object.keys(CATEGORY_NAMES)] as (Category | 'hepsi')[]).map((c) => (
          <button key={c} onClick={() => setCat(c)} aria-pressed={cat === c}
            className={`chip whitespace-nowrap px-3 py-1.5 text-sm ${cat === c ? 'bg-pirinc text-ceviz' : 'bg-white/5 ring-1 ring-white/10'}`}>
            {c === 'hepsi' ? 'Hepsi' : CATEGORY_NAMES[c]}
          </button>
        ))}
      </div>
      <section aria-label="Oyunlar" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {list.map((g, i) => (
          <button key={g.id} onClick={() => onPick(g)}
            className="group relative flex aspect-[4/3] flex-col justify-between rounded-2xl bg-fildisi p-3 text-left text-ceviz shadow-[0_3px_0_#EFE6D2,0_14px_28px_rgba(0,0,0,.45)] transition hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pirinc-300 sm:aspect-[5/7]"
            style={{ transform: `rotate(${(i % 2 ? 1 : -1) * 0.8}deg)` }}>
            <span className={`text-3xl leading-none ${i % 2 ? 'text-cay' : 'text-ceviz'}`}>{SUIT[i % 4]}</span>
            <span>
              <span className="block text-lg font-black leading-tight">{g.name}</span>
              <span className="mt-1 hidden text-sm text-ceviz-400 sm:block">{g.blurb}</span>
              <span className="mt-1 block text-xs font-semibold text-cuha">{g.players} kişi</span>
            </span>
          </button>
        ))}
      </section>
    </div>
  );
}
