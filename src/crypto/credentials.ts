import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** AES-256-GCM 固定参数：256 位密钥、96 位 IV、128 位认证标签。 */
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/** 加密结果：三个字段均为 base64，分别对应数据库三列。 */
export type EncryptedSecret = {
  /** 密文（base64）。 */
  readonly ciphertext: string;
  /** 本条记录独立的随机 IV（base64），可与密文一起存储。 */
  readonly iv: string;
  /** GCM 认证标签（base64），解密时用于完整性校验。 */
  readonly authTag: string;
};

/** 把 64 位 hex 主密钥解码为 32 字节；长度不对立即报错。 */
function decodeMasterKey(masterKeyHex: string): Buffer {
  const key = Buffer.from(masterKeyHex, "hex");
  if (key.length !== KEY_BYTES) {
    throw new Error("MASTER_KEY 必须是 32 字节 hex（生成：openssl rand -hex 32）");
  }
  return key;
}

/** 加密：同一明文每次产出不同密文（随机 IV），并附带防篡改标签。 */
export function encryptSecret(plaintext: string, masterKeyHex: string): EncryptedSecret {
  const key = decodeMasterKey(masterKeyHex);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

/**
 * 解密：密钥错误、IV/标签非法、密文被篡改时抛错（绝不返回乱码冒充明文）。
 */
export function decryptSecret(secret: EncryptedSecret, masterKeyHex: string): string {
  const key = decodeMasterKey(masterKeyHex);
  const iv = Buffer.from(secret.iv, "base64");
  const authTag = Buffer.from(secret.authTag, "base64");
  if (iv.length !== IV_BYTES) {
    throw new Error("凭据 IV 长度非法");
  }
  if (authTag.length !== TAG_BYTES) {
    throw new Error("凭据认证标签长度非法");
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
