import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Connect } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';

// Inline API handlers — sem Express separado, sem conflito ESM
function apiPlugin() {
  return {
    name: 'api-plugin',
    configureServer(server: any) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
        if (!req.url?.startsWith('/api')) return next();

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        // Lê o body
        const body = await new Promise<any>((resolve) => {
          let data = '';
          req.on('data', chunk => data += chunk);
          req.on('end', () => {
            try { resolve(JSON.parse(data)); } catch { resolve({}); }
          });
        });

        // POST /api/transcripts/process — Inicia o processamento
        if (req.method === 'POST' && req.url === '/api/transcripts/process') {
          const { originalText, provider, apiKey, niche, preset } = body;

          if (!originalText || !apiKey) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Texto e API Key são obrigatórios.' }));
            return;
          }

          // Cria um ID único para o transcript
          const transcriptId = `transcript_${Date.now()}_${Math.random().toString(36).slice(2)}`;

          // Armazena em memória com status PROCESSING
          (global as any).__transcripts = (global as any).__transcripts || {};
          (global as any).__transcripts[transcriptId] = { id: transcriptId, status: 'PROCESSING', cuts: [] };

          // Responde imediatamente
          res.end(JSON.stringify({ transcriptId, status: 'PROCESSING' }));

          // Processa em background usando setImmediate
          setImmediate(async () => {
            try {
              const systemPrompt = buildPrompt(niche || 'Geral', preset || 'Viral');
              const cuts = await callAI(originalText, provider, apiKey, systemPrompt);
              (global as any).__transcripts[transcriptId] = {
                id: transcriptId,
                status: 'COMPLETED',
                cuts: cuts.map((c: any, i: number) => ({ ...c, id: `cut_${i}_${Date.now()}` }))
              };
              console.log(`[Worker] Transcript ${transcriptId} → ${cuts.length} cortes extraídos.`);
            } catch (err: any) {
              console.error('[Worker] Erro:', err.message);
              (global as any).__transcripts[transcriptId] = {
                id: transcriptId,
                status: 'ERROR',
                error: err.message,
                cuts: []
              };
            }
          });
          return;
        }

        // GET /api/transcripts/:id — Polling de status
        const pollMatch = req.url?.match(/^\/api\/transcripts\/(.+)$/);
        if (req.method === 'GET' && pollMatch) {
          const id = pollMatch[1];
          const data = (global as any).__transcripts?.[id];
          if (!data) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'Transcript não encontrado.' }));
            return;
          }
          res.end(JSON.stringify(data));
          return;
        }

        next();
      });
    }
  };
}

function buildPrompt(niche: string, preset: string): string {
  return `Você é o motor de análise do Viral Transcript Engine especializado no nicho '${niche}'.
Estratégia de extração: '${preset}'.

Sua tarefa: encontrar de 2 a 5 trechos com alto potencial viral no texto abaixo.

CRITÉRIOS OBRIGATÓRIOS:
- Cada trecho deve ter 25 a 50 palavras (9 a 17 segundos de fala).
- Deve começar com um gancho forte (afirmação impactante, pergunta, ou quebra de expectativa).
- Deve ter uma resolução/payoff claro no final.
- Nunca comece com "então", "pois é", cumprimentos ou transições.

RETORNE APENAS um array JSON válido, sem markdown, sem texto adicional:
[
  {
    "title": "Título chamativo do corte",
    "score": 92,
    "category": "Opinião Forte",
    "text": "O texto extraído exatamente como está no original...",
    "hookScore": 95,
    "retentionScore": 88,
    "emotionScore": 85,
    "justification": "Abre com tese contraintuitiva e fecha com prova social."
  }
]`;
}

async function callAI(text: string, provider: string, apiKey: string, systemPrompt: string): Promise<any[]> {
  const url = provider === 'openai'
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions';

  const model = provider === 'openai' ? 'gpt-4o-mini' : 'anthropic/claude-3.5-sonnet';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'http://localhost:5173';
    headers['X-Title'] = 'Viral Transcript Engine';
  }

  // No ambiente Vite (Node.js), usa fetch global (Node 18+)
  const { default: nodeFetch } = await import('node-fetch');
  const fetchFn = (global as any).fetch || nodeFetch;

  const response = await fetchFn(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ],
      temperature: 0.7,
    })
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData?.error?.message || `Erro HTTP ${response.status} na API de IA.`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  const clean = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(clean);
}

export default defineConfig({
  plugins: [react(), apiPlugin()],
});
