import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { ArchetypeSwitcherButton } from './ArchetypeSwitcherButton';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('ArchetypeSwitcherButton (Spec 7 §4 header)', () => {
  it('shows the icon and the display name, labelled for switching', async () => {
    const onClick = vi.fn();
    const { container } = render(
      <ArchetypeSwitcherButton
        archetypeId="n-zoroark"
        displayName="N's Zoroark"
        onClick={onClick}
      />,
    );
    const button = screen.getByRole('button', { name: /Switch archetype/ });
    expect(button).toHaveTextContent("N's Zoroark");
    expect(container.querySelector('img')).not.toBeNull();
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('asks to choose an archetype when none is set', () => {
    render(<ArchetypeSwitcherButton archetypeId={null} displayName="" onClick={() => {}} />);
    expect(screen.getByRole('button')).toHaveTextContent('Choose archetype');
  });

  it('is at least 44 px tall', () => {
    render(<ArchetypeSwitcherButton archetypeId={null} displayName="" onClick={() => {}} />);
    expect(screen.getByRole('button').className).toContain('min-h-[44px]');
  });
});
