import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import i18n from '../../i18n';
import { MatchupMatrix } from './MatchupMatrix';
import { getMetaMatchups } from '../../lib/api';
import type { MetaMatchups } from '../../lib/api';

/**
 * Plan .claude/plans/ui-ux-button-consolidation.md §3.9 / §3.11-F (minimal,
 * new): the reload control at the bottom of the matrix footer goes from
 * icon-only (`title`+`aria-label`, no visible text, MatchupMatrix.tsx:363-372)
 * to icon-plus-visible-text. `getMetaMatchups` is mocked (pattern:
 * MetaPage.test.tsx:98-111) with an empty-but-valid response so the component
 * settles past its loading state without a network call.
 */

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return {
    ...actual,
    getMetaMatchups: vi.fn(),
  };
});

const getMetaMatchupsMock = vi.mocked(getMetaMatchups);

function emptyMatchups(): MetaMatchups {
  return {
    days: 14,
    online: true,
    bo1: true,
    matchupSource: {
      ownPairs: 0,
      fallbackPairs: 0,
      ownGames: 0,
      trainerHillImportedAt: null,
      conflictCount: 0,
      conflicts: [],
    },
    rows: [],
  };
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  getMetaMatchupsMock.mockReset().mockResolvedValue(emptyMatchups());
});

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('MatchupMatrix — reload control has a visible label (F1, plan §3.9)', () => {
  it('renders a button whose visible text content includes meta:matchupMatrix.reload', async () => {
    render(<MatchupMatrix window={{ days: 14, online: true, bo1: true }} iconsById={{}} />);
    await flushEffects();

    const reloadButton = screen.getByRole('button', {
      name: i18n.t('meta:matchupMatrix.reload') as string,
    });
    expect(reloadButton).toHaveTextContent(i18n.t('meta:matchupMatrix.reload') as string);
  });
});

describe('MatchupMatrix — reload control still triggers a refetch (F2, plan §3.9: onClick unchanged)', () => {
  it('calls getMetaMatchups again when the reload button is clicked', async () => {
    render(<MatchupMatrix window={{ days: 14, online: true, bo1: true }} iconsById={{}} />);
    await flushEffects();
    expect(getMetaMatchupsMock).toHaveBeenCalledTimes(1);

    const reloadButton = screen.getByRole('button', {
      name: i18n.t('meta:matchupMatrix.reload') as string,
    });
    fireEvent.click(reloadButton);
    await flushEffects();

    expect(getMetaMatchupsMock).toHaveBeenCalledTimes(2);
  });
});
