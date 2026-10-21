import type { AGUIEvent } from "../protocol/agui.js";

/** 写出一帧的最小客户端抽象；路由层把它映射到 SSE 流。 */
export type SseClient = {
  /** 连接实例 id，用于注册与清理。 */
  readonly id: string;
  /** 写出帧；实现方负责串行化与错误处理。 */
  write(frame: SseFrame): void;
  /** 主动关闭连接（致命错误等场景）。 */
  close(): void;
};

/** SSE 传输帧：AG-UI 事件 + 传输层事件序号。 */
export type SseFrame = {
  /** 会话内单调递增的事件序号；仅用于诊断与 SSE id 字段，不参与恢复。 */
  readonly id?: number;
  /** AG-UI 事件；恢复依赖 MESSAGES_SNAPSHOT，而不是重放。 */
  readonly event: AGUIEvent;
};

/** 单个会话的连接状态。 */
type SessionState = {
  /** 当前活跃连接。 */
  readonly clients: Map<string, SseClient>;
  /** 已分配的最大事件序号。 */
  nextEventId: number;
};

/**
 * SSE 连接中心：维护 sessionId → 连接集合，负责广播 AG-UI 事件。
 *
 * AG-UI 用 MESSAGES_SNAPSHOT 恢复对话现场、
 * 用"下一次 RunAgentInput 携带工具结果"续跑，因此这里不再维护
 * tool_call 重放缓冲与 ack。连接建立时由路由传入初始事件（状态 + 快照）。
 */
export class SseHub {
  private readonly sessions = new Map<string, SessionState>();

  /** 建立连接：注册客户端并按顺序下发初始事件（状态、消息快照等）。 */
  connect(sessionId: string, client: SseClient, initialEvents: AGUIEvent[] = []): void {
    const state = this.state(sessionId);
    state.clients.set(client.id, client);
    for (const event of initialEvents) {
      state.nextEventId += 1;
      client.write({ id: state.nextEventId, event });
    }
  }

  /** 断开连接：移除客户端。 */
  disconnect(sessionId: string, clientId: string): void {
    this.sessions.get(sessionId)?.clients.delete(clientId);
  }

  /** 向会话的所有连接广播一个 AG-UI 事件并分配事件序号；返回序号。 */
  send(sessionId: string, event: AGUIEvent): number {
    const state = this.state(sessionId);
    state.nextEventId += 1;
    const frame: SseFrame = { id: state.nextEventId, event };
    for (const client of state.clients.values()) {
      client.write(frame);
    }
    return frame.id!;
  }

  /** 观测信息：活跃连接数（诊断与测试用）。 */
  stats(sessionId: string): { clients: number } {
    return { clients: this.sessions.get(sessionId)?.clients.size ?? 0 };
  }

  /** 删除会话时调用：关闭该会话的所有连接并移除内存状态，避免空桶常驻。 */
  dispose(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    for (const client of state.clients.values()) {
      client.close();
    }
    this.sessions.delete(sessionId);
  }

  private state(sessionId: string): SessionState {
    let state = this.sessions.get(sessionId);
    if (!state) {
      state = { clients: new Map(), nextEventId: 0 };
      this.sessions.set(sessionId, state);
    }
    return state;
  }
}
