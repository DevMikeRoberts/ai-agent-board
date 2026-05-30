import { Router, Request, Response } from 'express';
import path from 'path';
import { v4 as uuid } from 'uuid';
import type { ProjectRepository } from '../repositories/project-types.js';
import { MAX_TITLE_LENGTH } from '@ai-agent-board/shared/constants.js';
import {
  asyncHandler,
  broadcastProjectDelete,
  broadcastProjectUpdate,
  expandTilde,
  isAllowedRepoPath,
  normalizeRepoPathForCompare,
  paramId,
} from './helpers.js';

export function createProjectsRouter(projectRepo: ProjectRepository): Router {
  const router = Router();

  router.get('/', asyncHandler(async (_req: Request, res: Response) => {
    res.json(await projectRepo.getAllWithCounts());
  }));

  router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = paramId(req);
    const project = id === 'default' ? await projectRepo.getDefault() : await projectRepo.getById(id);
    if (!project) { res.status(404).json({ error: 'project not found' }); return; }
    res.json(project);
  }));

  router.post('/', asyncHandler(async (req: Request, res: Response) => {
    const { name, repoPath } = req.body;
    const projectName = typeof name === 'string' ? name.trim() : undefined;

    if (req.body.isDefault !== undefined) {
      res.status(400).json({ error: 'isDefault is immutable' }); return;
    }
    if (!projectName && repoPath === undefined) {
      res.status(400).json({ error: 'name or repoPath is required' }); return;
    }
    if (projectName !== undefined && !projectName) {
      res.status(400).json({ error: 'name must be a non-empty string' }); return;
    }
    if (projectName && projectName.length > MAX_TITLE_LENGTH) {
      res.status(400).json({ error: `name must be at most ${MAX_TITLE_LENGTH} characters` }); return;
    }
    if (repoPath !== undefined && typeof repoPath !== 'string') {
      res.status(400).json({ error: 'repoPath must be a string' }); return;
    }

    let expandedRepoPath: string | undefined;
    if (typeof repoPath === 'string') {
      expandedRepoPath = expandTilde(repoPath);
      if (!path.isAbsolute(expandedRepoPath)) {
        res.status(400).json({ error: 'repoPath must be an absolute path' }); return;
      }
      const repoErr = isAllowedRepoPath(expandedRepoPath);
      if (repoErr) { res.status(400).json({ error: repoErr }); return; }
    }

    const now = Date.now();
    const project = await projectRepo.create({
      id: uuid(),
      name: projectName || path.basename(path.resolve(expandedRepoPath as string)),
      repoPath: expandedRepoPath,
      createdAt: now,
      updatedAt: now,
    });
    broadcastProjectUpdate(project);
    res.status(201).json(project);
  }));

  router.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = paramId(req);
    if (req.body.isDefault !== undefined) {
      res.status(400).json({ error: 'isDefault is immutable' }); return;
    }
    const existing = await projectRepo.getById(id);
    if (!existing) { res.status(404).json({ error: 'project not found' }); return; }

    const updates: { name?: string; repoPath?: string | null; updatedAt: number } = {
      updatedAt: Date.now(),
    };

    if (req.body.name !== undefined) {
      if (typeof req.body.name !== 'string' || !req.body.name.trim()) {
        res.status(400).json({ error: 'name must be a non-empty string' }); return;
      }
      if (req.body.name.length > MAX_TITLE_LENGTH) {
        res.status(400).json({ error: `name must be at most ${MAX_TITLE_LENGTH} characters` }); return;
      }
      updates.name = req.body.name.trim();
    }

    if (req.body.repoPath !== undefined) {
      if (req.body.repoPath !== null && typeof req.body.repoPath !== 'string') {
        res.status(400).json({ error: 'repoPath must be a string or null' }); return;
      }
      if (typeof req.body.repoPath === 'string') {
        const expandedRepoPath = expandTilde(req.body.repoPath);
        if (!path.isAbsolute(expandedRepoPath)) {
          res.status(400).json({ error: 'repoPath must be an absolute path' }); return;
        }
        const changed = isRepoPathChange(existing.repoPath, expandedRepoPath);
        if (changed && await projectRepo.hasTasksOrGroups(id)) {
          res.status(409).json({ error: 'repoPath cannot be changed after tasks or groups exist' }); return;
        }
        if (!changed) {
          updates.repoPath = existing.repoPath;
        } else {
          const repoErr = isAllowedRepoPath(expandedRepoPath);
          if (repoErr) { res.status(400).json({ error: repoErr }); return; }
          updates.repoPath = expandedRepoPath;
        }
      } else {
        if (isRepoPathChange(existing.repoPath, null) && await projectRepo.hasTasksOrGroups(id)) {
          res.status(409).json({ error: 'repoPath cannot be cleared after tasks or groups exist' }); return;
        }
        updates.repoPath = null;
      }
    }

    const updated = await projectRepo.update(id, updates);
    if (!updated) { res.status(404).json({ error: 'project not found' }); return; }
    broadcastProjectUpdate(updated);
    res.json(updated);
  }));

  router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = paramId(req);
    const deleted = await projectRepo.delete(id);
    if (!deleted) { res.status(409).json({ error: 'project cannot be deleted' }); return; }
    broadcastProjectDelete(id);
    res.status(204).send();
  }));

  return router;
}

function isRepoPathChange(existing: string | undefined, next: string | null): boolean {
  if (!existing && next === null) return false;
  if (!existing || next === null) return true;
  return normalizeRepoPathForCompare(existing) !== normalizeRepoPathForCompare(next);
}
