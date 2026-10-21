import assert from "node:assert/strict";
import { test } from "node:test";
import { decryptSecret, encryptSecret } from "./credentials.js";

const MASTER_KEY = "a".repeat(64);
const OTHER_KEY = "b".repeat(64);

test("加密后可原样解密", () => {
  const secret = encryptSecret("sk-test-123456", MASTER_KEY);
  assert.equal(decryptSecret(secret, MASTER_KEY), "sk-test-123456");
});

test("同一明文两次加密的密文不同（随机 IV 生效）", () => {
  const first = encryptSecret("sk-test-123456", MASTER_KEY);
  const second = encryptSecret("sk-test-123456", MASTER_KEY);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.notEqual(first.iv, second.iv);
});

test("错误主密钥解密失败", () => {
  const secret = encryptSecret("sk-test-123456", MASTER_KEY);
  assert.throws(() => decryptSecret(secret, OTHER_KEY));
});

test("篡改密文后解密失败", () => {
  const secret = encryptSecret("sk-test-123456", MASTER_KEY);
  const tampered = {
    ...secret,
    ciphertext: Buffer.from(
      Buffer.from(secret.ciphertext, "base64").map((byte, index) => (index === 0 ? byte ^ 0xff : byte)),
    ).toString("base64"),
  };
  assert.throws(() => decryptSecret(tampered, MASTER_KEY));
});

test("篡改认证标签后解密失败", () => {
  const secret = encryptSecret("sk-test-123456", MASTER_KEY);
  const tampered = {
    ...secret,
    authTag: Buffer.from(secret.authTag, "base64").fill(0).toString("base64"),
  };
  assert.throws(() => decryptSecret(tampered, MASTER_KEY));
});
