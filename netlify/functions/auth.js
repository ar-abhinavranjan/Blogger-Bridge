'use strict';

const {
  createSessionCookie,
  clearSessionCookie,
  getSession,
  getSessionSecret,
  isAllowedEmail
} = require('./lib/session');

function response(statusCode, body, origin, cookie) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Vary'] = 'Origin';
  }
  if (cookie) headers['Set-Cookie'] = cookie;
  return { statusCode, headers, body: JSON.stringify(body) };
}

function requestOrigin(event) {
  const headers = event.headers || {};
  return headers.origin || headers.Origin || '';
}

async function verifyGoogleCredential(credential, clientId) {
  if (typeof credential !== 'string' || !credential || credential.length > 12000) {
    return { ok: false, statusCode: 400, error: 'A valid Google sign-in credential is required.' };
  }

  const result = await fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential)
  );
  if (!result.ok) {
    return { ok: false, statusCode: 401, error: 'Google sign-in token is invalid or expired. Please sign in again.' };
  }

  const identity = await result.json();
  const now = Math.floor(Date.now() / 1000);
  const issuer = String(identity.iss || '');
  if (String(identity.aud || '') !== String(clientId) ||
      (issuer !== 'accounts.google.com' && issuer !== 'https://accounts.google.com') ||
      !identity.sub ||
      Number(identity.exp) <= now ||
      (identity.email_verified !== 'true' && identity.email_verified !== true)) {
    return { ok: false, statusCode: 401, error: 'Google could not verify this sign-in. Please try again.' };
  }

  if (!isAllowedEmail(identity.email)) {
    return { ok: false, statusCode: 403, error: 'This Google account is not authorized to access Blogger Bridge.' };
  }

  return {
    ok: true,
    identity: {
      sub: String(identity.sub),
      email: String(identity.email)
    }
  };
}

exports.handler = async (event) => {
  const appOrigin = process.env.APP_ORIGIN;
  const origin = requestOrigin(event);

  if (!appOrigin || !process.env.GOOGLE_CLIENT_ID || !getSessionSecret()) {
    return response(503, {
      ok: false,
      error: 'Authentication is not configured. Set APP_ORIGIN, GOOGLE_CLIENT_ID and a SESSION_SECRET of at least 32 characters in Netlify.'
    }, origin || undefined);
  }

  if ((origin && origin !== appOrigin) ||
      (event.httpMethod !== 'GET' && origin !== appOrigin)) {
    return response(403, { ok: false, error: 'Origin not allowed.' });
  }

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': appOrigin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Vary': 'Origin'
      },
      body: ''
    };
  }

  if (event.httpMethod === 'GET') {
    const session = getSession(event);
    const cookie = !session && event.headers &&
      (event.headers.cookie || event.headers.Cookie)
      ? clearSessionCookie()
      : undefined;
    return response(200, {
      ok: true,
      authenticated: Boolean(session),
      user: session ? { email: session.email } : null,
      googleClientId: process.env.GOOGLE_CLIENT_ID
    }, appOrigin, cookie);
  }

  if (event.httpMethod !== 'POST') {
    return response(405, { ok: false, error: 'Method not allowed.' }, appOrigin);
  }

  if (!event.body || event.body.length > 16000) {
    return response(400, { ok: false, error: 'Invalid or oversized request.' }, appOrigin);
  }

  let request;
  try {
    request = JSON.parse(event.body);
  } catch {
    return response(400, { ok: false, error: 'Invalid JSON request.' }, appOrigin);
  }

  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return response(400, { ok: false, error: 'Invalid request.' }, appOrigin);
  }

  if (request.action === 'logout') {
    return response(200, { ok: true, authenticated: false }, appOrigin, clearSessionCookie());
  }

  if (request.action !== 'login') {
    return response(400, { ok: false, error: 'Unsupported authentication action.' }, appOrigin);
  }

  try {
    const checked = await verifyGoogleCredential(request.credential, process.env.GOOGLE_CLIENT_ID);
    if (!checked.ok) {
      return response(checked.statusCode, { ok: false, error: checked.error }, appOrigin);
    }

    const cookie = createSessionCookie(checked.identity.email, checked.identity.sub);
    return response(200, {
      ok: true,
      authenticated: true,
      user: { email: checked.identity.email }
    }, appOrigin, cookie);
  } catch {
    return response(500, { ok: false, error: 'Secure sign-in could not be completed. Check the authentication configuration.' }, appOrigin);
  }
};
