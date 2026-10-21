import { integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * 数据表定义（当前真相）：全项目唯一表结构来源，业务代码从这里获得类型。
 * 结构变更流程：改本文件 → drizzle-kit generate 生成 migrations/*.sql（演进历史）
 * → 应用启动时 migrator 按 journal 执行未运行过的迁移。
 * 表结构对应设计 §4.3；schema_migrations 由 migrator 内置 journal（__drizzle_migrations）承担。
 */

export const users = pgTable(
  "users",
  {
    /** 内部主键，UUID v4，应用生成。 */
    id: uuid("id").primaryKey().defaultRandom(),
    /** GitHub 数字 ID；GitHub 的 ID 空间与 repo/org 共享且持续增长，用 bigint 防 int32 溢出。 */
    githubId: integer("github_id").notNull(),
    /** GitHub 登录名，仅展示用。 */
    login: text("login").notNull(),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_github_id_unique").on(t.githubId)],
);

export const credentials = pgTable("credentials", {
  /** 内部主键，UUID v4。 */
  id: uuid("id").primaryKey().defaultRandom(),
  /** 属主用户；删除用户级联删除其凭据。 */
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** AES-256-GCM 密文，主密钥在 env（MASTER_KEY），服务端永不回显明文。 */
  ciphertext: text("ciphertext").notNull(),
  /** 随机初始化向量，随密文一起存表；同一明文+同一密钥不产出同一密文。 */
  iv: text("iv").notNull(),
  /** GCM 完整性校验标签，防密文篡改。 */
  authTag: text("auth_tag").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  /** 最近一次被模型调用使用的时间，可空（保存后可能从未使用）。 */
  lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "string" }),
});

export const harnessSessions = pgTable("harness_sessions", {
  /** 会话 ID，客户端凭它建立 SSE 与上行 POST。 */
  id: uuid("id").primaryKey().defaultRandom(),
  /** 属主用户；删除用户级联删除其会话。 */
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** 会话标题，创建时可由客户端指定，用于列表展示。 */
  title: text("title").notNull(),
  /** 模型标识（如 gpt-4o）；创建时从凭据推导，可空表示未锁定。 */
  model: text("model"),
  /** 会话状态：active / interrupted；驱动失联降级逻辑。 */
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  /** 最近一次上行/下行活动的时间，失联判定的依据。 */
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "string" }),
  /** 会话创建时客户端上报的能力档位（只读查询 A/B 档等），服务端据此决定注入哪些工具定义。 */
  features: jsonb("features"),
});

export const sessionMessages = pgTable(
  "session_messages",
  {
    /** 所属会话；删除会话物理删除现场（设计 §5 隐私生命周期承诺）。 */
    sessionId: uuid("session_id")
      .notNull()
      .references(() => harnessSessions.id, { onDelete: "cascade" }),
    /** 会话内单调递增序号；断线重放按 (session_id, idx) 顺序重建现场的物理基础。 */
    idx: integer("idx").notNull(),
    /** OpenAI messages 角色：system / user / assistant / tool。 */
    role: text("role").notNull(),
    /** messages[i] 的完整形状（content、tool_calls、tool_call_id 等），jsonb 容纳多态。 */
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.idx] })],
);
