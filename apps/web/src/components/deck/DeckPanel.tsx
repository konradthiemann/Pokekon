import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { DeckCard, CardType, CardRole } from '../../types';
import { deleteDeckCard, updateDeckCard, upsertDeckCard } from '../../db/queries';
import { useDashboardStore } from '../../store/dashboardStore';
import { Trash2, Plus, Minus, Upload, ChevronDown } from 'lucide-react';
import { ImportDeckModal } from './ImportDeckModal';

interface Props {
  deckCards: DeckCard[];
}

// ─── Role / type config ───────────────────────────────────────────────────────

// Labels and hints come from the i18n `deck` namespace (`roles.*` / `roleHints.*`),
// resolved at render time — the role value stays the stable data key.
const ROLE_OPTIONS: Record<CardType, { value: CardRole }[]> = {
  Pokemon: [{ value: 'attacker' }, { value: 'tech' }],
  Trainer: [{ value: 'supporter' }, { value: 'item' }, { value: 'stadium' }, { value: 'tech' }],
  Energy: [{ value: 'energy' }],
};

const ROLE_COLORS: Record<string, string> = {
  attacker: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-200',
  tech: 'bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200',
  supporter: 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200',
  item: 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200',
  stadium: 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200',
  energy: 'bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-200',
};

const COLUMN_STYLES: Record<CardType, { header: string; accent: string }> = {
  Pokemon: {
    header: 'text-red-800 border-red-200 bg-red-50',
    accent: 'focus:border-red-500',
  },
  Trainer: {
    header: 'text-blue-800 border-blue-200 bg-blue-50',
    accent: 'focus:border-blue-500',
  },
  Energy: {
    header: 'text-orange-800 border-orange-200 bg-orange-50',
    accent: 'focus:border-orange-500',
  },
};

// ─── Autocomplete suggestions ─────────────────────────────────────────────────

const KNOWN_POKEMON = [
  'Dragapult ex',
  'Dragapult',
  'Duskull',
  'Dusclops',
  'Dusknoir',
  'Lucario ex',
  'Lucario',
  'Riolu',
  'Hariyama',
  'Makuhita',
  "N's Zorua",
  "N's Zoroark ex",
  "N's Zoroark",
  'Zorua',
  'Zoroark',
  'Froslass',
  'Snorunt',
  'Grimmsnarl ex',
  'Grimmsnarl',
  'Impidimp',
  'Morgrem',
  'Ogerpon ex',
  'Teal Mask Ogerpon ex',
  'Wellspring Mask Ogerpon ex',
  'Cornerstone Mask Ogerpon ex',
  'Meganium ex',
  'Chikorita',
  'Bayleef',
  'Raging Bolt ex',
  'Starmie ex',
  'Staryu',
  'Alakazam ex',
  'Kadabra',
  'Abra',
  'Dudunsparce',
  'Dunsparce',
  'Absol',
  'Kangaskhan ex',
  'Kangaskhan',
  "Rocket's Mewtwo ex",
  'Mewtwo ex',
  "Cynthia's Garchomp ex",
  'Garchomp',
  'Gible',
  'Gabite',
  'Okidogi ex',
  'Barbaracle',
  'Binacle',
  'Greninja ex',
  'Froakie',
  'Frogadier',
  'Venusaur ex',
  'Ivysaur',
  'Bulbasaur',
  "Steven's Metagross ex",
  'Metagross',
  'Beldum',
  'Metang',
  "Rocket's Honchkrow ex",
  'Honchkrow',
  'Murkrow',
  'Mega Lucario ex',
  'Lucario ex',
  'Ceruledge ex',
  'Charcadet',
  'Mega Starmie ex',
  'Decidueye ex',
  'Dartrix',
  'Rowlet',
  'Hydreigon ex',
  'Zweilous',
  'Deino',
  'Charizard ex',
  'Charmeleon',
  'Charmander',
  'Archaludon ex',
  'Duraludon',
  "Hop's Zacian ex",
  'Zacian',
  "Ethan's Typhlosion ex",
  'Typhlosion',
  'Quilava',
  'Cyndaquil',
  'Terapagos ex',
  'Jellicent ex',
  'Frillish',
  "Rocket's Spidops ex",
  'Tarountula',
  "Hop's Trevenant ex",
  'Phantump',
  'Ursaluna ex',
  'Ursaring',
  'Teddiursa',
  'Lunatone',
  'Lopunny ex',
  'Buneary',
  'Hydrapple ex',
  'Dipplin',
  'Applin',
  'Yanmega ex',
  'Yanma',
  'Zygarde ex',
  'Bouffalant',
  'Clefairy',
  'Clefable',
  'Crustle',
  'Dwebble',
  'Slowking ex',
  'Slowpoke',
  'Flareon ex',
  'Eevee',
  'Noctowl',
  'Hoothoot',
  'Munkidori',
  'Diancie ex',
  'Archaludon',
  'Kangaskhan-Mega ex',
  "Marnie's Grimmsnarl ex",
];

