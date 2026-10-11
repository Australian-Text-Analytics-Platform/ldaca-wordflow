import { AccountControls } from './AccountControls';
import { ProjectError, request } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { reportProjectError } from '@/features/project/projectErrors';
import { useEditingNavigation } from '@/features/table-editing/useEditingNavigation';
import { saveGeneratedExport } from '@/lib/download';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { FileLibrary } from './FileLibrary';
import { type ServerStatus } from './context';
import NativeSettings from '@/features/project/NativeSettings';
import logo from '@/logo.png';

interface Destination {
  name: string | null;
  close?: boolean;
}
interface ProjectDataDialogProps {
  base: string;
  currentProject?: ServerStatus;
  projects: ServerStatus[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  select: (id: string | null) => void;
  refresh: () => Promise<unknown>;
  ready?: boolean;
  connectionError?: boolean;
  notice?: string;
  returnFocus?: () => void;
  toolbarSave?: boolean;
}

/** The same browser library manager serves first arrival and an open workspace. */
export function ProjectDataDialog({
  base,
  currentProject,
  projects,
  open: visible,
  onOpenChange,
  select,
  refresh,
  ready = true,
  connectionError = false,
  notice,
  returnFocus,
  toolbarSave = false,
}: ProjectDataDialogProps) {
  const cache = useQueryClient();
  const navigate = useEditingNavigation();
  const title = useRef<HTMLHeadingElement>(null);
  const promptTrigger = useRef<HTMLElement>(null);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [prompt, setPrompt] = useState<'untitled' | 'interrupt' | 'save' | 'close' | null>(null);
  const [filename, setFilename] = useState('');
  const operation = useMutation({
    mutationFn: async (action: () => Promise<void>) => action(),
    meta: { reportError: false },
    onError: (error) => {
      if (error instanceof ProjectError && error.code === 'save_required') setPrompt('untitled');
      else if (error instanceof ProjectError && error.code === 'task_active')
        setPrompt('interrupt');
      else reportProjectError(error);
    },
  });
  const run = (action: () => Promise<void>) => operation.mutate(action);
  const change = async (target: Destination, discard = false, interrupt = false) => {
    if (target.close && currentProject) {
      await request(base, '/api/server/project/close', 'post', {
        body: { project_id: currentProject.project_id, discard_untitled: discard, interrupt },
      });
      select(null);
    } else {
      const opened = await (
        await request(base, '/api/server/project', 'post', { body: { name: target.name } })
      ).json();
      await refresh();
      select(opened.project_id);
    }
    setPrompt(null);
    setDestination(null);
    onOpenChange(false);
    await refresh();
  };
  const open = (name: string | null) => {
    navigate(() => {
      const target = { name };
      setDestination(target);
      run(() => change(target));
    });
  };
  const save = async (name: string | null, next = destination) => {
    if (!currentProject) return;
    await request(base, '/api/server/project/save', 'post', {
      body: { project_id: currentProject.project_id, name },
    });
    await refresh();
    await cache.invalidateQueries({
      queryKey: ['native', `${base}/project/${currentProject.project_id}`, 'project'],
    });
    await cache.invalidateQueries({ queryKey: ['server-files', base, 'projects'] });
    setPrompt(null);
    if (next) await change(next);
  };
  const requestSave = (as: boolean) => {
    if (!currentProject) return;
    if (!visible && document.activeElement instanceof HTMLElement) {
      promptTrigger.current = document.activeElement;
    }
    navigate(() => {
      setDestination(null);
      if (as || !currentProject.project?.path) {
        setFilename('');
        setPrompt('save');
      } else run(() => save(null, null));
    });
  };
  const shortcut = useEffectEvent((event: KeyboardEvent) => {
    if (
      !(event.metaKey || event.ctrlKey) ||
      event.key.toLowerCase() !== 's' ||
      event.altKey ||
      event.shiftKey ||
      event.isComposing
    )
      return;
    event.preventDefault();
    if (!event.repeat && !operation.isPending && !prompt) requestSave(false);
  });
  const hasProject = Boolean(currentProject?.project);
  useEffect(() => {
    if (!hasProject) return;
    const keydown = (event: KeyboardEvent) => shortcut(event);
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [hasProject]);
  const dismiss = () => {
    if (currentProject && !operation.isPending && !prompt) onOpenChange(false);
  };
  return (
    <>
      {toolbarSave && (
        <Button
          variant="secondary"
          size="sm"
          disabled={!hasProject || operation.isPending || prompt !== null}
          onClick={() => requestSave(false)}
          aria-keyshortcuts="Meta+S Control+S"
          title="Save project (⌘S / Ctrl+S)"
        >
          Save
        </Button>
      )}
      <Dialog
        open={visible}
        onOpenChange={(value) => {
          if (!value) dismiss();
        }}
      >
        <DialogContent
          showCloseButton={Boolean(currentProject)}
          className="flex h-[90dvh] w-[90vw] max-w-[calc(100vw_-_2rem)] flex-col gap-6 border-0 bg-transparent p-0 shadow-none outline-none"
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            if (!currentProject || operation.isPending || prompt) event.preventDefault();
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            title.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            if (returnFocus) {
              event.preventDefault();
              returnFocus();
            }
          }}
        >
          {!currentProject && (
            <img src={logo} alt="LDaCA" className="mx-auto h-auto w-60 shrink-0" />
          )}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--vscode-widget-border)] bg-widget shadow-[var(--vscode-shadow-lg)]">
            <header className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-b border-surface-border px-5 py-3 pr-10">
              <DialogTitle ref={title} tabIndex={-1} className="text-heading-2 outline-none">
                {currentProject ? 'Project & Data' : 'Welcome to Wordflow'}
              </DialogTitle>
              <DialogDescription className="min-w-0 flex-1">
                {currentProject
                  ? 'Manage your projects and data files.'
                  : 'Create or open a project to begin.'}
              </DialogDescription>
              <div className="ml-auto flex items-center gap-2">
                <NativeSettings />
                <AccountControls base={base} />
              </div>
            </header>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5 min-[900px]:overflow-hidden">
              {notice && (
                <p role="status" className="mb-4 text-description">
                  {notice}
                </p>
              )}
              {!ready && (
                <div
                  role={connectionError ? 'alert' : 'status'}
                  className="mb-4 flex flex-wrap items-center gap-3"
                >
                  <p>{connectionError ? 'Could not connect to Wordflow.' : 'Opening Wordflow…'}</p>
                  {connectionError && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        void refresh();
                      }}
                    >
                      Retry connection
                    </Button>
                  )}
                </div>
              )}
              {operation.isPending && (
                <p role="status" className="mb-3 text-description">
                  Working on your project…
                </p>
              )}
              <div className="grid shrink-0 gap-6 min-[900px]:min-h-0 min-[900px]:flex-1 min-[900px]:grid-cols-2">
                <FileLibrary
                  dropUpload
                  base={base}
                  library="projects"
                  projects={projects}
                  currentProject={currentProject}
                  ready={ready}
                  disabled={operation.isPending}
                  onOpenProject={open}
                  onSelectProject={(id) =>
                    navigate(() => {
                      select(id);
                      onOpenChange(false);
                    })
                  }
                  actions={
                    <Button disabled={!ready || operation.isPending} onClick={() => open(null)}>
                      New project
                    </Button>
                  }
                  currentActions={
                    currentProject && (
                      <div className="flex min-w-0 items-center gap-2 border-b border-surface-border pb-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-description text-body-secondary">Current project</p>
                          <p className="break-all font-medium">
                            {currentProject.project?.title ?? 'Untitled'}
                          </p>
                        </div>
                        <Button
                          variant="secondary"
                          disabled={operation.isPending}
                          onFocus={(event) => {
                            promptTrigger.current = event.currentTarget;
                          }}
                          onClick={() => requestSave(false)}
                        >
                          Save
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Current project actions"
                              onPointerDown={(event) => {
                                promptTrigger.current = event.currentTarget;
                              }}
                              onFocus={(event) => {
                                promptTrigger.current = event.currentTarget;
                              }}
                              disabled={operation.isPending}
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => requestSave(true)}>
                              Save As…
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                run(async () => {
                                  const response = await request(
                                    base,
                                    '/api/server/project/{id}/download',
                                    'get',
                                    { path: { id: currentProject.project_id } },
                                  );
                                  await saveGeneratedExport(
                                    await response.blob(),
                                    `${currentProject.project?.title ?? 'Untitled'}.wfpj`,
                                  );
                                })
                              }
                            >
                              Download project
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                navigate(() => {
                                  setDestination({ name: null, close: true });
                                  setPrompt('close');
                                })
                              }
                            >
                              Close project…
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )
                  }
                />
                <FileLibrary
                  dropUpload
                  base={base}
                  library="data"
                  currentProject={currentProject}
                  ready={ready}
                  disabled={operation.isPending}
                />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={prompt !== null}
        onOpenChange={(value) => {
          if (!value && !operation.isPending) {
            setPrompt(null);
            setDestination(null);
          }
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (promptTrigger.current?.isConnected) promptTrigger.current.focus();
          }}
        >
          <DialogTitle>
            {prompt === 'close'
              ? 'Close shared project?'
              : prompt === 'save'
                ? 'Save project'
                : prompt === 'interrupt'
                  ? 'Cancel active work?'
                  : 'Save Untitled project?'}
          </DialogTitle>
          <DialogDescription>
            {prompt === 'close'
              ? 'This closes the project in every window that has it open.'
              : prompt === 'save'
                ? 'Choose an unused filename. The project will be saved in the server’s projects directory.'
                : prompt === 'interrupt'
                  ? 'Closing this project cancels active work and waits for cleanup. The current project stays open if cancellation fails.'
                  : 'Save this project before continuing, or discard its contents.'}
          </DialogDescription>
          {prompt === 'save' && (
            <label className="flex flex-col gap-2">
              Filename
              <Input
                autoFocus
                value={filename}
                onChange={(event) => {
                  setFilename(event.target.value);
                }}
                placeholder="My research.wfpj"
              />
            </label>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              disabled={operation.isPending}
              onClick={() => {
                setPrompt(null);
                setDestination(null);
              }}
              autoFocus
            >
              Stay
            </Button>
            {prompt === 'close' && (
              <Button
                disabled={operation.isPending}
                onClick={() => {
                  if (destination) run(() => change(destination));
                }}
              >
                Close project
              </Button>
            )}
            {prompt === 'untitled' && (
              <>
                <Button
                  variant="ghost"
                  disabled={operation.isPending}
                  onClick={() => {
                    if (destination) run(() => change(destination, true));
                  }}
                >
                  Discard
                </Button>
                <Button
                  disabled={operation.isPending}
                  onClick={() => {
                    setFilename('');
                    setPrompt('save');
                  }}
                >
                  Save…
                </Button>
              </>
            )}
            {prompt === 'save' && (
              <Button
                disabled={operation.isPending || !filename.trim()}
                onClick={() => {
                  run(() =>
                    save(
                      filename.trim().endsWith('.wfpj')
                        ? filename.trim()
                        : `${filename.trim()}.wfpj`,
                    ),
                  );
                }}
              >
                Save
              </Button>
            )}
            {prompt === 'interrupt' && (
              <Button
                disabled={operation.isPending}
                onClick={() => {
                  if (destination) run(() => change(destination, true, true));
                }}
              >
                Cancel work and continue
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
