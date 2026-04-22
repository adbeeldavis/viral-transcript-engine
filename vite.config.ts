import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Connect } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// ─── Persistência em arquivo JSON (substitui SQLite/Prisma no contexto ESM) ───
const DB_DIR = join(process.cwd(), '.db');
const DB_FILE = join(DB_DIR, 'database.json');

function readDB(): any {
  if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });
  if (!existsSync(DB_FILE)) writeFileSync(DB_FILE, JSON.stringify({ transcripts: [], apiKeys: {} }));
  try { return JSON.parse(readFileSync(DB_FILE, 'utf-8')); } catch { return { transcripts: [], apiKeys: {} }; }
}

function writeDB(data: any) {
  writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ─── Estimativa de timestamps com base em palavras por minuto ─────────────────
// Ritmo médio de fala em pt-BR: ~140 palavras/minuto = ~2.33 palavras/segundo
const WPM = 140;
const WPS = WPM / 60;

function estimateTimestamps(fullText: string, cutText: string): { startSec: number; endSec: number } {
  const allWords = fullText.split(/\s+/).filter(Boolean);
  const cutWords = cutText.trim().split(/\s+/).filter(Boolean);

  // Encontra a posição do corte no texto completo
  const firstWord = cutWords[0].toLowerCase().replace(/[^a-záéíóúàãõâêôüñ]/gi, '');
  let bestPos = 0;

  for (let i = 0; i < allWords.length; i++) {
    const w = allWords[i].toLowerCase().replace(/[^a-záéíóúàãõâêôüñ]/gi, '');
    if (w === firstWord) {
      // Verifica se os próximos 3 words batem
      let score = 0;
      for (let j = 0; j < Math.min(3, cutWords.length); j++) {
        const cw = (allWords[i + j] || '').toLowerCase().replace(/[^a-záéíóúàãõâêôüñ]/gi, '');
        const tw = (cutWords[j] || '').toLowerCase().replace(/[^a-záéíóúàãõâêôüñ]/gi, '');
        if (cw === tw) score++;
      }
      if (score > 0) { bestPos = i; break; }
    }
  }

  const startSec = Math.round(bestPos / WPS);
  const endSec = Math.round((bestPos + cutWords.length) / WPS);
  return { startSec, endSec };
}

function formatTime(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Plugin do Vite com rotas de API embutidas ────────────────────────────────
function apiPlugin() {
  return {
    name: 'api-plugin',
    configureServer(server: any) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
        if (!req.url?.startsWith('/api')) return next();

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

        // Lê o body da requisição
        const body = await new Promise<any>((resolve) => {
          let data = '';
          req.on('data', chunk => data += chunk);
          req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
        });

        // ── POST /api/settings/apikey — Salva a API Key no banco ────────────
        if (req.method === 'POST' && req.url === '/api/settings/apikey') {
          const { provider, apiKey } = body;
          const db = readDB();
          db.apiKeys = db.apiKeys || {};
          db.apiKeys[provider] = apiKey;
          writeDB(db);
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        // ── GET /api/settings/apikeys — Carrega chaves salvas ───────────────
        if (req.method === 'GET' && req.url === '/api/settings/apikeys') {
          const db = readDB();
          res.end(JSON.stringify(db.apiKeys || {}));
          return;
        }

        // ── GET /api/history — Retorna histórico de transcripts ─────────────
        if (req.method === 'GET' && req.url === '/api/history') {
          const db = readDB();
          const history = (db.transcripts || [])
            .filter((t: any) => t.status === 'COMPLETED')
            .sort((a: any, b: any) => b.createdAt - a.createdAt)
            .slice(0, 30)
            .map((t: any) => ({
              id: t.id,
              niche: t.niche,
              preset: t.preset,
              cutsCount: t.cuts?.length || 0,
              createdAt: t.createdAt,
              preview: t.originalText?.slice(0, 80) + '...'
            }));
          res.end(JSON.stringify(history));
          return;
        }

        // ── GET /api/history/:id — Carrega um transcript salvo ──────────────
        const historyItemMatch = req.url?.match(/^\/api\/history\/(.+)$/);
        if (req.method === 'GET' && historyItemMatch) {
          const db = readDB();
          const item = (db.transcripts || []).find((t: any) => t.id === historyItemMatch[1]);
          if (!item) { res.statusCode = 404; res.end(JSON.stringify({ error: 'Não encontrado.' })); return; }
          res.end(JSON.stringify(item));
          return;
        }

        // ── POST /api/transcripts/process — Inicia o processamento ──────────
        if (req.method === 'POST' && req.url === '/api/transcripts/process') {
          const { originalText, provider, apiKey, niche, preset } = body;

          if (!originalText || !apiKey) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Texto e API Key são obrigatórios.' }));
            return;
          }

          const transcriptId = `tr_${Date.now()}_${Math.random().toString(36).slice(2)}`;

          // Estado em memória (para polling rápido)
          (global as any).__transcripts = (global as any).__transcripts || {};
          (global as any).__transcripts[transcriptId] = { id: transcriptId, status: 'PROCESSING', cuts: [] };

          // Salva no banco com status PROCESSING
          const db = readDB();
          db.transcripts = db.transcripts || [];
          db.transcripts.push({
            id: transcriptId, status: 'PROCESSING', originalText,
            niche: niche || 'Geral', preset: preset || 'Viral',
            createdAt: Date.now(), cuts: []
          });
          writeDB(db);

          // Responde imediatamente (não bloqueia)
          res.end(JSON.stringify({ transcriptId, status: 'PROCESSING' }));

          // Worker em background
          setImmediate(async () => {
            try {
              const systemPrompt = buildAggressivePrompt(niche || 'Geral', preset || 'Viral');
              console.log(`[Worker] Iniciando análise da IA para ${transcriptId}...`);
              const rawCuts = await callAI(originalText, provider, apiKey, systemPrompt);

              // Enriquece cada corte com timestamps estimados
              const enrichedCuts = rawCuts.slice(0, 10).map((cut: any, i: number) => {
                const ts = estimateTimestamps(originalText, cut.text);
                return {
                  ...cut,
                  id: `cut_${i}_${Date.now()}`,
                  startSec: ts.startSec,
                  endSec: ts.endSec,
                  startFormatted: formatTime(ts.startSec),
                  endFormatted: formatTime(ts.endSec),
                  durationSec: ts.endSec - ts.startSec,
                };
              });

              // Atualiza memória
              (global as any).__transcripts[transcriptId] = {
                id: transcriptId, status: 'COMPLETED', cuts: enrichedCuts
              };

              // Persiste no banco
              const db2 = readDB();
              const idx = db2.transcripts.findIndex((t: any) => t.id === transcriptId);
              if (idx >= 0) {
                db2.transcripts[idx].status = 'COMPLETED';
                db2.transcripts[idx].cuts = enrichedCuts;
              }
              writeDB(db2);

              console.log(`[Worker] ✅ ${transcriptId} → ${enrichedCuts.length} cortes salvos no banco.`);
            } catch (err: any) {
              console.error('[Worker] ❌ Erro:', err.message);
              (global as any).__transcripts[transcriptId] = {
                id: transcriptId, status: 'ERROR', error: err.message, cuts: []
              };
              const db2 = readDB();
              const idx = db2.transcripts.findIndex((t: any) => t.id === transcriptId);
              if (idx >= 0) { db2.transcripts[idx].status = 'ERROR'; db2.transcripts[idx].error = err.message; }
              writeDB(db2);
            }
          });
          return;
        }

        // ── GET /api/transcripts/:id — Polling ──────────────────────────────
        const pollMatch = req.url?.match(/^\/api\/transcripts\/(.+)$/);
        if (req.method === 'GET' && pollMatch) {
          const id = pollMatch[1];
          const mem = (global as any).__transcripts?.[id];
          if (mem) { res.end(JSON.stringify(mem)); return; }
          // Fallback: tenta no banco (se reiniciou o servidor)
          const db = readDB();
          const saved = (db.transcripts || []).find((t: any) => t.id === id);
          if (saved) { res.end(JSON.stringify(saved)); return; }
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Transcript não encontrado.' }));
          return;
        }

        next();
      });
    }
  };
}

