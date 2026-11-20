# Security policy

This repository is a read-only Yahoo Fantasy data downloader. Its OAuth credentials
and API exports are private local data, not files to publish.

## Credential protection

- Keep `CONSUMER_SECRET`, authorization codes, refresh tokens and any downloaded
  fantasy data out of Git, tickets, screenshots and logs.
- Prefer environment variables for client credentials. Store `AUTH_FILE` outside
  a shared directory if possible. On Unix, the application writes token/export
  JSON files with file mode `0600`.
- Avoid committing raw archives or Git working-directory backups. `.gitignore`
  is prevention, not retroactive removal.
- If a secret was committed or a repository was published with a sensitive file,
  revoke/rotate the affected credential, remove the file from all Git history
  as appropriate, and check existing forks/copies. Creating a clean new ZIP does
  **not** revoke an exposed credential.
- Obey Yahoo's application agreement, including any retention, usage, and
  redistribution restrictions that apply to you.

## Reporting

Do not paste any credentials or league data into a public issue. Report
security concerns to the repository owner privately.
