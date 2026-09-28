import { getChatGPTUser } from "@/app/chatgpt-auth";
import { assertSafeInput, callJev, LabError, validateInput } from "@/lib/lab";
import { loadKey } from "@/lib/secure-keys";

export const runtime = "edge";

function response(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return response({ error: "Entre com sua conta para usar o laboratório." }, 401);
  if (request.headers.get("x-jev-lab") !== "1" || request.headers.get("sec-fetch-site") === "cross-site") {
    return response({ error: "Requisição inválida." }, 403);
  }
  try {
    const raw = await request.json() as { kind?: unknown };
    const kind = raw?.kind;
    if (kind !== "choice" && kind !== "noul" && kind !== "score") throw new LabError("Escolha Choice, Noul ou Score.");
    const input = validateInput(raw, kind);
    assertSafeInput(input);
    const key = await loadKey(user.userId, "jev");
    if (!key) throw new LabError("Salve sua chave JEV antes de executar.");
    return response(await callJev(input, key, kind));
  } catch (error) {
    if (error instanceof LabError) return response({ error: error.message }, error.status);
    return response({ error: "Não foi possível consultar o JEV." }, 503);
  }
}
