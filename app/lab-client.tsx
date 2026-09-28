"use client";

import { useEffect, useState } from "react";
import type { LabInput, Questions } from "@/lib/lab";

const presets = {
  cobranca: "Olá, apareceram duas cobranças de R$ 49 na minha fatura de setembro, mas tenho apenas uma assinatura. Preciso que devolvam o valor cobrado a mais ainda hoje, pois minha fatura vence amanhã.",
  erro: "Bom dia. Desde ontem não consigo entrar no sistema: depois do login aparece o erro 503. Tenho uma apresentação hoje às 15h e preciso acessar meus arquivos antes disso.",
  cancelamento: "Gostaria de saber como funciona o cancelamento da assinatura no próximo mês e se há algum plano mais barato. Ainda não decidi cancelar.",
};
type Preset = keyof typeof presets;
type Provider = "jev" | "openrouter";
type Kind = "choice" | "noul" | "score";
type JevResult = { model: string; answers: Record<string, Record<string, unknown>>; usage: Record<string, number> | null; cost_usd: number | null; cost_kind: "estimate"; elapsed_ms: number };
type OpusResult = { model: string; answer: { choice: string; noul: boolean; score: number; reason: string }; usage: Record<string, number> | null; cost_usd: number | null; cost_kind: "reported"; elapsed_ms: number };
type Compared<T> = { ok: true; data: T } | { ok: false; error: string };
type Comparison = { jev: Compared<JevResult>; opus: Compared<OpusResult> };

const projectIdeas = [
  { number: "01", area: "ATENDIMENTO", title: "Triagem de chamados", type: "Choice", accent: "coral", question: "Qual equipe deve receber esta solicitação?", input: "Mensagem enviada pelo cliente", result: "Fila correta para revisão da equipe" },
  { number: "02", area: "SAÚDE", title: "Organização de relatos", type: "Score", accent: "blue", question: "Qual o grau de urgência relatado?", input: "Descrição inicial do atendimento", result: "Prioridade sugerida para avaliação humana" },
  { number: "03", area: "EDUCAÇÃO", title: "Acompanhamento de alunos", type: "Noul", accent: "yellow", question: "O texto indica dificuldade com o conteúdo?", input: "Dúvida escrita pelo estudante", result: "Sinal para o professor oferecer apoio" },
  { number: "04", area: "FINANÇAS", title: "Conferência de despesas", type: "Choice", accent: "blue", question: "A qual categoria pertence esta despesa?", input: "Descrição de uma transação", result: "Categoria para validar antes do registro" },
  { number: "05", area: "COMÉRCIO", title: "Leitura de avaliações", type: "Score", accent: "coral", question: "Quão grave é o problema descrito?", input: "Avaliação de produto ou loja", result: "Ordem de resposta da equipe" },
  { number: "06", area: "SEGURANÇA", title: "Relatos de incidentes", type: "Noul", accent: "yellow", question: "O relato menciona dados pessoais expostos?", input: "Descrição de um incidente", result: "Alerta para análise especializada" },
  { number: "07", area: "LOGÍSTICA", title: "Ocorrências de entrega", type: "Choice", accent: "yellow", question: "Qual problema principal ocorreu?", input: "Mensagem sobre uma entrega", result: "Encaminhamento para atraso, avaria ou endereço" },
  { number: "08", area: "RECURSOS HUMANOS", title: "Pesquisa de clima", type: "Score", accent: "blue", question: "Qual a intensidade da insatisfação expressa?", input: "Comentário aberto e voluntário", result: "Tendência agregada para a equipe investigar" },
  { number: "09", area: "SERVIÇO PÚBLICO", title: "Pedidos do cidadão", type: "Choice", accent: "coral", question: "Qual setor deve analisar este pedido?", input: "Solicitação recebida no portal", result: "Encaminhamento com registro do critério" },
];

