import { Button } from '@/components/ui/button';
import { request } from '@/api/client';
import { currentAccount, setAccount } from './account';
import { reportProjectError } from '@/features/project/projectErrors';
export function AccountControls({ base }: { base: string }) {
  const account = currentAccount();
  if (!account?.browser_credentials) return null;
  return (
    <Button
      variant="ghost"
      onClick={() => {
        void request(base, '/api/auth/logout', 'post', {})
          .then(() => {
            setAccount(null);
            window.location.href = `${base}/`;
          })
          .catch(reportProjectError);
      }}
    >
      Sign out {account.name ?? ''}
    </Button>
  );
}
