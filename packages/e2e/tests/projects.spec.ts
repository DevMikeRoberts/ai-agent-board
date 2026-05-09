import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import path from 'path';
import { API, cleanupTestPath, prepareTestRepo, waitForBoard } from './helpers';

process.env.E2E_TEST_REPO_ROOT ??= path.resolve(process.cwd(), 'test-results', 'repos');

type Project = {
  id: string;
  name: string;
  repoPath?: string;
  isDefault: boolean;
  taskCounts: Record<string, number>;
};

type Task = {
  id: string;
  title: string;
  projectId: string;
  repoPath?: string;
  columnId: string;
};

type TaskGroup = {
  id: string;
  title: string;
  projectId: string;
  repoPath?: string;
  columnId: string;
  children?: Task[];
};

async function createProject(
  request: APIRequestContext,
  data: { name?: string; repoPath?: string },
): Promise<Project> {
  const res = await request.post(`${API}/api/projects`, { data });
  expect(res.status()).toBe(201);
  return res.json();
}

async function deleteProject(request: APIRequestContext, id: string): Promise<void> {
  await request.delete(`${API}/api/projects/${id}`).catch(() => {});
}

async function createTask(
  request: APIRequestContext,
  data: { title: string; projectId?: string; repoPath?: string; columnId?: string },
): Promise<Task> {
  const payload: Record<string, unknown> = {
    title: data.title,
    description: 'Project-scoped task',
    columnId: data.columnId ?? 'backlog',
  };
  if (data.projectId !== undefined) payload.projectId = data.projectId;
  if (data.repoPath !== undefined) payload.repoPath = data.repoPath;

  const res = await request.post(`${API}/api/tasks`, {
    data: payload,
  });
  expect(res.status()).toBe(201);
  return res.json();
}

async function createGroup(
  request: APIRequestContext,
  data: { title: string; projectId?: string; repoPath?: string; columnId?: string },
): Promise<TaskGroup> {
  const payload: Record<string, unknown> = {
    title: data.title,
    description: 'Project-scoped group',
    maxConcurrency: 1,
    children: [
      { title: `${data.title} child one` },
      { title: `${data.title} child two` },
    ],
  };
  if (data.projectId !== undefined) payload.projectId = data.projectId;
  if (data.repoPath !== undefined) payload.repoPath = data.repoPath;

  const res = await request.post(`${API}/api/groups`, { data: payload });
  expect(res.status()).toBe(201);
  const group = await res.json() as TaskGroup;
  if (data.columnId && data.columnId !== group.columnId) {
    const moveRes = await request.patch(`${API}/api/groups/${group.id}`, {
      data: { columnId: data.columnId },
    });
    expect(moveRes.status()).toBe(200);
    return moveRes.json();
  }
  return group;
}

async function openNewTaskDialog(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New Task' }).click();
  await expect(page.getByRole('heading', { name: 'Create Task' })).toBeVisible();
}

