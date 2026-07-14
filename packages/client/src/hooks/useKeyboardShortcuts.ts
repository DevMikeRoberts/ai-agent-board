import { useEffect } from 'react';

interface ShortcutHandlers {
  onNewTask: () => void;
  onSprintPlanner?: () => void;
  onCloseAll: () => void;
  onToggleCompanion?: () => void;
  /** Return true if any dialog or panel is currently open */
  isAnyOpen: () => boolean;
}

export function useKeyboardShortcuts({ onNewTask, onSprintPlanner, onCloseAll, onToggleCompanion, isAnyOpen }: ShortcutHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in inputs/textareas/contenteditable
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement).isContentEditable) return;

      if (e.key === 'Escape') {
        if (isAnyOpen()) {
          e.preventDefault();
          onCloseAll();
        }
        return;
      }

      if (e.key === 'n' || e.key === 'N') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey && !isAnyOpen()) {
          e.preventDefault();
          onNewTask();
        }
      }

      if ((e.key === 'g' || e.key === 'G') && onSprintPlanner) {
        if (!e.ctrlKey && !e.metaKey && !e.altKey && !isAnyOpen()) {
          e.preventDefault();
          onSprintPlanner();
        }
      }

      if ((e.key === 'b' || e.key === 'B') && onToggleCompanion) {
        if (!e.ctrlKey && !e.metaKey && !e.altKey && !isAnyOpen()) {
          e.preventDefault();
          onToggleCompanion();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNewTask, onSprintPlanner, onCloseAll, onToggleCompanion, isAnyOpen]);
}
