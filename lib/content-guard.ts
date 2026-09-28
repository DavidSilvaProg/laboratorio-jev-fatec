export type BlockedCategory = "autoagressão" | "exploração sexual de menores" | "violência" | "conteúdo sexual" | "atividade ilícita";

function normalize(text: string): string {
  const digits: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t" };
  return text.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/[013457]/g, (digit) => digits[digit])
    .replace(/[^a-z]+/g, " ").trim();
}

const selfHarm = /\b(?:suicid\w*|autoagress\w*|automutil\w*|autoles\w*|self harm|selfharm|self injury)\b/u;
const childSexual = /\b(?:pedofil\w*|pornografia infantil|abuso sexual infantil|exploracao sexual infantil|child sexual|csam|csem|grooming)\b/u;
const minors = /\b(?:crianca\w*|menor(?:es)?|infantil|adolescente\w*|child(?:ren)?|minor(?:s)?)\b/u;
const sexual = /\b(?:sexo|sexual\w*|pornograf\w*|nudez|nudes?|erotic\w*|rape|estupro\w*|molest\w*)\b/u;
const violence = /\b(?:morte\w*|morr\w*|matar|matei|morto\w*|assassin\w*|homicid\w*|massacr\w*|tirotei\w*|tortur\w*|terroris\w*|bomba\w*|explosiv\w*|armas?|weapon\w*|murder\w*|kill(?:ing|ed|er)?|death|dead|dying|shooting\w*|violenc\w*)\b/u;
const illegal = /\b(?:fraude\w*|golpe\w*|phishing|ransomware|malware|hackear|invadir (?:um |o |uma |a )?(?:sistema|conta|rede)|fabricar (?:arma|bomba)|trafic\w*)\b/u;

export function findBlockedCategory(texts: string[]): BlockedCategory | null {
  for (const original of texts) {
    const text = normalize(original);
    if (selfHarm.test(text)) return "autoagressão";
    if (childSexual.test(text) || (minors.test(text) && sexual.test(text))) return "exploração sexual de menores";
    if (violence.test(text)) return "violência";
    if (sexual.test(text)) return "conteúdo sexual";
    if (illegal.test(text)) return "atividade ilícita";
  }
  return null;
}

export function blockedMessage(category: BlockedCategory): string {
  return `Conteúdo sobre ${category} foi bloqueado antes do envio às APIs. Use um exemplo acadêmico seguro de atendimento, cobrança ou suporte.`;
}
