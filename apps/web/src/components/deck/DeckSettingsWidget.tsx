import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Plus, Settings2 } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { SidePanel } from './SidePanel';

// ─── Deck Settings ────────────────────────────────────────────────────────────

/** Deck name / variant / slug editing and "new variant" — extracted from
 *  DeckPage so the coach layout's Deck › My lists can use it too (Spec 7 §6). */
export function DeckSettingsWidget() {
  const { t } = useTranslation('deck');
  const { activeDeck, updateCurrentDeck, duplicateDeckAsVariant } = useDashboardStore();

  const [archetypeName, setArchetypeName] = useState(activeDeck?.archetypeName ?? '');
  const [variant, setVariant] = useState(activeDeck?.variant ?? '');
  const [archetype, setArchetype] = useState(activeDeck?.archetype ?? '');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newVariantName, setNewVariantName] = useState('');
  const [copying, setCopying] = useState(false);
  const [prevDeckId, setPrevDeckId] = useState(activeDeck?.id);

  // Reset the form fields when the active deck changes (adjust-state-during-render pattern).
  if (activeDeck?.id !== prevDeckId) {
    setPrevDeckId(activeDeck?.id);
    setArchetypeName(activeDeck?.archetypeName ?? '');
    setVariant(activeDeck?.variant ?? '');
    setArchetype(activeDeck?.archetype ?? '');
  }

  if (!activeDeck) return null;

  const dirty =
    archetypeName.trim() !== (activeDeck.archetypeName ?? '') ||
    variant.trim() !== (activeDeck.variant ?? '') ||
    archetype.trim() !== (activeDeck.archetype ?? '');

  const handleSave = async () => {
    await updateCurrentDeck({
      archetype: archetype.trim(),
      archetypeName: archetypeName.trim(),
      variant: variant.trim(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleCreateVariant = async () => {
    if (!newVariantName.trim()) return;
    setCopying(true);
    await duplicateDeckAsVariant(newVariantName.trim(), { copyCards: true });
    setCopying(false);
    setNewVariantName('');
  };

  return (
    <SidePanel
      icon={<Settings2 className="w-4 h-4" />}
      title={t('settings.title')}
      description={t('settings.description')}
    >
      <div className="flex flex-col gap-4 h-full">
        <div className="space-y-2">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1 font-bold">
              {t('settings.archetype')}
            </label>
            <input
              type="text"
              value={archetypeName}
              onChange={(e) => setArchetypeName(e.target.value)}
              placeholder={t('settings.archetypePlaceholder')}
              className="input w-full px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1 font-bold">
              {t('settings.variantLabel')}
            </label>
            <input
              type="text"
              value={variant}
              onChange={(e) => setVariant(e.target.value)}
              placeholder={t('settings.variantPlaceholder')}
              className="input w-full px-3 py-1.5 text-sm"
            />
          </div>
          {showAdvanced ? (
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1 font-bold">
                {t('settings.slugLabel')}
              </label>
              <input
                type="text"
                value={archetype}
                onChange={(e) => setArchetype(e.target.value)}
                placeholder="n-zoroark"
                className="input w-full px-3 py-1.5 text-sm font-mono"
              />
              <p className="text-[11px] text-slate-400 mt-1">{t('settings.slugHint')}</p>
            </div>
          ) : (
            <button
              onClick={() => setShowAdvanced(true)}
              className="text-[11px] text-slate-500 hover:text-brand-700 transition-colors"
            >
              {t('settings.advancedToggle')}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!archetypeName.trim() || !dirty}
            className="btn-primary w-full justify-center text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saved
              ? t('settings.saved')
              : dirty
                ? t('settings.saveChanges')
                : t('settings.upToDate')}
          </button>
        </div>

        <div className="border-t border-slate-200" />

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Copy className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
              {t('settings.newVariantTitle')}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            {t('settings.newVariantHint', { archetype: activeDeck.archetypeName })}
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newVariantName}
              onChange={(e) => setNewVariantName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateVariant()}
              placeholder={t('settings.variantNamePlaceholder')}
              className="input flex-1 px-3 py-1.5 text-sm"
            />
            <button
              onClick={handleCreateVariant}
              disabled={!newVariantName.trim() || copying}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 transition-colors disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              {copying ? '…' : t('settings.create')}
            </button>
          </div>
        </div>
      </div>
    </SidePanel>
  );
}
