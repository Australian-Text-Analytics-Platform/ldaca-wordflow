import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ServerNoticeResource } from '@/api';
import { acknowledgeServerNotice, getServerNotice } from '@/api';
import { useAuth } from '@/features/auth/hooks/useAuth';

/** How often an open page asks again, so a changed notice reaches it (issue 438). */
const REFRESH_MS = 5 * 60 * 1000;
const serverNoticeQueryKey = ['server-notice'] as const;

/**
 * The operator's notice to everyone signed in to a shared server, and
 * whether this person chose Got it for it (recorded on the server, so it
 * holds on every device). Null until it has answered, or when signed out.
 */
export const useServerNotice = (): ServerNoticeResource | null => {
  const { isAuthenticated } = useAuth();
  const query = useQuery({
    queryKey: serverNoticeQueryKey,
    queryFn: async ({ signal }) => (await getServerNotice({ signal, throwOnError: true })).data,
    enabled: isAuthenticated,
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });
  return isAuthenticated ? (query.data ?? null) : null;
};

/** Records Got it on the server; the banner hides at once, and a stale notice is fetched again. */
export const useAcknowledgeServerNotice = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (noticeId: string) =>
      (await acknowledgeServerNotice({ path: { notice_id: noticeId }, throwOnError: true })).data,
    onMutate: (noticeId) => {
      queryClient.setQueryData<ServerNoticeResource>(serverNoticeQueryKey, (current) =>
        current?.notice?.id === noticeId ? { ...current, acknowledged: true } : current,
      );
    },
    onSuccess: (resource) => {
      queryClient.setQueryData(serverNoticeQueryKey, resource);
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: serverNoticeQueryKey });
    },
  });
};
