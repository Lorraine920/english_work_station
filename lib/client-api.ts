export async function api<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(path, {
    method, headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined, cache: "no-store",
  });
  const data = await response.json() as T & { message?: string };
  if (!response.ok) throw new Error(data.message || "请求失败，请稍后重试。");
  return data as T;
}
export type ConnectionStatus = { notionConfigured: boolean; aiConfigured: boolean; pageId: string; model: string };
