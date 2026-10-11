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
import { OperationError } from '@/features/project/OperationError';
import { useEditingNavigation } from '@/features/table-editing/useEditingNavigation';
import { saveGeneratedExport } from '@/lib/download';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
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
}: ProjectDataDialogProps) {
  const cache = useQueryClient();
  const navigate = useEditingNavigation();
  const title = useRef<HTMLHeadingElement>(null);
  const promptTrigger = useRef<HTMLElement>(null);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [prompt, setPrompt] = useState<'rename' | 'interrupt' | 'close' | null>(null);
  const [filename, setFilename] = useState('');
  const operation = useMutation({
    mutationFn: async (action: () => Promise<void>) => action(),
    meta: { reportError: false },
    onError: (error) => {
      if (prompt === 'close' && error instanceof ProjectError && error.code === 'task_active')
        setPrompt('interrupt');
    },
  });
  const [duplicated, setDuplicated] = useState<string | null>(null);
  const run = (action: () => Promise<void>) => {
    setDuplicated(null);
    operation.mutate(action);
  };
  const change = async (target: Destination, interrupt = false) => {
    if (target.close && currentProject) {
      await request(base, '/api/server/project/close', 'post', {
        body: { project_id: currentProject.project_id, interrupt },
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
  const rename = async () => {
    if (!currentProject) return;
    const name = filename.trim();
    await request(base, '/api/server/project/rename', 'post', {
      body: {
        project_id: currentProject.project_id,
        name: name.toLowerCase().endsWith('.wfpj') ? name : `${name}.wfpj`,
      },
    });
    await refresh();
    await cache.invalidateQueries({
      queryKey: ['native', `${base}/project/${currentProject.project_id}`, 'project'],
    });
    await cache.invalidateQueries({ queryKey: ['server-files', base, 'projects'] });
    setPrompt(null);
  };
  const duplicate = async () => {
    if (!currentProject) return;
    const file = await (
      await request(base, '/api/server/project/duplicate', 'post', {
        body: { project_id: currentProject.project_id },
      })
    ).json();
    await refresh();
    await cache.invalidateQueries({ queryKey: ['server-files', base, 'projects'] });
    setDuplicated(file.name);
  };
  const error = operation.isError && (
    <OperationError
      title={prompt === 'rename' ? 'Could not rename project' : 'Project action failed'}
      error={operation.error}
      onRetry={() => {
        if (prompt === 'rename') run(rename);
        else if (operation.variables) run(operation.variables);
      }}
    />
  );
  const dismiss = () => {
    if (currentProject && !operation.isPending && !prompt) onOpenChange(false);
  };
  return (
    <>
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
              {!prompt && error}
              {duplicated && (
                <p role="status">Created {duplicated}. Your current project remains open.</p>
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
                            <DropdownMenuItem
                              onSelect={() => {
                                operation.reset();
                                setDestination(null);
                                setFilename(currentProject.project?.title ?? '');
                                setPrompt('rename');
                              }}
                            >
                              Rename…
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => run(duplicate)}>
                              Duplicate project
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
              : prompt === 'rename'
                ? 'Rename project'
                : prompt === 'interrupt'
                  ? 'Cancel active work?'
                  : 'Rename project'}
          </DialogTitle>
          <DialogDescription>
            {prompt === 'close'
              ? 'This closes the project in every window that has it open.'
              : prompt === 'rename'
                ? 'Choose an unused filename. Rename is available while the project is idle and no Table edit session is open.'
                : prompt === 'interrupt'
                  ? 'Closing this project cancels active work and waits for cleanup. The current project stays open if cancellation fails.'
                  : 'Choose an unused filename.'}
          </DialogDescription>
          {prompt === 'rename' && (
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
          {error}
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
            {prompt === 'rename' && (
              <Button
                disabled={operation.isPending || !filename.trim()}
                onClick={() => {
                  run(rename);
                }}
              >
                Rename
              </Button>
            )}
            {prompt === 'interrupt' && (
              <Button
                disabled={operation.isPending}
                onClick={() => {
                  if (destination) run(() => change(destination, true));
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
