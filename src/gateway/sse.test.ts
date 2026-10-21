import assert from "node:assert/strict";
import { test } from "node:test";
import { messagesSnapshotEvent, sessionStatusEvent, EventType } from "../protocol/agui.js";
import { SseHub, type SseClient, type SseFrame } from "./sse.js";

/** 假客户端：把收到的帧收集到数组，便于断言。 */
function fakeClient(id: string): { client: SseClient; frames: SseFrame[] } {
  const frames: SseFrame[] = [];
  return {
    client: { id, write: (frame) => frames.push(frame), close: () => {} },
    frames,
  };
}

test("连接时按顺序下发初始事件（状态 + 消息快照）", () => {
  const hub = new SseHub();
  const a = fakeClient("a");
  const initial = [sessionStatusEvent("active"), messagesSnapshotEvent([])];
  hub.connect("s1", a.client, initial);

  assert.equal(a.frames.length, 2);
  assert.equal(a.frames[0]?.event.type, EventType.CUSTOM);
  assert.equal(a.frames[1]?.event.type, EventType.MESSAGES_SNAPSHOT);
});

test("不同会话互不串事件", () => {
  const hub = new SseHub();
  const a = fakeClient("a");
  const b = fakeClient("b");
  hub.connect("s1", a.client);
  hub.connect("s2", b.client);

  hub.send("s1", sessionStatusEvent("interrupted"));
  assert.equal(a.frames.length, 1);
  assert.equal(b.frames.length, 0);
});

test("事件序号在同一会话内单调递增", () => {
  const hub = new SseHub();
  const a = fakeClient("a");
  hub.connect("s1", a.client);
  const first = hub.send("s1", sessionStatusEvent("active"));
  const second = hub.send("s1", messagesSnapshotEvent([]));
  assert.equal(first, 1);
  assert.equal(second, 2);
});

test("断开后活跃连接归零", () => {
  const hub = new SseHub();
  const client = fakeClient("c");
  hub.connect("s1", client.client);
  hub.disconnect("s1", "c");
  assert.deepEqual(hub.stats("s1"), { clients: 0 });
});

test("AG-UI 事件可通过官方 schema 校验", async () => {
  const { parseAgUiEvent } = await import("../protocol/agui.js");
  assert.doesNotThrow(() => parseAgUiEvent(sessionStatusEvent("active")));
  assert.doesNotThrow(() => parseAgUiEvent(messagesSnapshotEvent([])));
});

test("dispose 关闭连接并清除会话状态", () => {
  const hub = new SseHub();
  let closed = false;
  const client: SseClient = {
    id: "c",
    write: () => {},
    close: () => {
      closed = true;
    },
  };
  hub.connect("s1", client);
  hub.dispose("s1");
  assert.equal(closed, true);
  assert.deepEqual(hub.stats("s1"), { clients: 0 });
});
