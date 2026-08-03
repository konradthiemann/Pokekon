import { useTranslation } from 'react-i18next';
import { ExternalLink, Medal } from 'lucide-react';
import type { DecklistCardEntry } from '@pokekon/shared';
import type { ArchetypeListEntry } from '../../lib/api';

function CardGroup({ title, entries }: { title: string; entries: DecklistCardEntry[] }) {
  const { t } = useTranslation('meta');
  if (entries.length === 0) return null;
  const cardCount = entries.reduce((sum, e) => sum + e.count, 0);
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5 flex items-baseline justify-between gap-2">
        <span>{title}</span>
        <span className="normal-case tracking-normal text-slate-400 font-normal">
          {t('archetypeDetail.lists.cardCount', { count: cardCount })}
        </span>
      </p>
      <ul className="space-y-0.5">
        {/* Reprints can repeat a card name within a group (different set/number),
            so the name alone is not a safe key. */}
        {entries.map((card, i) => (
          <li
            key={`${card.name}-${i}`}
            className="flex items-baseline gap-1.5 text-xs leading-snug"
          >
            <span className="font-mono font-semibold text-brand-700 shrink-0 w-4 text-right">
              {card.count}
            </span>
            <span className="text-slate-700 truncate" title={card.name}>
              {card.name}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One published tournament decklist: finish, event context and the 60 cards
 * grouped the way Limitless serves them (Pokémon / Trainer / Energy).
 */
export function DecklistCard({ entry }: { entry: ArchetypeListEntry }) {
  const { t } = useTranslation('meta');
  const date = new Date(entry.tournament.date);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <Medal className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-hidden="true" />
            {entry.placing != null
              ? t('archetypeDetail.lists.placing', { placing: entry.placing })
              : t('archetypeDetail.lists.placingUnknown')}
            <span className="text-xs font-normal text-slate-500">
              / {t('archetypeDetail.lists.playersShort', { count: entry.tournament.players })}
            </span>
            <span className="font-mono text-xs font-semibold text-slate-600 ml-1">
              {entry.wins}-{entry.losses}
              {entry.ties > 0 ? `-${entry.ties}` : ''}
            </span>
          </p>
          <p className="text-xs text-slate-500 truncate mt-0.5" title={entry.tournament.name}>
            {entry.tournament.name} · {date.toLocaleDateString()}
            {entry.playerName && (
              <> · {t('archetypeDetail.lists.by', { player: entry.playerName })}</>
            )}
          </p>
        </div>
        <a
          href={`https://play.limitlesstcg.com/tournament/${encodeURIComponent(entry.tournament.id)}/standings`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('archetypeDetail.lists.openTournament')}
          className="text-slate-400 hover:text-brand-700 transition-colors shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
        <CardGroup title={t('archetypeDetail.lists.pokemon')} entries={entry.decklist.pokemon} />
        <CardGroup title={t('archetypeDetail.lists.trainer')} entries={entry.decklist.trainer} />
        <CardGroup title={t('archetypeDetail.lists.energy')} entries={entry.decklist.energy} />
      </div>
    </div>
  );
}
