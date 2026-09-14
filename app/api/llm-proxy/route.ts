import { NextRequest, NextResponse } from "next/server";

const TARGET = "https://api.kimi.com/coding/v1";

async function handler(req: NextRequest) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/llm-proxy/, "") + url.search;
  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!["host", "content-length", "connection"].includes(k.toLowerCase()))
      headers.set(k, v);
  });
  const resp = await fetch(TARGET + path, {
    method: req.method,
    headers,
    body: req.method === "GET" ? undefined : req.body,
    // @ts-expect-error duplex needed for streaming body
    duplex: "half",
  });
  return new NextResponse(resp.body, {
    status: resp.status,
    headers: { "content-type": resp.headers.get("content-type") ?? "application/json" },
  });
}

export const GET = handler;
export const POST = handler;
