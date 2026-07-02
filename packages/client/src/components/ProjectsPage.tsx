import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FolderKanban, GitBranch, Github, Pencil, Plus, Settings, Star, Trash2, X, Zap } from 'lucide-react';
import type { CreateProjectRequest, Project, ProjectConfig, ProjectPathValidation, UpdateProjectRequest } from '@/types';
import { ThemeToggle } from './ThemeToggle';
import { ProjectDialog, type ProjectDialogInitialValues } from './ProjectDialog';
import { ConfigDialog } from './ConfigDialog';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

interface ProjectsPageProps {
  projects: Project[];
  config: ProjectConfig | null;
  loading: boolean;
  error: string | null;
  initialCreate?: ProjectDialogInitialValues | null;
  onConsumeInitialCreate?: () => void;
  onClearError: () => void;
  onCreateProject: (data: CreateProjectRequest) => Promise<unknown>;
  onUpdateProject: (id: string, data: UpdateProjectRequest) => Promise<unknown>;
  onDeleteProject: (id: string) => Promise<unknown>;
  onUpdateConfig: (patch: Partial<ProjectConfig>) => Promise<unknown>;
  onValidateProjectPath: (repoPath: string) => Promise<ProjectPathValidation | undefined>;
  onSelectProjectDirectory: (initialPath?: string) => Promise<string | null | undefined>;
  onOpenProject: (project: Project) => void;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

const countLabels: Array<[keyof NonNullable<Project['taskCounts']>, string, string]> = [
  ['backlog',      'Backlog',     '#60a5fa'],
  ['in-progress',  'In Progress', '#f97316'],
  ['review',       'Review',      '#fbbf24'],
  ['done',         'Done',        '#34d399'],
];

export function ProjectsPage({
  projects,
  config,
  loading,
  error,
  initialCreate,
  onConsumeInitialCreate,
  onClearError,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onUpdateConfig,
  onValidateProjectPath,
  onSelectProjectDirectory,
  onOpenProject,
  theme,
  toggleTheme,
}: ProjectsPageProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [createInitialValues, setCreateInitialValues] = useState<ProjectDialogInitialValues | null>(null);

  useEffect(() => {
    if (initialCreate) {
      setEditingProject(null);
      setCreateInitialValues(initialCreate);
      setDialogOpen(true);
    }
  }, [initialCreate]);

  function openCreateDialog() {
    setEditingProject(null);
    setCreateInitialValues(null);
    setDialogOpen(true);
  }

  function openEditDialog(project: Project) {
    setEditingProject(project);
    setCreateInitialValues(null);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingProject(null);
    setCreateInitialValues(null);
    onConsumeInitialCreate?.();
  }

  async function handleDialogSubmit(data: CreateProjectRequest | UpdateProjectRequest) {
    if (editingProject) return onUpdateProject(editingProject.id, data);
    return onCreateProject(data as CreateProjectRequest);
  }

  async function handleConfirmDeleteProject() {
    if (!deletingProject) return;
    const result = await onDeleteProject(deletingProject.id);
    if (result !== undefined) setDeletingProject(null);
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* ── Header ── */}
      <header
        className="sticky top-0 z-40 border-b border-white/5"
        style={{
          background: 'linear-gradient(180deg, rgba(8,9,15,0.97) 0%, rgba(9,10,16,0.95) 100%)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.04), 0 4px 24px rgba(0,0,0,0.4)',
        }}
      >
        {/* Orange top line */}
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(249,115,22,0.6) 35%, rgba(251,146,60,0.8) 50%, rgba(249,115,22,0.6) 65%, transparent 100%)' }}
          aria-hidden="true"
        />
        <div className="flex h-14 items-center justify-between px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl btn-orange-gradient">
              <div className="logo-ring" aria-hidden="true" />
              <Zap className="relative z-10 h-4.5 w-4.5 text-white" style={{ height: '1.125rem', width: '1.125rem' }} />
            </div>
            <div>
              <h1 className="truncate text-sm font-bold tracking-tight text-white md:text-base gradient-text-orange">
                AI Agent Board
              </h1>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-orange-500/60">Projects</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openCreateDialog}
              className="btn-orange-gradient flex h-9 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold"
              aria-label="New Project"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span>New Project</span>
            </button>
            <button
              onClick={() => setConfigOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/8 bg-white/5 text-zinc-400 transition-all hover:border-orange-500/30 hover:bg-orange-500/8 hover:text-orange-300"
              aria-label="Settings"
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </button>
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="board-ambient flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-6xl space-y-6">

          {/* Intro banner */}
          <div
            className="relative overflow-hidden rounded-2xl border border-white/8 p-5"
            style={{
              background: 'linear-gradient(135deg, rgba(249,115,22,0.08) 0%, rgba(139,92,246,0.06) 50%, rgba(59,130,246,0.05) 100%)',
              backdropFilter: 'blur(16px)',
            }}
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-30"
              style={{
                background: 'radial-gradient(ellipse 60% 80% at 100% 50%, rgba(249,115,22,0.2) 0%, transparent 60%)',
              }}
              aria-hidden="true"
            />
            <p className="relative max-w-3xl text-sm font-medium text-muted-foreground">
              Pick a Project to open a scoped board. Repo-backed Projects lock task Local Path to the Project path,
              while Default/no-repo Projects keep manual path entry available.
            </p>
          </div>

          {loading && (
            <div className="rounded-2xl border border-white/6 bg-card p-6 text-sm text-muted-foreground">
              Loading projects…
            </div>
          )}

          {!loading && projects.length === 0 && (
            <div
              className="rounded-2xl border border-dashed border-white/12 p-10 text-center"
              style={{ background: 'rgba(255,255,255,0.02)' }}
            >
              <div
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
                style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.25)' }}
              >
                <FolderKanban className="h-8 w-8 text-orange-400" style={{ filter: 'drop-shadow(0 0 8px rgba(249,115,22,0.5))' }} />
              </div>
              <h2 className="text-lg font-bold text-foreground">No projects yet</h2>
              <p className="mt-2 text-sm text-muted-foreground">Create a Project to start a scoped board.</p>
              <button
                onClick={openCreateDialog}
                className="btn-orange-gradient mt-6 inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold"
              >
                <Plus className="h-4 w-4" />
                New Project
              </button>
            </div>
          )}

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project, i) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="project-card-wrap"
              >
                <article
                  aria-label={project.name}
                  className="flex min-h-64 flex-col rounded-2xl border border-white/8 bg-card p-5 shadow-xl"
                  style={{ backdropFilter: 'blur(16px)' }}
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-bold text-foreground">{project.name}</h2>
                      {project.repoUrl && (
                        <p className="mt-1.5 flex items-center gap-1.5 break-all font-mono text-xs text-muted-foreground">
                          <Github className="h-3 w-3 shrink-0 text-zinc-500" />
                          {project.repoUrl}
                        </p>
                      )}
                      {project.repoPath ? (
                        <p className="mt-1.5 break-all font-mono text-xs text-muted-foreground">{project.repoPath}</p>
                      ) : (
                        <p className="mt-1.5 text-xs text-muted-foreground">Manual local paths per task</p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {project.isDefault && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold"
                          style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.30)', color: '#fbbf24' }}
                        >
                          <Star className="h-3 w-3" style={{ filter: 'drop-shadow(0 0 4px rgba(251,191,36,0.8))' }} />
                          Default
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditDialog(project)}
                        className="flex h-8 w-8 items-center justify-center rounded-xl text-zinc-600 transition-all hover:bg-white/6 hover:text-zinc-300"
                        aria-label={`Edit ${project.name}`}
                        title="Edit project"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {!project.isDefault && (
                        <button
                          type="button"
                          onClick={() => setDeletingProject(project)}
                          className="flex h-8 w-8 items-center justify-center rounded-xl text-zinc-600 transition-all hover:bg-red-500/12 hover:text-red-400"
                          aria-label={`Delete ${project.name}`}
                          title="Delete project"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Task count stats */}
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    {countLabels.map(([key, label, color]) => (
                      <div
                        key={key}
                        className="stat-card rounded-xl px-3 py-2.5"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
                          <span
                            className="text-xl font-bold"
                            style={{ color, textShadow: `0 0 14px ${color}60` }}
                          >
                            {project.taskCounts?.[key] ?? 0}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Open Project CTA */}
                  <button
                    onClick={() => onOpenProject(project)}
                    className="btn-orange-gradient mt-auto flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold"
                  >
                    <GitBranch className="h-4 w-4" />
                    Open Project
                  </button>
                </article>
              </motion.div>
            ))}
          </div>
        </div>
      </main>

      <ProjectDialog
        open={dialogOpen}
        project={editingProject}
        initialValues={createInitialValues}
        onClose={closeDialog}
        onSubmit={handleDialogSubmit}
        onValidatePath={onValidateProjectPath}
        onSelectDirectory={onSelectProjectDirectory}
      />

      <ConfigDialog
        open={configOpen}
        config={config}
        onClose={() => setConfigOpen(false)}
        onSubmit={onUpdateConfig}
      />

      <DeleteConfirmDialog
        open={deletingProject !== null}
        taskTitle={deletingProject?.name ?? ''}
        title="Delete project?"
        description={(
          <p className="text-sm text-muted-foreground mb-5">
            <span className="font-semibold text-foreground">{deletingProject?.name}</span> will be permanently
            deleted, along with all of its tasks and groups. This cannot be undone.
          </p>
        )}
        onCancel={() => setDeletingProject(null)}
        onConfirm={handleConfirmDeleteProject}
      />

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-4 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400 shadow-2xl"
            style={{ backdropFilter: 'blur(20px)' }}
          >
            <span>{error}</span>
            <button onClick={onClearError} className="ml-1 shrink-0 text-red-400 hover:text-red-300" aria-label="Dismiss error">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
