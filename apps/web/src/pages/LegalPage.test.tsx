import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../i18n';
import { LegalPage } from './LegalPage';

describe('LegalPage', () => {
  it('renders the German Impressum with the controller address and DDG section', async () => {
    await i18n.changeLanguage('de');
    render(<LegalPage doc="impressum" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Impressum' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /§ 5 DDG/ })).toBeInTheDocument();
    expect(screen.getByText(/Olfermannstr\. 7/)).toBeInTheDocument();
  });

  it('renders the privacy policy including the GitHub Models / BYOK disclosure', async () => {
    await i18n.changeLanguage('de');
    render(<LegalPage doc="datenschutz" />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Datenschutzerklärung' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /GitHub Models/ })).toBeInTheDocument();
    // The key fact that distinguishes this app from the source template.
    expect(screen.getByText(/AES-256-GCM/)).toBeInTheDocument();
  });

  it('reflows the whole document when the language switches to English', async () => {
    await i18n.changeLanguage('en');
    render(<LegalPage doc="datenschutz" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeInTheDocument();
  });

  it('exposes the back link and cross-links the two legal routes', async () => {
    await i18n.changeLanguage('de');
    render(<LegalPage doc="impressum" />);

    expect(screen.getByRole('link', { name: 'Zurück zur App' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Datenschutz' })).toHaveAttribute(
      'href',
      '/datenschutz',
    );
  });
});
