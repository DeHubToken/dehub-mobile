import { apiClient } from '../libs/api.client';

/** Two-step sign-in settings (riftn-backend src/auth/two-factor.controller). */
export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt: string | null;
  backupCodesLeft: number;
}

export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
}

export const TwoFactorService = {
  status: () => apiClient.get<TwoFactorStatus>('/auth/2fa/status'),
  setup: () => apiClient.post<TwoFactorSetup>('/auth/2fa/setup', {}),
  enable: (code: string) => apiClient.post<{ backupCodes: string[] }>('/auth/2fa/enable', { code }, { quiet: true }),
  disable: (code: string) =>
    apiClient.post<{ ok: true }>('/auth/2fa/disable', code.length === 6 ? { code } : { backupCode: code }, { quiet: true }),
  regenerateBackupCodes: (code: string) =>
    apiClient.post<{ backupCodes: string[] }>('/auth/2fa/backup-codes', { code }, { quiet: true }),
};
