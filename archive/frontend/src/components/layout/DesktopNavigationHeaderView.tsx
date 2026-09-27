import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useRef, useState } from 'react';
import type { Tab } from '@/api';
import { Button } from '@/components/ui/button';
import InfoIcon from '@/components/help/InfoIcon';
import ReferenceIcon from '@/components/help/ReferenceIcon';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  analysisTabQuickAccessLabel,
  filterAnalysisTabs,
} from '@/features/views/common/analysisNavigation';
import { cn } from '@/lib/utils';
import logo from '@/logo.png';
interface DesktopNavigationHeaderViewProps {
  tools?: ReactNode;
  projectName: string;
  tabs: Tab[];
  unavailableTabWarnings?: string[];
  currentTabId: string | null;
  isLoading: boolean;
  isError: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  hasNativeTrafficLights: boolean;
  onBack?: () => void;
  onForward?: () => void;
  onSelectTab?: (tab: Tab) => void;
  onRetry: () => void;
}

/** VS Code-style macOS title-bar controls with a searchable Project Tab picker. */
export function DesktopNavigationHeaderView({
  tools,
  projectName,
  tabs,
  unavailableTabWarnings = [],
  currentTabId,
  isLoading,
  isError,
  canGoBack,
  canGoForward,
  hasNativeTrafficLights,
  onBack,
  onForward,
  onSelectTab,
  onRetry,
}: DesktopNavigationHeaderViewProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const filteredTabs = filterAnalysisTabs(tabs, query);
  const selectedIndex = Math.min(highlightedIndex, Math.max(filteredTabs.length - 1, 0));

  const changeOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setQuery('');
      setHighlightedIndex(0);
    }
  };

  const chooseTab = (tab: Tab) => {
    onSelectTab?.(tab);
    setOpen(false);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((index) =>
        filteredTabs.length === 0 ? 0 : (index + 1) % filteredTabs.length,
      );
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((index) =>
        filteredTabs.length === 0 ? 0 : (index - 1 + filteredTabs.length) % filteredTabs.length,
      );
      return;
    }
    if (event.key === 'Enter') {
      const tab = filteredTabs[selectedIndex];
      if (tab) {
        event.preventDefault();
        chooseTab(tab);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  };

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

      <div className="flex items-center">
        <nav
          aria-label="Navigation history"
          data-tauri-drag-region="false"
          className="flex items-center gap-1"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-tauri-drag-region="false"
            className="size-[22px] rounded-md text-[var(--vscode-titleBar-activeForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] disabled:opacity-40"
            aria-label="Go back"
            disabled={!canGoBack}
            onClick={onBack}
          >
            <ArrowLeft data-testid="desktop-header-back-icon" className="!size-[18px]" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-tauri-drag-region="false"
            className="size-[22px] rounded-md text-[var(--vscode-titleBar-activeForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] disabled:opacity-40"
            aria-label="Go forward"
            disabled={!canGoForward}
            onClick={onForward}
          >
            <ArrowRight data-testid="desktop-header-forward-icon" className="!size-[18px]" />
          </Button>
        </nav>

        <Popover open={open} onOpenChange={changeOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-tauri-drag-region="false"
              className="ml-1.5 flex h-[22px] w-[38vw] max-w-[600px] min-w-32 items-center justify-center gap-1.5 overflow-hidden rounded-md border border-[var(--vscode-commandCenter-border)] bg-[var(--vscode-commandCenter-background)] px-2 text-[13px] text-[var(--vscode-commandCenter-foreground)] outline-hidden hover:border-[var(--vscode-commandCenter-activeBorder)] hover:bg-[var(--vscode-commandCenter-activeBackground)] hover:text-[var(--vscode-commandCenter-activeForeground)] focus-visible:border-[var(--vscode-commandCenter-activeBorder)] sm:min-w-48"
              aria-label="Open quick access"
            >
              <Search
                data-testid="desktop-header-search-icon"
                className="size-[18px] shrink-0 opacity-80"
              />
              <span className="min-w-0 truncate">{projectName}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="center"
            side="bottom"
            sideOffset={-22}
            className="w-[min(600px,calc(100vw-2rem))] border-[var(--vscode-editorWidget-border)] bg-[var(--vscode-quickInput-background)] p-2 text-[var(--vscode-quickInput-foreground)]"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              searchInputRef.current?.focus();
            }}
          >
            <Input
              ref={searchInputRef}
              value={query}
              placeholder="Search analysis tabs…"
              aria-label="Search analysis tabs"
              className="mb-2 h-8 px-2 text-body"
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={handleSearchKeyDown}
            />

            <div
              role="listbox"
              aria-label="Project analysis tabs"
              className="max-h-[50vh] overflow-y-auto"
            >
              {unavailableTabWarnings.map((warning) => (
                <p
                  role="alert"
                  key={warning}
                  className="mx-2 mb-2 rounded-sm border border-warning/40 bg-warning/10 px-2 py-1.5 text-body text-warning"
                >
                  {warning}
                </p>
              ))}
              {isLoading ? (
                <p className="px-2 py-4 text-center text-body text-description">Loading Tabs…</p>
              ) : isError ? (
                <div className="flex items-center justify-between gap-3 px-2 py-3">
                  <p className="text-body text-error">Could not load Project Tabs.</p>
                  <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
                    Retry
                  </Button>
                </div>
              ) : projectName === 'No project' ? (
                <p className="px-2 py-4 text-center text-body text-description">
                  Load a Project to access analysis Tabs.
                </p>
              ) : tabs.length === 0 ? (
                <p className="px-2 py-4 text-center text-body text-description">
                  This Project has no analysis Tabs.
                </p>
              ) : filteredTabs.length === 0 ? (
                <p className="px-2 py-4 text-center text-body text-description">
                  No Tabs match “{query}”.
                </p>
              ) : (
                filteredTabs.map((tab, index) => {
                  const selected = tab.id === currentTabId;
                  const highlighted = index === selectedIndex;
                  return (
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      key={tab.id}
                      className={`flex w-full items-center rounded-sm px-2 py-1.5 text-left text-body text-foreground outline-hidden ${
                        highlighted ? 'bg-list-active' : 'hover:bg-list-hover'
                      } ${selected ? 'font-semibold' : ''}`}
                      onMouseMove={() => {
                        setHighlightedIndex(index);
                      }}
                      onClick={() => {
                        chooseTab(tab);
                      }}
                    >
                      <span className="truncate">{analysisTabQuickAccessLabel(tab)}</span>
                    </button>
                  );
                })
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex min-w-0 justify-end">{tools}</div>
    </header>
  );
}
