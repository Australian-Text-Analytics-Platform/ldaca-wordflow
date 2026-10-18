import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import CILogonLogin from '../CILogonLogin';
import { LoginScreen } from '../LoginScreen';

describe('OIDC sign-in button (issue 405)', () => {
  it('says SSO, not a provider name, and loads no provider image', () => {
    render(<CILogonLogin />);

    const link = screen.getByRole('link', { name: 'Sign in with SSO' });
    expect(link.getAttribute('href')).toContain('/api/auth/cilogon/login');
    expect(screen.queryByText(/CILogon/)).toBeNull();
    expect(link).not.toContainHTML('cilogon.org');
  });

  it('tells users to sign in with single sign-on', () => {
    render(
      <LoginScreen authMethods={[{ name: 'cilogon', display_name: 'CILogon', enabled: true }]} />,
    );

    expect(
      screen.getByText('LDaCA Wordflow requires you to sign in with single sign-on (SSO).'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in with SSO' })).toBeInTheDocument();
  });
});
