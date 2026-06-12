import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Database, UploadCloud } from 'lucide-react';
import {
  getLocalDataCounts,
  importLocalData,
  markLocalImportDone,
  LOCAL_IMPORT_FLAG,
  type ImportProgress,
  type LocalDataCounts,
} from '../../lib/localImport';
import { useDashboardStore } from '../../store/dashboardStore';

interface Props {
  onClose: () => void;
}

type Phase = 'idle' | 'importing' | 'error';

/**
 * One-time offer to upload pre-account local data (IndexedDB) to the server.
 * Confirm → upload with progress, set the done-flag, refresh, close.
 * Decline → set the done-flag only (local data stays untouched either way).
 * Error → flag is NOT set; the user can retry or continue without importing.
 */
export function ImportLocalDataModal({ onClose }: Props) {
  const { t } = useTranslation('auth');
  const refresh = useDashboardStore((s) => s.refresh);

  const [counts, setCounts] = useState<LocalDataCounts | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<ImportProgress>({ done: 0, total: 0 });

  useEffect(() => {
    void getLocalDataCounts().then(setCounts);
  }, []);

  const handleImport = async () => {
    setPhase('importing');
    try {
      await importLocalData(setProgress);
      markLocalImportDone();
      await refresh();
      onClose();
    } catch {
      // Flag intentionally NOT set — the offer reappears and retry is possible.
      setPhase('error');
    }
  };

  const handleDecline = () => {
    markLocalImportDone();
    onClose();
  };

  const busy = phase === 'importing';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-local-modal-title"
        className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-xl p-5 sm:p-6 w-full max-w-md shadow-xl max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-4 h-4 text-brand-400" aria-hidden="true" />
          <h2 id="import-local-modal-title" className="text-white font-semibold">
            {t('localImport.title')}
          </h2>
        </div>

        <p className="text-sm text-gray-300 mb-3">
          {counts
            ? t('localImport.description', { decks: counts.decks, logs: counts.logs })
            : t('localImport.descriptionGeneric')}
        </p>
        <p className="text-xs text-gray-500 mb-5">
          {t('localImport.rehint', { flag: LOCAL_IMPORT_FLAG })}
        </p>

        {phase === 'importing' && (
          <div className="mb-5">
            <div className="flex justify-between text-xs text-gray-400 mb-1.5">
              <span>{t('localImport.importing')}</span>
              <span>
                {t('localImport.progress', { done: progress.done, total: progress.total })}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full bg-brand-500 transition-all"
                style={{
                  width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : '0%',
                }}
              />
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div
            role="alert"
            className="flex items-start gap-2 p-3 mb-5 bg-red-900/20 border border-red-800/40 rounded-lg"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" aria-hidden="true" />
            <p className="text-xs text-red-400">{t('localImport.error')}</p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleDecline}
            disabled={busy}
            className="btn-ghost flex-1 justify-center text-sm disabled:opacity-50"
          >
            {t('localImport.decline')}
          </button>
          <button
            onClick={() => void handleImport()}
            disabled={busy}
            className="btn-primary flex-1 justify-center text-sm disabled:opacity-50"
          >
            <UploadCloud className="w-4 h-4" aria-hidden="true" />
            {phase === 'error' ? t('localImport.retry') : t('localImport.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
