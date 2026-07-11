# Security notes

Portfolio data is stored as plain JSON in the current browser's `localStorage`. It is not encrypted and should not contain account credentials, bank identifiers, API keys, or other secrets.

The bank asset ships with a zero balance. Entering a balance stores it only in the current browser; the personal amount is not included in the published source code.

The application uses a meta Content Security Policy because GitHub Pages does not support repository-defined HTTP response headers. The `_headers` file provides stronger response headers for compatible static hosts such as Cloudflare Pages or Netlify; GitHub Pages ignores this file. In particular, `Permissions-Policy`, `X-Content-Type-Options`, and `Cross-Origin-Opener-Policy` require a host or proxy that supports response headers.

The scheduled `Update market data` GitHub Actions workflow retrieves TWSE and Google Apps Script responses, validates them, and commits reduced JSON snapshots under `data/`. The browser only reads these same-origin snapshots and never executes the remote responses. Prices represent the latest data exposed by TWSE, not guaranteed real-time quotes.

The workflow has repository write permission because it commits refreshed snapshots. Repository administrators can disable the schedule and run `node scripts/update-data.mjs` manually if automated commits are not desired.

To report a vulnerability, open a private security advisory in this repository rather than a public issue.
