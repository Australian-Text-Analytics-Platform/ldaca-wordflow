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
import { useState } from 'react';
import { FileLibrary } from './FileLibrary';
import { useServer } from './context';

interface Destination {
  name: string | null;
  close?: boolean;
}
export function ServerControls({ projectBase }: { projectBase: string }) {
  const server = useServer();
  const cache = useQueryClient();
  const navigate = useEditingNavigation();
  const [library, setLibrary] = useState<'data' | 'projects' | null>(null);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [prompt, setPrompt] = useState<'rename' | 'interrupt' | 'close' | null>(null);
  const [duplicated, setDuplicated] = useState<string | null>(null);
  const [filename, setFilename] = useState('');
  const operation = useMutation({
    mutationFn: async (action: () => Promise<void>) => action(),
    meta: { reportError: false },
    onError: (error) => {
      if (prompt === 'close' && error instanceof ProjectError && error.code === 'task_active')
        setPrompt('interrupt');
    },
  });
  if (!server) return null;
  const run = (action: () => Promise<void>) => {
    setDuplicated(null);
    operation.mutate(action);
  };
  const change = async (target: Destination, interrupt = false) => {
    if (target.close) {
      await request(server.base, '/api/server/project/close', 'post', {
        body: { project_id: server.status.project_id, interrupt },
      });
      server.select(null);
    } else {
      const opened = await (
        await request(server.base, '/api/server/project', 'post', { body: { name: target.name } })
      ).json();
      server.select(opened.project_id);
    }
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
  const rename = async () => {
    const name = filename.trim();
    await request(server.base, '/api/server/project/rename', 'post', {
      body: {
        project_id: server.status.project_id,
        name: name.toLowerCase().endsWith('.wfpj') ? name : `${name}.wfpj`,
      },
    });
    await server.refresh();
    await cache.invalidateQueries({ queryKey: ['native', projectBase, 'project'] });
    setPrompt(null);
  };
  const duplicate = async () => {
    const file = await (
      await request(server.base, '/api/server/project/duplicate', 'post', {
        body: { project_id: server.status.project_id },
      })
    ).json();
    await server.refresh();
    setDuplicated(file.name);
  };
  const resetPrompt = () => {
    operation.reset();
    setDestination(null);
    setPrompt(null);
  };
  const error = operation.isError && (
    <OperationError
      error={operation.error}
      title={prompt === 'rename' ? 'Could not rename project' : 'Project action failed'}
      onRetry={() => {
        if (prompt === 'rename') run(rename);
        else if (operation.variables) run(operation.variables);
      }}
    />
  );
  return (
    <>
      <AccountControls base={server.base} />
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
              operation.reset();
              setDestination(null);
              setFilename(server.status.project?.title ?? '');
              setPrompt('rename');
            }}
          >
            Rename…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              run(duplicate);
            }}
          >
            Duplicate project
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              run(async () => {
                const response = await request(
                  server.base,
                  '/api/server/project/{id}/download',
                  'get',
                  { path: { id: server.status.project_id } },
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
          {server.projects
            .filter((project) => project.project_id !== server.status.project_id)
            .map((project) => (
              <DropdownMenuItem
                key={project.project_id}
                onSelect={() => {
                  navigate(() => {
                    server.select(project.project_id);
                  });
                }}
              >
                {project.project?.title ?? 'Untitled'}
              </DropdownMenuItem>
            ))}
          <DropdownMenuItem
            onSelect={() => {
              navigate(() => {
                operation.reset();
                setDestination({ name: null, close: true });
                setPrompt('close');
              });
            }}
          >
            Close project…
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
      {duplicated && (
        <p role="status" className="text-body">
          Created {duplicated}
        </p>
      )}
      {!prompt && error}
      <Dialog
        open={prompt !== null}
        onOpenChange={(value) => {
          if (!value && !operation.isPending) resetPrompt();
        }}
      >
        <DialogContent>
          <DialogTitle>
            {prompt === 'rename'
              ? 'Rename project'
              : prompt === 'interrupt'
                ? 'Cancel active work?'
                : 'Close shared project?'}
          </DialogTitle>
          <DialogDescription>
            {prompt === 'rename'
              ? 'Choose an unused project name. Rename is available only while the project is idle and no Table edits are open.'
              : prompt === 'interrupt'
                ? 'Closing this project cancels active work and waits for cleanup. The current project stays open if cancellation fails.'
                : 'This closes the project in every window that has it open. Its file remains in the project library.'}
          </DialogDescription>
          {prompt === 'rename' && (
            <label className="flex flex-col gap-2">
              Project name
              <Input
                autoFocus
                value={filename}
                onChange={(event) => setFilename(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && filename.trim() && !operation.isPending) {
                    event.preventDefault();
                    run(rename);
                  }
                }}
              />
            </label>
          )}
          {error}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" disabled={operation.isPending} onClick={resetPrompt}>
              {prompt === 'rename' ? 'Cancel' : 'Stay'}
            </Button>
            {prompt === 'rename' && (
              <Button
                disabled={operation.isPending || !filename.trim()}
                onClick={() => run(rename)}
              >
                {operation.isPending ? 'Renaming…' : 'Rename'}
              </Button>
            )}
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
            {prompt === 'interrupt' && (
              <Button
                disabled={operation.isPending}
                onClick={() => {
                  if (destination) run(() => change(destination, true));
                }}
              >
                Cancel work and close
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
