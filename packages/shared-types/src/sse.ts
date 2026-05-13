/** chapter-writer SSE 事件 union（client/server 共用） */

export interface SseStartedEvent {
  event: "started";
  data: { draftId: string; model: string; contextHash: string };
}

export interface SseChunkEvent {
  event: "chunk";
  data: { text: string };
}

export interface SseUsageEvent {
  event: "usage";
  data: { inputTokens: number; outputTokens: number };
}

export interface SseCompleteEvent {
  event: "complete";
  data: { draftId: string; totalChars: number; durationMs: number };
}

export interface SseDegradedEvent {
  event: "degraded";
  data: { from: string; to: string; reason: string };
}

export interface SseErrorEvent {
  event: "error";
  data: { code: string; message: string; retryable: boolean };
}

export type SseEvent =
  | SseStartedEvent
  | SseChunkEvent
  | SseUsageEvent
  | SseCompleteEvent
  | SseDegradedEvent
  | SseErrorEvent;

export type SseEventName = SseEvent["event"];