test.describe('Projects API', () => {
  const createdProjectIds: string[] = [];
  const createdTaskIds: string[] = [];
  const createdGroupIds: string[] = [];
  const cleanupPaths: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdGroupIds) {
      await request.delete(`${API}/api/groups/${id}`).catch(() => {});
    }
    for (const id of createdTaskIds) {
      await request.delete(`${API}/api/tasks/${id}`).catch(() => {});
    }
    for (const id of createdProjectIds) {
      await deleteProject(request, id);
    }
    createdTaskIds.length = 0;
    createdGroupIds.length = 0;
    createdProjectIds.length = 0;
    for (const targetPath of cleanupPaths) {
      cleanupTestPath(targetPath);
    }
    cleanupPaths.length = 0;
  });

  test('keeps implicit task scope pinned to the seeded default project', async ({ request }) => {
    const defaultBeforeRes = await request.get(`${API}/api/projects/default`);
    expect(defaultBeforeRes.status()).toBe(200);
    const defaultBefore = await defaultBeforeRes.json() as Project;
    expect(defaultBefore).toMatchObject({ id: 'default', isDefault: true });

    const attackerRepo = prepareTestRepo('projects-api-default-attacker', { clean: true });
    const createDefaultRes = await request.post(`${API}/api/projects`, {
      data: {
        name: 'Attacker Default Project',
        repoPath: attackerRepo,
        isDefault: true,
      },
    });
    expect(createDefaultRes.status()).toBe(400);

    const normalProject = await createProject(request, {
      name: 'Normal Non Default Project',
      repoPath: prepareTestRepo('projects-api-normal-non-default', { clean: true }),
    });
    createdProjectIds.push(normalProject.id);

    const patchDefaultRes = await request.patch(`${API}/api/projects/${normalProject.id}`, {
      data: { isDefault: true },
    });
    expect(patchDefaultRes.status()).toBe(400);

    const defaultAfterRes = await request.get(`${API}/api/projects/default`);
    expect(defaultAfterRes.status()).toBe(200);
    await expect(defaultAfterRes.json()).resolves.toMatchObject({ id: 'default', isDefault: true });

    const defaultRepo = prepareTestRepo('projects-api-implicit-default-task', { clean: true });
    const implicitTask = await createTask(request, {
      title: 'Implicit Default Scope Task',
      repoPath: defaultRepo,
    });
    createdTaskIds.push(implicitTask.id);
    expect(implicitTask.projectId).toBe('default');

    const tasksRes = await request.get(`${API}/api/tasks`);
    expect(tasksRes.status()).toBe(200);
    const tasks = await tasksRes.json() as Task[];
    expect(tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: implicitTask.id, projectId: 'default' }),
    ]));
  });

  test('rejects mismatched locked repo paths for tasks and groups', async ({ request }) => {
    const repoPath = prepareTestRepo('projects-api-locked-repo', { clean: true });
    const otherRepoPath = prepareTestRepo('projects-api-other-repo', { clean: true });
    const project = await createProject(request, {
      name: 'Locked Repo Project',
      repoPath,
    });
    createdProjectIds.push(project.id);

    const mismatchedTaskRes = await request.post(`${API}/api/tasks`, {
      data: {
        title: 'Mismatched Locked Task',
        description: 'Should be rejected',
        projectId: project.id,
        repoPath: otherRepoPath,
      },
    });
    expect(mismatchedTaskRes.status()).toBe(400);
    await expect(mismatchedTaskRes.json()).resolves.toMatchObject({
      error: expect.stringMatching(/repoPath|project/i),
    });

    const task = await createTask(request, {
      title: 'Locked Task',
      projectId: project.id,
    });
    createdTaskIds.push(task.id);
    expect(task.repoPath).toBe(repoPath);

    const patchTaskRes = await request.patch(`${API}/api/tasks/${task.id}`, {
      data: { repoPath: otherRepoPath },
    });
    expect(patchTaskRes.status()).toBe(400);
    await expect(patchTaskRes.json()).resolves.toMatchObject({
      error: expect.stringMatching(/repoPath|locked|project/i),
    });

    const configureTaskRes = await request.post(`${API}/api/tasks/${task.id}/configure`, {
      data: {
        repoPath: otherRepoPath,
        branchName: 'locked-task-branch',
        baseBranch: 'main',
        useWorktree: true,
      },
    });
    expect(configureTaskRes.status()).toBe(400);
    await expect(configureTaskRes.json()).resolves.toMatchObject({
      error: expect.stringMatching(/repoPath|locked|project/i),
    });

    const mismatchedGroupRes = await request.post(`${API}/api/groups`, {
      data: {
        title: 'Mismatched Locked Group',
        projectId: project.id,
        repoPath: otherRepoPath,
        maxConcurrency: 1,
        children: [{ title: 'Child one' }, { title: 'Child two' }],
      },
    });
    if (mismatchedGroupRes.status() === 201) {
      const group = await mismatchedGroupRes.json() as TaskGroup;
      createdGroupIds.push(group.id);
    }
    expect(mismatchedGroupRes.status()).toBe(400);

    const group = await createGroup(request, {
      title: 'Locked Group',
      projectId: project.id,
    });
    createdGroupIds.push(group.id);
    expect(group.repoPath).toBe(repoPath);

    const patchGroupRes = await request.patch(`${API}/api/groups/${group.id}`, {
      data: { repoPath: otherRepoPath },
    });
    expect(patchGroupRes.status()).toBe(400);
    await expect(patchGroupRes.json()).resolves.toMatchObject({
      error: expect.stringMatching(/repoPath|locked|project/i),
    });
  });

  test('rejects relative group repo paths for manual no-repo projects', async ({ request }) => {
    const project = await createProject(request, { name: 'Manual No Repo Group Project' });
    createdProjectIds.push(project.id);

    const relativeRepoName = `relative-group-repo-${Date.now()}`;
    const relativeRepoPath = `..\\e2e\\test-results\\${relativeRepoName}`;
    cleanupPaths.push(path.resolve(process.cwd(), 'test-results', relativeRepoName));

    const res = await request.post(`${API}/api/groups`, {
      data: {
        title: 'Relative Manual Group',
        projectId: project.id,
        repoPath: relativeRepoPath,
        maxConcurrency: 1,
        children: [{ title: 'Child one' }, { title: 'Child two' }],
      },
    });
    if (res.status() === 201) {
      const group = await res.json() as TaskGroup;
      createdGroupIds.push(group.id);
    }
    expect(res.status()).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringMatching(/absolute|repoPath|Local Path/i),
    });
  });

  test('rejects task and group projectId changes after creation', async ({ request }) => {
    const repoPath = prepareTestRepo('projects-api-projectid-immutable', { clean: true });
    const sourceProject = await createProject(request, { name: 'Source Project' });
    const targetProject = await createProject(request, { name: 'Target Project' });
    createdProjectIds.push(sourceProject.id, targetProject.id);

    const task = await createTask(request, {
      title: 'Immutable Project Task',
      projectId: sourceProject.id,
      repoPath,
    });
    createdTaskIds.push(task.id);

    const taskMoveRes = await request.patch(`${API}/api/tasks/${task.id}`, {
      data: { projectId: targetProject.id },
    });
    expect(taskMoveRes.status()).toBe(400);
    await expect(taskMoveRes.json()).resolves.toMatchObject({
      error: expect.stringMatching(/projectId|immutable/i),
    });

    const group = await createGroup(request, {
      title: 'Immutable Project Group',
      projectId: sourceProject.id,
      repoPath,
    });
    createdGroupIds.push(group.id);

    const groupMoveRes = await request.patch(`${API}/api/groups/${group.id}`, {
      data: { projectId: targetProject.id },
    });
    expect(groupMoveRes.status()).toBe(400);
    await expect(groupMoveRes.json()).resolves.toMatchObject({
      error: expect.stringMatching(/projectId|immutable/i),
    });
  });

  test('locks project repoPath changes once tasks or groups exist', async ({ request }) => {
    const repoPath = prepareTestRepo('projects-api-repopath-lock-original', { clean: true });
    const replacementRepoPath = prepareTestRepo('projects-api-repopath-lock-replacement', { clean: true });
    const project = await createProject(request, {
      name: 'Repo Path Lock Project',
      repoPath,
    });
    createdProjectIds.push(project.id);

    const task = await createTask(request, {
      title: 'Repo Lock Task',
      projectId: project.id,
    });
    createdTaskIds.push(task.id);

    const group = await createGroup(request, {
      title: 'Repo Lock Group',
      projectId: project.id,
    });
    createdGroupIds.push(group.id);

    const replaceRes = await request.patch(`${API}/api/projects/${project.id}`, {
      data: { repoPath: replacementRepoPath },
    });
    expect(replaceRes.status()).toBe(409);
    await expect(replaceRes.json()).resolves.toMatchObject({
      error: expect.stringMatching(/repoPath|task|group|migration|locked/i),
    });

    const clearRes = await request.patch(`${API}/api/projects/${project.id}`, {
      data: { repoPath: null },
    });
    expect(clearRes.status()).toBe(409);
    await expect(clearRes.json()).resolves.toMatchObject({
      error: expect.stringMatching(/repoPath|task|group|migration|locked/i),
    });

    const deleteRes = await request.delete(`${API}/api/projects/${project.id}`);
    expect(deleteRes.status()).toBe(409);
  });

  test('summarizes only board-visible standalone tasks and groups', async ({ request }) => {
    const repoPath = prepareTestRepo('projects-api-counts', { clean: true });
    const project = await createProject(request, {
      name: 'Counts Project',
      repoPath,
    });
    createdProjectIds.push(project.id);

    const activeTask = await createTask(request, {
      title: 'Active Standalone Count Task',
      projectId: project.id,
      columnId: 'backlog',
    });
    createdTaskIds.push(activeTask.id);

    const archivedTask = await createTask(request, {
      title: 'Archived Standalone Count Task',
      projectId: project.id,
      columnId: 'done',
    });
    createdTaskIds.push(archivedTask.id);
    const archiveTaskRes = await request.patch(`${API}/api/tasks/${archivedTask.id}/archive`);
    expect(archiveTaskRes.status()).toBe(200);

    const activeGroup = await createGroup(request, {
      title: 'Active Count Group',
      projectId: project.id,
    });
    createdGroupIds.push(activeGroup.id);

    const archivedGroup = await createGroup(request, {
      title: 'Archived Count Group',
      projectId: project.id,
    });
    createdGroupIds.push(archivedGroup.id);
    const archiveGroupRes = await request.patch(`${API}/api/groups/${archivedGroup.id}/archive`);
    expect(archiveGroupRes.status()).toBe(200);

    const res = await request.get(`${API}/api/projects/${project.id}`);
    expect(res.status()).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      id: project.id,
      taskCounts: { backlog: 2, 'in-progress': 0, review: 0, done: 0, total: 2 },
    });
  });

  test('rejects project repo paths that are not absolute', async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: 'Unsafe Project', repoPath: '..\\relative-repo' },
    });
    expect(res.status()).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringMatching(/absolute|repoPath|Local Path/i),
    });
  });
});

