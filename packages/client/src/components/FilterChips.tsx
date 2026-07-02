import type { AgentType, AgentStatus } from '@/types';
import { AGENT_DISPLAY } from '@/lib/agent-config';
import { cn } from '@/lib/utils';

export type StatusFilter = 'running' | 'failed' | 'complete';

const STATUS_CHIPS: { value: StatusFilter; label: string; active: string }[] = [
  { value: 'running',  label: 'Running',  active: 'bg-blue-500/18 text-blue-300 border-blue-500/40 shadow-[0_0_10px_rgba(59,130,246,0.2)]' },
  { value: 'failed',   label: 'Failed',   active: 'bg-red-500/18 text-red-300 border-red-500/40 shadow-[0_0_10px_rgba(239,68,68,0.2)]' },
  { value: 'complete', label: 'Complete', active: 'bg-emerald-500/18 text-emerald-300 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]' },
];

const AGENT_CHIPS: { value: AgentType; label: string; emoji: string }[] = (
  Object.entries(AGENT_DISPLAY) as [AgentType, { emoji: string; label: string }][]
).map(([value, { emoji, label }]) => ({ value, emoji, label }));

export function statusFilterToStatuses(filter: StatusFilter): AgentStatus[] {
  switch (filter) {
    case 'running':  return ['planning', 'executing'];
    case 'failed':   return ['failed'];
    case 'complete': return ['complete'];
  }
}

interface FilterChipsProps {
  activeAgentTypes: AgentType[];
  activeStatuses: StatusFilter[];
  onToggleAgentType: (agentType: AgentType) => void;
  onToggleStatus: (status: StatusFilter) => void;
  onClear: () => void;
}

export function FilterChips({ activeAgentTypes, activeStatuses, onToggleAgentType, onToggleStatus, onClear }: FilterChipsProps) {
  const hasActiveFilters = activeAgentTypes.length > 0 || activeStatuses.length > 0;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Agent chips */}
      {AGENT_CHIPS.map((chip) => (
        <button
          key={chip.value}
          onClick={() => onToggleAgentType(chip.value)}
          className={cn(
            'flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-all duration-150',
            activeAgentTypes.includes(chip.value)
              ? 'bg-orange-500/18 text-orange-300 border-orange-500/45 shadow-[0_0_10px_rgba(249,115,22,0.2)]'
              : 'border-white/10 bg-white/5 text-zinc-500 hover:border-white/18 hover:bg-white/8 hover:text-zinc-300'
          )}
        >
          {chip.emoji && <span>{chip.emoji}</span>}
          {chip.label}
        </button>
      ))}

      <span className="mx-1 h-4 w-px bg-white/10" />

      {/* Status chips */}
      {STATUS_CHIPS.map((chip) => (
        <button
          key={chip.value}
          onClick={() => onToggleStatus(chip.value)}
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-all duration-150',
            activeStatuses.includes(chip.value)
              ? chip.active
              : 'border-white/10 bg-white/5 text-zinc-500 hover:border-white/18 hover:bg-white/8 hover:text-zinc-300'
          )}
        >
          {chip.label}
        </button>
      ))}

      {hasActiveFilters && (
        <button
          onClick={onClear}
          className="ml-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold text-zinc-500 transition-all hover:border-orange-500/35 hover:bg-orange-500/8 hover:text-orange-400"
        >
          Clear
        </button>
      )}
    </div>
  );
}
