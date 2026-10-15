# Security

Marquio is a local application. The server binds to loopback and validates its session, origin and host; possession of its session URL grants access to that local project. Keep the URL private, stop unused servers and share portable projects deliberately. Portable exports omit local session tokens and command receipts. Client assets and uploaded fonts still travel with the backup.

The supported project store is a local filesystem with exclusive hard links and directory synchronization. Its revision protocol protects normal concurrent application writes; it is not a security boundary against another malicious process running as your user. Browser recovery is scoped to origin and port. Imported projects/assets are validated within bounded sizes and relative paths, but treat unfamiliar files with the same care as other design documents.

Report a vulnerability through GitHub's private vulnerability reporting for `higormanoel/brand-manual-pdf` when available. If unavailable, open an issue requesting a private reporting channel without exploit details, credentials, client files or session URLs. Include the affected commit/version, platform, reproduction conditions and impact in the private report. No public response-time or support-window guarantee is offered for this early release.
