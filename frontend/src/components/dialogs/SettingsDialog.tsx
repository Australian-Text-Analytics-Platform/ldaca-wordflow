import { useState } from 'react';
import { Bot, Eye, FolderOpen, Hash, KeyRound, Moon, RotateCcw, Sparkles, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { DataFolderSettingsPanel } from '@/components/dialogs/DataFolderSettingsPanel';
import { ToolCacheSettingsPanel } from '@/components/dialogs/ToolCacheSettingsPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type SettingsTab, useSettingsDialogStore } from '@/stores/settingsDialogStore';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useGuidanceAcknowledgmentsStore } from '@/features/guidance/acknowledgmentsStore';
import {
  useUpdateUserPreferences,
  useUserPreferences,
} from '@/features/preferences/useUserPreferences';
import { DataPortalCredentialPanel } from '@/features/provider-credentials/components/DataPortalCredentialPanel';
import {
  applyColorTheme,
  DARK_THEME,
  LIGHT_THEME,
  useActiveTheme,
} from '@/features/theme/themeRuntime';
import { DesktopUpdateSettings } from '@/features/updater/DesktopUpdateSettings';
import { AiProvidersPreferencesPanel } from '@/features/views/annotation/components/AiProvidersPreferencesPanel';
import { useVisibleViews } from '@/features/views/useVisibleViews';
import { VIEW_DEFINITIONS } from '@/features/views/viewRegistry';
import { useWorkspaceData } from '@/features/workspace/common/hooks/useWorkspaceData';
import { isTauri } from '@/lib/isTauri';
import { cn } from '@/lib/utils';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The tab shown when the dialog opens (issue 249). */
  initialTab?: SettingsTab;
}

const SETTINGS_TABS = [
  { value: 'general', label: 'General', icon: Sparkles },
  { value: 'portal', label: 'Portal', icon: KeyRound },
  { value: 'ai', label: 'AI', icon: Bot },
  { value: 'workspace', label: 'Project', icon: FolderOpen },
  { value: 'views', label: 'Views', icon: Eye },
  { value: 'guidance', label: 'Guidance', icon: Hash },
] as const;

/**
 * Unified preferences window opened from the header settings cog. It presents
 * backend-synced preferences and browser-local settings in one vertical-tab
 * surface while preserving workflow-local quick entry points elsewhere.
 * Used by: the shared application header because the app shell owns the persistent action for user preferences.
 * Flow: route account controls through the preference API, keep guidance
 * acknowledgments device-local, and reuse the working-directory backend config
 * panel in single-user mode.
 */