const KNOWN_TRAINERS = [
  // Supporters
  "Professor's Research",
  'Professorin Forschung',
  'Iono',
  'Arven',
  "Boss's Orders",
  'Befehl des Bosses',
  'N',
  'Cynthia',
  'Colza',
  'Kieran',
  'Janine',
  'Rocket Boss Giovanni',
  'Katy',
  'Hop',
  'Marnie',
  'Steven',
  'Lt. Surge',
  'Ethan',
  'Tord',
  // Items
  'Nest Ball',
  'Nestball',
  'Ultra Ball',
  'Hyperball',
  'Rare Candy',
  'Sonderbonbon',
  'Buddy-Buddy Poffin',
  'Dicke-Freunde-Knursp',
  'Escape Rope',
  'Fluchtnetz',
  'Switch',
  'Switching Cart',
  'Lost Vacuum',
  'Leeresog',
  'Earthen Vessel',
  'Erdbehälter',
  "Hero's Cape",
  'Heldenumhang',
  'Technical Machine: Evolution',
  'Technical Machine: Devolution',
  'Pal Pad',
  'Rescue Board',
  'Energy Recycler',
  'Night Stretcher',
  'Super Rod',
  'Counter Catcher',
  'Pokégear 3.0',
  'Fog Crystal',
  'Iron Valiant ex',
  'Iron Hands ex',
  'Ancient Booster Energy Capsule',
  'Collapsed Stadium',
  'Zusammengebrochenes Stadion',
  'Path to the Peak',
  'Weg zur Spitze',
  'Primeval Forest',
  'Ewiger Urwald',
  'Rocky Helmet',
  'Artazon',
];

const KNOWN_ENERGY = [
  'Grass Energy',
  'Grasenergie',
  'Fire Energy',
  'Feuerenergie',
  'Water Energy',
  'Wasserenergie',
  'Lightning Energy',
  'Blitzenergie',
  'Psychic Energy',
  'Psychoenergie',
  'Fighting Energy',
  'Kampfenergie',
  'Darkness Energy',
  'Dunkelenergie',
  'Metal Energy',
  'Metallenergie',
  'Dragon Energy',
  'Drachenenergie',
  'Double Turbo Energy',
  'Reversal Energy',
  'Umkehrenergie',
  'Jet Energy',
  'Therapeutic Energy',
  'Luminous Energy',
  'Mist Energy',
];

const CARD_SUGGESTIONS: Record<CardType, string[]> = {
  Pokemon: KNOWN_POKEMON,
  Trainer: KNOWN_TRAINERS,
  Energy: KNOWN_ENERGY,
};

// ─── Inline role dropdown ─────────────────────────────────────────────────────

