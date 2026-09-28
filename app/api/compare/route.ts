import { getChatGPTUser } from "@/app/chatgpt-auth";
import { assertSafeInput, callJev, callOpus, LabError, validateInput } from "@/lib/lab";
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
    const input = validateInput(await request.json());
    assertSafeInput(input);
    const [jevKey, openrouterKey] = await Promise.all([
      loadKey(user.userId, "jev"),
      loadKey(user.userId, "openrouter"),
    ]);
    if (!jevKey || !openrouterKey) throw new LabError("Salve as duas chaves antes de comparar.");
    const run = async (fn: () => Promise<unknown>) => {
      try { return { ok: true, data: await fn() }; }
      catch (error) {
        return { ok: false, error: error instanceof LabError ? error.message : "Consulta indisponível." };
      }
    };
    const [jev, opus] = await Promise.all([
      run(() => callJev(input, jevKey)),
      run(() => callOpus(input, openrouterKey)),
    ]);
    return response({ jev, opus });
  } catch (error) {
    if (error instanceof LabError) return response({ error: error.message }, error.status);
    return response({ error: "Não foi possível iniciar a comparação." }, 503);
  }
}
