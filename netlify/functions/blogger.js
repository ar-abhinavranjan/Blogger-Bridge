const ALLOWED_EMAIL = "proabhinavranjan@gmail.com";
const READ_ACTIONS = new Set(["getBlog", "listPosts", "listPages"]);

function response(statusCode, body, origin) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(origin ? {
        "Access-Control-Allow-Origin": origin,
        "Vary": "Origin"
      } : {})
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  const appOrigin = process.env.APP_ORIGIN;
  const origin = event.headers.origin || event.headers.Origin || "";

  if (!appOrigin || (origin && origin !== appOrigin) || (!origin && event.httpMethod !== "GET")) {
    return response(403, { ok: false, error: "Origin not allowed." });
  }

  if (event.httpMethod === "GET") {
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    if (!googleClientId) {
      return response(503, { ok: false, error: "Google sign-in is not configured." }, appOrigin);
    }
    return response(200, { ok: true, googleClientId }, appOrigin);
  }

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": appOrigin,
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Vary": "Origin"
      },
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return response(405, { ok: false, error: "Method not allowed." }, appOrigin);
  }

  const appsScriptUrl = process.env.APPS_SCRIPT_URL;
  const bridgeKey = process.env.BRIDGE_KEY;
  const googleClientId = process.env.GOOGLE_CLIENT_ID;

  if (!appsScriptUrl || !bridgeKey || !googleClientId) {
    return response(503, { ok: false, error: "Backend environment is not configured." }, appOrigin);
  }

  try {
    const authorization = event.headers.authorization || event.headers.Authorization || "";
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return response(401, { ok: false, error: "Google sign-in is required." }, appOrigin);
    }

    const tokenInfoResponse = await fetch(
      "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(match[1])
    );
    if (!tokenInfoResponse.ok) {
      return response(401, { ok: false, error: "Google identity token is invalid or expired." }, appOrigin);
    }

    const identity = await tokenInfoResponse.json();
    if (
      identity.aud !== googleClientId ||
      identity.email !== ALLOWED_EMAIL ||
      identity.email_verified !== "true"
    ) {
      return response(403, { ok: false, error: "This Google account is not authorized." }, appOrigin);
    }

    if (!event.body || event.body.length > 20000) {
      return response(400, { ok: false, error: "Invalid or oversized request." }, appOrigin);
    }

    const request = JSON.parse(event.body);
    if (!request || typeof request !== "object" || Array.isArray(request) ||
        !READ_ACTIONS.has(request.action)) {
      return response(400, { ok: false, error: "Unsupported action. Only read operations are enabled." }, appOrigin);
    }

    const payload = { action: request.action, bridgeKey };
    if (request.action === "listPosts" || request.action === "listPages") {
      if (request.maxResults !== undefined) payload.maxResults = Math.min(Math.max(Number(request.maxResults) || 20, 1), 100);
      if (Array.isArray(request.statuses)) payload.statuses = request.statuses;
      if (typeof request.pageToken === "string") payload.pageToken = request.pageToken;
    }

    const upstream = await fetch(appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow"
    });

    const raw = await upstream.text();
    let data;
    try { data = JSON.parse(raw); }
    catch { return response(502, { ok: false, error: "Apps Script returned an unreadable response." }, appOrigin); }

    return response(upstream.ok && data.ok ? 200 : 502, data, appOrigin);
  } catch (error) {
    return response(500, { ok: false, error: "Secure Blogger request failed." }, appOrigin);
  }
};
