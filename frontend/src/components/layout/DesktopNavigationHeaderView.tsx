import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import InfoIcon from '@/components/help/InfoIcon';
import ReferenceIcon from '@/components/help/ReferenceIcon';
import { cn } from '@/lib/utils';
import logo from '@/logo.png';

/** Current project location and native application controls. */
export function DesktopNavigationHeaderView({
  tools,
  projectName,
  location,
  hasNativeTrafficLights,
}: {
  tools?: ReactNode;
  projectName: string;
  location: string[];
  hasNativeTrafficLights: boolean;
}) {
  const path = [projectName, ...location];
  return (
    <header
      data-testid="desktop-navigation-header"
      data-tauri-drag-region="deep"
      className={cn(
        'app-titlebar-backplane fixed inset-x-0 top-0 z-30 grid h-(--desktop-titlebar-height) select-none grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 pr-2 text-[var(--vscode-titleBar-activeForeground)]',
        hasNativeTrafficLights ? 'pl-[78px]' : 'pl-2',
      )}
    >
      <div className="flex min-w-0 items-center gap-0.5 overflow-hidden whitespace-nowrap">
        <span className="truncate text-[15px] leading-none font-semibold">Wordflow</span>
        <span
          data-testid="desktop-header-about-control"
          data-tauri-drag-region="false"
          className="flex shrink-0"
        >
          <InfoIcon
            targetKey="general.overview"
            label="About Wordflow"
            className="size-[22px] text-[var(--vscode-icon-foreground)]"
            iconClassName="!size-[18px]"
          />
        </span>
        <span
          data-testid="desktop-header-citation-control"
          data-tauri-drag-region="false"
          className="flex shrink-0"
        >
          <ReferenceIcon
            targetKey="general.platform"
            label="Cite LDaCA Wordflow"
            className="size-[22px] text-[var(--vscode-icon-foreground)]"
            iconClassName="!size-[18px]"
          />
        </span>
        <span className="ml-1 text-[13px] leading-none text-description max-[700px]:hidden">
          by
        </span>
        <img
          src={logo}
          alt="LDaCA Logo"
          className="ml-1.5 h-[28px] w-auto shrink-0 object-contain max-[700px]:hidden"
        />
      </div>

      <nav
        aria-label="Current location"
        title={path.join(' ▸ ')}
        className="ml-1.5 flex h-[22px] w-[38vw] max-w-[600px] min-w-32 items-center justify-center gap-1.5 overflow-hidden rounded-md border border-[var(--vscode-commandCenter-border)] bg-[var(--vscode-commandCenter-background)] px-2 text-[13px] text-[var(--vscode-commandCenter-foreground)] sm:min-w-48"
      >
        <Search
          data-testid="desktop-header-search-icon"
          className="size-[18px] shrink-0 opacity-80"
        />
        <ol className="flex min-w-0 items-center gap-1.5">
          {path.map((part, index) => (
            <li key={index} className="flex min-w-0 items-center gap-1.5">
              {index > 0 && (
                <span aria-hidden="true" className="shrink-0 opacity-60">
                  ▸
                </span>
              )}
              <span
                className="truncate"
                aria-current={index === path.length - 1 ? 'page' : undefined}
              >
                {part}
              </span>
            </li>
          ))}
        </ol>
      </nav>

      <div className="flex min-w-0 justify-end">{tools}</div>
    </header>
  );
}
