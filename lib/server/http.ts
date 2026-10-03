export class ApiError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const privateHeaders = { "cache-control": "private, no-store" };
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiError("请从网站内发起请求。", 403);
  }
}
export function failure(error: unknown) {
  if (error instanceof ApiError) return Response.json({ message: error.message }, { status: error.status, headers: privateHeaders });
  return Response.json({ message: "服务暂时不可用，请稍后重试。" }, { status: 502, headers: privateHeaders });
}
export async function readJson(request: Request) {
  const text = await request.text();
  if (text.length > 180000) throw new ApiError("提交内容过长。", 413);
  try { return JSON.parse(text) as unknown; } catch { throw new ApiError("请求内容不是有效的 JSON。"); }
}
