import { AccountControls } from './AccountControls';
import { Button } from '@/components/ui/button';
import { isTauri } from '@/lib/isTauri';
import { useRef, useState } from 'react';
import { ProjectDataDialog } from './ProjectDataDialog';
import { useServer } from './context';

export function ServerControls() {
  const server = useServer();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  if (!server) {
    if (isTauri()) return null;
    return (
      <Button variant="secondary" size="sm" disabled title="Requires the standalone server.">
        Project & Data
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <AccountControls base={server.base} />
      <Button ref={trigger} variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Project & Data
      </Button>
      <ProjectDataDialog
        toolbarSave
        base={server.base}
        currentProject={server.status}
        projects={server.projects}
        open={open}
        onOpenChange={setOpen}
        select={server.select}
        refresh={server.refresh}
        returnFocus={() => trigger.current?.focus()}
      />
    </div>
  );
}
