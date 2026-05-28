import { useCallback, useEffect, useState } from 'react';
import type { CreateProjectRequest, UpdateProjectRequest, Project } from '@/types';
import { api, connectWS } from '@/lib/api';

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshProjects = useCallback(async () => {
    try {
      setError(null);
      const result = await api.getProjects();
      setProjects(result);
    } catch (err) {
      setError(`Failed to load projects: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    return connectWS((msg) => {
      if (msg.type === 'project_updated') {
        setProjects((prev) => {
          const exists = prev.some((project) => project.id === msg.payload.id);
          return exists
            ? prev.map((project) => (project.id === msg.payload.id ? msg.payload : project))
            : [...prev, msg.payload];
        });
      }
      if (
        msg.type === 'project_deleted' ||
        msg.type === 'task_updated' ||
        msg.type === 'task_deleted' ||
        msg.type === 'group_updated'
      ) {
        refreshProjects();
      }
    }, refreshProjects);
  }, [refreshProjects]);

  const createProject = useCallback(async (data: CreateProjectRequest) => {
    try {
      setError(null);
      const result = await api.createProject(data);
      await refreshProjects();
      return result;
    } catch (err) {
      setError(`Failed to create project: ${(err as Error).message}`);
      return undefined;
    }
  }, [refreshProjects]);

  const updateProject = useCallback(async (id: string, data: UpdateProjectRequest) => {
    try {
      setError(null);
      const result = await api.updateProject(id, data);
      await refreshProjects();
      return result;
    } catch (err) {
      setError(`Failed to update project: ${(err as Error).message}`);
      return undefined;
    }
  }, [refreshProjects]);

  const deleteProject = useCallback(async (id: string) => {
    try {
      setError(null);
      await api.deleteProject(id);
      await refreshProjects();
      return true;
    } catch (err) {
      setError(`Failed to delete project: ${(err as Error).message}`);
      return undefined;
    }
  }, [refreshProjects]);

  const validateProjectPath = useCallback(async (repoPath: string) => {
    try {
      setError(null);
      return await api.validateProjectPath(repoPath);
    } catch (err) {
      setError(`Failed to validate path: ${(err as Error).message}`);
      return undefined;
    }
  }, []);

  const selectProjectDirectory = useCallback(async (initialPath?: string) => {
    try {
      setError(null);
      const result = await api.selectProjectDirectory(initialPath);
      return result.repoPath;
    } catch (err) {
      setError(`Failed to open folder picker: ${(err as Error).message}`);
      return undefined;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    projects,
    loading,
    error,
    clearError,
    refreshProjects,
    createProject,
    updateProject,
    deleteProject,
    validateProjectPath,
    selectProjectDirectory,
  };
}
