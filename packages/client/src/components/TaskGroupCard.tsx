import { useMemo } from 'react';
import { Layers, Play, Square, Trash2, Pencil } from 'lucide-react';
import type { TaskGroupWithChildren } from '@/lib/api';
import { AGENT_DISPLAY } from '@/lib/agent-config';
import { PRIORITY_DISPLAY } from '@/lib/priority-config';
import { computeGroupStatus, statusIcon } from '@/lib/group-utils';
import { cn } from '@/lib/utils';

interface TaskGroupCardProps {
  group: TaskGroupWithChildren;
  onClickGroup: (group: TaskGroupWithChildren) => void;
  onRunGroup: (id: string) => void;
  onStopGroup: (id: string) => void;
  onDeleteGroup: (id: string) => void;
  onEditGroup?: (group: TaskGroupWithChildren) => void;
}

export function TaskGroupCard({ group, onClickGroup, onRunGroup, onStopGroup, onDeleteGroup, onEditGroup }: TaskGroupCardProps) {
  const status = useMemo(() => computeGroupStatus(group.children), [group.children]);
  const isRunning = status.executing > 0 || status.planning > 0;
  const pct = status.total > 0 ? ((status.completed / status.total) * 100) : 0;
  const priorityInfo = PRIORITY_DISPLAY[group.priority];

  const agentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of group.children) {
      const type = c.agentType || 'copilot';
      counts.set(type, (counts.get(type) || 0) + 1);
    }
    return [...counts.entries()];
  }, [group.children]);

  return (
    <div
      className={cn(
        'group relative cursor-pointer rounded-2xl border p-3.5 transition-all duration-200',
        'hover:scale-[1.01]',
        priorityInfo?.borderClass || 'border-white/10',
        isRunning ? 'border-b-2 border-b-blue-500/70' : '',
      )}
      style={{
        background: 'rgba(255,255,255,0.035)',
        backdropFilter: 'blur(16px) saturate(180%)',
        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
        boxShadow: isRunning
          ? '0 0 20px rgba(59,130,246,0.15), 0 8px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)'
          : '0 8px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
      onClick={() => onClickGroup(group)}
    >
      {/* Hover shine */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, transparent 60%)' }}
        aria-hidden="true"
      />

      {/* Header */}
      <div className="relative mb-2.5 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
            style={{ background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.25)' }}
          >
            <Layers className="h-3.5 w-3.5 text-blue-400" />
          </div>
          <h3 className="text-sm font-bold text-foreground line-clamp-1">{group.title}</h3>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {!isRunning && status.idle > 0 && group.columnId !== 'done' && (
            <button
              onClick={(e) => { e.stopPropagation(); onRunGroup(group.id); }}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-zinc-500 transition-all hover:bg-emerald-500/15 hover:text-emerald-400"
              title="Run group"
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          )}
          {isRunning && (
            <button
              onClick={(e) => { e.stopPropagation(); onStopGroup(group.id); }}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-zinc-500 transition-all hover:bg-red-500/15 hover:text-red-400"
              title="Stop all"
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          )}
          {onEditGroup && (
            <button
              onClick={(e) => { e.stopPropagation(); onEditGroup(group); }}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-zinc-500 transition-all hover:bg-white/8 hover:text-zinc-300"
              title="Edit group"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDeleteGroup(group.id); }}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-zinc-500 transition-all hover:bg-red-500/15 hover:text-red-400"
            title="Delete group"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="relative mb-3">
        <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold">
          <span className="text-muted-foreground">{status.completed}/{status.total} complete</span>
          {status.failed > 0 && <span className="text-red-400">{status.failed} failed</span>}
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${pct}%`,
              background: status.failed > 0 && status.completed === 0
                ? 'linear-gradient(90deg, #ef4444, #f87171)'
                : status.completed === status.total && status.total > 0
                  ? 'linear-gradient(90deg, #10b981, #34d399)'
                  : 'linear-gradient(90deg, #f97316, #fb923c)',
              boxShadow: pct > 0
                ? status.completed === status.total && status.total > 0
                  ? '0 0 8px rgba(16,185,129,0.5)'
                  : '0 0 8px rgba(249,115,22,0.5)'
                : undefined,
            }}
          />
        </div>
      </div>

      {/* Agent breakdown */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {agentCounts.map(([type, count]) => {
          const display = AGENT_DISPLAY[type as keyof typeof AGENT_DISPLAY];
          return (
            <span
              key={type}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#9ca3af' }}
            >
              {display?.emoji} {display?.label} ({count})
            </span>
          );
        })}
      </div>

      {/* Status summary */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-muted-foreground">
        {status.executing > 0 && <span className="flex items-center gap-1 text-blue-400">{statusIcon('executing', 'h-3 w-3')} {status.executing} running</span>}
        {status.planning  > 0 && <span className="flex items-center gap-1 text-purple-400">{statusIcon('planning',  'h-3 w-3')} {status.planning} planning</span>}
        {status.completed > 0 && <span className="flex items-center gap-1 text-emerald-400">{statusIcon('complete',  'h-3 w-3')} {status.completed} done</span>}
        {status.failed    > 0 && <span className="flex items-center gap-1 text-red-400">{statusIcon('failed',    'h-3 w-3')} {status.failed} failed</span>}
        {status.idle      > 0 && <span className="text-muted-foreground/60">{status.idle} pending</span>}
      </div>

      {/* Child tasks */}
      {group.children.length > 0 && (
        <div
          className="mt-3 border-t pt-2.5 space-y-1.5"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          {group.children.map((child) => {
            const agentDisplay = AGENT_DISPLAY[child.agentType as keyof typeof AGENT_DISPLAY];
            const prio = PRIORITY_DISPLAY[child.priority];
            return (
              <div
                key={child.id}
                className={cn(
                  'rounded-xl border px-2.5 py-2 transition-colors',
                  prio?.borderClass || 'border-white/6',
                )}
                style={{ background: 'rgba(255,255,255,0.03)' }}
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-xs font-semibold leading-snug text-foreground line-clamp-1">
                    {prio && <span className="mr-0.5">{prio.emoji}</span>}
                    {child.title}
                  </h4>
                  {statusIcon(child.agentStatus, 'h-3 w-3')}
                </div>
                {child.description && (
                  <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground/70 line-clamp-1">{child.description}</p>
                )}
                {agentDisplay && (
                  <span
                    className="mt-1 inline-flex items-center gap-0.5 text-[10px]"
                    style={{ color: '#6b7280' }}
                  >
                    {agentDisplay.emoji} {agentDisplay.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
