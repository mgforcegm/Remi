Context
The team manually sends SMS campaigns via Braze: copy order IDs from a Google Sheet, run a BigQuery query, and trigger deployment. Remi v2 automates this with strong governance (approval gates), durable scheduling (Cloud Tasks, not cron), minimal payload risk (pointer-based, not data-shipping), and integration safety (Kafka publish only from server-side Cloud Run).
Critical correction: Cloud Scheduler only supports recurring cron jobs, NOT one-time execution. Google Cloud Tasks is the correct service — it supports scheduleTime for delayed one-time execution (up to 30 days), OIDC auth for Cloud Run, and auto-cleanup after firing.

Two Repos
RepoPurposeRuntimeRemi/ (this repo)Slack bot — data pipeline + schedulingNode.js/TS, runs as long-lived processremi-dispatcher/ (separate)Cloud Run — Kafka publish + Slack statusNode.js/TS, stateless HTTP service

End-to-End Flow
User: @Remi send SMS campaign for <sheet_url> schedule 3pm ET
  │
  Step 1: PARSE_REQUEST
  │  Extract sheet URL, schedule time, compute request_id
  │  Validate user/channel permissions
  │
  Step 2: FETCH_ORDER_IDS
  │  Sheets API → read order IDs from specified tab
  │
  Step 3: RUN_BIGQUERY
  │  Parameterize existing query with order IDs + dates
  │  Run job, collect results
  │
  Step 4: WRITE_AUDIENCE_TABLE
  │  Write results to BQ temp table: remi_sms_audience_{request_id}
  │  Record dataset_ref pointer
  │
  Step 5: PREVIEW_AND_APPROVE
  │  Post: recipient count, masked sample rows, links
  │  Ask: "Reply APPROVE to schedule or CANCEL"
  │  Pause until APPROVE / CANCEL / 30min timeout
  │
  Step 6: CREATE_CLOUD_TASK
  │  Create Cloud Tasks job → dispatcher URL at scheduled time
  │  Payload = pointer to BQ table + metadata (NOT data)
  │  Post confirmation with scheduled time + request_id
  │
  ─── At scheduled time ───
  │
  Cloud Tasks → Cloud Run Dispatcher:
  │  Validate OIDC auth → validate payload → publish to Kafka
  │  Post status to Slack thread: "Published ✅"

Remi Bot — Project Structure
Remi/
├── package.json / tsconfig.json / .env.example / .gitignore
├── config/
│   ├── default.ts                         # Timeouts, TTLs, thresholds
│   ├── services.ts                        # GCP project, BQ dataset, task queue
│   └── workflows/
│       └── sms-campaign.ts                # Query template, sheet IDs, column mappings
├── src/
│   ├── index.ts                           # Bootstrap: init Bolt, register workflows, start
│   ├── app/
│   │   ├── slack-app.ts                   # Bolt app, @mention + thread reply handlers
│   │   └── middleware/
│   │       ├── logging.ts
│   │       ├── auth.ts                    # Channel/user RBAC
│   │       └── error-handler.ts
│   ├── core/
│   │   ├── types/
│   │   │   ├── workflow.ts                # IWorkflow, IWorkflowStep, WorkflowContext, StepResult
│   │   │   ├── conversation.ts            # ConversationState, ConversationPhase
│   │   │   └── services.ts               # Service client interfaces
│   │   ├── workflow-engine.ts             # State machine: runs steps, handles pause/resume
│   │   ├── workflow-registry.ts           # Plugin registry: register + resolve by message
│   │   ├── step-executor.ts              # Retry, timeout, error classification
│   │   └── conversation-manager.ts       # Per-thread state, APPROVE/CANCEL gate
│   ├── workflows/
│   │   ├── base-workflow.ts               # Abstract base with default hooks
│   │   └── sms-campaign/
│   │       ├── index.ts                   # SmsCampaignWorkflow class
│   │       ├── types.ts                   # SmsCampaignContext
│   │       ├── validators.ts              # Zod schemas for inputs
│   │       └── steps/
│   │           ├── 01-parse-request.ts
│   │           ├── 02-fetch-order-ids.ts
│   │           ├── 03-run-bigquery.ts
│   │           ├── 04-write-audience-table.ts
│   │           ├── 05-preview-and-approve.ts
│   │           └── 06-create-cloud-task.ts
│   ├── services/
│   │   ├── google-sheets.ts               # Read ranges, resolve tabs by gid
│   │   ├── bigquery.ts                    # Run queries, write temp tables
│   │   ├── cloud-tasks.ts                 # Create one-time HTTP tasks with OIDC
│   │   └── slack-messenger.ts             # Thread messaging, Block Kit formatting
│   └── utils/
│       ├── logger.ts                      # Pino structured logger
│       ├── retry.ts                       # Generic retry with exponential backoff
│       ├── sheet-url-parser.ts            # Parse Sheet URLs → { spreadsheetId, gid }
│       ├── date-helpers.ts                # Parse schedule times, ET→UTC conversion
│       └── request-id.ts                  # Generate deterministic request_id
└── tests/
    ├── unit/
    └── integration/
