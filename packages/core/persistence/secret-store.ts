export interface SecretStore {
  setSecret(account: string, value: string): Promise<void>;
  getSecret(account: string): Promise<string | null>;
  deleteSecret(account: string): Promise<void>;
}
