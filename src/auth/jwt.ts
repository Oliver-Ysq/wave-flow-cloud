import { randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

/** 登录令牌受众：只有声明给本服务用的 token 才通过校验。 */
const TOKEN_AUDIENCE = "wave-flow-cloud";
/** OAuth state 的受众：与登录令牌共用签名密钥，靠 audience 隔离用途。 */
const STATE_AUDIENCE = "oauth-state";
/** 登录令牌有效期：权衡重新登录频率与泄漏窗口（设计 §5）。 */
const TOKEN_TTL = "7d";
/** OAuth state 有效期：覆盖用户完成 GitHub 授权所需时间。 */
const STATE_TTL = "10m";

/** 把配置里的 hex 密钥解码为 32 字节；长度不对说明配置非法。 */
function decodeSigningKey(secret: string): Uint8Array {
  const key = Buffer.from(secret, "hex");
  if (key.length !== 32) {
    throw new Error("JWT_SECRET 必须是 32 字节 hex（生成：openssl rand -hex 32）");
  }
  return key;
}

/** 签发登录 JWT：sub=内部用户 id，aud=本服务，7 天过期。 */
export async function signAuthToken(userId: string, secret: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience(TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(decodeSigningKey(secret));
}

/** 校验登录 JWT，返回 sub（用户 id）；签名、过期或 audience 不符均抛错。 */
export async function verifyAuthToken(token: string, secret: string): Promise<string> {
  const { payload } = await jwtVerify(token, decodeSigningKey(secret), {
    audience: TOKEN_AUDIENCE,
  });
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("令牌缺少 sub");
  }
  return payload.sub;
}

/** 签发 OAuth state：短时效 + 随机 nonce，回调时验签即可防 Login CSRF。 */
export async function signOAuthState(secret: string): Promise<string> {
  return new SignJWT({ nonce: randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(STATE_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(STATE_TTL)
    .sign(decodeSigningKey(secret));
}

/** 校验 OAuth state；签名、过期或 audience 不符均抛错，回调应视为非法。 */
export async function verifyOAuthState(state: string, secret: string): Promise<void> {
  await jwtVerify(state, decodeSigningKey(secret), { audience: STATE_AUDIENCE });
}
