'use strict';

const crypto = require('node:crypto');

const SESSION_COOKIE = 'bb_session';
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const ALLOWED_EMAIL = 'proabhinavranjanparoo@gmail.com';

function normalizeEmail(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u0020\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, '')
    .toLowerCase();
}

function isAllowedEmail(value) {
  return normalizeEmail(value) === normalizeEmail(ALLOWED_EMAIL);
}

function getCookieHeader(event) {
  const headers = (event && event.headers) || {};
  return headers.cookie || headers.Cookie || '';
}

function getCookie(event, name) {
  const item = getCookieHeader(event)
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(name + '='));
  return item ? item.slice(name.length + 1) : '';
}

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET || '';
  if (Buffer.byteLength(secret, 'utf8') < 32) return '';
  return secret;
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function createSessionCookie(email, subject) {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error('SESSION_SECRET must be configured with at least 32 characters.');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: String(subject || ''),
    email: normalizeEmail(email),
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS
  };
  if (!payload.sub || !isAllowedEmail(payload.email)) {
    throw new Error('Cannot create a session for this account.');
  }

  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const token = encoded + '.' + sign(encoded, secret);
  return SESSION_COOKIE + '=' + token +
    '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + SESSION_MAX_AGE_SECONDS;
}

function clearSessionCookie() {
  return SESSION_COOKIE +
    '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

function getSession(event) {
  const secret = getSessionSecret();
  if (!secret) return null;

  const token = getCookie(event, SESSION_COOKIE);
  if (!token || token.length > 4096) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encoded, suppliedSignature] = parts;
  const expectedSignature = sign(encoded, secret);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length ||
      !crypto.timingSafeEqual(supplied, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (!payload || typeof payload !== 'object' ||
        typeof payload.sub !== 'string' || !payload.sub ||
        typeof payload.email !== 'string' || !isAllowedEmail(payload.email) ||
        !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) ||
        payload.iat > now + 60 || payload.exp <= now ||
        payload.exp <= payload.iat ||
        payload.exp - payload.iat > SESSION_MAX_AGE_SECONDS) {
      return null;
    }
    return { sub: payload.sub, email: normalizeEmail(payload.email), exp: payload.exp };
  } catch {
    return null;
  }
}

module.exports = {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  ALLOWED_EMAIL,
  normalizeEmail,
  isAllowedEmail,
  createSessionCookie,
  clearSessionCookie,
  getSession,
  getSessionSecret
};
