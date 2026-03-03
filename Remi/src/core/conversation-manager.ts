import { logger } from '../utils/logger';
import { WorkflowEngine, WorkflowPause } from './workflow-engine';
import { WorkflowRegistry } from './workflow-registry';
import type { ConversationState, ConversationPhase, ISlackMessenger } from './types';

interface ActiveConversation {
  state: ConversationState;
  pendingPause: WorkflowPause | null;
}

export class ConversationManager {
  private conversations: Map<string, ActiveConversation> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly engine: WorkflowEngine,
    private readonly registry: WorkflowRegistry,
    private readonly messenger: ISlackMessenger,
    private readonly ttlMs: number = 1_800_000,
  ) {}

  /**
   * Start periodic cleanup of stale conversations.
   */
  startCleanup(): void {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Handle a new @Remi mention (starts a new workflow or posts help).
   */
  async handleMention(
    channel: string,
    threadTs: string,
    userId: string,
    botUserId: string,
    text: string,
  ): Promise<void> {
    const key = this.key(channel, threadTs);

    // Check if there's already an active conversation for this thread
    if (this.conversations.has(key)) {
      await this.messenger.postStatus(
        channel,
        threadTs,
        'A workflow is already running in this thread. Please wait for it to complete or start a new thread.',
      );
      return;
    }

    // Strip the bot mention from the message
    const cleanMessage = text.replace(/<@[A-Z0-9]+>/g, '').trim();

    // Try to resolve a workflow
    const workflow = this.registry.resolve(cleanMessage);
    if (!workflow) {
      const available = this.registry
        .list()
        .map((w) => `- *${w.displayName}*: ${w.description}`)
        .join('\n');

      await this.messenger.postStatus(
        channel,
        threadTs,
        `I'm not sure what you'd like me to do. Here's what I can help with:\n${available}`,
      );
      return;
    }

    // Create conversation state
    const state: ConversationState = {
      phase: 'EXECUTING',
      workflowName: workflow.name,
      executionId: null,
      threadTs,
      channel,
      userId,
      pendingResolver: null,
      pendingQuestion: null,
      lastActivityAt: new Date(),
    };

    const conversation: ActiveConversation = {
      state,
      pendingPause: null,
    };

    this.conversations.set(key, conversation);

    logger.info(
      { channel, threadTs, userId, workflow: workflow.name },
      'Starting new workflow from mention',
    );

    await this.messenger.postStatus(
      channel,
      threadTs,
      `:robot_face: Starting *${workflow.displayName}* workflow. I'll keep you updated here.`,
    );

    // Execute workflow (runs async, pauses when input needed)
    this.engine
      .execute(
        workflow,
        { channel, threadTs, userId, botUserId },
        cleanMessage,
        {},
        (pause: WorkflowPause) => {
          // Workflow is pausing — store the resolver
          conversation.state.phase =
            pause.type === 'approval' ? 'AWAITING_APPROVAL' : 'AWAITING_INPUT';
          conversation.state.pendingQuestion = pause.question;
          conversation.state.pendingResolver = pause.resolve;
          conversation.pendingPause = pause;
          conversation.state.lastActivityAt = new Date();
        },
      )
      .then(({ success, context }) => {
        conversation.state.phase = success ? 'COMPLETED' : 'FAILED';
        conversation.state.executionId = context.executionId;
        conversation.state.lastActivityAt = new Date();

        if (success) {
          logger.info({ executionId: context.executionId }, 'Workflow completed');
        }
      })
      .catch((error) => {
        conversation.state.phase = 'FAILED';
        conversation.state.lastActivityAt = new Date();
        logger.error({ error: String(error) }, 'Workflow execution crashed');
        this.messenger.postError(channel, threadTs, error instanceof Error ? error : new Error(String(error)));
      });
  }

  /**
   * Handle a thread reply (feeds input back to a paused workflow).
   */
  async handleThreadReply(
    channel: string,
    threadTs: string,
    userId: string,
    text: string,
  ): Promise<void> {
    const key = this.key(channel, threadTs);
    const conversation = this.conversations.get(key);

    if (!conversation) return;

    const { state } = conversation;

    if (
      (state.phase === 'AWAITING_INPUT' || state.phase === 'AWAITING_APPROVAL') &&
      state.pendingResolver
    ) {
      logger.info(
        { channel, threadTs, phase: state.phase, reply: text.slice(0, 100) },
        'Received reply for paused workflow',
      );

      state.lastActivityAt = new Date();
      const resolver = state.pendingResolver;
      state.pendingResolver = null;
      state.pendingQuestion = null;
      state.phase = 'EXECUTING';
      conversation.pendingPause = null;

      // Resume the workflow
      resolver(text.trim());
    }
  }

  /**
   * Check if a thread has an active conversation.
   */
  hasActiveConversation(channel: string, threadTs: string): boolean {
    const key = this.key(channel, threadTs);
    const conversation = this.conversations.get(key);
    if (!conversation) return false;
    return !['COMPLETED', 'FAILED', 'IDLE'].includes(conversation.state.phase);
  }

  private key(channel: string, threadTs: string): string {
    return `${channel}:${threadTs}`;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, conversation] of this.conversations) {
      const age = now - conversation.state.lastActivityAt.getTime();
      if (age > this.ttlMs) {
        logger.info({ key, phase: conversation.state.phase, ageMs: age }, 'Cleaning up stale conversation');

        // If there's a pending resolver, cancel it
        if (conversation.state.pendingResolver) {
          conversation.state.pendingResolver('__timeout__');
        }

        this.conversations.delete(key);
      }
    }
  }
}
