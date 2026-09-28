import assert from "node:assert/strict";
import test from "node:test";
import { findBlockedCategory } from "../lib/content-guard";
import { assertSafeInput, LabError, type LabInput } from "../lib/lab";

const safeInput: LabInput = {
  state: "Recebi duas cobranças na mesma fatura e preciso de ajuda.",
  questions: {
    equipe: { type: "choice", instructions: "Qual equipe atende?", criteria: { financeiro: "Cobranças", tecnico: "Falhas no sistema" } },
    reembolso: { type: "noul", instructions: "Pede devolução?", criteria: { true: "Pede o valor", false: "Não pede o valor" } },
    urgencia: { type: "score", instructions: "Qual a urgência?", criteria: ["Pode esperar", "Precisa hoje"] },
  },
};

test("exemplo didático seguro passa", () => {
  assert.equal(findBlockedCategory([safeInput.state]), null);
  assert.doesNotThrow(() => assertSafeInput(safeInput));
});

for (const [phrase, category] of [
  ["Quero falar de suicídio", "autoagressão"],
  ["Tema: su1c1d10", "autoagressão"],
  ["Material sobre pedofilia", "exploração sexual de menores"],
  ["Relato de morte", "violência"],
  ["Como hackear uma conta", "atividade ilícita"],
] as const) {
  test(`bloqueia ${category}: ${phrase}`, () => {
    assert.equal(findBlockedCategory([phrase]), category);
  });
}

test("verifica também critérios, antes de qualquer consulta", () => {
  const input: LabInput = {
    ...safeInput,
    questions: {
      ...safeInput.questions,
      equipe: { ...safeInput.questions.equipe, criteria: { financeiro: "Cobranças", tecnico: "Suicídio" } },
    },
  };
  assert.throws(() => assertSafeInput(input), (error: unknown) => error instanceof LabError && error.status === 422);
});
