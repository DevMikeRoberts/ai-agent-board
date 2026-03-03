import { CheckCircle2, AlertCircle, Cog, Brain } from 'lucide-react';
import type { Task, AgentStatus } from '@/types';
import { cn } from '@/lib/utils';

export interface GroupStatus {
  total: number;
  completed: number;
  failed: number;
  executing: number;
  planning: number;
  idle: number;
}

export function computeGroupStatus(children: Task[]): GroupStatus {
  const s: GroupStatus = { total: children.length, completed: 0, failed: 0, executing: 0, planning: 0, idle: 0 };
  for (const c of children) {
    if (c.agentStatus === 'complete') s.completed++;
    else if (c.agentStatus === 'failed') s.failed++;
    else if (c.agentStatus === 'executing') s.executing++;
    else if (c.agentStatus === 'planning') s.planning++;
    else s.idle++;
  }
  return s;
}

export function statusIcon(status: AgentStatus, size = 'h-4 w-4') {
  switch (status) {
    case 'executing': return <Cog className={cn(size, 'animate-spin text-blue-400')} />;
    case 'planning': return <Brain className={cn(size, 'animate-pulse text-purple-400')} />;
    case 'complete': return <CheckCircle2 className={cn(size, 'text-emerald-400')} />;
    case 'failed': return <AlertCircle className={cn(size, 'text-red-400')} />;
    default: return <div className={cn(size, 'rounded-full border border-zinc-500')} />;
  }
}
