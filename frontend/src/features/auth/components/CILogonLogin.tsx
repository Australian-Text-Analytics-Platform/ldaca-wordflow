import { KeyRound } from 'lucide-react';

import { AuthProviderCard } from '@/features/auth/components/AuthProviderCard';
import { buildCilogonLoginUrl } from '@/features/auth/authRedirectUrls';
import { Button } from '@/components/ui/button';

interface CILogonLoginProps {
  isLoading?: boolean;
  error?: string | null;
}

/**
 * The button for the server's OIDC sign-in (CILOGON_* settings). It says
 * "SSO", not a provider name, because the same sign-in can be CILogon (AAF),
 * a Keycloak realm, or another OIDC provider (issue 405).
 */
export default function CILogonLogin({ isLoading, error }: CILogonLoginProps) {
  const loginUrl = buildCilogonLoginUrl();

  return (
    <AuthProviderCard isLoading={isLoading} error={error}>
      <Button asChild variant="secondary" className="w-full">
        <a href={loginUrl}>
          <KeyRound className="size-5" aria-hidden="true" />
          Sign in with SSO
        </a>
      </Button>
    </AuthProviderCard>
  );
}
