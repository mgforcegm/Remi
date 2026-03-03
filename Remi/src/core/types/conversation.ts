export type ConversationPhase =
  | 'IDLE'
  | 'EXECUTING'
  | 'AWAITING_INPUT'
  | 'AWAITING_APPROVAL'
  | 'COMPLETED'
  | 'FAILED';

export interface ConversationState {
  phase: ConversationPhase;
  workflowName: string | null;
  executionId: string | null;
  threadTs: string;
  channel: string;
  userId: string;
  pendingResolver: ((input: string) => void) | null;
  pendingQuestion: string | null;
  lastActivityAt: Date;
}
