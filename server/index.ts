import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Criar um novo projeto
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

// Listar projetos
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

// Salvar um Transcript e seus Cortes
app.post('/api/transcripts', async (req, res) => {
  try {
    const { projectId, originalText, cuts } = req.body;
    
    // Validar se o projeto existe
    const projectExists = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!projectExists) {
      return res.status(404).json({ error: "Projeto não encontrado" });
    }

    const transcript = await prisma.transcript.create({
      data: {
        projectId,
        originalText,
        cuts: {
          create: cuts.map((cut: any) => ({
            text: cut.text,
            title: cut.title,
            category: cut.category,
            justification: cut.justification,
            totalScore: cut.score,
            hookScore: cut.hookScore,
            retentionScore: cut.retentionScore,
            emotionScore: cut.emotionScore,
          }))
        }
      },
      include: {
        cuts: true
      }
    });

    res.json(transcript);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 API rodando na porta ${PORT}`);
});
