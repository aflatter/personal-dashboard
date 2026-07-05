// Secrets are injected as env vars by SecretSpec (`secretspec run -- …`), resolved
// from 1Password. All optional: a missing secret means the matching source is
// simply skipped (the collector keeps serving its last-known/seeded state).

export interface Secrets {
  fastmailTokenPersonal?: string;
  fastmailTokenWork?: string;
  togglApiToken?: string;
  togglWorkspaceId?: string;
}

export function loadSecrets(): Secrets {
  return {
    fastmailTokenPersonal: process.env.FASTMAIL_TOKEN_PERSONAL,
    fastmailTokenWork: process.env.FASTMAIL_TOKEN_WORK,
    togglApiToken: process.env.TOGGL_API_TOKEN,
    togglWorkspaceId: process.env.TOGGL_WORKSPACE_ID,
  };
}
