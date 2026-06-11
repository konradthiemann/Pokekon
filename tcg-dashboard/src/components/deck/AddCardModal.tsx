import { useState } from 'react';
import { X } from 'lucide-react';
import type { CardType, CardRole } from '../../types';
import { upsertDeckCard } from '../../db/queries';
import { useDashboardStore } from '../../store/dashboardStore';

interface Props {
  onClose: () => void;
}

export function AddCardModal({ onClose }: Props) {
  const { activeDeckId } = useDashboardStore();
  const [name, setName]   = useState('');
  const [count, setCount] = useState(1);
  const [type, setType]   = useState<CardType>('Pokemon');
  const [role, setRole]   = useState<CardRole>('attacker');
  const [saving, setSaving] = useState(false);

  const ROLES_BY_TYPE: Record<CardType, CardRole[]> = {
    Pokemon: ['attacker', 'tech'],
    Trainer: ['supporter', 'item', 'stadium', 'tech'],
    Energy:  ['energy'],
  };

  const handleTypeChange = (t: CardType) => {
    setType(t);
    setRole(ROLES_BY_TYPE[t][0]);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await upsertDeckCard({ name: name.trim(), count, type, role, cardId: 0 }, activeDeckId ?? undefined);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-semibold">Add Card</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Card Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Charizard ex"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Count</label>
              <input
                type="number"
                min={1}
                max={4}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => handleTypeChange(e.target.value as CardType)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
              >
                <option>Pokemon</option>
                <option>Trainer</option>
                <option>Energy</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as CardRole)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
            >
              {ROLES_BY_TYPE[type].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="btn-ghost flex-1 justify-center text-sm">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="btn-primary flex-1 justify-center text-sm disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Add Card'}
          </button>
        </div>
      </div>
    </div>
  );
}