function RoleDropdown({
  role,
  type,
  onChange,
}: {
  role: CardRole;
  type: CardType;
  onChange: (r: CardRole) => void;
}) {
  const { t } = useTranslation('deck');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const options = ROLE_OPTIONS[type];
  const cls =
    ROLE_COLORS[role] ?? 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`flex items-center gap-0.5 border rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${cls}`}
        title={t('panel.changeRole')}
      >
        {t(`roles.${role}`)}
        <ChevronDown className="w-2.5 h-2.5 opacity-60" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-card py-1 min-w-[150px]">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={(e) => {
                e.stopPropagation();
                onChange(opt.value);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 flex items-center justify-between gap-2 ${role === opt.value ? 'text-brand-700 font-medium' : 'text-slate-700'}`}
            >
              <span>{t(`roles.${opt.value}`)}</span>
              <span className="text-[10px] text-slate-400">{t(`roleHints.${opt.value}`)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Inline counter ───────────────────────────────────────────────────────────

function CountStepper({
  count,
  onChange,
  onRemove,
}: {
  count: number;
  onChange: (n: number) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation('deck');
  const dec = () => {
    if (count <= 1) onRemove();
    else onChange(count - 1);
  };
  const inc = () => {
    if (count < 4) onChange(count + 1);
  };

  return (
    <div className="flex items-center gap-0.5 bg-slate-100 border border-slate-200 rounded">
      <button
        onClick={dec}
        className="w-5 h-5 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-l"
        title={count <= 1 ? 'Remove card' : 'Decrease'}
        aria-label={count <= 1 ? t('panel.removeCard') : t('panel.decrease')}
      >
        {count <= 1 ? (
          <Trash2 className="w-2.5 h-2.5" aria-hidden="true" />
        ) : (
          <Minus className="w-3 h-3" aria-hidden="true" />
        )}
      </button>
      <span className="text-xs text-slate-800 font-mono w-4 text-center tabular-nums">{count}</span>
      <button
        onClick={inc}
        disabled={count >= 4}
        className="w-5 h-5 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-r disabled:opacity-30 disabled:hover:bg-transparent"
        title={count >= 4 ? 'Max 4 copies' : 'Increase'}
        aria-label={count >= 4 ? t('panel.maxCopies') : t('panel.increase')}
      >
        <Plus className="w-3 h-3" aria-hidden="true" />
      </button>
    </div>
  );
}

// ─── Card row ─────────────────────────────────────────────────────────────────

function CardRow({
  card,
  onChangeCount,
  onChangeRole,
  onDelete,
}: {
  card: DeckCard;
  onChangeCount: (count: number) => void;
  onChangeRole: (role: CardRole) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 group transition-colors">
      <span className="flex-1 text-sm text-slate-800 min-w-0 truncate">{card.name}</span>
      <RoleDropdown role={card.role} type={card.type} onChange={onChangeRole} />
      <CountStepper count={card.count} onChange={onChangeCount} onRemove={onDelete} />
    </div>
  );
}

// ─── Card name combobox ───────────────────────────────────────────────────────

function CardNameCombobox({
  type,
  deckCards,
  onSubmit,
  placeholder,
  accent,
}: {
  type: CardType;
  deckCards: DeckCard[];
  onSubmit: (name: string) => void;
  placeholder: string;
  accent: string;
}) {
  const { t } = useTranslation('deck');
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const existingNames = deckCards.filter((c) => c.type === type).map((c) => c.name);
  const staticList = CARD_SUGGESTIONS[type];

  // Merge existing deck cards (first) + static list, deduplicated
  const allSuggestions = [...new Set([...existingNames, ...staticList])];

  const filtered =
    value.trim().length >= 1
      ? allSuggestions.filter((n) => n.toLowerCase().includes(value.toLowerCase())).slice(0, 6)
      : [];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const submit = (name?: string) => {
    const final = (name ?? value).trim();
    if (!final) return;
    onSubmit(final);
    setValue('');
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => value.trim().length >= 1 && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            submit();
            e.preventDefault();
          }
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={placeholder}
        className={`flex-1 bg-white border border-slate-300 rounded-md px-2 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none ${accent}`}
        autoComplete="off"
      />
      <button
        onClick={() => submit()}
        disabled={!value.trim()}
        className="px-2 py-1 rounded-md bg-slate-100 border border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-200 disabled:opacity-30 text-xs"
        title="Add card"
        aria-label={t('panel.addCard')}
      >
        <Plus className="w-3 h-3" aria-hidden="true" />
      </button>
      {open && filtered.length > 0 && (
        <div className="absolute left-0 bottom-full mb-1 z-40 w-full bg-white border border-slate-200 rounded-lg shadow-card py-1 max-h-48 overflow-y-auto">
          {filtered.map((name) => (
            <button
              key={name}
              onMouseDown={(e) => {
                e.preventDefault();
                submit(name);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-800 hover:bg-slate-100 truncate"
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Column with quick-add ────────────────────────────────────────────────────

function CardColumn({
  type,
  cards,
  allDeckCards,
  onChangeCount,
  onChangeRole,
  onDelete,
  onQuickAdd,
}: {
  type: CardType;
  cards: DeckCard[];
  allDeckCards: DeckCard[];
  onChangeCount: (id: number, count: number) => void;
  onChangeRole: (id: number, role: CardRole) => void;
  onDelete: (id: number) => void;
  onQuickAdd: (name: string) => void;
}) {
  const total = cards.reduce((s, c) => s + c.count, 0);
  const sorted = [...cards].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const styles = COLUMN_STYLES[type];

  return (
    <div className="flex flex-col min-w-0">
      <div className={`px-3 py-2 border-b ${styles.header}`}>
        <span className="text-xs font-bold uppercase tracking-wider">{type}</span>
        <span className="text-xs font-normal ml-1.5 opacity-70">({total})</span>
      </div>

      <div className="overflow-y-auto max-h-[320px] divide-y divide-slate-200">
        {sorted.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">None</div>
        ) : (
          sorted.map((card) => (
            <CardRow
              key={card.id ?? card.name}
              card={card}
              onChangeCount={(n) => card.id != null && onChangeCount(card.id, n)}
              onChangeRole={(r) => card.id != null && onChangeRole(card.id, r)}
              onDelete={() => card.id != null && onDelete(card.id)}
            />
          ))
        )}
      </div>

      <div className="px-2 py-2 border-t border-slate-200 bg-slate-50">
        <CardNameCombobox
          type={type}
          deckCards={allDeckCards}
          onSubmit={onQuickAdd}
          placeholder={`+ Add ${type.toLowerCase()}…`}
          accent={styles.accent}
        />
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function DeckPanel({ deckCards }: Props) {
  const { refresh, patchDeckCards, activeDeckId } = useDashboardStore();
  const [showImportModal, setShowImportModal] = useState(false);
  const [mobileTab, setMobileTab] = useState<CardType>('Pokemon');

  const totalCards = deckCards.reduce((s, c) => s + c.count, 0);
  const pokemon = deckCards.filter((c) => c.type === 'Pokemon');
  const trainers = deckCards.filter((c) => c.type === 'Trainer');
  const energies = deckCards.filter((c) => c.type === 'Energy');

  const handleChangeCount = async (id: number, count: number) => {
    if (activeDeckId == null) return;
    patchDeckCards((cards) => cards.map((c) => (c.id === id ? { ...c, count } : c)));
    try {
      await updateDeckCard(activeDeckId, id, { count });
    } catch (err) {
      console.error('Failed to update card count:', err);
      refresh();
    }
  };

  const handleChangeRole = async (id: number, role: CardRole) => {
    if (activeDeckId == null) return;
    patchDeckCards((cards) => cards.map((c) => (c.id === id ? { ...c, role } : c)));
    try {
      await updateDeckCard(activeDeckId, id, { role });
    } catch (err) {
      console.error('Failed to update card role:', err);
      refresh();
    }
  };

  const handleDelete = async (id: number) => {
    if (activeDeckId == null) return;
    patchDeckCards((cards) => cards.filter((c) => c.id !== id));
    try {
      await deleteDeckCard(activeDeckId, id);
    } catch (err) {
      console.error('Failed to delete card:', err);
      refresh();
    }
  };

  const handleQuickAdd = async (type: CardType, name: string) => {
    if (activeDeckId == null) return;
    const defaultRole: CardRole =
      type === 'Pokemon' ? 'attacker' : type === 'Trainer' ? 'item' : 'energy';
    const existing = deckCards.find((c) => c.name === name && c.type === type);

    if (existing?.id != null) {
      const newCount = Math.min(existing.count + 1, 4);
      patchDeckCards((cards) =>
        cards.map((c) => (c.id === existing.id ? { ...c, count: newCount } : c)),
      );
      try {
        await updateDeckCard(activeDeckId, existing.id, { count: newCount });
      } catch (err) {
        console.error('Failed to increment card:', err);
        refresh();
      }
      return;
    }

    // New card: add optimistically with a temp id, then replace with real id
    const tempId = -Date.now();
    const newCard: DeckCard = {
      id: tempId,
      name,
      count: 1,
      type,
      role: defaultRole,
      cardId: 0,
      deckId: activeDeckId,
    };
    patchDeckCards((cards) => [...cards, newCard]);
    try {
      const realId = await upsertDeckCard(
        { name, count: 1, type, role: defaultRole, cardId: 0 },
        activeDeckId,
      );
      patchDeckCards((cards) => cards.map((c) => (c.id === tempId ? { ...c, id: realId } : c)));
    } catch (err) {
      console.error('Failed to add card:', err);
      patchDeckCards((cards) => cards.filter((c) => c.id !== tempId));
    }
  };

  return (
    <div className="card overflow-hidden p-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-200">
        <div>
          <h3 className="card-header mb-0">Deck List</h3>
          <p className="text-xs text-slate-500 mt-0.5 font-semibold">
            {totalCards}/60 cards · click role to change · use{' '}
            <kbd className="px-1 rounded bg-slate-100 border border-slate-200 text-[10px] font-mono">
              +
            </kbd>
            /
            <kbd className="px-1 rounded bg-slate-100 border border-slate-200 text-[10px] font-mono">
              −
            </kbd>{' '}
            to adjust counts
          </p>
        </div>
        <button
          onClick={() => setShowImportModal(true)}
          className="btn-ghost text-xs"
          title="Import deck list"
        >
          <Upload className="w-3.5 h-3.5" aria-hidden="true" />
          Import
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-4 py-2 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${totalCards === 60 ? 'bg-emerald-500' : totalCards > 60 ? 'bg-red-500' : 'bg-brand-500'}`}
              style={{ width: `${Math.min((totalCards / 60) * 100, 100)}%` }}
            />
          </div>
          <span
            className={`text-xs font-mono shrink-0 ${totalCards === 60 ? 'text-emerald-700' : totalCards > 60 ? 'text-red-700' : 'text-slate-500'}`}
          >
            {totalCards}/60
          </span>
        </div>
      </div>

      {/* Mobile tab switcher */}
      <div className="flex border-b border-slate-200 md:hidden">
        {(
          [
            ['Pokemon', pokemon] as const,
            ['Trainer', trainers] as const,
            ['Energy', energies] as const,
          ] as [CardType, typeof pokemon][]
        ).map(([type, cards]) => {
          const count = cards.reduce((s, c) => s + c.count, 0);
          return (
            <button
              key={type}
              onClick={() => setMobileTab(type)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                mobileTab === type
                  ? 'text-slate-900 border-b-2 border-brand-500'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {type} <span className="opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Mobile: show only the selected column */}
      <div className="md:hidden">
        {mobileTab === 'Pokemon' && (
          <CardColumn
            type="Pokemon"
            cards={pokemon}
            allDeckCards={deckCards}
            onChangeCount={handleChangeCount}
            onChangeRole={handleChangeRole}
            onDelete={handleDelete}
            onQuickAdd={(name) => handleQuickAdd('Pokemon', name)}
          />
        )}
        {mobileTab === 'Trainer' && (
          <CardColumn
            type="Trainer"
            cards={trainers}
            allDeckCards={deckCards}
            onChangeCount={handleChangeCount}
            onChangeRole={handleChangeRole}
            onDelete={handleDelete}
            onQuickAdd={(name) => handleQuickAdd('Trainer', name)}
          />
        )}
        {mobileTab === 'Energy' && (
          <CardColumn
            type="Energy"
            cards={energies}
            allDeckCards={deckCards}
            onChangeCount={handleChangeCount}
            onChangeRole={handleChangeRole}
            onDelete={handleDelete}
            onQuickAdd={(name) => handleQuickAdd('Energy', name)}
          />
        )}
      </div>

      {/* Desktop: three-column layout */}
      <div className="hidden md:grid grid-cols-3 divide-x divide-slate-200">
        <CardColumn
          type="Pokemon"
          cards={pokemon}
          allDeckCards={deckCards}
          onChangeCount={handleChangeCount}
          onChangeRole={handleChangeRole}
          onDelete={handleDelete}
          onQuickAdd={(name) => handleQuickAdd('Pokemon', name)}
        />
        <CardColumn
          type="Trainer"
          cards={trainers}
          allDeckCards={deckCards}
          onChangeCount={handleChangeCount}
          onChangeRole={handleChangeRole}
          onDelete={handleDelete}
          onQuickAdd={(name) => handleQuickAdd('Trainer', name)}
        />
        <CardColumn
          type="Energy"
          cards={energies}
          allDeckCards={deckCards}
          onChangeCount={handleChangeCount}
          onChangeRole={handleChangeRole}
          onDelete={handleDelete}
          onQuickAdd={(name) => handleQuickAdd('Energy', name)}
        />
      </div>

      {showImportModal && (
        <ImportDeckModal
          onClose={() => {
            setShowImportModal(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
