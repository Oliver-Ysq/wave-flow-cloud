/**
 * 环境配置契约：全项目唯一读取 process.env 的模块。
 * 启动时一次性校验所有必需变量（fail-fast），缺失即抛错并一次性列出全部缺失项；
 * loadConfig 是纯函数（env 可注入），便于后续单测不碰真实环境。
 */

/** 必需环境变量清单：环境契约，新增变量必须先加到这里和 .env.example。 */
const REQUIRED_ENVS = [
  "DATABASE_URL",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GITHUB_REDIRECT_URL",
  "JWT_SECRET",
  "MASTER_KEY",
] as const;

/** 已校验的应用配置：字段均为非空字符串（PORT 已解析为整数）。 */
export type AppConfig = {
  /** HTTP 服务监听端口。默认 3077；非 1–65535 整数视为配置错误。 */
  readonly port: number;
  /** PostgreSQL 连接串（第 1 章启用）。 */
  readonly databaseUrl: string;
  /** GitHub OAuth App 客户端 ID（第 2 章启用）。 */
  readonly githubClientId: string;
  /** GitHub OAuth App 客户端密钥（第 2 章启用）。 */
  readonly githubClientSecret: string;
  /** GitHub OAuth 回调地址，必须与 OAuth App 登记值一致（协议/域名/端口/路径）。 */
  readonly githubRedirectUrl: string;
  /** JWT 签名密钥，32 字节 hex（64 个十六进制字符）。 */
  readonly jwtSecret: string;
  /** AES-256-GCM 主密钥，用于模型凭据加密（第 3 章启用）。 */
  readonly masterKey: string;
};

/** 解析并校验环境变量；任何缺失或非法值都抛 Error，进程应在启动阶段退出。 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const missing = REQUIRED_ENVS.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`启动失败：缺少必需环境变量 ${missing.join("、")}`);
  }

  const rawPort = env.PORT ?? "3077";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`启动失败：PORT 必须是 1–65535 的整数，当前值 "${rawPort}"`);
  }

  // 上面的校验已保证以下取值非空
  const jwtSecret = env.JWT_SECRET!.trim();
  if (!/^[0-9a-f]{64}$/i.test(jwtSecret)) {
    throw new Error("启动失败：JWT_SECRET 必须是 64 位 hex（32 字节，生成：openssl rand -hex 32）");
  }

  const masterKey = env.MASTER_KEY!.trim();
  if (!/^[0-9a-f]{64}$/i.test(masterKey)) {
    throw new Error("启动失败：MASTER_KEY 必须是 64 位 hex（32 字节，生成：openssl rand -hex 32）");
  }

  return {
    port,
    databaseUrl: env.DATABASE_URL!.trim(),
    githubClientId: env.GITHUB_CLIENT_ID!.trim(),
    githubClientSecret: env.GITHUB_CLIENT_SECRET!.trim(),
    githubRedirectUrl: env.GITHUB_REDIRECT_URL!.trim(),
    jwtSecret,
    masterKey,
  };
}
