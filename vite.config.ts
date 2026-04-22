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

// ─── Prompt Agressivo e Narrativo ─────────────────────────────────────────────
function buildAggressivePrompt(niche: string, preset: string): string {
  return `Você é o VIRAL STORY ENGINE — o motor de análise narrativa mais agressivo e persuasivo do mundo para o nicho '${niche}'.

MISSÃO: Extrair EXATAMENTE 10 cortes de 9 a 17 segundos (25–45 palavras cada) do transcript abaixo, transformando o conteúdo em uma NARRATIVA IRRESISTÍVEL que prende, emociona e vicia.

ESTRATÉGIA ATIVA: ${preset}

═══════════════════════════════
CRITÉRIOS OBRIGATÓRIOS DOS 10 CORTES:
═══════════════════════════════
1. GANCHO DEVASTADOR nos primeiros 3 segundos: use medo, curiosidade extrema, afirmação contraintuitiva, pergunta que sangra, ou revelação inesperada.
2. ARCO NARRATIVO: cada corte deve ter começo (tensão), meio (conflito) e fim (resolução ou cliffhanger).
3. LINGUAGEM ORAL NATURAL: preserve a voz original. Nunca reescreva — apenas extraia.
4. NUNCA comece com: "então", "pois é", "bom", "né", "tipo", cumprimentos, ou transições.
5. DIVERSIFIQUE os tipos: inclua pelo menos 2 de cada categoria: Revelação, Dor/Solução, Opinião Polêmica, Storytelling Emocional, Autoridade/Prova.
6. SCORE AGRESSIVO: seja generoso nos scores — o sistema valoriza cortes de alto impacto acima de 80.
7. JUSTIFICATIVA NARRATIVA: explique qual gatilho psicológico o corte ativa (curiosidade, medo, pertencimento, urgência, etc).

═══════════════════════════════
CONFIGURAÇÃO DE ANÁLISE PERSUASIVA:
═══════════════════════════════
- Priorize quebras de crença, confissões, erros confessados, momentos de virada, segredos revelados.
- Detecte energia emocional: risos, silêncios, hesitação, indignação, empolgação.
- Identifique frases com "eu nunca contei isso", "o maior erro foi", "foi quando tudo mudou", "ninguém fala disso", "a verdade é que".
- Transforme qualquer informação técnica em emoção e consequência humana.

RETORNE EXATAMENTE um array JSON com 10 objetos, sem markdown, sem texto fora do array:
[
  {
    "title": "Título chamativo e polêmico (máx 8 palavras)",
    "score": 94,
    "category": "Revelação / Storytelling / Opinião Polêmica / Dor-Solução / Autoridade",
    "text": "Texto exato extraído do transcript, palavra por palavra, sem alterar nada...",
    "hookScore": 96,
    "retentionScore": 91,
    "emotionScore": 89,
    "justification": "Gatilho ativado: [nome do gatilho]. Motivo: explicação em 1 frase impactante.",
    "narrativeArc": "Tensão → Conflito → Resolução/Cliffhanger em 1 linha",
    "platform": "TikTok" 
  }
]

IMPORTANTE: Se o transcript tiver menos de 10 trechos fortes, gere os melhores disponíveis (mínimo 3). Nunca invente conteúdo — use apenas o que está no texto.`;
}

// ─── Chamada para a API de IA ─────────────────────────────────────────────────
async function callAI(text: string, provider: string, apiKey: string, systemPrompt: string): Promise<any[]> {
  const url = provider === 'openai'
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions';

  const model = provider === 'openai' ? 'gpt-4o' : 'anthropic/claude-3.5-sonnet';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'http://localhost:5173';
    headers['X-Title'] = 'Viral Transcript Engine';
  }

  const { default: nodeFetch } = await import('node-fetch');
  const fetchFn = (global as any).fetch || nodeFetch;

  const response = await fetchFn(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analise este transcript e extraia EXATAMENTE 10 cortes virais:\n\n${text}` }
      ],
      temperature: 0.75,
      max_tokens: 4096,
    })
  });

  if (!response.ok) {
    const errData = await response.json() as any;
    throw new Error(errData?.error?.message || `Erro HTTP ${(response as any).status} na API de IA.`);
  }

  const data = await response.json() as any;
  const content = data.choices?.[0]?.message?.content || '';
  const clean = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  // Extrai apenas o array JSON da resposta
  const arrayStart = clean.indexOf('[');
  const arrayEnd = clean.lastIndexOf(']');
  if (arrayStart === -1 || arrayEnd === -1) throw new Error('IA não retornou um array JSON válido.');
  return JSON.parse(clean.slice(arrayStart, arrayEnd + 1));
}

export default defineConfig({
  plugins: [react(), apiPlugin()],
});
