import { useMemo } from 'react';
import { type QueryClient, useMutation } from '@tanstack/react-query';
import {
  createWorkspace,
  deleteWorkspaceById,
  closeWorkspaceById,
  openWorkspaceById,
  updateWorkspaceById,
} from '@/api';
import { queryKeys } from '@/lib/queryKeys';
import { invalidateProjectSummaries, isProjectDetailQueryKey } from './projectMutationCache';

interface ProjectManagementMutationsParams {
  currentProjectId: string | null;
  queryClient: QueryClient;
}

/**
 * Owns project-level mutations exposed through ServerProjectProvider actions.
 * Used by: useProjectNodeMutations because current-project sync and
 * project CRUD have different cache/selection behavior from node graph and
 * table transformations.
 * Flow: command the backend Project lifecycle, refresh its authoritative
 * resource list, and return stable action functions for launch/header/settings
 * consumers. No client-side current-Project mirror is written.
 */
export const useProjectManagementMutations = ({
  currentProjectId,
  queryClient,
}: ProjectManagementMutationsParams) => {
  const ensureProjectSelected = () => {
    if (!currentProjectId) {
      throw new Error('No project selected');
    }
    return currentProjectId;
  };
  const setCurrentProjectOnServer = async (projectId: string | null) => {
    if (projectId === null) {
      if (!currentProjectId) return null;
      return closeWorkspaceById({
        path: { workspace_id: currentProjectId },
        throwOnError: true,
      });
    }
    const { data } = await openWorkspaceById({
      path: { workspace_id: projectId },
      throwOnError: true,
    });
    return data;
  };

  const setCurrentProjectMutation = useMutation<
    unknown,
    Error,
    string | null,
    { previousId: string | null }
  >({
    mutationKey: ['project', 'set-current'],
    mutationFn: (projectId: string | null) => setCurrentProjectOnServer(projectId),
    onMutate: async (projectId: string | null) => {
      const previousId = currentProjectId;
      if (!projectId && previousId) {
        await queryClient.cancelQueries({
          predicate: ({ queryKey }) => isProjectDetailQueryKey(queryKey, previousId),
        });
      }
      return { previousId };
    },
    onSuccess: async (_data, projectId, context) => {
      const previousId = context.previousId ?? null;
      const nextId = projectId ?? null;

      if (nextId) {
        void queryClient.invalidateQueries({
          predicate: ({ queryKey }) => isProjectDetailQueryKey(queryKey, nextId),
        });
      } else if (previousId) {
        queryClient.removeQueries({
          predicate: ({ queryKey }) => isProjectDetailQueryKey(queryKey, previousId),
        });
      }

      await queryClient.invalidateQueries({ queryKey: queryKeys.projectList, exact: true });
    },
  });

  const createProjectMutation = useMutation({
    mutationKey: ['project', 'create'],
    mutationFn: ({ name, description }: { name: string; description?: string }) =>
      createWorkspace({
        body: { name, description: description ?? '' },
        throwOnError: true,
      }).then(({ data }) => data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectList, exact: true });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationKey: ['project', 'delete'],
    mutationFn: (projectId: string) => {
      if (!projectId.trim()) {
        throw new Error('projectId is required');
      }
      return deleteWorkspaceById({
        path: { workspace_id: projectId },
        throwOnError: true,
      }).then(() => undefined);
    },
    onSuccess: () => {
      invalidateProjectSummaries(queryClient);
    },
  });

  const updateProjectNameMutation = useMutation({
    mutationKey: ['project', 'rename'],
    mutationFn: (newName: string) => {
      const projectId = ensureProjectSelected();
      return updateWorkspaceById({
        body: { name: newName },
        path: { workspace_id: projectId },
        throwOnError: true,
      }).then(({ data }) => data);
    },
    onSuccess: () => {
      invalidateProjectSummaries(queryClient);
    },
  });

  const updateProjectDescriptionMutation = useMutation({
    mutationKey: ['project', 'update-description'],
    mutationFn: (description: string) => {
      const projectId = ensureProjectSelected();
      return updateWorkspaceById({
        body: { description },
        path: { workspace_id: projectId },
        throwOnError: true,
      }).then(({ data }) => data);
    },
    onSuccess: () => {
      invalidateProjectSummaries(queryClient);
    },
  });

  const actions = useMemo(
    () => ({
      setCurrentProject: (projectId: string | null) =>
        setCurrentProjectMutation.mutateAsync(projectId),
      createProject: (name: string, description?: string) =>
        createProjectMutation.mutateAsync({ name, description }),
      deleteProject: (projectId: string) => deleteProjectMutation.mutateAsync(projectId),
      saveProject: async () => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.projectList, exact: true });
      },
      renameProject: (newName: string) => updateProjectNameMutation.mutateAsync(newName),
      updateProjectDescription: (description: string) =>
        updateProjectDescriptionMutation.mutateAsync(description),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutation refs intentionally omitted; mutateAsync identities are stable
    [currentProjectId, queryClient],
  );

  return { actions } as const;
};