// ─── Prompt Viral Elite Engine ─────────────────────────────────────────────────
function buildAggressivePrompt(niche: string, preset: string): string {
  return `Você é o VIRAL ELITE ENGINE — motor de análise de curto-forma especializado no nicho '${niche}' com estratégia '${preset}'.

FILOSOFIA: Todo corte deve vencer 4 etapas: parar o scroll → segurar atenção → recompensar rápido → deixar resíduo emocional ou intelectual. Não aprove cortes curtos e vazios. Prefira 10–17 segundos com impacto real a 6 segundos sem sentido.

HIERARQUIA DE DECISÃO:
1. Clareza instantânea (funciona sem contexto e sem áudio)
2. Hook nos primeiros 1–3s (tese forte, pergunta incômoda, contraintuitivo, confissão, choque leve)
3. Carga emocional perceptível
4. Curiosidade ou tensão sustentada
5. Payoff rápido e recompensador
6. Gatilho de reação social (comentar, compartilhar, salvar, replay)

EMOÇÕES PRIMÁRIAS A DETECTAR: surpresa, medo, raiva, tristeza, alegria, antecipação, confiança, nojo
EMOÇÕES COMPOSTAS DE ALTO VALOR: esperança+caminho, dor+identificação, vulnerabilidade+superação, indignação+argumento, ambição+prova, surpresa+utilidade

GATILHOS MENTAIS A PONTUAR: curiosidade, contraste, quebra de padrão, prova social, autoridade, especificidade, urgência, pertencimento, insight contraintuitivo, reframe, validação emocional, benefício concreto, risco/perda

ESTRUTURAS DE ALTO VALOR (priorize trechos com):
- erro + consequência | mito + correção | dor + solução | tese + prova | opinião forte + justificativa
- mini-história + aprendizado | vulnerabilidade + virada | pergunta provocativa + resposta curta
- confissão | segredo revelado | "ninguém fala isso" | "foi aqui que tudo mudou"

DESCARTE automático se: depende de contexto anterior, burocrático, sem emoção, sem frase memorável, abertura lenta, payoff fraco, final mole.

SCORE AVANÇADO (0–100 cada):
- hookScore: força do gancho nos primeiros 3s
- retentionScore: capacidade de segurar atenção até o fim
- emotionScore: intensidade emocional perceptível
- clarityScore: funciona sem contexto e sem áudio
- shareScore: potencial de compartilhamento/salvamento
- closingScore: força da frase final
- score: média ponderada (hook x2 + retention + emotion + clarity + share + closing) / 7

ADAPTAÇÃO POR PLATAFORMA:
- TikTok: mais energia, pattern interrupt, tese forte, verdade incômoda, sensação de descoberta
- Instagram Reels: mais refinamento, frase compartilhável, valor claro, menos caos
- YouTube Shorts: abrir forte, legível sem áudio, payoff rápido, favorece loop
- X/Twitter: funciona como tese, frase quotéavel, ponto de vista que gera resposta

RETORNE EXATAMENTE um array JSON com até 10 objetos. Sem markdown. Sem texto fora do array:
[
  {
    "title": "Título chamativo e polarizador (máx 8 palavras)",
    "headline": "Frase de capa curta para thumbnail",
    "score": 94,
    "category": "Revelação | Storytelling | Opinião Polêmica | Dor-Solução | Autoridade | Verdade Incômoda",
    "cutTypes": ["polêmico", "educativo"],
    "text": "Texto exato extraído do transcript, palavra por palavra, sem alterar nada...",
    "hookScore": 96,
    "retentionScore": 91,
    "emotionScore": 89,
    "clarityScore": 88,
    "shareScore": 85,
    "closingScore": 90,
    "primaryEmotion": "surpresa",
    "secondaryEmotion": "indignação",
    "dominantTrigger": "quebra de padrão",
    "justification": "Por quê foi escolhido, qual emoção aciona, qual reação social tende a gerar.",
    "narrativeArc": "Tensão → Conflito → Resolução",
    "editingNotes": "Punch-in na frase X. Pausa dramática após Y. Destaque a palavra Z.",
    "captionShort": "Legenda curta que funciona no mudo",
    "captionCTA": "Legenda com chamada para ação",
    "tiktokVersion": "Versão adaptada para TikTok (igual ou com ajuste de hook)",
    "reelsVersion": "Versão refinada para Instagram Reels",
    "shortsVersion": "Versão loop-friendly para YouTube Shorts",
    "xVersion": "Frase quotéavel curta para X/Twitter",
    "risk": "Baixo",
    "platform": "TikTok"
  }
]

REGRA FINAL: Descarte qualquer corte que não faça pelo menos 4 destas 6 coisas: (1) parar scroll, (2) despertar emoção, (3) criar curiosidade/tensão, (4) entregar payoff, (5) gerar vontade de reagir, (6) deixar frase memorável. Nunca invente — use apenas o que está no transcript.`;
}

