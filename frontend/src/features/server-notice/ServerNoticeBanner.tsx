import { Info } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { useAcknowledgeServerNotice, useServerNotice } from './useServerNotice';

/**
 * The operator's notice to everyone signed in to a shared server (issue 438),
 * across the top of the workspace until the person chooses Got it, which the
 * server records with their name, email and the time. A new text shows
 * again. Hints and suggestions being off does not hide it: it says where data
 * goes.
 */
export function ServerNoticeBanner() {
  const resource = useServerNotice();
  const acknowledge = useAcknowledgeServerNotice();
  const notice = resource?.notice;
  if (!notice || resource.acknowledged) return null;

  return (
    <section
      aria-label="Notice from this server"
      data-testid="server-notice"
      className="flex shrink-0 items-start gap-3 border-b border-info bg-info-background px-4 py-2.5 text-body text-foreground"
    >
      <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1 [&_a]:text-link [&_a]:underline [&_p]:m-0">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          skipHtml
          components={{
            a: ({ href, children }) =>
              href?.startsWith('https://') ? (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ) : (
                <span>{children}</span>
              ),
            img: ({ alt }) => (alt ? <span>{alt}</span> : null),
          }}
        >
          {notice.text}
        </ReactMarkdown>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0"
        onClick={() => {
          acknowledge.mutate(notice.id);
        }}
      >
        Got it
      </Button>
    </section>
  );
}