Removed from v1: Google Drive service, Apps Script service, CSV handling — replaced by BQ temp tables + Cloud Tasks + Kafka.

Dispatcher — Project Structure (separate repo)
remi-dispatcher/
├── package.json / tsconfig.json / Dockerfile / .env.example
├── src/
│   ├── index.ts                           # Express app, start server
│   ├── routes/
│   │   └── dispatch.ts                    # POST /dispatch — main handler
│   ├── services/
│   │   ├── kafka-producer.ts              # kafkajs producer, publish to topic
│   │   └── slack-notifier.ts              # Post status to Slack thread
│   ├── middleware/
│   │   ├── auth.ts                        # OIDC token verification (Cloud Tasks SA only)
│   │   └── validate.ts                    # Zod payload validation
│   ├── types/
│   │   └── dispatch-payload.ts            # Shared payload schema
│   └── utils/
│       └── logger.ts
└── tests/

Shared Contract: Cloud Tasks → Dispatcher Payload
typescriptinterface DispatchPayload {
  request_id: string;                    // "remi_20260301_a3f2b1"
  scheduled_for: string;                 // ISO 8601 UTC
  dataset_ref: {
    project: string;
    dataset: string;
    table: string;                       // "remi_sms_audience_20260301_a3f2b1"
  };
  deployment: {
    kafka_topic: string;                 // "sms.deployment.requests"
    template_id: string;
    variant?: string;
  };
  audit: {
    requested_by: string;               // Slack user ID
    approved_by: string;
    approved_at: string;                // ISO 8601
    channel: string;
    thread_ts: string;
  };
  slack_callback: {
    channel: string;
    thread_ts: string;
    bot_token_secret: string;           // Secret Manager reference, NOT raw token
  };
}
request_id format: remi_{YYYYMMDD}_{6-char-hex} — deterministic from channel+thread_ts, used for idempotency at three layers: Cloud Tasks task name, dispatcher dedup, Kafka message key.

Key Interfaces (Remi Bot)
typescript// Workflow step result — can pause for approval
interface StepResult {
  data: Record<string, unknown>;
  needsInput?: boolean;                  // Pause for any user input
  needsApproval?: boolean;               // Specific APPROVE/CANCEL gate
  question?: string;
  options?: string[];
  statusMessage?: string;
}

// Conversation phases — v2 adds AWAITING_APPROVAL
type ConversationPhase =
  | 'IDLE'
  | 'EXECUTING'
  | 'AWAITING_INPUT'
  | 'AWAITING_APPROVAL'                  // NEW: waiting for APPROVE/CANCEL
  | 'COMPLETED'
  | 'FAILED';

// SMS campaign accumulated context
interface SmsCampaignContext {
  requestId: string;
  scheduleTime: Date;                    // UTC
  sourceSpreadsheetId: string;
  sourceGid: number;
  sourceTabName: string;
  orderIds: string[];
  bigQueryJobId: string;
  queryResultRowCount: number;
  audienceTable: string;                 // Full BQ table ref
  datasetRef: { project: string; dataset: string; table: string };
  approvedBy: string;
  approvedAt: Date;
  cloudTaskName: string;
}
```

---

## Dependencies

### Remi Bot
```
@slack/bolt, @slack/web-api             # Slack
@google-cloud/bigquery                  # BigQuery
@google-cloud/tasks                     # Cloud Tasks (replaces Scheduler)
googleapis, google-auth-library         # Sheets API
dotenv, pino, uuid, zod                 # Utilities
typescript, vitest, tsx, eslint         # Dev
```

### Dispatcher
```
express                                 # HTTP server
kafkajs                                 # Kafka producer (recommended over @confluentinc/kafka-javascript — pure JS, zero native deps, sufficient for low-volume producer)
google-auth-library                     # OIDC token verification
@google-cloud/secret-manager            # Read Slack bot token
zod                                     # Payload validation
pino                                    # Logger
typescript, vitest                      # Dev
Kafka recommendation: kafkajs — pure JavaScript, no native dependencies (important for Cloud Run cold starts), good TypeScript support, trivial migration path to Confluent client if needed later.

