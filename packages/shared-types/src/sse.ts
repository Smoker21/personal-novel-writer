// ── SSE event union（章節 AI 撰寫串流；Spec 005） ─────────────────────────

export type SseEvent =
  | SseStartedEvent
  | SseChunkEvent
  | SseUsageEvent
  | SseDegradedEvent
  | SseCompleteEvent
  | SseErrorEvent;

export interface SseStartedEvent {
  event: "started";
  data: {
    draftId: string;
    model: string;
    contextHash: string;
  };
}

export interface SseChunkEvent {
  event: "chunk";
  data: {
    text: string;
  };
}

export interface SseUsageEvent {
  event: "usage";
  data: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface SseDegradedEvent {
  event: "degraded";
  data: {
    fromModel: string;
    toModel: string;
    reason: string;
  };
}

export interface SseCompleteEvent {
  event: "complete";
  data: {
    draftId: string;
    totalChars: number;
    durationMs: number;
  };
}

export interface SseErrorEvent {
  event: "error";
  data: {
    code: string;
    message: string;
    retryable: boolean;
  };
}
