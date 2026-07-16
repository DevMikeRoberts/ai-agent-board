import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface RetroRadioProps {
  on: boolean;
  volume: number;
  onToggle: () => void;
  onVolumeChange: (v: number) => void;
}

export function RetroRadio({ on, volume, onToggle, onVolumeChange }: RetroRadioProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Volume slider */}
      {on && (
        <motion.input
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 64, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.25 }}
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          className="h-1 appearance-none rounded-full bg-neon-green/30 accent-neon-green"
          style={{ accentColor: 'var(--color-neon-green)' }}
          title={`Volume: ${Math.round(volume * 100)}%`}
          aria-label="Radio volume"
        />
      )}

      {/* Toggle button */}
      <motion.button
        onClick={onToggle}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        className={cn(
          'sticker-sm sticker-press flex h-8 items-center gap-1.5 rounded-full px-3',
          'border-2 font-pixel text-[10px] [text-transform:lowercase] transition-colors',
          on
            ? 'border-neon-green bg-neon-green/15 text-neon-green'
            : 'border-border bg-card text-muted-foreground hover:border-foreground/30'
        )}
        title={on ? 'Turn radio off' : 'Turn radio on'}
        aria-label={on ? 'Turn radio off' : 'Turn radio on'}
      >
        {/* Pixel radio icon */}
        <svg width="14" height="14" viewBox="0 0 8 8" fill="none" aria-hidden="true">
          <line x1="3" y1="0" x2="5" y2="3" stroke="currentColor" strokeWidth="0.8" />
          <rect x="1" y="3" width="6" height="4" rx="0.5" fill="currentColor" opacity="0.3" />
          <rect x="1" y="3" width="6" height="4" rx="0.5" stroke="currentColor" strokeWidth="0.7" />
          <rect x="3" y="4.5" width="2" height="1" rx="0.3" fill="currentColor" />
          {on && (
            <>
              <line x1="6" y1="1" x2="7" y2="2" stroke="currentColor" strokeWidth="0.5" opacity="0.6" />
              <line x1="6.5" y1="0" x2="7.5" y2="1.5" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
            </>
          )}
        </svg>
        <span>{on ? 'radio on' : 'radio'}</span>
      </motion.button>
    </div>
  );
}
