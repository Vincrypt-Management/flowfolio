// backend/secrets/keychain.ts

const SERVICE = "flowfolio";

export class SecretToolNotFoundError extends Error {
  constructor() {
    super(
      "`secret-tool` was not found. Install it via your distro's `libsecret-tools` " +
        "(or equivalent) package to enable secret storage on Linux.",
    );
    this.name = "SecretToolNotFoundError";
  }
}

async function run(cmd: string, args: string[], stdin?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const command = new Deno.Command(cmd, {
    args,
    stdin: stdin !== undefined ? "piped" : "null",
    stdout: "piped",
    stderr: "piped",
  });
  const child = command.spawn();
  if (stdin !== undefined) {
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(stdin));
    await writer.close();
  }
  const { code, stdout, stderr } = await child.output();
  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
}

// ===== macOS: Keychain via `security` =====

async function macSet(account: string, value: string): Promise<void> {
  await run("security", ["delete-generic-password", "-a", account, "-s", SERVICE]).catch(() => {});
  const { code, stderr } = await run("security", [
    "add-generic-password",
    "-a",
    account,
    "-s",
    SERVICE,
    "-w",
    value,
  ]);
  if (code !== 0) throw new Error(`Failed to store secret in macOS Keychain: ${stderr}`);
}

async function macGet(account: string): Promise<string | null> {
  const { code, stdout } = await run("security", [
    "find-generic-password",
    "-a",
    account,
    "-s",
    SERVICE,
    "-w",
  ]);
  if (code !== 0) return null;
  return stdout.trim();
}

async function macDelete(account: string): Promise<void> {
  await run("security", ["delete-generic-password", "-a", account, "-s", SERVICE]).catch(() => {});
}

// ===== Linux: Secret Service via `secret-tool` =====

async function assertSecretToolAvailable(): Promise<void> {
  try {
    await run("secret-tool", ["--version"]);
  } catch {
    throw new SecretToolNotFoundError();
  }
}

async function linuxSet(account: string, value: string): Promise<void> {
  await assertSecretToolAvailable();
  const { code, stderr } = await run(
    "secret-tool",
    ["store", "--label", `FlowFolio (${account})`, "service", SERVICE, "account", account],
    value,
  );
  if (code !== 0) throw new Error(`Failed to store secret via secret-tool: ${stderr}`);
}

async function linuxGet(account: string): Promise<string | null> {
  await assertSecretToolAvailable();
  const { code, stdout } = await run("secret-tool", ["lookup", "service", SERVICE, "account", account]);
  if (code !== 0) return null;
  const trimmed = stdout.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function linuxDelete(account: string): Promise<void> {
  await assertSecretToolAvailable();
  await run("secret-tool", ["clear", "service", SERVICE, "account", account]).catch(() => {});
}

// ===== Windows: DPAPI-encrypted blob in a JSON file =====

function windowsSecretsFilePath(): string {
  const appData = Deno.env.get("APPDATA") ?? ".";
  return `${appData}/FlowFolio/secrets.json`;
}

async function readWindowsSecretsFile(): Promise<Record<string, string>> {
  try {
    const text = await Deno.readTextFile(windowsSecretsFilePath());
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function writeWindowsSecretsFile(data: Record<string, string>): Promise<void> {
  const path = windowsSecretsFilePath();
  await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  await Deno.writeTextFile(path, JSON.stringify(data, null, 2));
}

// `value`/`encrypted` are passed via environment variables the caller sets immediately
// before invoking these, not interpolated into the command string, to avoid shell-argument
// injection. Neither function takes the secret as a parameter for that reason.

async function windowsEncrypt(): Promise<string> {
  const { code, stdout, stderr } = await run("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `$s = ConvertTo-SecureString -String $Env:FLOWFOLIO_SECRET_PLAINTEXT -AsPlainText -Force; ConvertFrom-SecureString -SecureString $s`,
  ]);
  if (code !== 0) throw new Error(`DPAPI encryption failed: ${stderr}`);
  return stdout.trim();
}

async function windowsDecrypt(): Promise<string> {
  const { code, stdout, stderr } = await run("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `$s = ConvertTo-SecureString -String $Env:FLOWFOLIO_SECRET_ENCRYPTED; ` +
      `$ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); ` +
      `[System.Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr)`,
  ]);
  if (code !== 0) throw new Error(`DPAPI decryption failed: ${stderr}`);
  return stdout.trim();
}

async function windowsSet(account: string, value: string): Promise<void> {
  Deno.env.set("FLOWFOLIO_SECRET_PLAINTEXT", value);
  try {
    const encrypted = await windowsEncrypt();
    const secrets = await readWindowsSecretsFile();
    secrets[account] = encrypted;
    await writeWindowsSecretsFile(secrets);
  } finally {
    Deno.env.delete("FLOWFOLIO_SECRET_PLAINTEXT");
  }
}

async function windowsGet(account: string): Promise<string | null> {
  const secrets = await readWindowsSecretsFile();
  const encrypted = secrets[account];
  if (!encrypted) return null;
  Deno.env.set("FLOWFOLIO_SECRET_ENCRYPTED", encrypted);
  try {
    return await windowsDecrypt();
  } finally {
    Deno.env.delete("FLOWFOLIO_SECRET_ENCRYPTED");
  }
}

async function windowsDelete(account: string): Promise<void> {
  const secrets = await readWindowsSecretsFile();
  delete secrets[account];
  await writeWindowsSecretsFile(secrets);
}

// ===== Public API, dispatched by platform =====

export async function setSecret(account: string, value: string): Promise<void> {
  switch (Deno.build.os) {
    case "darwin":
      return await macSet(account, value);
    case "linux":
      return await linuxSet(account, value);
    case "windows":
      return await windowsSet(account, value);
    default:
      throw new Error(`Unsupported platform: ${Deno.build.os}`);
  }
}

export async function getSecret(account: string): Promise<string | null> {
  switch (Deno.build.os) {
    case "darwin":
      return await macGet(account);
    case "linux":
      return await linuxGet(account);
    case "windows":
      return await windowsGet(account);
    default:
      throw new Error(`Unsupported platform: ${Deno.build.os}`);
  }
}

export async function deleteSecret(account: string): Promise<void> {
  switch (Deno.build.os) {
    case "darwin":
      return await macDelete(account);
    case "linux":
      return await linuxDelete(account);
    case "windows":
      return await windowsDelete(account);
    default:
      throw new Error(`Unsupported platform: ${Deno.build.os}`);
  }
}
