import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Brain, Check, X } from 'lucide-react';
import { getAiSettings, updateAiSettings } from '../../lib/api';

/**
 * Central place to manage the server-side LLM analysis credentials (BYOK).
 * The key is stored encrypted server-side (user_ai_settings) and never returned
 * — we only ever learn whether one is set (`hasApiKey`). Reachable from the
 * account menu so it does not require opening a logged match.
 */
export function AiSettingsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('auth');
  const [token, setToken] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    getAiSettings()
      .then((s) => setHasApiKey(s.hasApiKey))
      .catch(() => setError(t('aiSettings.error')))
      .finally(() => setLoading(false));
  }, [t]);

  const save = async () => {
    if (!token.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await updateAiSettings({ apiKey: token.trim() });
      setToken('');
      setHasApiKey(true);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch {
      setError(t('aiSettings.error'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateAiSettings({ apiKey: '' });
      setHasApiKey(false);
    } catch {
      setError(t('aiSettings.error'));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-settings-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-slate-200 rounded-2xl p-5 w-full max-w-md shadow-card space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2
            id="ai-settings-title"
            className="flex items-center gap-2 text-slate-900 font-bold text-sm"
          >
            <Brain className="w-4 h-4 text-brand-700" aria-hidden="true" />
            {t('aiSettings.title')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('close', { ns: 'common' })}
            className="text-slate-500 hover:text-slate-700 p-1"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">{t('aiSettings.description')}</p>

        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">{t('aiSettings.provider')}</span>
          <span className="text-slate-800 font-medium">{t('aiSettings.providerGithub')}</span>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">{t('aiSettings.tokenLabel')}</label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={
              loading
                ? '…'
                : hasApiKey
                  ? t('aiSettings.tokenPlaceholderSet')
                  : t('aiSettings.tokenPlaceholderNew')
            }
            className="input font-mono"
          />
          <p className="mt-1 text-[10px] text-slate-400">{t('aiSettings.tokenHelp')}</p>
        </div>

        {error && <p className="text-xs text-red-700">{error}</p>}

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className={`text-xs ${hasApiKey ? 'text-emerald-700' : 'text-slate-500'}`}>
            {justSaved ? (
              <span className="flex items-center gap-1">
                <Check className="w-3 h-3" aria-hidden="true" />
                {t('aiSettings.saved')}
              </span>
            ) : hasApiKey ? (
              t('aiSettings.statusSet')
            ) : (
              t('aiSettings.statusNone')
            )}
          </span>
          <div className="flex items-center gap-2">
            {hasApiKey && (
              <button
                onClick={() => void remove()}
                disabled={saving}
                className="px-3 py-2 rounded-lg text-xs font-medium text-red-700 hover:bg-red-50 border border-red-200 transition-colors disabled:opacity-40"
              >
                {t('aiSettings.remove')}
              </button>
            )}
            <button
              onClick={() => void save()}
              disabled={saving || !token.trim()}
              className="btn-primary text-xs disabled:opacity-40"
            >
              {saving ? t('aiSettings.saving') : t('aiSettings.save')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
