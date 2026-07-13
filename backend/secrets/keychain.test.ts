// backend/secrets/keychain.test.ts
import { assertEquals } from "jsr:@std/assert";
import { deleteSecret, getSecret, setSecret } from "./keychain.ts";

const TEST_ACCOUNT = "FLOWFOLIO_TEST_SECRET";

Deno.test({
  name: "set then get round-trips a secret",
  fn: async () => {
    try {
      await setSecret(TEST_ACCOUNT, "test-value-123");
      const value = await getSecret(TEST_ACCOUNT);
      assertEquals(value, "test-value-123");
    } finally {
      await deleteSecret(TEST_ACCOUNT);
    }
  },
});

Deno.test({
  name: "getSecret returns null for a secret that was never set",
  fn: async () => {
    const value = await getSecret("FLOWFOLIO_TEST_NEVER_SET");
    assertEquals(value, null);
  },
});

Deno.test({
  name: "set overwrites a previous value for the same account",
  fn: async () => {
    try {
      await setSecret(TEST_ACCOUNT, "first");
      await setSecret(TEST_ACCOUNT, "second");
      const value = await getSecret(TEST_ACCOUNT);
      assertEquals(value, "second");
    } finally {
      await deleteSecret(TEST_ACCOUNT);
    }
  },
});

Deno.test({
  name: "delete then get returns null",
  fn: async () => {
    try {
      await setSecret(TEST_ACCOUNT, "temp");
    } finally {
      await deleteSecret(TEST_ACCOUNT);
    }
    const value = await getSecret(TEST_ACCOUNT);
    assertEquals(value, null);
  },
});
