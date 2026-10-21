import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import * as schema from "./schema.js";

/** 类型化数据库句柄：schema 推导出的表类型随 db 导出，业务查询全程有类型。 */
export type Db = NodePgDatabase<typeof schema>;

/** 创建连接池与 Drizzle 句柄；调用方负责持有并在进程退出时结束池。 */
export function createDb(databaseUrl: string): Db {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  return drizzle(pool, { schema });
}

/**
 * 执行未运行过的迁移：按 migrations/ 内 journal 记录求差集，逐文件应用。
 * 幂等——重复调用零操作；失败抛错，启动流程应拒绝继续（fail-fast）。
 */
export async function runMigrations(db: Db, migrationsFolder = "migrations"): Promise<void> {
  await migrate(db, { migrationsFolder });
}
