export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type ColumnId = 'backlog' | 'in-progress' | 'review' | 'done';
export type AgentStatus = 'idle' | 'planning' | 'executing' | 'complete' | 'failed';

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  columnId: ColumnId;
  agentStatus: AgentStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export type AgentEventType =
  | 'thinking'
  | 'tool_call'
  | 'file_edit'
  | 'command'
  | 'output'
  | 'error'
  | 'complete';

export interface AgentEvent {
  id: string;
  taskId: string;
  type: AgentEventType;
  content: string;
  timestamp: number;
  metadata?: {
    file?: string;
    language?: string;
    command?: string;
    diff?: string;
  };
}

export interface WSMessage {
  type: 'agent_event' | 'task_updated';
  payload: AgentEvent | Task;
}
