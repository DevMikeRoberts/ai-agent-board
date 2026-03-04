// Re-export all types and validation utilities from the shared module
export type {
  Priority,
  ColumnId,
  AgentStatus,
  AgentType,
  Task,
  TaskGroup,
  TaskTemplate,
  TaskAttachment,
  AgentEventType,
  AgentEvent,
  WSMessage,
} from '../../../shared/types.js';

export {
  VALID_PRIORITIES,
  VALID_COLUMNS,
  VALID_AGENT_STATUSES,
  VALID_AGENT_TYPES,
  VALID_TRANSITIONS,
  isValidPriority,
  isValidColumnId,
  isValidAgentStatus,
  isValidAgentType,
  MAX_GROUP_CHILDREN,
  MIN_GROUP_CHILDREN,
  isValidMaxConcurrency,
} from '../../../shared/constants.js';
