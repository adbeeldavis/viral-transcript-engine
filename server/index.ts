import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { processTranscriptAI, AIProvider } from './ai';

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.post('/api/projects', async (req, res) => {
  try {
    const { name, niche, preset } = req.body;
    const project = await prisma.project.create({
      data: { name, niche, preset },
    });
    res.json(project);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/projects', async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      include: { transcripts: true }
    });
    res.json(projects);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint Assíncrono: Inicia o processamento e retorna o ID do Transcript
app.post('/api/transcripts/process', async (req, res) => {
  try {
    const { originalText, provider, apiKey, projectId: reqProjectId, niche, preset } = req.body;
    
    // Se não enviou projectId, cria um Projeto Padrão
    let projectId = reqProjectId;
    if (!projectId) {
      let defaultProject = await prisma.project.findFirst({ where: { name: 'Default Project' } });
      if (!defaultProject) {
        defaultProject = await prisma.project.create({ data: { name: 'Default Project', preset: 'viral', niche: 'geral' } });
      }
      projectId = defaultProject.id;
    }

    // 1. Cria o Transcript com status PENDING
    const transcript = await prisma.transcript.create({
      data: {
        projectId,
        originalText,
        status: "PROCESSING"
      }
    });

    // 2. Responde imediatamente para não travar o frontend
    res.json({ transcriptId: transcript.id, status: transcript.status });

    // 3. Processa em Background (Simulando uma fila/worker)
    setImmediate(async () => {
      try {
        console.log(`[Worker] Processando transcript ${transcript.id}...`);
        const cuts = await processTranscriptAI(originalText, provider as AIProvider, apiKey, niche, preset);
        
        await prisma.transcript.update({
          where: { id: transcript.id },
          data: {
            status: "COMPLETED",
            cuts: {
              create: cuts.map((cut) => ({
                text: cut.text,
                title: cut.title,
                category: cut.category,
                justification: cut.justification,
                totalScore: cut.score || Math.round((cut.hookScore + cut.retentionScore + cut.emotionScore) / 3),
                hookScore: cut.hookScore,
                retentionScore: cut.retentionScore,
                emotionScore: cut.emotionScore,
              }))
            }
          }
        });
        console.log(`[Worker] Transcript ${transcript.id} finalizado com sucesso!`);
      } catch (error: any) {
        console.error(`[Worker] Erro no transcript ${transcript.id}:`, error.message);
        await prisma.transcript.update({
          where: { id: transcript.id },
          data: { status: "ERROR" } // Idealmente salvar o log do erro também
        });
      }
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para Polling (verificar status do processamento)
app.get('/api/transcripts/:id', async (req, res) => {
  try {
    const transcript = await prisma.transcript.findUnique({
      where: { id: req.params.id },
      include: { cuts: true }
    });
    
    if (!transcript) {
      return res.status(404).json({ error: "Transcript não encontrado" });
    }
    
    res.json(transcript);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 API rodando na porta ${PORT}`);
});
