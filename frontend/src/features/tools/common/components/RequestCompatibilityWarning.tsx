import type { RequestIssue } from '../analysisRequest';

export function RequestCompatibilityWarning({
  issues,
  action = 'Run',
}: {
  issues: RequestIssue[];
  action?: 'Run' | 'Start';
}) {
  if (!issues.length) return null;
  return (
    <aside
      className="min-w-0 rounded-md border border-border bg-background-secondary p-3 text-sm"
      aria-label="Saved settings compatibility"
    >
      <p className="font-semibold">These saved settings are not recognized:</p>
      <ul className="my-2 max-h-64 space-y-3 overflow-auto">
        {issues.map((issue) => {
          const json = JSON.stringify(issue.value, null, 2);
          return (
            <li key={issue.path} className="min-w-0">
              <code className="[overflow-wrap:anywhere]">{issue.path}</code>
              {json.length > 160 ? (
                <details>
                  <summary className="cursor-pointer">Show original value</summary>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {json}
                  </pre>
                </details>
              ) : (
                <pre className="whitespace-pre-wrap [overflow-wrap:anywhere]">{json}</pre>
              )}
              <p className="text-label-secondary">{issue.explanation}</p>
            </li>
          );
        })}
      </ul>
      <p>{action} will save only supported settings.</p>
    </aside>
  );
}