export function SettingsDialog({
  open,
  onOpenChange,
  initialTab = 'general',
}: SettingsDialogProps) {
  const { workspaces } = useWorkspaceData();
  const userId = useAuth().user?.id ?? null;
  const visibleViews = useVisibleViews();
  const acknowledgments = useGuidanceAcknowledgmentsStore((state) =>
    userId ? state.byUser[userId] : undefined,
  );
  const resetAcknowledgments = useGuidanceAcknowledgmentsStore((state) => state.reset);
  // A hint's Turn off hints walks people here: point out the Guidance tab,
  // then the option, which they untick themselves (issue 358).
  const guidingHints = useSettingsDialogStore((state) => state.guide) === 'contextual-hints';
  const endGuide = useSettingsDialogStore((state) => state.endGuide);
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const {
    preferences,
    isError: preferencesError,
    isSuccess: preferencesReady,
    refetch: refetchPreferences,
  } = useUserPreferences();
  const updatePreferences = useUpdateUserPreferences();
  const activeTheme = useActiveTheme();
  const favoriteWorkspaces = preferences.favorite_workspaces ?? [];
  const analysisMultiTabEnabled = preferences.analysis_multi_tab_enabled ?? false;
  const contextualHintsEnabled = preferences.contextual_hints_enabled ?? false;
  /**
   * Called by: the shadcn Switch for the analysis multi-tab preference.
   * The preference controls chrome visibility only, so both directions write
   * immediately without reading or changing persisted analysis tabs.
   */
  const handleAnalysisMultiTabChange = (enabled: boolean) => {
    updatePreferences.mutate({ analysis_multi_tab_enabled: enabled });
  };

  /** Applies the selected theme immediately, then lets the account mutation confirm or roll it back. */
  const handleThemeChange = (dark: boolean) => {
    const previousTheme = activeTheme;
    const nextTheme = dark ? DARK_THEME : LIGHT_THEME;
    applyColorTheme(nextTheme);
    updatePreferences.mutate(
      { color_theme: nextTheme },
      {
        onError: () => {
          applyColorTheme(previousTheme);
        },
      },
    );
  };

  /** Clears versioned Contextual Hint acknowledgments for the current user only. */
  const handleResetHints = () => {
    if (userId) resetAcknowledgments(userId);
    toast('Contextual Hint history reset. Eligible hints can appear again.');
  };

  /** Called by: workspace favorites panel because Settings needs labels where the workspace list already has them. */
  const workspaceLabel = (workspaceId: string) => {
    const workspace = workspaces.find((item) => item.id === workspaceId);
    return workspace?.name ?? workspaceId;
  };

  const syncBadge = { label: 'Account', variant: 'outline' as const };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[80dvh] w-[80vw] max-w-none flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-surface-border/60 px-6 py-4">
            <div className="flex items-start justify-between gap-4 pr-8">
              <div className="space-y-1">
                <DialogTitle>Settings</DialogTitle>
                <DialogDescription>
                  Manage saved preferences and browser-side options.
                </DialogDescription>
              </div>
              <Badge variant={syncBadge.variant}>{syncBadge.label}</Badge>
            </div>
          </DialogHeader>
          <Tabs
            value={tab}
            onValueChange={(value) => {
              setTab(value as SettingsTab);
            }}
            orientation="vertical"
            className="flex min-h-0 flex-1 flex-row gap-0 overflow-hidden"
          >
            <TabsList className="h-full w-52 shrink-0 flex-col justify-start overflow-y-auto rounded-none border-r border-surface-border/60 bg-panel/30 p-2">
              {SETTINGS_TABS.map(({ value, label, icon: Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  data-guide-target={
                    guidingHints && value === 'guidance' && tab !== 'guidance' ? '' : undefined
                  }
                  className={cn(
                    'h-9 w-full justify-start gap-2 px-3 text-left flex-none',
                    guidingHints &&
                      value === 'guidance' &&
                      tab !== 'guidance' &&
                      'ring-2 ring-focus',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-6">
              {guidingHints ? (
                <p
                  role="status"
                  className="mb-4 rounded-md border border-focus bg-list-hover px-3 py-2 text-body text-foreground"
                >
                  {tab === 'guidance'
                    ? 'Untick Show contextual hints to turn hints off. Come back here to turn them on again.'
                    : 'To turn hints off, open Guidance on the left.'}
                </p>
              ) : null}
              <TabsContent value="general" className="mt-0 space-y-5">
                <section className="space-y-3">
                  <div>
                    <h3 className="text-body font-semibold">Appearance</h3>
                    <p className="text-body text-description">
                      Use the VS Code 2026 Light or Dark theme. This preference follows your
                      account.
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
                    <Label
                      htmlFor="settings-color-theme"
                      className="flex min-w-0 items-center gap-2 text-body font-medium"
                    >
                      {activeTheme === DARK_THEME ? (
                        <Moon className="size-4 shrink-0" aria-hidden />
                      ) : (
                        <Sun className="size-4 shrink-0" aria-hidden />
                      )}
                      <span>{activeTheme === DARK_THEME ? 'Dark 2026' : 'Light 2026'}</span>
                    </Label>
                    <Switch
                      id="settings-color-theme"
                      checked={activeTheme === DARK_THEME}
                      disabled={!preferencesReady || updatePreferences.isPending}
                      onCheckedChange={handleThemeChange}
                      aria-label="Use Dark 2026 theme"
                    />
                  </div>
                  {preferencesError && (
                    <div className="flex items-center justify-between gap-3 text-label-secondary text-error">
                      <span>Couldn't load the account theme preference.</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void refetchPreferences()}
                      >
                        Retry
                      </Button>
                    </div>
                  )}
                </section>
                <section className="space-y-3">
                  <div>
                    <h3 className="text-body font-semibold">Preference sync</h3>
                    <p className="text-body text-description">
                      These preferences follow your account. Provider credentials use dedicated
                      mode-specific storage and are not User Preferences.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-body">
                    <Badge variant={syncBadge.variant}>{syncBadge.label}</Badge>
                    <Badge variant="outline">{favoriteWorkspaces.length} favorites</Badge>
                    <Badge variant="outline">{visibleViews.length} visible views</Badge>
                  </div>
                </section>
                <section className="border-t border-surface-border/60 pt-4">
                  <div className="flex items-center justify-between gap-4 rounded-md border border-surface-border/70 px-3 py-2">
                    <Label htmlFor="settings-analysis-multi-tab" className="text-body font-medium">
                      Enable multi-tab
                    </Label>
                    <Switch
                      id="settings-analysis-multi-tab"
                      checked={analysisMultiTabEnabled}
                      onCheckedChange={handleAnalysisMultiTabChange}
                    />
                  </div>
                </section>
                {isTauri() && <DesktopUpdateSettings />}
              </TabsContent>

              <TabsContent value="portal" className="mt-0 space-y-5">
                <DataPortalCredentialPanel />
              </TabsContent>

              <TabsContent value="ai" className="mt-0">
                <AiProvidersPreferencesPanel />
              </TabsContent>

              <TabsContent value="workspace" className="mt-0 space-y-5">
                <section className="space-y-3">
                  <div>
                    <h3 className="text-body font-semibold">Data folder</h3>
                    <p className="text-body text-description">
                      Where Wordflow keeps your Projects, imported files, and settings.
                    </p>
                  </div>
                  <DataFolderSettingsPanel />
                </section>
                <section className="space-y-3 border-t border-surface-border/60 pt-4">
                  <div>
                    <h3 className="text-body font-semibold">Tool caches</h3>
                    <p className="text-body text-description">
                      Wordflow keeps the results of slow steps so later runs on the same text are
                      faster. Clearing frees disk space; nothing in your Projects changes.
                    </p>
                  </div>
                  <ToolCacheSettingsPanel />
                </section>
                <section className="space-y-3 border-t border-surface-border/60 pt-4">
                  <h3 className="text-body font-semibold">Favourite Projects</h3>
                  {favoriteWorkspaces.length ? (
                    <div className="space-y-2">
                      {favoriteWorkspaces.map((workspaceId) => (
                        <div
                          key={workspaceId}
                          className="flex items-center justify-between gap-3 rounded-md border border-surface-border/70 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-body font-medium">
                              {workspaceLabel(workspaceId)}
                            </p>
                            <p className="truncate text-label-secondary text-description">
                              {workspaceId}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              updatePreferences.mutate({
                                favorite_workspaces: favoriteWorkspaces.filter(
                                  (id) => id !== workspaceId,
                                ),
                              });
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-body text-description">No favourite Projects saved.</p>
                  )}
                </section>
              </TabsContent>

              <TabsContent value="views" className="mt-0 space-y-3">
                <div>
                  <h3 className="text-body font-semibold">Visible views</h3>
                  <p className="text-body text-description">
                    Data Loader stays visible so Projects remain reachable.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {VIEW_DEFINITIONS.map(({ id: view, label, requiresWorkspace }) => {
                    const checked = visibleViews.includes(view);
                    const disabled = !requiresWorkspace;
                    return (
                      <Label
                        key={view}
                        htmlFor={`settings-view-${view}`}
                        className="flex items-center gap-3 rounded-md border border-surface-border/70 px-3 py-2 text-body"
                      >
                        <Checkbox
                          id={`settings-view-${view}`}
                          checked={checked}
                          disabled={disabled}
                          onCheckedChange={(nextChecked) => {
                            const hiddenViews = new Set(preferences.hidden_views ?? []);
                            if (nextChecked === true) hiddenViews.delete(view);
                            else hiddenViews.add(view);
                            updatePreferences.mutate({
                              hidden_views: [...hiddenViews],
                            });
                          }}
                        />
                        <span>{label}</span>
                      </Label>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="guidance" className="mt-0 space-y-4">
                <section className="space-y-3">
                  <p className="text-label-secondary text-description">
                    Hints show tips while you learn Wordflow. Turn them off here, and back on here
                    at any time.
                  </p>
                  <Label
                    htmlFor="settings-hints-enabled"
                    data-highlighted={guidingHints && tab === 'guidance' ? '' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-md border border-surface-border/70 px-3 py-2 text-body',
                      guidingHints && 'border-focus ring-2 ring-focus',
                    )}
                  >
                    <Checkbox
                      id="settings-hints-enabled"
                      checked={contextualHintsEnabled}
                      onCheckedChange={(checked) => {
                        updatePreferences.mutate({
                          contextual_hints_enabled: checked === true,
                        });
                        endGuide();
                      }}
                    />
                    <span>Show contextual hints</span>
                  </Label>
                  <div className="flex flex-wrap gap-2 text-body">
                    <Badge variant="outline">
                      {Object.keys(acknowledgments ?? {}).length} acknowledged
                    </Badge>
                  </div>
                  <Button type="button" variant="outline" onClick={handleResetHints}>
                    <RotateCcw className="h-4 w-4" />
                    Reset Contextual Hint history
                  </Button>
                </section>
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
