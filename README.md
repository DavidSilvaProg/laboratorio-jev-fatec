# Laboratório JEV — Tópicos Especiais em Informática

Aplicação web para uma aula prática sobre as três perguntas do JEV: **Choice**, **Noul** e **Score**. O aluno edita um chamado, observa o contrato JSON e compara as respostas do JEV com as do **Claude Opus 5.5** via OpenRouter. A comparação mostra tempo, tokens e custo por consulta quando os provedores informam os dados necessários. A página inclui ideias de projetos reais.

Site publicado: [Laboratório JEV](https://laboratorio-jev-topicos-fatec.davidsilvaprog.chatgpt.site/).

## Como funciona

- O visitante entra com ChatGPT antes de usar o laboratório.
- Cada pessoa informa suas próprias chaves do JEV e da OpenRouter na página. O servidor as armazena no Cloudflare D1 com AES-GCM, associadas à identidade do usuário. As chaves não retornam nas respostas da API.
- O filtro em `lib/content-guard.ts` verifica todos os campos editáveis antes de qualquer chamada aos provedores. É uma barreira baseada em regras, não uma garantia de conformidade com as políticas dos provedores.
- O custo do JEV é uma **estimativa** pelos tokens de entrada e pela tarifa configurada no código. O custo do Opus é o valor informado pela OpenRouter, quando disponível. Consulte os provedores para os valores cobrados na conta.

## Executar localmente

Requer Node.js 22.13 ou superior. O projeto foi preparado para o ambiente Sites, com Vinext, Cloudflare Workers e D1.

```powershell
npm ci
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Crie um arquivo `.dev.vars` na raiz com `KEY_ENCRYPTION_SECRET=` seguido do valor gerado. **Não publique esse arquivo.** Use um segredo diferente para cada ambiente.

```powershell
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_massive_kid_colt.sql
npm run dev
```

Abra `http://localhost:5173/`. O ambiente local oferece uma conta de teste para o fluxo de autenticação. As chamadas reais ao JEV e à OpenRouter só ocorrem após cadastrar as respectivas chaves e clicar em executar.

## Verificação

```powershell
node --import tsx --test tests/content-guard.test.ts
npx tsc --noEmit
npm run lint
npm run build
```

As rotas da aplicação estão em `app/api/`. O acesso aos provedores fica em `lib/lab.ts`; o armazenamento criptografado, em `lib/secure-keys.ts`.

## Publicação

O código pode ser publicado como um Site com binding D1 `DB` e a variável secreta `KEY_ENCRYPTION_SECRET` configurada no ambiente de produção. `.openai/hosting.json` identifica o projeto Sites existente; não contém chaves de API. O repositório público contém código e migrações, mas não contém chaves de usuários nem dados do D1.
