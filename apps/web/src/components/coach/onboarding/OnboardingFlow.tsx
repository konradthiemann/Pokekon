import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardPaste, Clock, Search, Sparkles } from 'lucide-react';
import type { TournamentDecklist } from '@pokekon/shared';
import { KNOWN_ARCHETYPES } from '../../../constants/archetypes';
import { useFieldAnalysis } from '../../../hooks/useFieldAnalysis';
import { getArchetypeSynthesis } from '../../../lib/api';
import { archetypeDisplayName } from '../../../lib/coach/archetypeName';
import { medoidToParsedCards, topFieldArchetypes } from '../../../lib/coach/onboarding';
import { importCards } from '../../../lib/deckImport';
import { PLAYER_NAME_KEY } from '../../../lib/demo';
import { useDashboardStore } from '../../../store/dashboardStore';
import { ImportDeckModal } from '../../deck/ImportDeckModal';
import { PokemonIcon } from '../../shared/PokemonIcon';

type OnboardingStep = 'archetype' | 'list' | 'playerName';

/** Field window of step 1 (Spec 7 §5.1: "most played right now"). */
const FIELD_WINDOW = { days: 7, online: true, bo1: true } as const;
/** Window for the meta-list placeholder (best cluster's medoid, Spec 7 E7). */
const META_LIST_DAYS = 90;
const MAX_RESULTS = 10;

interface ArchetypeOption {
  slug: string;
  name: string;
  sharePct?: number;
  icons?: string[];
}

const optionButton =
  'flex w-full min-h-[44px] items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-900 hover:border-brand-300 hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500';

/**
 * Onboarding of the archetype-first UI (Spec 7 §5.1): archetype → list →
 * TCG Live name. `switchArchetype` reuses steps 1–2 for the header's archetype
 * switch (no name step, cancellable). Step 2 is skipped when the user already
 * has a deck of the chosen archetype.
 */
export function OnboardingFlow({
  mode,
  onDone,
  onCancel,
}: {
  mode: 'firstRun' | 'switchArchetype';
  onDone: () => void;
  onCancel?: () => void;
}) {
  const { t, i18n } = useTranslation('onboarding');
  const { decks, setActiveArchetype, createNewDeck, refresh, setCoachTab } = useDashboardStore();
  const [step, setStep] = useState<OnboardingStep>('archetype');
  const [chosen, setChosen] = useState<ArchetypeOption | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false); // guards taps that land before the re-render
  const [saveFailed, setSaveFailed] = useState(false);

  const totalSteps = mode === 'firstRun' ? 3 : 2;
  const stepNumber = step === 'archetype' ? 1 : step === 'list' ? 2 : 3;

  function finish() {
    setCoachTab('start');
    onDone();
  }

  function afterList() {
    if (mode === 'firstRun') setStep('playerName');
    else finish();
  }

  async function choose(option: ArchetypeOption) {
    if (savingRef.current) return; // a double tap must not save two archetypes
    savingRef.current = true;
    setSaving(true);
    setSaveFailed(false);
    try {
      await setActiveArchetype(option.slug);
    } catch {
      setSaveFailed(true);
      return;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
    setChosen(option);
    if (decks.some((d) => d.archetype === option.slug)) afterList();
    else setStep('list');
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card">
      {/* Brand strip — red is brand only (Spec 7 §9a), white text 5.0:1. */}
      <div className="flex items-center justify-between gap-3 bg-poke-600 px-4 py-3 text-white">
        <div>
          <p className="text-sm font-extrabold">
            {mode === 'firstRun' ? t('strip.title') : t('strip.switchTitle')}
          </p>
          <p className="text-xs opacity-90">
            {t('strip.step', { current: stepNumber, total: totalSteps })}
          </p>
        </div>
        {mode === 'switchArchetype' && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] rounded-md px-3 text-sm font-bold text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-energy-500"
          >
            {t('cancel')}
          </button>
        )}
      </div>

      <div className="p-4">
        {step === 'archetype' && (
          <ArchetypeStep
            language={i18n.language}
            decks={decks}
            disabled={saving}
            failed={saveFailed}
            onChoose={(o) => void choose(o)}
          />
        )}
        {step === 'list' && chosen && (
          <ListSetup
            archetype={chosen}
            createNewDeck={createNewDeck}
            refresh={refresh}
            onNext={afterList}
          />
        )}
        {step === 'playerName' && <PlayerNameStep onDone={finish} />}
      </div>
    </div>
  );
}

