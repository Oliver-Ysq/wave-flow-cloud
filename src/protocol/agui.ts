import {
  EventType,
  PROTOCOL_VERSION,
  type AGUIEvent,
  type Message,
  type ToolCall,
} from "@ag-ui/core";
import { EventSchema } from "@ag-ui/core/schemas";

export { EventType, PROTOCOL_VERSION };
export type { AGUIEvent, Message, ToolCall };

/** Wave Flow 在 AG-UI 之上的扩展事件名；标准未覆盖的语义统一走 CUSTOM。 */
export const WAVEFLOW_CUSTOM_EVENT = {
  /** 会话状态快照：active / interrupted。 */
  sessionStatus: "waveflow.session.status",
} as const;

/** 构造会话状态扩展事件（AG-UI CUSTOM）。 */
export function sessionStatusEvent(status: "active" | "interrupted"): AGUIEvent {
  return {
    type: EventType.CUSTOM,
    name: WAVEFLOW_CUSTOM_EVENT.sessionStatus,
    value: { status },
  };
}

/** 构造对话快照事件（AG-UI 标准恢复手段，用于连接/重连时同步现场）。 */
export function messagesSnapshotEvent(messages: Message[]): AGUIEvent {
  return { type: EventType.MESSAGES_SNAPSHOT, messages };
}

/** 发送前校验；不合法视为编程错误，不进入网络。 */
export function parseAgUiEvent(event: AGUIEvent): AGUIEvent {
  return EventSchema.parse(event) as AGUIEvent;
}
