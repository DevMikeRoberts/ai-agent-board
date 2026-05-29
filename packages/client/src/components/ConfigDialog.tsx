import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { ProjectConfig } from '@/types';

interface ConfigDialogProps {
  open: boolean;
  config: ProjectConfig | null;
  onClose: () => void;
  onSubmit: (cloneRoot: string) => Promise<unknown>;
}

export function ConfigDialog({ open, config, onClose, onSubmit }: ConfigDialogProps) {
  const [cloneRoot, setCloneRoot] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCloneRoot(config?.cloneRoot ?? '');
    setError('');
    setSubmitting(false);
  }, [open, config]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const trimmed = cloneRoot.trim();
    if (!trimmed) {
      setError('Clone root is required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await onSubmit(trimmed);
      if (result === undefined) {
        setError('Failed to update clone root');
        return;
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
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
            aria-label="Settings"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-semibold">Settings</h2>
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
                <label htmlFor="config-clone-root" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Clone Root
                </label>
                <input
                  id="config-clone-root"
                  value={cloneRoot}
                  onChange={(e) => { setCloneRoot(e.target.value); setError(''); }}
                  placeholder="~/agentboard/projects"
                  autoFocus
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="mt-1 text-xs text-muted-foreground/60">
                  Repos created from a GitHub URL are cloned into this folder. It is created automatically.
                </p>
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
                  {submitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
