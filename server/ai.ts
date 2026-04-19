export type AIProvider = 'openai' | 'openrouter';

export interface CutResult {
  title: string;
  category: string;
  text: string;
  score: number;
  hookScore: number;
  retentionScore: number;
  emotionScore: number;
  justification: string;
}

const SYSTEM_PROMPT = `Você é o motor de análise do Viral Transcript Engine. 
Sua tarefa é encontrar trechos de 9 a 17 segundos (aprox. 25 a 45 palavras faladas) dentro do texto fornecido que se sustentem sozinhos (Standalone).

REGRAS RÍGIDAS:
1. Extraia de 1 a 3 cortes com maior potencial viral.
2. O trecho DEVE ter um gancho forte (começar com uma afirmação, pergunta ou quebra de expectativa).
3. O trecho DEVE ter uma resolução ou payoff.
4. Classifique a emoção e calcule os sub-scores de hookScore, retentionScore e emotionScore (0 a 100). O total score é a média.
5. Forneça uma 'justification' (1 frase curta) do POR QUE este trecho tem potencial viral.
6. Retorne ESTRITAMENTE um array JSON contendo os cortes. Não adicione markdown como \`\`\`json. Apenas o array.

Exemplo do formato esperado:
[
  {
    "title": "O título chamativo do corte",
    "score": 95,
    "category": "Opinião Forte",
    "text": "O texto extraído exatamente como no original...",
    "hookScore": 98,
    "retentionScore": 90,
    "emotionScore": 85,
    "justification": "Abre com uma dor comum e finaliza com resolução prática."
  }
]`;

export async function processTranscriptAI(
  text: string,
  provider: AIProvider,
  apiKey: string
): Promise<CutResult[]> {
  if (provider === 'openai') {
    return callOpenAI(text, apiKey);
  } else {
    return callOpenRouter(text, apiKey);
  }
}

async function callOpenAI(text: string, apiKey: string): Promise<CutResult[]> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text }
      ],
      temperature: 0.7,
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Erro na API da OpenAI');
  }

  const data = await response.json();
  return parseResponse(data.choices[0].message.content);
}

async function callOpenRouter(text: string, apiKey: string): Promise<CutResult[]> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'http://localhost:5173',
      'X-Title': 'Viral Transcript Engine'
    },
    body: JSON.stringify({
      model: 'anthropic/claude-3.5-sonnet',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text }
      ],
      temperature: 0.7,
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Erro na API do OpenRouter');
  }

  const data = await response.json();
  return parseResponse(data.choices[0].message.content);
}

function parseResponse(content: string): CutResult[] {
  try {
    const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleanContent);
  } catch (err) {
    console.error("Falha ao fazer parse do JSON:", content);
    throw new Error('A IA não retornou um JSON válido.');
  }
}
