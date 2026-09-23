import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CopyDeckListButton } from './CopyDeckListButton';

describe('CopyDeckListButton', () => {
  const writeText = vi.fn<(text: string) => Promise<void>>();

  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
  });

  it('copies the deck in PTCGL format and confirms', async () => {
    render(
      <CopyDeckListButton
        cards={[
          { name: "N's Zorua", count: 4, type: 'Pokemon', set: 'JTG', number: '97' },
          { name: 'Darkness Energy', count: 8, type: 'Energy' },
        ]}
      />,
    );

    fireEvent.click(screen.getByTestId('copy-deck-list'));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const text = writeText.mock.calls[0][0];
    expect(text).toContain("4 N's Zorua JTG 97");
    expect(text).toContain('8 Basic {D} Energy SVE 7');
    expect(text).toContain('Total Cards: 12');
    expect(screen.queryByTestId('copy-deck-missing-prints')).toBeNull();
  });

  it('warns when cards have no set code', () => {
    render(<CopyDeckListButton cards={[{ name: 'Judge', count: 1, type: 'Trainer' }]} />);
    expect(screen.getByTestId('copy-deck-missing-prints')).toBeTruthy();
  });

  it('is disabled for an empty deck', () => {
    render(<CopyDeckListButton cards={[]} />);
    expect((screen.getByTestId('copy-deck-list') as HTMLButtonElement).disabled).toBe(true);
  });
});