// ─── Trunca o transcript para evitar limites de TPM ─────────────────────────
function truncateTranscript(text: string, maxWords = 3500): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  console.log(`[Worker] Transcript truncado de ${words.length} para ${maxWords} palavras (limite de tokens).`);
  return words.slice(0, maxWords).join(' ') + '\n[... transcript truncado para análise ...]';
}

// ─── Chamada para a API de IA ─────────────────────────────────────────────────
async function callAI(text: string, provider: string, apiKey: string, systemPrompt: string): Promise<any[]> {
  const url = provider === 'openai'
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions';

  // gpt-4o-mini: limite 200k TPM (muito mais folgado que gpt-4o com 30k TPM)
  const model = provider === 'openai' ? 'gpt-4o-mini' : 'anthropic/claude-3.5-sonnet';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'http://localhost:5173';
    headers['X-Title'] = 'Viral Transcript Engine';
  }

  // Trunca o texto antes de enviar
  const safeText = truncateTranscript(text);

  const { default: nodeFetch } = await import('node-fetch');
  const fetchFn = (global as any).fetch || nodeFetch;

  const response = await fetchFn(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analise este transcript e extraia os 10 melhores cortes virais:\n\n${safeText}` }
      ],
      temperature: 0.75,
      max_tokens: 3500,
    })
  });

  if (!response.ok) {
    const errData = await response.json() as any;
    throw new Error(errData?.error?.message || `Erro HTTP ${(response as any).status} na API de IA.`);
  }

  const data = await response.json() as any;
  const content = data.choices?.[0]?.message?.content || '';
  const clean = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  const arrayStart = clean.indexOf('[');
  const arrayEnd = clean.lastIndexOf(']');
  if (arrayStart === -1 || arrayEnd === -1) throw new Error('IA não retornou um array JSON válido.');
  return JSON.parse(clean.slice(arrayStart, arrayEnd + 1));
}

export default defineConfig({
  plugins: [react(), apiPlugin()],
});
