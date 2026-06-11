import { useState } from 'react';
import { MapPin, X, Plus } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { SidePanel } from './SidePanel';

// Suggested archetypes for quick-add (based on current meta)
const QUICK_ADD = [
  "Dragapult ex", "N's Zoroark ex", "Lucario Hariyama", "Alakazam Dudunsparce",
  "Ogerpon Meganium", "Starmie Froslass", "Cynthia's Garchomp ex",
  "Rocket's Mewtwo", "Raging Bolt Ogerpon", "Ceruledge ex",
];

export function LocalMetaPanel() {
  const { localMeta, setLocalMeta, archetypeStats } = useDashboardStore();
  const [input, setInput] = useState('');

  const metaArchetypes = archetypeStats.map((a) => a.archetype);
  const allOptions = [...new Set([...QUICK_ADD, ...metaArchetypes])].filter(
    (a) => !localMeta.includes(a),
  );

  const add = (arch: string) => {
    const trimmed = arch.trim();
    if (!trimmed || localMeta.includes(trimmed)) return;
    setLocalMeta([...localMeta, trimmed]);
    setInput('');
  };

  const remove = (arch: string) => setLocalMeta(localMeta.filter((a) => a !== arch));

  return (
    <SidePanel
      icon={<MapPin className="w-4 h-4" />}
      title="Local Meta"
      description="Decks you commonly face at your locals. These get boosted priority in recommendations."
    >
      <div className="flex flex-col gap-3 h-full">
        {/* Current list */}
        {localMeta.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {localMeta.map((arch) => (
              <span
                key={arch}
                className="flex items-center gap-1 bg-amber-900/30 border border-amber-700/50 text-amber-300 rounded-full px-2.5 py-0.5 text-xs"
              >
                {arch}
                <button
                  onClick={() => remove(arch)}
                  className="text-amber-500 hover:text-amber-200 ml-0.5"
                  aria-label={`Remove ${arch}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Add input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add(input)}
            placeholder="Archetype name…"
            list="arch-suggestions"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-600"
          />
          <datalist id="arch-suggestions">
            {allOptions.map((a) => <option key={a} value={a} />)}
          </datalist>
          <button
            onClick={() => add(input)}
            disabled={!input.trim()}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-700/30 hover:bg-amber-700/50 text-amber-300 border border-amber-700/40 transition-colors disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>

        {/* Quick-add chips */}
        {localMeta.length < 8 && allOptions.length > 0 && (
          <div className="mt-auto">
            <p className="text-[11px] uppercase tracking-wider text-gray-600 mb-1.5 font-medium">Suggestions</p>
            <div className="flex flex-wrap gap-1">
              {allOptions.slice(0, 6).map((arch) => (
                <button
                  key={arch}
                  onClick={() => add(arch)}
                  className="text-xs px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-full border border-gray-700 transition-colors"
                >
                  + {arch}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </SidePanel>
  );
}