async function api<T = Record<string, unknown>>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method, cache: "no-store",
    headers: { "Content-Type": "application/json", "X-JEV-LAB": "1" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({ error: "Resposta inválida do servidor." })) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Não foi possível concluir a operação.");
  return data as T;
}
function percentage(value: unknown) {
  return typeof value === "number" ? new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value * 100) + "%" : "—";
}
function decimal(value: unknown) {
  return typeof value === "number" ? new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) : "—";
}
function usageText(value: Record<string, number> | null) {
  if (!value) return "uso não informado";
  const input = value.input_tokens ?? value.prompt_tokens;
  const output = value.output_tokens ?? value.completion_tokens;
  return input === undefined ? "uso não informado" : `${input} tokens de entrada · ${output ?? "—"} de saída`;
}
function costText(value: number | null) {
  return value === null ? "Não informado" : new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 6, maximumFractionDigits: 8,
  }).format(value);
}
function JsonAnswer({ result, kind, levels }: { result: JevResult; kind: Kind; levels: string[] }) {
  const name = kind === "choice" ? "equipe" : kind === "noul" ? "reembolso" : "urgencia";
  const answer = result.answers[name] || {};
  const value = kind === "choice" ? String(answer.choice ?? "—") : kind === "noul"
    ? percentage(answer.noul) + " de chance de sim"
    : decimal(answer.score) + " / " + (levels.length - 1);
  const probabilities = answer.probabilities && typeof answer.probabilities === "object"
    ? Object.entries(answer.probabilities as Record<string, number>).map(([id, p]) => `${id}: ${percentage(p)}`).join(" · ") : null;
  return <div className="answer"><strong>{value}</strong>{kind === "score" && <p>Escala: {levels.map((level, i) => `${i} ${level}`).join(" · ")}</p>}{probabilities && <p>Probabilidades: {probabilities}</p>}{typeof answer.confidence === "number" && <p>Confiança informada: {percentage(answer.confidence)}</p>}<small>{result.model} · {result.elapsed_ms} ms · {usageText(result.usage)}</small></div>;
}

