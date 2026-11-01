# AR. Blogger Bridge

A secure Blogger management console with a CMD-inspired interface and visual dashboard.

## Project status

**Frontend foundation — in progress.** This repository contains the static dashboard and GitHub Pages deployment workflow. It is not yet connected to the Blogger account.

## Security model

- Never place the Blogger Bridge key, Google OAuth client secret, access token, or refresh token in frontend code.
- The browser must call an authenticated backend; it must not call the legacy bridge endpoint with a shared secret.
- Publishing, deleting, and other destructive operations must require explicit confirmation.
- Only allowlisted Blogger actions should be exposed. This is not an operating-system shell.

## Deployment

The site is designed for GitHub Pages using GitHub Actions. In repository Settings → Pages, select **GitHub Actions** as the build and deployment source if it is not already enabled.

## Backend integration

The existing Google Apps Script backend is maintained separately. Before enabling live operations, add a secure user-authenticated server-side adapter. Do not expose the legacy `BRIDGE_KEY` in this repository.

## Product identity

**AR. Blogger Bridge** — Blogger management console.
