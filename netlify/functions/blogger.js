'use strict';

const { getSession } = require('./lib/session');

// The Apps Script bridge implements these actions. Keep this server-side
// allowlist authoritative; the browser never receives BRIDGE_KEY.
const ACTION_FIELDS = Object.freeze({
  listBlogs: [],
  getBlog: [],
  getBlogUserInfo: [],
  listPosts: ['maxResults', 'statuses', 'pageToken'],
  listAllPosts: ['maxResults', 'statuses', 'maxPages'],
  getPost: ['postId'],
  searchPosts: ['query'],
  getPostByPath: ['path'],
  createDraft: ['title', 'content', 'labels', 'customMetaData'],
  editPost: ['postId', 'title', 'content', 'labels'],
  publishPost: ['postId', 'publishDate', 'confirmPublish'],
  revertToDraft: ['postId', 'confirmRevert'],
  deletePost: ['postId', 'confirmDelete'],
  listPages: ['maxResults', 'statuses', 'pageToken'],
  listAllPages: ['maxResults', 'statuses', 'maxPages'],
  getPage: ['pageId'],
  createPageDraft: ['title', 'content'],
  editPage: ['pageId', 'title', 'content'],
  publishPage: ['pageId', 'confirmPublish'],
  revertPage: ['pageId', 'confirmRevert'],
  deletePage: ['pageId', 'confirmDelete'],
  listComments: ['postId', 'maxResults', 'pageToken'],
  getComment: ['postId', 'commentId'],
  deleteComment: ['postId', 'commentId', 'confirmDelete'],
  getPageViews: ['range']
});

const CONFIRMATION_RULES = Object.freeze({
  publishPost: 'confirmPublish',
  publishPage: 'confirmPublish',
  revertToDraft: 'confirmRevert',
  revertPage: 'confirmRevert',
  deletePost: 'confirmDelete',
  deletePage: 'confirmDelete',
  deleteComment: 'confirmDelete'
});

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

function safePayload(action, request) {
  const allowed = ACTION_FIELDS[action];
  if (!allowed) throw new Error('Unsupported Blogger action.');

  const payload = { action };
  for (const field of allowed) {
    if (Object.prototype.hasOwnProperty.call(request, field)) {
      payload[field] = request[field];
    }
  }

  const confirmation = CONFIRMATION_RULES[action];
  if (confirmation && payload[confirmation] !== true) {
    throw new Error('This operation requires explicit confirmation.');
  }

  if (action === 'listPosts' || action === 'listPages' ||
      action === 'listAllPosts' || action === 'listAllPages' ||
      action === 'listComments') {
    if (payload.maxResults !== undefined) {
      payload.maxResults = Math.min(Math.max(Number(payload.maxResults) || 20, 1), 100);
    }
  }
  if (action === 'listAllPosts' || action === 'listAllPages') {
    if (payload.maxPages !== undefined) {
      payload.maxPages = Math.min(Math.max(Number(payload.maxPages) || 1, 1), 10);
    }
  }
  if (payload.statuses !== undefined && !Array.isArray(payload.statuses)) {
    throw new Error('statuses must be an array.');
  }
  if (payload.labels !== undefined && !Array.isArray(payload.labels)) {
    throw new Error('labels must be an array.');
  }
  if (['createDraft', 'createPageDraft'].includes(action)) {
    if (typeof payload.title !== 'string' || !payload.title.trim() ||
        typeof payload.content !== 'string' || !payload.content.trim()) {
      throw new Error('A title and content are required.');
    }
  }
  return payload;
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
        typeof request.action !== 'string') {
      return response(400, { ok: false, error: 'Invalid Blogger request.' }, appOrigin);
    }

    const payload = safePayload(request.action, request);
    payload.bridgeKey = bridgeKey;

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
  } catch (error) {
    const message = String(error && error.message || error);
    const clientError = /Unsupported Blogger action|requires explicit confirmation|must be an array|title and content/i.test(message);
    return response(clientError ? 400 : 500, {
      ok: false,
      error: clientError ? message : 'Secure Blogger request failed.'
    }, appOrigin);
  }
};
