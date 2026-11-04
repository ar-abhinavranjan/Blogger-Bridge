# AR. Blogger Bridge

A private Blogger management console with Google-first sign-in, a server-verified session, and a read-only Blogger API adapter.

## Authentication flow

1. The site opens on a dedicated Google sign-in screen. The dashboard remains hidden.
2. Google Identity Services returns an ID token to the browser.
3. The Netlify authentication function verifies the token with Google, checks its audience, issuer, expiry, verified-email status, and the configured account allowlist.
4. The server issues a signed, seven-day session cookie named `bb_session`.
5. The cookie is `HttpOnly; Secure; SameSite=Lax; Path=/`. JavaScript cannot read it.
6. Subsequent visits check the session before showing the dashboard. Expired or invalid sessions return to sign-in.
7. Logout revokes the browser session by clearing the cookie.

The Google credential is exchanged once at sign-in. Blogger requests use the session cookie and do not send the Google ID token on every request.

## Netlify deployment configuration

Set these environment variables in the Netlify site that hosts this application:

| Variable | Required value |
|---|---|
| `APP_ORIGIN` | Exact HTTPS origin of the deployed site, e.g. `https://your-real-hostname.example` (no trailing slash or path) |
| `GOOGLE_CLIENT_ID` | OAuth 2.0 **Web application** client ID from Google Cloud |
| `SESSION_SECRET` | Random secret with at least 32 UTF-8 bytes; generate a new unique value and keep it private |
| `APPS_SCRIPT_URL` | Existing deployed Google Apps Script web-app URL |
| `BRIDGE_KEY` | Same secret as the Apps Script `BRIDGE_KEY` script property |

Do not commit any of these values to GitHub. After setting or changing variables, trigger a fresh Netlify deploy.

### Google OAuth settings

In Google Cloud Console, configure the OAuth client as a **Web application** and add the exact deployed hostname under Authorized JavaScript origins. The Google sign-in consent screen must be configured for the intended account. This application currently retains its existing single-account allowlist in `netlify/functions/lib/session.js`; change that constant deliberately if the authorized account is changed.

### Generate a session secret

Generate a high-entropy random value locally, for example with Node.js:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Copy the output directly into Netlify's `SESSION_SECRET` environment variable. Never send it in chat, source control, or a client-side setting.

## Security model

- The browser never receives `BRIDGE_KEY`, OAuth client secrets, Blogger access tokens, or refresh tokens.
- Session cookies are signed server-side, expire after seven days, and are checked on every Blogger API request.
- The Blogger function enforces the configured same-origin policy and accepts an explicit allowlist of Blogger actions for blog details, paginated posts and pages, draft creation, editing, publishing, reverting, deletion, comments, and page-view statistics.
- Publishing, reverting, and deletion require explicit confirmation flags in the server request and a browser confirmation step.\n- The terminal is a controlled command interface, not an operating-system shell.\n- Comments are loaded per post because the Blogger API comment-list endpoint requires a post ID.\n- Analytics uses the Blogger pageviews endpoint and may return no data when the Blogger API has no statistics available.
- Destructive operations must require explicit confirmation if introduced in a future release.
- Use HTTPS in production; the Secure cookie will not be sent over plain HTTP.

## Deployment

The repository includes `netlify.toml` and Netlify Functions under `netlify/functions`. Deploy this repository through the Netlify site configured with the environment variables above. Do not use a static-only GitHub Pages deployment for this authentication flow because it requires the Netlify Functions backend.

## Existing Blogger integration

The Google Apps Script backend remains separately maintained. The Netlify adapter calls it server-side and never exposes the shared bridge key to the browser.

## Product identity

**AR. Blogger Bridge** — Blogger management console.
