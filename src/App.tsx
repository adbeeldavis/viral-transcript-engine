import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, TrendingUp, Download, Play, CheckCircle, Settings, Loader } from 'lucide-react';
import './index.css';

export type AIProvider = 'openai' | 'openrouter';

export interface CutResult {
  id: string;
  title: string;
  score?: number;
  totalScore?: number;
  category: string;
  text: string;
  hookScore: number;
  retentionScore: number;
  emotionScore: number;
  justification: string;
}

function App() {
  const [step, setStep] = useState<'upload' | 'processing' | 'results'>('upload');
  
  // AI Settings State
  const [provider, setProvider] = useState<AIProvider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  
  // Content State
  const [transcript, setTranscript] = useState('');
  const [niche, setNiche] = useState('Negócios & Finanças');
  const [preset, setPreset] = useState('Viral Agressivo');
  
  // Results State
  const [cuts, setCuts] = useState<CutResult[]>([]);
  const [activeCut, setActiveCut] = useState<CutResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);

  const handleProcess = async () => {
    if (!transcript.trim()) {
      setError('Por favor, insira o texto do transcript.');
      return;
    }
    if (!apiKey.trim()) {
      setError(`Por favor, insira a sua API Key da ${provider === 'openai' ? 'OpenAI' : 'OpenRouter'} nas configurações.`);
      setShowSettings(true);
      return;
    }

    setError(null);
    setStep('processing');

    try {
      // 1. Inicia o Job Assíncrono no Backend
      const resStart = await fetch('http://localhost:3001/api/transcripts/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalText: transcript, provider, apiKey })
      });

      if (!resStart.ok) throw new Error("Erro ao iniciar o processamento na API.");
      
      const { transcriptId } = await resStart.json();

      // 2. Polling para checar o status
      const checkStatus = async () => {
        const resCheck = await fetch(`http://localhost:3001/api/transcripts/${transcriptId}`);
        const data = await resCheck.json();

        if (data.status === 'COMPLETED') {
          if (data.cuts.length === 0) {
            setError("A IA não retornou nenhum corte válido.");
            setStep('upload');
            return;
          }
          setCuts(data.cuts);
          setActiveCut(data.cuts[0]);
          setStep('results');
        } else if (data.status === 'ERROR') {
          setError("Ocorreu um erro no processamento em background (IA).");
          setStep('upload');
        } else {
          // Continua o Polling após 2 segundos
          setTimeout(checkStatus, 2000);
        }
      };

      setTimeout(checkStatus, 2000);

    } catch (err: any) {
      setError(err.message || 'Erro inesperado ao processar.');
      setStep('upload');
    }
  };

  const exportJSON = () => {
    if (!activeCut) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activeCut, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", `corte_${activeCut.id || 'export'}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handlePlaySimulation = () => {
    if (!activeCut) return;
    setIsPlaying(true);
    setActiveWordIndex(0);
  };

  // Simulação de renderização Chunk-by-Chunk
  useEffect(() => {
    if (isPlaying && activeCut) {
      const words = activeCut.text.split(' ');
      if (activeWordIndex < words.length - 1) {
        const timer = setTimeout(() => {
          setActiveWordIndex(prev => prev + 1);
        }, 300); // Avança uma palavra a cada 300ms
        return () => clearTimeout(timer);
      } else {
        const timer = setTimeout(() => {
          setIsPlaying(false);
          setActiveWordIndex(-1);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [isPlaying, activeWordIndex, activeCut]);

  return (
    <div className="app-container">
      <header>
        <div className="logo">
          <Sparkles size={28} />
          Viral Transcript Engine
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={() => setShowSettings(!showSettings)}>
            <Settings size={18} /> Configurações de IA
          </button>
          {step === 'results' && (
            <button className="btn" onClick={() => { setStep('upload'); setCuts([]); setActiveCut(null); }}>
              Novo Processamento
            </button>
          )}
        </div>
      </header>

      <main>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="glass-panel"
            style={{ marginBottom: '2rem', border: '1px solid var(--primary)' }}
          >
            <h3 style={{ marginBottom: '1rem' }}>Configurações de IA</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
              <div className="input-group">
                <label>Provedor de IA</label>
                <select value={provider} onChange={(e) => setProvider(e.target.value as AIProvider)}>
                  <option value="openai">OpenAI (GPT-4o)</option>
                  <option value="openrouter">OpenRouter (Claude/Outros)</option>
                </select>
              </div>
              <div className="input-group">
                <label>API Key ({provider === 'openai' ? 'OpenAI' : 'OpenRouter'})</label>
                <input 
                  type="password" 
                  placeholder="sk-..." 
                  value={apiKey} 
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
              * A chave é repassada com segurança ao backend local, sem persistência no banco.
            </p>
          </motion.div>
        )}

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '2rem', color: 'var(--accent-red)' }}>
            <strong>Erro: </strong> {error}
          </div>
        )}

        <AnimatePresence mode="wait">
          {step === 'upload' && (
            <motion.div 
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="glass-panel"
              style={{ maxWidth: '800px', margin: '2rem auto' }}
            >
              <h2 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Transforme Texto em Vídeos Virais</h2>
              
              <div className="input-group" style={{ marginBottom: '1.5rem' }}>
                <label>Cole seu Transcript aqui</label>
                <textarea 
                  rows={8} 
                  placeholder="Cole o texto bruto do seu vídeo ou podcast aqui..."
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  style={{ resize: 'vertical' }}
                ></textarea>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '1rem' }}>
                <div className="input-group">
                  <label>Nicho do Conteúdo</label>
                  <select value={niche} onChange={(e) => setNiche(e.target.value)}>
                    <option>Negócios & Finanças</option>
                    <option>Saúde & Bem-estar</option>
                    <option>Educação</option>
                    <option>Humor & Entretenimento</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Preset de Extração</label>
                  <select value={preset} onChange={(e) => setPreset(e.target.value)}>
                    <option>Viral Agressivo (Foco em Retenção)</option>
                    <option>Autoridade Premium (Foco em Credibilidade)</option>
                    <option>Storytelling Emocional</option>
                  </select>
                </div>
              </div>

              <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                <button className="btn" onClick={handleProcess} style={{ padding: '1rem 3rem', fontSize: '1.1rem' }}>
                  Analisar e Salvar no BD <TrendingUp size={20} />
                </button>
              </div>
            </motion.div>
          )}

          {step === 'processing' && (
            <motion.div 
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="glass-panel"
              style={{ maxWidth: '500px', margin: '8rem auto', textAlign: 'center', padding: '4rem 2rem' }}
            >
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                style={{ display: 'inline-block', marginBottom: '2rem' }}
              >
                <Loader size={64} color="var(--primary)" />
              </motion.div>
              <h3>Processamento Assíncrono...</h3>
              <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>
                O backend salvou o projeto no SQLite e a IA (Worker) está segmentando o texto em background. A UI não está travada!
              </p>
            </motion.div>
          )}

          {step === 'results' && activeCut && (
            <motion.div 
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="dashboard-grid"
            >
              {/* Esquerda: Lista de Cortes */}
              <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3>Cortes Sugeridos ({cuts.length})</h3>
                  <button className="btn btn-secondary" style={{ padding: '0.5rem' }} onClick={exportJSON}>
                    <Download size={18} /> Exportar JSON
                  </button>
                </div>
                
                <div style={{ overflowY: 'auto', paddingRight: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {cuts.map(cut => (
                    <div 
                      key={cut.id} 
                      className={`cut-card ${activeCut.id === cut.id ? 'active' : ''}`}
                      onClick={() => { setActiveCut(cut); setIsPlaying(false); setActiveWordIndex(-1); }}
                    >
                      <div className="cut-header">
                        <span className="cut-title">{cut.title}</span>
                        <span className="score-badge">🔥 {cut.totalScore || cut.score}</span>
                      </div>
                      <p className="cut-text">{cut.text}</p>
                      <div className="tags">
                        <span className="tag">{cut.category}</span>
                        <span className="tag">{cut.text.split(' ').length} palavras</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Direita: Editor e Detalhes */}
              <div className="glass-panel editor-panel">
                <div className="video-preview" style={{ cursor: isPlaying ? 'default' : 'pointer' }} onClick={!isPlaying ? handlePlaySimulation : undefined}>
                  {!isPlaying && (
                    <motion.div whileHover={{ scale: 1.1 }}>
                      <Play size={48} color="rgba(255,255,255,0.7)" />
                    </motion.div>
                  )}
                  <div style={{ 
                    position: 'absolute', bottom: '2rem', width: '85%', textAlign: 'center', 
                    fontSize: '1.4rem', fontWeight: '900', textShadow: '0 3px 6px rgba(0,0,0,0.9)',
                    fontFamily: 'sans-serif', lineHeight: '1.2'
                  }}>
                    {isPlaying ? (
                      activeCut.text.split(' ').map((word, i) => (
                        <motion.span 
                          key={i}
                          initial={{ opacity: 0.3, scale: 0.9 }}
                          animate={{ 
                            opacity: i <= activeWordIndex ? 1 : 0.3,
                            color: i === activeWordIndex ? 'var(--primary)' : '#fff',
                            scale: i === activeWordIndex ? 1.1 : 1
                          }}
                          style={{ display: 'inline-block', marginRight: '0.3rem', transition: 'color 0.1s ease' }}
                        >
                          {word}
                        </motion.span>
                      ))
                    ) : (
                      <>
                        <span className="highlight-word">{activeCut.text.split(' ').slice(0, 3).join(' ')}</span> {activeCut.text.split(' ').slice(3, 7).join(' ')}...
                        <br/><span style={{ fontSize: '0.8rem', opacity: 0.7, fontWeight: 'normal' }}>Clique para simular legenda</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="sub-scores">
                  <div className="score-item">
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span>Gancho (Hook)</span>
                      <span>{activeCut.hookScore}/100</span>
                    </div>
                    <div className="score-bar-bg">
                      <div className="score-bar-fill" style={{ width: `${activeCut.hookScore}%` }}></div>
                    </div>
                  </div>
                  <div className="score-item">
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span>Retenção</span>
                      <span>{activeCut.retentionScore}/100</span>
                    </div>
                    <div className="score-bar-bg">
                      <div className="score-bar-fill" style={{ width: `${activeCut.retentionScore}%`, background: 'var(--accent-orange)' }}></div>
                    </div>
                  </div>
                </div>

                <div className="justification-box">
                  <strong>Por que este corte é viral?</strong><br />
                  {activeCut.justification}
                </div>

                <div className="input-group">
                  <label>Texto do Corte (Editável)</label>
                  <textarea rows={3} value={activeCut.text} onChange={(e) => setActiveCut({...activeCut, text: e.target.value})}></textarea>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default App;
