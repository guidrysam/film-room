import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";

describe("drive crypto", () => {
  const prev = process.env.DRIVE_TOKEN_ENCRYPTION_KEY;

  before(() => {
    process.env.DRIVE_TOKEN_ENCRYPTION_KEY = "test-drive-vault-key";
  });

  after(() => {
    if (prev === undefined) delete process.env.DRIVE_TOKEN_ENCRYPTION_KEY;
    else process.env.DRIVE_TOKEN_ENCRYPTION_KEY = prev;
  });

  it("round-trips secrets", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/drive/crypto");
    const blob = encryptSecret("refresh-token-value");
    assert.equal(decryptSecret(blob), "refresh-token-value");
  });
});
