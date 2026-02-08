import { Sun, Moon, Kanban } from 'lucide-react';
import { motion } from 'framer-motion';

interface HeaderProps {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  taskCount: number;
}

export function Header({ theme, toggleTheme, taskCount }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Kanban className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight">
              Copilot Kanban
            </h1>
            <p className="text-xs text-muted-foreground">
              {taskCount} tasks
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={toggleTheme}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </motion.button>
        </div>
      </div>
    </header>
  );
}
