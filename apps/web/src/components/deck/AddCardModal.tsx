import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { CardType, CardRole } from '../../types';
import { upsertDeckCard } from '../../db/queries';
import { useDashboardStore } from '../../store/dashboardStore';

interface Props {
  onClose: () => void;
}

export function AddCardModal({ onClose }: Props) {
  const { t } = useTranslation('deck');
  const { activeDeckId } = useDashboardStore();
  const [name, setName] = useState('');
  const [count, setCount] = useState(1);
  const [type, setType] = useState<CardType>('Pokemon');
  const [role, setRole] = useState<CardRole>('attacker');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const ROLES_BY_TYPE: Record<CardType, CardRole[]> = {
    Pokemon: ['attacker', 'tech'],
    Trainer: ['supporter', 'item', 'stadium', 'tech'],
    Energy: ['energy'],
  };

  const handleTypeChange = (t: CardType) => {
    setType(t);
    setRole(ROLES_BY_TYPE[t][0]);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await upsertDeckCard(
      { name: name.trim(), count, type, role, cardId: 0 },
      activeDeckId ?? undefined,
    );
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-card-modal-title"
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm shadow-xl"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 id="add-card-modal-title" className="text-white font-semibold">
            {t('addCardModal.title')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('close', { ns: 'common' })}
            className="text-gray-500 hover:text-gray-300"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('addCardModal.cardName')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('addCardModal.cardNamePlaceholder')}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">{t('addCardModal.count')}</label>
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
              <label className="block text-xs text-gray-400 mb-1">{t('addCardModal.type')}</label>
              <select
                value={type}
                onChange={(e) => handleTypeChange(e.target.value as CardType)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
              >
                <option value="Pokemon">{t('cardTypes.Pokemon')}</option>
                <option value="Trainer">{t('cardTypes.Trainer')}</option>
                <option value="Energy">{t('cardTypes.Energy')}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('addCardModal.role')}</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as CardRole)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
            >
              {ROLES_BY_TYPE[type].map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="btn-ghost flex-1 justify-center text-sm">
            {t('cancel', { ns: 'common' })}
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="btn-primary flex-1 justify-center text-sm disabled:opacity-50"
          >
            {saving ? t('saving', { ns: 'common' }) : t('addCardModal.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
