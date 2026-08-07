# Contexto para o Claude Code

Setup, variáveis de ambiente e estrutura de pastas estão no `README.md` — não repetimos aqui.
Este arquivo guarda o que **não é óbvio pelo código**: definições de métrica, invariantes que
não podem ser quebradas e armadilhas que já causaram bug em produção.

## Onde ficam as coisas

| Caminho | O que é |
|---|---|
| `frontend/index.html` | SPA inteiro do chat (fluxo, tracking, PDF) — arquivo único e grande |
| `admin/dashboard.html` | Painel admin inteiro (HTML + CSS + JS num arquivo) |
| `backend/src/routes/admin.js` | Todos os endpoints do painel (`/stats`, `/funnel`, `/timeseries`, …) |
| `backend/src/routes/analyze.js` | `POST /analyze` → roda a IA e **persiste a conclusão** (`persistCompletion`) |
| `backend/src/services/hubspot.js` | `buildHubSpotProperties` — mapeia respostas do chat → propriedades do CRM |
| `backend/supabase_schema.sql` | Schema + migrações. Aplicadas **manualmente** no SQL Editor do Supabase |

O fluxo real de conclusão passa por `POST /analyze`, **não** por `POST /lead`
(essa rota existe mas o frontend não a usa para concluir).

## Métricas do admin: três populações diferentes

A maior fonte de confusão do projeto. Números que parecem se contradizer geralmente
medem populações distintas. Ao mexer em qualquer métrica, deixe explícito no rótulo
qual população ela conta.

| Fonte | Conta | Onde aparece |
|---|---|---|
| `funnel_events` | **sessões de navegador** (anônimas, sem e-mail) — inclui quem saiu antes de deixar o e-mail | Taxa de Conversão, Taxa de Início, Taxa de Conclusão |
| `leads` | **pessoas** (dedup por e-mail) | Leads no Período, Análises Completas, "Conclusão entre quem deixou o e-mail" |
| `sessions` | sessões em andamento nos **últimos 7 dias**, independente do filtro de data | "em andamento" no funil, Sessões (24h) |

Definições em uso:

- **Taxa de Conversão** = `complete ÷ view` (pageview → análise concluída)
- **Taxa de Início** = `start ÷ view`
- **Taxa de Conclusão (Iniciaram e Finalizaram)** = `complete ÷ start`
- **Conclusão entre quem deixou o e-mail** = `completos ÷ (completos + parciais)` na tabela `leads`

As duas últimas dão números **quase iguais** com dados reais (~42% e ~43%) e medem coisas
diferentes — não as compare nem unifique sem falar com o time.

Uma pessoa que refaz o quiz gera 1 lead mas 2 sessões, então um gap pequeno entre
`funnel_events` e `leads` é esperado, não é bug. Não existe chave para cruzar as duas
tabelas: `funnel_events` só tem `session_id` anônimo.

## Invariantes — não quebre

1. **`leads.completed_at` é imutável.** Gravado uma vez, no momento real da conclusão.
   Numa reconclusão, preserva-se a data original. Reescrevê-la moveria uma conclusão de
   um período já fechado para o atual.

2. **Período fechado nunca muda de número.** Métricas por dia/mês usam corte de data fixo
   (`created_at` / `completed_at` comparados ao `to` do período), nunca o status "de agora"
   (`score != null`). Ver `cohortSplit` e `cohortSplitByDay` em `admin.js`.
   Quem completa depois do período fechar continua "parcial" naquele período para sempre.

3. **Uma pessoa = uma linha em `leads`.** `persistCompletion` procura qualquer linha do
   e-mail (prefere o parcial em aberto) e atualiza. Não cria segunda linha em reconclusão.

4. **`start` e `complete` são idempotentes por sessão** em `funnel_events`
   (checagem no app + índice único no banco). Só `view` pode repetir.

## Armadilhas que já causaram bug

- **`supabase-js` não lança exceção em erro de banco.** Retorna `{ data: null, error }`.
  Sem checar `error` explicitamente, uma escrita que falha passa como sucesso —
  foi assim que leads completos se perderam em silêncio. **Sempre checar `error`.**

- **Logs do EasyPanel são efêmeros** (sem histórico, e o container reinicia com frequência).
  Falhas críticas vão para a tabela `system_errors`, não só `console.error`.

- **HubSpot descarta valor fora das opções da propriedade** e ainda responde OK
  (`_doRequest` remove o campo inválido e repete). O lead fica `hubspot_synced=true`
  sem nenhum campo. Antes de mapear um campo novo, confirme o nome interno e as opções
  aceitas da propriedade — não invente.
  Rode a guarda: `cd backend && npm run check:hubspot`

- **Comparação de string com acento/caixa fixos.** `'Sem Formação'` vs `'Sem formação'` já
  derrubou um campo. Use o helper `norm()` de `hubspot.js`.

- **`.funnel-item` no admin é container de bloco.** Já foi grid, e o dropdown das etapas
  de abandono abria ao lado da linha em vez de abaixo.

## Antes de commitar

```bash
node --check backend/src/routes/<arquivo>.js     # não há linter/test runner configurado
cd backend && npm run check:hubspot              # se tocou em hubspot.js
```

Para o `admin/dashboard.html` e o `frontend/index.html` (JS embutido), extraia o maior
bloco `<script>` e rode `node --check` nele.

Não há suíte de testes. Quando a mudança envolve cálculo de métrica ou layout, vale
validar rodando o handler real contra um Supabase simulado (padrão já usado antes:
substituir `require.cache` de `backend/src/lib/supabase.js` por um mock).

## Deploy

`main` → push → webhook do EasyPanel dispara o build (Docker Swarm, servidor remoto).
O `deploy.sh` do repo roda **no servidor**, não na máquina local. A URL do webhook contém
um token e por isso **não fica versionada** — peça ao Lucas quando precisar.

Migrações de schema **não** são aplicadas pelo deploy: rode o SQL novo de
`supabase_schema.sql` no SQL Editor do Supabase antes de subir código que dependa dele.

## Idioma

Código, comentários e mensagens de commit em **português**. Comentários explicam *por que*,
não *o que*.
