import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { isAbsoluteRepoPath, getRepoPathHelpText, getRepoPathPlaceholder } from '@/lib/utils';
import type { CreateProjectRequest } from '@/types';

interface ProjectDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateProjectRequest) => Promise<unknown>;
}

function leafNameFromPath(value: string): string {
  const normalized = value.trim().replace(/[\\/]+$/, '');
  return normalized.split(/[\\/]/).filter(Boolean).pop() ?? '';
}

export function ProjectDialog({ open, onClose, onSubmit }: ProjectDialogProps) {
  const [name, setName] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setName('');
      setRepoPath('');
      setNameTouched(false);
      setError('');
      setSubmitting(false);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const trimmedName = name.trim();
    const trimmedPath = repoPath.trim();
    if (!trimmedName && !trimmedPath) {
      setError('Project Name or Local Path is required');
      return;
    }
    if (trimmedPath && !isAbsoluteRepoPath(trimmedPath)) {
      setError('Local Path must be absolute');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const result = await onSubmit({
        name: trimmedName || undefined,
        repoPath: trimmedPath || undefined,
      });
      if (result === undefined) return;
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  function handlePathChange(value: string) {
    setRepoPath(value);
    setError('');
    if (!nameTouched) setName(leafNameFromPath(value));
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-semibold">Create Project</h2>
              <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="project-name" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Project Name
                </label>
                <input
                  id="project-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameTouched(true);
                    setError('');
                  }}
                  placeholder="Defaults to the folder name"
                  autoFocus
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label htmlFor="project-repo-path" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Local Path
                </label>
                <input
                  id="project-repo-path"
                  value={repoPath}
                  onChange={(e) => handlePathChange(e.target.value)}
                  placeholder={getRepoPathPlaceholder()}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="mt-1 text-xs text-muted-foreground/60">{getRepoPathHelpText()}</p>
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? 'Creating…' : 'Create Project'}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
