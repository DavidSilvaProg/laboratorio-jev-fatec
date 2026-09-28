export type ChoiceQuestion = { type: "choice"; instructions: string; criteria: Record<string, string> };
export type NoulQuestion = { type: "noul"; instructions: string; criteria: { true: string; false: string } };
export type ScoreQuestion = { type: "score"; instructions: string; criteria: string[] };
export type Questions = { equipe: ChoiceQuestion; reembolso: NoulQuestion; urgencia: ScoreQuestion };
export type LabInput = { state: string; questions: Questions };

export class LabError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function stringValue(value: unknown, name: string, limit: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > limit) {
    throw new LabError(`${name} deve conter de 1 a ${limit} caracteres.`);
  }
  return value.trim();
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LabError("Dados inválidos.");
  return value as Record<string, unknown>;
}

export function validateInput(value: unknown, kind?: "choice" | "noul" | "score"): LabInput {
  const data = objectValue(value);
  const state = stringValue(data.state, "O chamado", 4000);
  const raw = objectValue(data.questions);
  const choiceRaw = objectValue(raw.equipe);
  const noulRaw = objectValue(raw.reembolso);
  const scoreRaw = objectValue(raw.urgencia);
  if (choiceRaw.type !== "choice" || noulRaw.type !== "noul" || scoreRaw.type !== "score") {
    throw new LabError("Os três tipos de pergunta são obrigatórios.");
  }
  const choiceCriteriaRaw = objectValue(choiceRaw.criteria);
  const entries = Object.entries(choiceCriteriaRaw);
  if (entries.length < 2 || entries.length > 8) throw new LabError("Choice precisa de 2 a 8 opções.");
  const choiceCriteria: Record<string, string> = {};
  for (const [id, description] of entries) {
    if (!/^[a-z][a-z0-9_]{0,29}$/.test(id)) throw new LabError("Identificador Choice inválido.");
    choiceCriteria[id] = stringValue(description, `Opção ${id}`, 250);
  }
  const noulCriteriaRaw = objectValue(noulRaw.criteria);
  if (Object.keys(noulCriteriaRaw).sort().join(",") !== "false,true") throw new LabError("Noul precisa dos critérios true e false.");
  const scoreCriteriaRaw = scoreRaw.criteria;
  if (!Array.isArray(scoreCriteriaRaw) || scoreCriteriaRaw.length < 2 || scoreCriteriaRaw.length > 8) {
    throw new LabError("Score precisa de 2 a 8 níveis.");
  }
  const questions: Questions = {
    equipe: { type: "choice", instructions: stringValue(choiceRaw.instructions, "Pergunta Choice", 500), criteria: choiceCriteria },
    reembolso: {
      type: "noul", instructions: stringValue(noulRaw.instructions, "Pergunta Noul", 500),
      criteria: {
        true: stringValue(noulCriteriaRaw.true, "Critério true", 250),
        false: stringValue(noulCriteriaRaw.false, "Critério false", 250),
      },
    },
    urgencia: {
      type: "score", instructions: stringValue(scoreRaw.instructions, "Pergunta Score", 500),
      criteria: scoreCriteriaRaw.map((item) => stringValue(item, "Nível de Score", 250)),
    },
  };
  if (kind && !["choice", "noul", "score"].includes(kind)) throw new LabError("Tipo inválido.");
  return { state, questions };
}

async function providerJson(url: string, key: string, payload: unknown, provider: string, timeout: number) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(provider === "OpenRouter" ? { "HTTP-Referer": "https://laboratorio-jev-topicos-fatec.davidsilvaprog.chatgpt.site", "X-Title": "Laboratório JEV" } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    throw new LabError(`Falha de conexão com ${provider}.`, 502);
  }
  if (!response.ok) throw new LabError(`${provider} retornou HTTP ${response.status}.`, 502);
  try { return await response.json() as Record<string, unknown>; }
  catch { throw new LabError(`${provider} não retornou JSON válido.`, 502); }
}

export async function callJev(input: LabInput, key: string, kind?: "choice" | "noul" | "score") {
  const questions = kind
    ? Object.fromEntries(Object.entries(input.questions).filter(([, question]) => question.type === kind))
    : input.questions;
  const started = performance.now();
  const body = await providerJson("https://api.typesafe.ai/v1/systemone", key,
    { model: "jev-latest", state: input.state, questions }, "JEV", 60_000);
  const answers = body.answers as Record<string, Record<string, unknown>> | undefined;
  if (!answers || Object.entries(questions).some(([name, question]) =>
    !answers[name] || answers[name].type !== question.type)) {
    throw new LabError("JEV retornou respostas incompletas.", 502);
  }
  return { model: body.model ?? "jev-latest", answers, usage: body.usage ?? null, elapsed_ms: Math.round(performance.now() - started) };
}

export async function callLuna(input: LabInput, key: string) {
  const schema = {
    type: "object",
    properties: {
      choice: { type: "string", enum: Object.keys(input.questions.equipe.criteria) },
      noul: { type: "boolean" },
      score: { type: "integer", enum: input.questions.urgencia.criteria.map((_, index) => index) },
      reason: { type: "string" },
    },
    required: ["choice", "noul", "score", "reason"],
    additionalProperties: false,
  };
  const payload = {
    model: "openai/gpt-6-luna",
    messages: [
      { role: "system", content: "Você classifica chamados. Use somente o estado e as rubricas recebidas. Responda exclusivamente com o JSON solicitado, em português, sem inventar fatos." },
      { role: "user", content: JSON.stringify({ estado: input.state, perguntas: input.questions, formato_da_resposta: schema }) },
    ],
    response_format: { type: "json_schema", json_schema: { name: "triagem_chamado", strict: true, schema } },
    provider: { require_parameters: true },
    max_tokens: 1200,
  };
  const started = performance.now();
  const body = await providerJson("https://openrouter.ai/api/v1/chat/completions", key, payload, "OpenRouter", 90_000);
  try {
    const choices = body.choices as Array<{ message: { content: string } }>;
    const answer = JSON.parse(choices[0].message.content) as Record<string, unknown>;
    if (!Object.hasOwn(input.questions.equipe.criteria, answer.choice as string) ||
      typeof answer.noul !== "boolean" ||
      !Number.isInteger(answer.score) ||
      (answer.score as number) < 0 || (answer.score as number) >= input.questions.urgencia.criteria.length ||
      typeof answer.reason !== "string") throw new Error("Formato inválido");
    return { model: body.model ?? "openai/gpt-6-luna", answer, usage: body.usage ?? null, elapsed_ms: Math.round(performance.now() - started) };
  } catch {
    throw new LabError("GPT-6 Luna não seguiu o formato esperado. Rode a comparação novamente.", 502);
  }
}

