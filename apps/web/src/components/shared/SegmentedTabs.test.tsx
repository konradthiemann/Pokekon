import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { List, Sparkles } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedTabs } from './SegmentedTabs';

const items = [
  { id: 'metaList' as const, label: 'Meta list', Icon: Sparkles },
  { id: 'myLists' as const, label: 'My lists', Icon: List },
];

describe('SegmentedTabs', () => {
  it('renders a tablist with exactly one selected tab', () => {
    render(<SegmentedTabs items={items} active="myLists" onChange={() => {}} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'My lists' })).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onChange with the clicked id', async () => {
    const onChange = vi.fn();
    render(<SegmentedTabs items={items} active="myLists" onChange={onChange} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Meta list' }));
    expect(onChange).toHaveBeenCalledWith('metaList');
  });

  it('gives every tab a touch target of at least 44 px', () => {
    render(<SegmentedTabs items={items} active="myLists" onChange={() => {}} />);
    for (const tab of screen.getAllByRole('tab')) expect(tab.className).toContain('min-h-[44px]');
  });
});
