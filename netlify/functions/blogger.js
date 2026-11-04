'use strict';

const { getSession } = require('./lib/session');
const READ_ACTIONS = new Set(['getBlog', 'listPosts', 'listPages']);

function response(statusCode, body, origin) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Vary'] = 'Origin';
  }
  return { statusCode, headers, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  const appOrigin = process.env.APP_ORIGIN;
  const headers = event.headers || {};
  const origin = headers.origin || headers.Origin || '';

  if (!appOrigin || (origin && origin !== appOrigin) ||
      (event.httpMethod !== 'OPTIONS' && origin !== appOrigin)) {
    return response(403, { ok: false, error: 'Origin not allowed.' });
  }

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': appOrigin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Vary': 'Origin'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return response(405, { ok: false, error: 'Method not allowed.' }, appOrigin);
  }

  const session = getSession(event);
  if (!session) {
    return response(401, { ok: false, error: 'Your session is missing or expired. Sign in again.' }, appOrigin);
  }

  const appsScriptUrl = process.env.APPS_SCRIPT_URL;
  const bridgeKey = process.env.BRIDGE_KEY;
  if (!appsScriptUrl || !bridgeKey) {
    return response(503, { ok: false, error: 'Blogger backend environment is not configured.' }, appOrigin);
  }

  if (!event.body || event.body.length > 20000) {
    return response(400, { ok: false, error: 'Invalid or oversized request.' }, appOrigin);
  }

  try {
    const request = JSON.parse(event.body);
    if (!request || typeof request !== 'object' || Array.isArray(request) ||
        !READ_ACTIONS.has(request.action)) {
      return response(400, { ok: false, error: 'Unsupported action. Only read operations are enabled.' }, appOrigin);
    }

    const payload = { action: request.action, bridgeKey };
    if (request.action === 'listPosts' || request.action === 'listPages') {
      if (request.maxResults !== undefined) {
        payload.maxResults = Math.min(Math.max(Number(request.maxResults) || 20, 1), 100);
      }
      if (Array.isArray(request.statuses)) payload.statuses = request.statuses;
      if (typeof request.pageToken === 'string') payload.pageToken = request.pageToken;
    }

    const upstream = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });

    const raw = await upstream.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return response(502, { ok: false, error: 'Apps Script returned an unreadable response.' }, appOrigin);
    }

    if (data && data.ok === false && String(data.error || '') === 'Unauthorized.') {
      return response(502, {
        ok: false,
        error: 'Apps Script rejected BRIDGE_KEY. Check that Netlify BRIDGE_KEY exactly matches the Apps Script Script Property. Do not share the secret.'
      }, appOrigin);
    }

    return response(upstream.ok && data.ok ? 200 : 502, data, appOrigin);
  } catch {
    return response(500, { ok: false, error: 'Secure Blogger request failed.' }, appOrigin);
  }
};