function ArchetypeStep({
  language,
  decks,
  disabled,
  failed,
  onChoose,
}: {
  language: string;
  decks: { archetype: string; archetypeName: string }[];
  disabled: boolean;
  failed: boolean;
  onChoose: (option: ArchetypeOption) => void;
}) {
  const { t } = useTranslation('onboarding');
  const [query, setQuery] = useState('');
  const { data, isLoading, error } = useFieldAnalysis(FIELD_WINDOW);
  const field = useMemo(() => data?.archetypes ?? [], [data]);

  const shareFormat = useMemo(
    () => new Intl.NumberFormat(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    [language],
  );

  const top: ArchetypeOption[] = useMemo(
    () =>
      topFieldArchetypes(field, MAX_RESULTS).map((a) => ({
        slug: a.archetypeId,
        name: a.archetypeName,
        sharePct: a.sharePct,
        icons: a.icons,
      })),
    [field],
  );

  const results: ArchetypeOption[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return [];
    const bySlug = new Map<string, ArchetypeOption>();
    for (const f of field) {
      bySlug.set(f.archetypeId, {
        slug: f.archetypeId,
        name: f.archetypeName,
        sharePct: f.sharePct,
        icons: f.icons,
      });
    }
    for (const k of KNOWN_ARCHETYPES) {
      if (!bySlug.has(k.slug)) bySlug.set(k.slug, { slug: k.slug, name: k.name });
    }
    return [...bySlug.values()]
      .filter((o) => o.name.toLowerCase().includes(q) || o.slug.includes(q))
      .slice(0, MAX_RESULTS)
      .map((o) => ({
        ...o,
        name: archetypeDisplayName(o.slug, { known: KNOWN_ARCHETYPES, field, decks }),
      }));
  }, [query, field, decks]);

  const searching = query.trim() !== '';
  const options = searching ? results : top;

  return (
    <div>
      <h2 className="text-base font-extrabold text-slate-900">{t('archetype.heading')}</h2>
      <p className="mt-1 text-sm text-slate-600">{t('archetype.intro')}</p>

      <label className="relative mt-4 block">
        <span className="sr-only">{t('archetype.search')}</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('archetype.search')}
          className="input pl-9"
        />
      </label>

      <p className="mt-4 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">
        {searching ? t('archetype.results') : t('archetype.mostPlayed')}
      </p>
      {!searching && isLoading && (
        <p className="mt-2 text-sm text-slate-600">{t('archetype.loading')}</p>
      )}
      {!searching && error && (
        <p className="mt-2 text-sm text-slate-600">{t('archetype.unavailable')}</p>
      )}
      {searching && results.length === 0 && (
        <p className="mt-2 text-sm text-slate-600">{t('archetype.noResults')}</p>
      )}

      {failed && (
        <p role="alert" className="mt-2 text-sm text-slate-900">
          {t('archetype.failed')}
        </p>
      )}

      <ul
        aria-label={searching ? t('archetype.results') : t('archetype.mostPlayed')}
        className="mt-2 space-y-2"
      >
        {options.map((o) => (
          <li key={o.slug}>
            <button
              type="button"
              className={optionButton}
              aria-label={
                o.sharePct !== undefined
                  ? `${o.name}, ${t('archetype.share', { share: shareFormat.format(o.sharePct) })}`
                  : o.name
              }
              disabled={disabled}
              onClick={() => onChoose(o)}
            >
              <PokemonIcon archetype={o.slug} icons={o.icons} size="sm" />
              <span className="flex-1 truncate font-semibold">{o.name}</span>
              {o.sharePct !== undefined && (
                <span className="text-xs tabular-nums text-slate-600">
                  {t('archetype.share', { share: shareFormat.format(o.sharePct) })}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Step 2 — also used on its own as the empty state of Deck › My lists. */
export function ListSetup({
  archetype,
  createNewDeck,
  refresh,
  onNext,
  showLater = true,
}: {
  archetype: { slug: string; name: string };
  createNewDeck: (archetype: string, archetypeName: string, variant: string) => Promise<number>;
  refresh: () => Promise<void>;
  onNext: () => void;
  /** false outside the onboarding, where "later" has nowhere to go. */
  showLater?: boolean;
}) {
  const { t } = useTranslation('onboarding');
  const [medoid, setMedoid] = useState<{ slug: string; list: TournamentDecklist | null } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getArchetypeSynthesis(archetype.slug, { days: META_LIST_DAYS, scope: 'global' })
      .then((res) => {
        if (!cancelled) {
          setMedoid({ slug: archetype.slug, list: res.clusters[0]?.representative ?? null });
        }
      })
      .catch(() => {
        if (!cancelled) setMedoid({ slug: archetype.slug, list: null });
      });
    return () => {
      cancelled = true;
    };
  }, [archetype.slug]);

  const loaded = medoid?.slug === archetype.slug ? medoid : null;
  const representative = loaded?.list ?? null;

  async function takeMetaList() {
    if (!representative) return;
    setBusy(true);
    setFailed(false);
    try {
      const deckId = await createNewDeck(archetype.slug, archetype.name, t('list.metaVariant'));
      await importCards(medoidToParsedCards(representative), true, deckId);
      await refresh();
      onNext();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function pasteOwn() {
    setBusy(true);
    setFailed(false);
    try {
      await createNewDeck(archetype.slug, archetype.name, t('list.ownVariant'));
      setImporting(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="text-base font-extrabold text-slate-900">{t('list.heading')}</h2>
      <div className="mt-4 space-y-2">
        <button
          type="button"
          className={optionButton}
          disabled={busy || !representative}
          onClick={() => void takeMetaList()}
        >
          <Sparkles className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
          <span className="flex-1">
            <span className="block font-semibold">{t('list.takeMeta')}</span>
            <span className="block text-xs text-slate-600">{t('list.takeMetaHint')}</span>
          </span>
        </button>
        {!loaded && <p className="text-xs text-slate-600">{t('list.loadingClusters')}</p>}
        {loaded && !representative && (
          <p className="text-xs text-slate-600">{t('list.noClusters')}</p>
        )}

        <button
          type="button"
          className={optionButton}
          disabled={busy}
          onClick={() => void pasteOwn()}
        >
          <ClipboardPaste className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
          <span className="flex-1">
            <span className="block font-semibold">{t('list.pasteOwn')}</span>
            <span className="block text-xs text-slate-600">{t('list.pasteOwnHint')}</span>
          </span>
        </button>

        {showLater && (
          <button type="button" className={optionButton} disabled={busy} onClick={onNext}>
            <Clock className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <span className="flex-1">
              <span className="block font-semibold">{t('list.later')}</span>
              <span className="block text-xs text-slate-600">{t('list.laterHint')}</span>
            </span>
          </button>
        )}
      </div>
      {failed && (
        <p role="alert" className="mt-3 text-sm text-slate-900">
          {t('list.failed')}
        </p>
      )}

      {importing && (
        <ImportDeckModal
          onClose={() => {
            setImporting(false);
            onNext();
          }}
        />
      )}
    </div>
  );
}

function PlayerNameStep({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation('onboarding');
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(PLAYER_NAME_KEY) ?? '';
    } catch {
      return '';
    }
  });

  function save() {
    const trimmed = name.trim();
    if (trimmed !== '') {
      try {
        localStorage.setItem(PLAYER_NAME_KEY, trimmed);
      } catch {
        // blocked storage — the name is optional
      }
    }
    onDone();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <h2 className="text-base font-extrabold text-slate-900">{t('playerName.heading')}</h2>
      <p className="mt-1 text-sm text-slate-600">{t('playerName.intro')}</p>
      <label className="mt-4 block text-sm font-semibold text-slate-900">
        {t('playerName.label')}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="nickname"
          className="input mt-1"
        />
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" className="btn-primary">
          {t('playerName.save')}
        </button>
        <button type="button" className="btn-ghost" onClick={onDone}>
          {t('playerName.skip')}
        </button>
      </div>
    </form>
  );
}
