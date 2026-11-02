import { BatakTable } from './BatakTable';
import { PapazTable } from './PapazTable';
import { PistiTable } from './PistiTable';
import { ChessBoard } from './ChessBoard';
import { TavlaBoard } from './TavlaBoard';
import { KizmaBoard } from './KizmaBoard';
import { XiangqiBoard } from './XiangqiBoard';
import { CinBoard } from './CinBoard';
import { ScrabbleBoard } from './ScrabbleBoard';
import { OkeyBoard } from './OkeyBoard';
import { Okey101Board } from './Okey101Board';
import { Elli1Board } from './Elli1Board';
import { AmiralBoard } from './AmiralBoard';
import { TombalaBoard } from './TombalaBoard';
import { MonopoliBoard } from './MonopoliBoard';
import { BlofTable } from './BlofTable';
import { KingTable } from './KingTable';
import { PisTable, KazikTable, YanikTable } from './KartAtmaTables';
import { BricTable } from './BricTable';
import { PokerTable, BlackjackTable } from './CasinoTables';
import type { TableProps } from './common';

export function GameTable(props: TableProps) {
  switch (props.view?.game) {
    case 'pisti': return <PistiTable {...props} />;
    case 'batak': return <BatakTable {...props} />;
    case 'papaz': return <PapazTable {...props} />;
    case 'satranc': return <ChessBoard {...props} />;
    case 'tavla': return <TavlaBoard {...props} />;
    case 'kizma': return <KizmaBoard {...props} />;
    case 'xiangqi': return <XiangqiBoard {...props} />;
    case 'cindamasi': return <CinBoard {...props} />;
    case 'scrabble': return <ScrabbleBoard {...props} />;
    case 'okey': return <OkeyBoard {...props} />;
    case 'okey101': return <Okey101Board {...props} />;
    case 'elli1': return <Elli1Board {...props} />;
    case 'amiral': return <AmiralBoard {...props} />;
    case 'tombala': return <TombalaBoard {...props} />;
    case 'monopoli': return <MonopoliBoard {...props} />;
    case 'blof': return <BlofTable {...props} />;
    case 'king': return <KingTable {...props} />;
    case 'pisyedili': return <PisTable {...props} />;
    case 'kazik': return <KazikTable {...props} />;
    case 'yanik': return <YanikTable {...props} />;
    case 'bric': return <BricTable {...props} />;
    case 'poker': return <PokerTable {...props} />;
    case 'blackjack': return <BlackjackTable {...props} />;
    default: return <p className="p-6 text-center">Oyun yükleniyor…</p>;
  }
}
