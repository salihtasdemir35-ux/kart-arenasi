import { RULES } from '@kart/engine';
import { Modal } from '../components/ui';

export function RulesModal({ engineId, name, open, onClose }: { engineId: string; name: string; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={`${name} kuralları`}>
      <ol className="flex list-decimal flex-col gap-2 pl-5 leading-relaxed text-fildisi/90">
        {(RULES[engineId] ?? []).map((r) => <li key={r}>{r}</li>)}
      </ol>
    </Modal>
  );
}
