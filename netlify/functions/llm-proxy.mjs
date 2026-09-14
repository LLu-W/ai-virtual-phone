// netlify/functions/llm-proxy.mjs
// 转发 /api/llm-proxy/* → https://api.kimi.com/coding/v1/*
// 不存 key，原样透传 Authorization 头
// k3 系列模型只允许 temperature=1 且 top_p=0.95，在此统一强制改写

const TARGET = "https://api.kimi.com/coding/v1";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api\/llm-proxy/, "") || "/";
    const targetUrl = TARGET + path + url.search;

    const headers = {};
    for (const [k, v] of req.headers.entries()) {
      const lk = k.toLowerCase();
      if (["host", "connection", "content-length", "accept-encoding"].includes(lk)) continue;
      headers[k] = v;
    }

    const hasBody = !["GET", "HEAD"].includes(req.method);
    let body;
    let sentJson = null;
    if (hasBody) {
      const rawBody = await req.text();
      body = rawBody;
      if (req.method === "POST" && url.pathname.endsWith("/chat/completions")) {
        try {
          const json = JSON.parse(rawBody);
          json.temperature = 1;   // k3 只接受 1
          json.top_p = 0.95;      // k3 只接受 0.95
          body = JSON.stringify(json);
          headers["Content-Type"] = "application/json";
          sentJson = json;
        } catch {
          body = rawBody;
        }
      }
    }

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });

    // 记录失败请求：状态码 + 报错内容 + 我们发送的参数（不含 key 和消息内容）
    if (!upstream.ok) {
      const errText = await upstream.text();
      const paramSummary = sentJson
        ? JSON.stringify(Object.keys(sentJson).filter(k => k !== "messages"))
        : "(non-JSON)";
      console.log(`[llm-proxy] UPSTREAM ${upstream.status} ${url.pathname}`);
      console.log(`[llm-proxy] error: ${errText.slice(0, 500)}`);
      console.log(`[llm-proxy] sent params: ${paramSummary}`);
      return new Response(errText, {
        status: upstream.status,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const respHeaders = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) respHeaders.set(k, v);
    respHeaders.delete("content-encoding");
    respHeaders.delete("content-length");

    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });
  } catch (err) {
    console.log(`[llm-proxy] EXCEPTION: ${String(err)}`);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
};

export const config = {
  path: "/api/llm-proxy/*",
};
