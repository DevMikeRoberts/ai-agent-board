import { Sun, Moon } from 'lucide-react';
import { motion } from 'framer-motion';

interface ThemeToggleProps {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

export function ThemeToggle({ theme, toggleTheme }: ThemeToggleProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      onClick={toggleTheme}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/8 bg-white/5 text-zinc-400 transition-all hover:border-orange-500/30 hover:bg-orange-500/8 hover:text-orange-300"
      aria-label="Toggle theme"
    >
      <motion.div
        key={theme}
        initial={{ scale: 0.5, rotate: -90, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        exit={{ scale: 0.5, rotate: 90, opacity: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {theme === 'dark' ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )}
      </motion.div>
    </motion.button>
  );
}
