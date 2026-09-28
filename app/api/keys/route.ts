import { getChatGPTUser } from "@/app/chatgpt-auth";
import { deleteKey, keyStatus, saveKey, type Provider } from "@/lib/secure-keys";

export const runtime = "edge";

function response(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function validProvider(value: unknown): value is Provider {
  return value === "jev" || value === "openrouter";
}

function sameSiteMutation(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  return request.headers.get("x-jev-lab") === "1" && fetchSite !== "cross-site";
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return response({ error: "Entre com sua conta para usar o laboratório." }, 401);
  try {
    return response(await keyStatus(user.userId));
  } catch {
    return response({ error: "Não foi possível consultar as chaves salvas." }, 503);
  }
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return response({ error: "Entre com sua conta para usar o laboratório." }, 401);
  if (!sameSiteMutation(request)) return response({ error: "Requisição inválida." }, 403);
  let body: unknown;
  try { body = await request.json(); } catch { return response({ error: "JSON inválido." }, 400); }
  if (!body || typeof body !== "object") return response({ error: "Dados inválidos." }, 400);
  const { provider, key } = body as { provider?: unknown; key?: unknown };
  if (!validProvider(provider) || typeof key !== "string" || !key.trim() || key.length > 500) {
    return response({ error: "Informe o provedor e uma chave válida." }, 400);
  }
  try {
    await saveKey(user.userId, provider, key.trim());
    return response({ saved: true, provider });
  } catch {
    return response({ error: "Não foi possível salvar a chave. Tente novamente." }, 503);
  }
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return response({ error: "Entre com sua conta para usar o laboratório." }, 401);
  if (!sameSiteMutation(request)) return response({ error: "Requisição inválida." }, 403);
  let body: unknown;
  try { body = await request.json(); } catch { return response({ error: "JSON inválido." }, 400); }
  const provider = body && typeof body === "object" ? (body as { provider?: unknown }).provider : null;
  if (!validProvider(provider)) return response({ error: "Provedor inválido." }, 400);
  try {
    await deleteKey(user.userId, provider);
    return response({ deleted: true, provider });
  } catch {
    return response({ error: "Não foi possível remover a chave." }, 503);
  }
}