export default function LabClient({ displayName }: { displayName: string }) {
  const [preset, setPreset] = useState<Preset>("cobranca");
  const [state, setState] = useState(presets.cobranca);
  const [choiceQuestion, setChoiceQuestion] = useState("Qual equipe deve atender este chamado? Use a causa principal descrita no texto.");
  const [choiceCriteria, setChoiceCriteria] = useState("financeiro | Cobranças, pagamentos, faturas ou reembolsos\ntecnico | Erros, falhas, login ou problemas no funcionamento\ncomercial | Planos, preços ou contratação\ngeral | Dúvidas que não cabem nas outras equipes");
  const [noulQuestion, setNoulQuestion] = useState("O cliente pede explicitamente a devolução de um valor pago?");
  const [noulTrue, setNoulTrue] = useState("Pede estorno, reembolso ou devolução do dinheiro.");
  const [noulFalse, setNoulFalse] = useState("Relata um problema, mas não pede devolução do valor.");
  const [scoreQuestion, setScoreQuestion] = useState("Qual a urgência de atendimento segundo o texto do cliente?");
  const [scoreCriteria, setScoreCriteria] = useState("Pode esperar sem prazo mencionado\nPrecisa de resposta nesta semana\nPrecisa de resposta hoje\nExige ação imediata por prazo ou bloqueio explícito");
  const [draftKeys, setDraftKeys] = useState({ jev: "", openrouter: "" });
  const [stored, setStored] = useState({ jev: false, openrouter: false });
  const [keyMessage, setKeyMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [results, setResults] = useState<Partial<Record<Kind, JevResult>>>({});
  const [errors, setErrors] = useState<Partial<Record<Kind, string>>>({});
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [compareMessage, setCompareMessage] = useState("");

  useEffect(() => {
    api("/api/keys").then((data) => setStored({ jev: !!data.jev, openrouter: !!data.openrouter }))
      .catch((error) => setKeyMessage(error.message));
  }, []);

  function input(): LabInput {
    if (!state.trim()) throw new Error("Escreva um chamado.");
    const criteria: Record<string, string> = {};
    for (const row of choiceCriteria.split("\n").map((item) => item.trim()).filter(Boolean)) {
      const divider = row.indexOf("|");
      if (divider < 1) throw new Error("Em Choice, use identificador | descrição em cada linha.");
      const id = row.slice(0, divider).trim(), description = row.slice(divider + 1).trim();
      if (!/^[a-z][a-z0-9_]{0,29}$/.test(id) || !description || Object.hasOwn(criteria, id))
        throw new Error("As opções Choice precisam de identificadores únicos, sem espaços ou acentos, e descrição.");
      criteria[id] = description;
    }
    const levels = scoreCriteria.split("\n").map((item) => item.trim()).filter(Boolean);
    if (Object.keys(criteria).length < 2 || levels.length < 2) throw new Error("Defina ao menos duas opções Choice e dois níveis Score.");
    const questions: Questions = {
      equipe: { type: "choice", instructions: choiceQuestion, criteria },
      reembolso: { type: "noul", instructions: noulQuestion, criteria: { true: noulTrue, false: noulFalse } },
      urgencia: { type: "score", instructions: scoreQuestion, criteria: levels },
    };
    return { state, questions };
  }

  async function save(provider: Provider) {
    setBusy(`save-${provider}`); setKeyMessage("");
    try {
      await api("/api/keys", "PUT", { provider, key: draftKeys[provider] });
      setDraftKeys((previous) => ({ ...previous, [provider]: "" }));
      setStored((previous) => ({ ...previous, [provider]: true }));
      setKeyMessage(`Chave ${provider === "jev" ? "JEV" : "OpenRouter"} salva com segurança.`);
    } catch (error) { setKeyMessage((error as Error).message); }
    finally { setBusy(""); }
  }
  async function remove(provider: Provider) {
    setBusy(`delete-${provider}`); setKeyMessage("");
    try {
      await api("/api/keys", "DELETE", { provider });
      setStored((previous) => ({ ...previous, [provider]: false }));
      setKeyMessage("Chave removida.");
    } catch (error) { setKeyMessage((error as Error).message); }
    finally { setBusy(""); }
  }
  async function run(kind: Kind) {
    setBusy(kind); setErrors((previous) => ({ ...previous, [kind]: "" }));
    try {
      const data = await api<JevResult>("/api/jev", "POST", { ...input(), kind });
      setResults((previous) => ({ ...previous, [kind]: data }));
    } catch (error) { setErrors((previous) => ({ ...previous, [kind]: (error as Error).message })); }
    finally { setBusy(""); }
  }
  async function compare() {
    setBusy("compare"); setCompareMessage(""); setComparison(null);
    try {
      const data = await api<Comparison>("/api/compare", "POST", input());
      setComparison(data);
      setCompareMessage(data.jev.ok && data.opus.ok ? "Comparação concluída com respostas reais." : "Uma das consultas falhou. Veja os detalhes abaixo.");
    } catch (error) { setCompareMessage((error as Error).message); }
    finally { setBusy(""); }
  }
  function pickPreset(next: Preset) {
    setPreset(next); setState(presets[next]); setResults({}); setComparison(null);
  }
  let preview = "";
  try { preview = JSON.stringify({ model: "jev-latest", ...input() }, null, 2); }
  catch (error) { preview = (error as Error).message; }
  const levels = scoreCriteria.split("\n").map((item) => item.trim()).filter(Boolean);
  const jevAnswers = comparison?.jev.ok ? comparison.jev.data.answers : null;
  const opusAnswer = comparison?.opus.ok ? comparison.opus.data.answer : null;

  return <main>
    <header className="site-header"><a className="logo" href="#inicio"><span>J</span> LAB <small>JEV</small></a><nav><a href="#experimento">Experimento</a><a href="#comparacao">Comparação</a><a href="#ideias">Ideias</a></nav><div className="account">{displayName}</div></header>
    <div className="page-wrap" id="inicio">
      <div className="intro"><p className="overline">TÓPICOS ESPECIAIS EM INFORMÁTICA / AULA INTERATIVA</p><h1>Uma mensagem. <em>Três decisões.</em></h1><p>Edite o chamado, execute Choice, Noul e Score no JEV e compare as decisões com o Claude Opus 5.5. As chamadas só acontecem quando você clicar nos botões.</p></div>
      <section id="experimento" className="workspace">
        <div className="main-column">
          <div className="panel"><div className="panel-heading"><span className="number">1</span><div><h2>Chamado a analisar</h2><p>O mesmo texto será usado em todas as perguntas.</p></div></div><div className="presets">{(Object.keys(presets) as Preset[]).map((item) => <button key={item} className={preset === item ? "active" : ""} onClick={() => pickPreset(item)}>{item === "cobranca" ? "Cobrança" : item === "erro" ? "Erro técnico" : "Cancelamento"}</button>)}</div><label htmlFor="state">Mensagem do cliente</label><textarea id="state" rows={5} maxLength={4000} value={state} onChange={(event) => setState(event.target.value)} /></div>
          <div className="question-grid">
            <article className="panel question"><div className="question-heading"><span className="icon coral">◎</span><div><h2>Choice <small>UMA CATEGORIA</small></h2><p>Roteie um chamado para uma equipe.</p></div></div><p className="lesson"><b>Quando usar:</b> uma alternativa deve vencer entre opções conhecidas. JEV devolve a escolha e a distribuição entre elas.</p><label htmlFor="choice-q">Pergunta</label><input id="choice-q" maxLength={500} value={choiceQuestion} onChange={(event) => setChoiceQuestion(event.target.value)} /><label htmlFor="choice-c">Opções <small>identificador | descrição, uma por linha</small></label><textarea id="choice-c" rows={4} value={choiceCriteria} onChange={(event) => setChoiceCriteria(event.target.value)} /><button className="action dark" disabled={!!busy} onClick={() => run("choice")}>{busy === "choice" ? "Consultando…" : "Executar Choice ↗"}</button>{errors.choice && <p className="error">{errors.choice}</p>}{results.choice && <JsonAnswer result={results.choice} kind="choice" levels={levels} />}</article>
            <article className="panel question"><div className="question-heading"><span className="icon blue">◐</span><div><h2>Noul <small>SIM OU NÃO</small></h2><p>Verifique uma condição específica.</p></div></div><p className="lesson"><b>Quando usar:</b> você precisa da probabilidade de uma afirmação ser verdadeira. Um valor perto de 0,5 indica incerteza.</p><label htmlFor="noul-q">Pergunta</label><input id="noul-q" maxLength={500} value={noulQuestion} onChange={(event) => setNoulQuestion(event.target.value)} /><div className="two-fields"><div><label htmlFor="noul-true">Conta como “sim”</label><input id="noul-true" maxLength={250} value={noulTrue} onChange={(event) => setNoulTrue(event.target.value)} /></div><div><label htmlFor="noul-false">Conta como “não”</label><input id="noul-false" maxLength={250} value={noulFalse} onChange={(event) => setNoulFalse(event.target.value)} /></div></div><button className="action dark" disabled={!!busy} onClick={() => run("noul")}>{busy === "noul" ? "Consultando…" : "Executar Noul ↗"}</button>{errors.noul && <p className="error">{errors.noul}</p>}{results.noul && <JsonAnswer result={results.noul} kind="noul" levels={levels} />}</article>
            <article className="panel question"><div className="question-heading"><span className="icon yellow">▥</span><div><h2>Score <small>ESCALA ORDENADA</small></h2><p>Avalie a intensidade da urgência.</p></div></div><p className="lesson"><b>Quando usar:</b> os níveis têm ordem, do menor para o maior. O JEV pode retornar um valor fracionário porque calcula a média ponderada.</p><label htmlFor="score-q">Pergunta</label><input id="score-q" maxLength={500} value={scoreQuestion} onChange={(event) => setScoreQuestion(event.target.value)} /><label htmlFor="score-c">Níveis <small>um por linha, em ordem crescente; começam em 0</small></label><textarea id="score-c" rows={4} value={scoreCriteria} onChange={(event) => setScoreCriteria(event.target.value)} /><button className="action dark" disabled={!!busy} onClick={() => run("score")}>{busy === "score" ? "Consultando…" : "Executar Score ↗"}</button>{errors.score && <p className="error">{errors.score}</p>}{results.score && <JsonAnswer result={results.score} kind="score" levels={levels} />}</article>
          </div>
        </div>
        <aside className="side-column"><div className="panel keys"><div className="panel-heading"><span className="number">2</span><div><h2>Suas chaves</h2><p>Salvas para as próximas visitas.</p></div></div>{(["jev", "openrouter"] as Provider[]).map((provider) => <div className="key-row" key={provider}><label htmlFor={`key-${provider}`}>{provider === "jev" ? "TypeSafe / JEV" : "OpenRouter"}</label><span className={stored[provider] ? "key-status saved" : "key-status"}>{stored[provider] ? "Salva" : "Não salva"}</span><input id={`key-${provider}`} type="password" autoComplete="off" spellCheck={false} placeholder={stored[provider] ? "Cole outra chave para substituir" : "Cole a chave"} value={draftKeys[provider]} onChange={(event) => setDraftKeys((previous) => ({ ...previous, [provider]: event.target.value }))} /><div className="key-actions"><button className="action small" disabled={!!busy || !draftKeys[provider].trim()} onClick={() => save(provider)}>{busy === `save-${provider}` ? "Salvando…" : stored[provider] ? "Substituir" : "Salvar chave"}</button>{stored[provider] && <button className="link-button" disabled={!!busy} onClick={() => remove(provider)}>Remover</button>}</div></div>)}{keyMessage && <p className={keyMessage.includes("salva") || keyMessage.includes("removida") ? "success" : "error"} role="status">{keyMessage}</p>}<p className="privacy">As chaves são criptografadas no servidor e não voltam para a página. Cada conta acessa apenas as próprias chaves.</p></div><div className="panel preview"><div className="panel-heading"><span className="number">3</span><div><h2>Contrato JEV</h2><p>JSON enviado na comparação.</p></div></div><pre>{preview}</pre></div></aside>
      </section>
    </div>
    <section id="comparacao" className="compare"><div className="page-wrap"><div className="compare-heading"><div><p className="overline">COMPARAÇÃO</p><h2>Agora, lado a lado.</h2><p>A mesma mensagem e os mesmos critérios vão para JEV e Claude Opus 5.5.</p></div><button className="action coral-button" disabled={!!busy} onClick={compare}>{busy === "compare" ? "Consultando os modelos…" : "Comparar os dois modelos ↗"}</button></div><p className="compare-message" role="status">{compareMessage || "Execute a comparação para ver respostas, tempo e custo de cada consulta."}</p><div className="comparison-grid"><div className="comparison-card"><div className="comparison-title"><small>MODELO DE DECISÃO</small><h3>JEV</h3></div>{!comparison && <p className="waiting">Aguardando execução.</p>}{comparison && !comparison.jev.ok && <p className="error">{comparison.jev.error}</p>}{jevAnswers && comparison?.jev.ok && <div className="comparison-body"><div className="cost-line"><span>Custo desta consulta <small>estimado</small></span><strong>{costText(comparison.jev.data.cost_usd)}</strong></div><div><span>Equipe</span><strong>{String(jevAnswers.equipe?.choice ?? "—")}</strong></div><div><span>Reembolso explícito</span><strong>{percentage(jevAnswers.reembolso?.noul)} de chance de sim</strong></div><div><span>Urgência</span><strong>{decimal(jevAnswers.urgencia?.score)} / {levels.length - 1}</strong></div><small>{`${comparison.jev.data.model} · ${comparison.jev.data.elapsed_ms} ms · ${usageText(comparison.jev.data.usage)}`}</small></div>}</div><div className="comparison-card"><div className="comparison-title"><small>LLM GENERALISTA</small><h3>Claude Opus 5.5</h3></div>{!comparison && <p className="waiting">Aguardando execução.</p>}{comparison && !comparison.opus.ok && <p className="error">{comparison.opus.error}</p>}{opusAnswer && comparison?.opus.ok && <div className="comparison-body"><div className="cost-line"><span>Custo desta consulta <small>informado pela API</small></span><strong>{costText(comparison.opus.data.cost_usd)}</strong></div><div><span>Equipe</span><strong>{opusAnswer.choice}</strong></div><div><span>Reembolso explícito</span><strong>{opusAnswer.noul ? "Sim" : "Não"}</strong></div><div><span>Urgência</span><strong>{opusAnswer.score} / {levels.length - 1}</strong></div><p>{opusAnswer.reason}</p><small>{`${comparison.opus.data.model} · ${comparison.opus.data.elapsed_ms} ms · ${usageText(comparison.opus.data.usage)}`}</small></div>}</div></div><p className="cost-note">Valores em USD por execução. JEV: estimativa pelos tokens de entrada à tarifa pública de US$ 0,042 por milhão; Opus: valor devolvido pela OpenRouter. Se faltar informação de uso, o custo aparece como não informado. Taxas de compra de créditos não estão incluídas.</p><div className="discussion"><strong>Para discutir em sala</strong><p>Uma resposta diferente não prova que um modelo errou. Compare as decisões com o texto e teste mais exemplos. Os números de JEV e Opus têm formatos diferentes; não são medidas diretas de acurácia.</p></div></div></section>
    <section id="ideias" className="ideas"><div className="page-wrap"><div className="ideas-intro"><div><p className="overline">DO LABORATÓRIO PARA O MUNDO REAL</p><h2>Onde usar o <em>JEV?</em></h2><p>Comece com uma decisão pequena e bem definida. Cada cartão abaixo traz uma pergunta que você pode adaptar no experimento acima.</p></div><span className="ideas-count">09<br /><small>pontos de partida</small></span></div><div className="ideas-grid">{projectIdeas.map((idea) => <article className={`idea-card ${idea.accent}`} key={idea.number}><div className="idea-top"><span>{idea.number} / {idea.area}</span><span className="idea-type">{idea.type}</span></div><h3>{idea.title}</h3><p className="idea-question">“{idea.question}”</p><dl><div><dt>Entrada</dt><dd>{idea.input}</dd></div><div><dt>Saída útil</dt><dd>{idea.result}</dd></div></dl></article>)}</div><div className="ideas-note"><span aria-hidden="true">↗</span><div><strong>Transforme uma ideia em projeto de aula</strong><p>Defina as opções ou a escala, reúna exemplos variados e compare as respostas com decisões revisadas por pessoas. Em contextos sensíveis, use o resultado como apoio, não como decisão automática.</p></div><a href="#experimento">Testar uma pergunta ↑</a></div></div></section>
    <footer className="footer"><span>LAB JEV · TÓPICOS ESPECIAIS EM INFORMÁTICA</span><div><a href="https://api.typesafe.ai/docs" target="_blank" rel="noreferrer">API TypeSafe ↗</a><a href="https://openrouter.ai/anthropic/claude-opus-5.5?view=api" target="_blank" rel="noreferrer">Claude Opus 5.5 ↗</a></div></footer>
  </main>;
}

