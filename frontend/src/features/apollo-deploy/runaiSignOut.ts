/**
 * Run:ai sign-in (APOLLO_AUTH=runai_proxy; branch deploy/apollo only).
 *
 * On Apollo, Run:ai's login sidecar signs people in and the server turns that
 * into a Wordflow session. Signing out of Wordflow alone would sign the person
 * straight back in, so logout also sends the browser to the sidecar's own
 * sign-out address. See docs/deploy/apollo.md.
 */
import { client } from '@/api/generated/client.gen';

interface ApolloSession {
  runai_proxy: boolean;
  sign_out_url: string | null;
}

/** The sidecar sign-out address under Run:ai sign-in; null everywhere else. */
export const fetchRunaiSignOutUrl = async (): Promise<string | null> => {
  try {
    const { data } = await client.get<{ 200: ApolloSession }, unknown, true>({
      security: [{ in: 'cookie', name: 'wordflow_session', type: 'apiKey' }],
      url: '/api/apollo/session',
      throwOnError: true,
    });
    return data.runai_proxy ? data.sign_out_url : null;
  } catch {
    return null;
  }
};

/** Full-page navigation, separate so tests can replace it. */
export const runaiNavigation = {
  leave: (url: string): void => {
    window.location.assign(url);
  },
};