Error Handling & Rollback
StepRollback on FailureParse RequestNone (no side effects)Fetch Order IDsNone (read-only)Run BigQueryCancel running jobWrite Audience TableDelete temp tablePreview & ApproveNone (CANCEL = clean exit)Create Cloud TaskDelete the taskDispatcher: Kafka publishNo auto-rollback — alert user, dedupe prevents re-send
Threshold checks (in Step 5, before approval):

Recipients = 0 → abort with error
Recipients > configurable max (e.g., 10,000) → require explicit confirmation
Duplicate request_id → warn user, ask to confirm or cancel

Idempotency (3 layers):

Cloud Tasks: task name = remi-dispatch-{request_id} → rejects duplicates
Dispatcher: in-memory Set of processed request_ids (cleared on restart, but Cloud Tasks handles persistence)
Kafka: message key = request_id → consumer can dedupe


Security & Permissions
Service AccountPermissionsRemi bot SABQ job run + table create/write, Sheets read, Cloud Tasks create, Secret Manager readCloud Tasks SAInvoke Cloud Run dispatcherDispatcher SAKafka publish, Secret Manager read (for Slack token)
RBAC: Configurable allowed channels + allowed users in config/default.ts. Auth middleware rejects unauthorized requests before they reach the workflow engine.

Implementation Phases
Phase 1: Dispatcher + Kafka Publish

Build Cloud Run dispatcher: POST /dispatch endpoint
OIDC auth middleware, Zod validation
kafkajs producer → publish to test topic
Hardcode a test payload, verify Kafka publish works
Dockerfile + deploy to Cloud Run
Milestone: HTTP POST to dispatcher → message appears in Kafka

Phase 2: Remi Schedules Task

Init Remi project (package.json, tsconfig, Bolt app)
Implement Cloud Tasks service client
Remi creates a Cloud Tasks job pointing to dispatcher
Verify: Remi → Cloud Tasks → Dispatcher → Kafka end-to-end
Milestone: Scheduled task fires and publishes to Kafka

Phase 3: Data Pipeline

Implement Google Sheets service (read order IDs)
Implement BigQuery service (parameterized queries + temp table writes)
Build steps 1-4 of SMS workflow
Verify: Sheet → BigQuery → temp table with correct data
Milestone: Data pipeline produces correct audience table

Phase 4: Slack UX + Approval

Build conversation manager (thread state, pause/resume)
Build workflow engine (state machine, step executor)
Implement Step 5: preview + APPROVE/CANCEL gate
Implement Step 6: create Cloud Task with full payload
Dispatcher posts status back to Slack thread
Milestone: Full end-to-end from Slack mention to Kafka publish with approval

Phase 5: Hardening

RBAC middleware (allowed channels/users)
Threshold checks (0 recipients, max recipients)
BQ temp table TTL / cleanup
Observability (structured logs, error alerting)
Integration tests
Milestone: Production-ready


Verification Plan

Unit tests: Workflow engine, step executor, conversation manager, URL parser, date parsing, each service (mocked)
Dispatcher integration: Send test payload to Cloud Run endpoint → verify Kafka message + Slack post
Cloud Tasks integration: Create task → verify it fires at correct time → hits dispatcher
Full end-to-end: @Remi in test channel with real Sheet URL → verify:

Status updates in thread for each step
Order IDs extracted correctly
BigQuery query runs with correct parameters
Temp table created with correct data
Preview shows correct count + sample rows
APPROVE triggers Cloud Task creation
Task fires at scheduled time → Kafka publish → Slack status


Error scenarios: Invalid URL, empty order IDs, BQ error, CANCEL, timeout, duplicate request
Security: Unauthorized user/channel rejected, dispatcher rejects non-Scheduler calls


Pending: User to Provide

Google Sheet (source sheet with order IDs — URL + which tab/column)
BigQuery query to be parameterized (the existing query)
GCP project ID, BigQuery dataset name
Cloud Tasks queue name and location
Kafka cluster connection details (brokers, topic name, auth)
Braze template_id / variant for the SMS campaign
Service account credentials (or confirmation they're set up)
Slack bot token, signing secret, app token
List of allowed Slack channels/users for RBAC
