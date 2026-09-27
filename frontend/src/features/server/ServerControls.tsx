import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { useEditingNavigation } from '@/features/table-editing/useEditingNavigation';
import { ProjectError, request } from '@/features/project/api';
import { reportProjectError } from '@/features/project/projectErrors';
import { saveGeneratedExport } from '@/features/tools/common/chartExport';
import { FileLibrary } from './FileLibrary';
import { useServer } from './context';

interface Destination {
  name: string | null;
}
export function ServerControls({ projectBase }: { projectBase: string }) {
  const server = useServer();
  const cache = useQueryClient();
  const navigate = useEditingNavigation();
  const [library, setLibrary] = useState<'data' | 'projects' | null>(null);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [prompt, setPrompt] = useState<'untitled' | 'interrupt' | 'save' | null>(null);
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
  if (!server) return null;
  const run = (action: () => Promise<void>) => {
    operation.mutate(action);
  };
  const change = async (target: Destination, discard = false, interrupt = false) => {
    await request(server.base, '/api/server/project', 'post', {
      body: {
        session_id: server.status.session_id,
        name: target.name,
        discard_untitled: discard,
        interrupt,
      },
    });
    setPrompt(null);
    setDestination(null);
    setLibrary(null);
    await server.refresh();
  };
  const open = (name: string | null) => {
    navigate(() => {
      const target = { name };
      setDestination(target);
      run(() => change(target));
    });
  };
  const save = async (name: string | null) => {
    await request(server.base, '/api/server/project/save', 'post', {
      body: { session_id: server.status.session_id, name },
    });
    await server.refresh();
    await cache.invalidateQueries({ queryKey: ['native', projectBase, 'project'] });
    setPrompt(null);
    if (destination) await change(destination);
  };
  const requestSave = (as: boolean) => {
    navigate(() => {
      setDestination(null);
      if (as || !server.status.project?.path) {
        setFilename('');
        setPrompt('save');
      } else run(() => save(null));
    });
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={operation.isPending}>
            Project
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              open(null);
            }}
          >
            New project
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setLibrary('projects');
            }}
          >
            Open / manage projects…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              requestSave(false);
            }}
          >
            Save
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              requestSave(true);
            }}
          >
            Save As…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              run(async () => {
                const response = await request(
                  server.base,
                  '/api/server/project/{id}/download',
                  'get',
                  { path: { id: server.status.session_id } },
                );
                await saveGeneratedExport(
                  await response.blob(),
                  `${server.status.project?.title ?? 'Untitled'}.wfpj`,
                );
              });
            }}
          >
            Download project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setLibrary('data');
        }}
      >
        Data files
      </Button>
      <Dialog
        open={library !== null}
        onOpenChange={(value) => {
          if (!value) setLibrary(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogTitle>{library === 'data' ? 'Data files' : 'Projects'}</DialogTitle>
          <DialogDescription>Manage files stored on this server.</DialogDescription>
          {library && <FileLibrary library={library} onOpenProject={open} />}
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
        <DialogContent>
          <DialogTitle>
            {prompt === 'save'
              ? 'Save project'
              : prompt === 'interrupt'
                ? 'Cancel active work?'
                : 'Save Untitled project?'}
          </DialogTitle>
          <DialogDescription>
            {prompt === 'save'
              ? 'Choose an unused filename. The project will be saved in the server’s projects directory.'
              : prompt === 'interrupt'
                ? 'Changing projects cancels active work and waits for cleanup. The current project stays open if cancellation fails.'
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
            >
              Stay
            </Button>
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