test.describe('Projects page', () => {
  const createdProjectIds: string[] = [];
  const createdTaskIds: string[] = [];
  const createdGroupIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdGroupIds) {
      await request.delete(`${API}/api/groups/${id}`).catch(() => {});
    }
    for (const id of createdTaskIds) {
      await request.delete(`${API}/api/tasks/${id}`).catch(() => {});
    }

    for (const id of createdProjectIds) {
      await deleteProject(request, id);
    }
    createdProjectIds.length = 0;
    createdTaskIds.length = 0;
    createdGroupIds.length = 0;
  });

  test('creates a project card and uses its locked repo path when creating project tasks', async ({ page, request }) => {
    const repoPath = prepareTestRepo('projects-ui-card', { clean: true });
    const projectName = `Project UI ${Date.now()}`;
    let createdProjectId: string | undefined;

    await page.goto('/projects');
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByRole('heading', { name: 'Create Project' })).toBeVisible();
    await page.getByLabel('Project Name').fill(projectName);
    await page.getByLabel('Local Path').fill(repoPath);
    await page.getByRole('button', { name: 'Create Project' }).click();

    const listRes = await request.get(`${API}/api/projects`);
    if (listRes.ok()) {
      const projects = await listRes.json() as Project[];
      const created = projects.find((project) => project.name === projectName);
      if (created) {
        createdProjectId = created.id;
        createdProjectIds.push(created.id);
      }
    }
    expect(createdProjectId).toBeTruthy();

    const projectCard = page.getByRole('article', { name: projectName });
    await expect(projectCard).toBeVisible();
    await expect(projectCard.getByText(repoPath)).toBeVisible();
    await expect(projectCard.getByText(/Backlog\s+0/i)).toBeVisible();
    await expect(projectCard.getByText(/In Progress\s+0/i)).toBeVisible();
    await expect(projectCard.getByText(/Review\s+0/i)).toBeVisible();
    await expect(projectCard.getByText(/Done\s+0/i)).toBeVisible();

    await projectCard.getByRole('button', { name: 'Open Project' }).click();
    await waitForBoard(page);
    await expect(page.getByRole('heading', { name: projectName })).toBeVisible();

    await openNewTaskDialog(page);
    await expect(page.getByLabel(/Local Path/i)).toHaveValue(repoPath);
    const taskTitle = `Project UI Task ${Date.now()}`;
    await page.getByPlaceholder('What needs to be done?').fill(taskTitle);
    await page.getByRole('button', { name: 'Create Task' }).click();
    await expect(page.getByRole('heading', { name: taskTitle })).toBeVisible();

    const tasksRes = await request.get(`${API}/api/tasks?projectId=${createdProjectId}`);
    if (tasksRes.ok()) {
      const tasks = await tasksRes.json();
      for (const task of tasks) {
        if (task.title === taskTitle) {
          createdTaskIds.push(task.id);
          expect(task.repoPath).toBe(repoPath);
          expect(task.projectId).toBe(createdProjectId);
        }
      }
    }

    await page.goto('/projects');
    const updatedCard = page.getByRole('article', { name: projectName });
    await expect(updatedCard.getByText(/Backlog\s+1/i)).toBeVisible();
  });

  test('opens the seeded default project card with editable manual Local Path', async ({ page, request }) => {
    const defaultRes = await request.get(`${API}/api/projects/default`);
    expect(defaultRes.status()).toBe(200);
    const defaultProject = await defaultRes.json() as Project;
    expect(defaultProject.id).toBe('default');

    await page.goto('/projects');
    const defaultCard = page.getByRole('article', { name: defaultProject.name });
    await expect(defaultCard).toBeVisible();
    await defaultCard.getByRole('button', { name: 'Open Project' }).click();
    await waitForBoard(page);

    await openNewTaskDialog(page);
    const localPath = page.getByLabel(/Local Path/i);
    await expect(localPath).toBeEditable();
    await expect(localPath).toHaveValue('');
  });
});
