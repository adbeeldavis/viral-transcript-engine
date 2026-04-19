import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, TrendingUp, Download, Play, CheckCircle, Settings, Loader, Flame, LayoutTemplate } from 'lucide-react';
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
      const resStart = await fetch('http://localhost:3001/api/transcripts/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalText: transcript, provider, apiKey })
      });

      if (!resStart.ok) throw new Error("Erro ao iniciar o processamento na API.");
      
      const { transcriptId } = await resStart.json();

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
    downloadAnchorNode.setAttribute("href", dataStr);
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

  useEffect(() => {
    if (isPlaying && activeCut) {
      const words = activeCut.text.split(' ');
      if (activeWordIndex < words.length - 1) {
        const timer = setTimeout(() => {
          setActiveWordIndex(prev => prev + 1);
        }, 300);
        return () => clearTimeout(timer);
      } else {
        const timer = setTimeout(() => {
          setIsPlaying(false);
          setActiveWordIndex(-1);
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [isPlaying, activeWordIndex, activeCut]);

  return (
    <div className="app-container">
      <header>
        <div className="logo">
          <Sparkles size={32} color="var(--primary)" />
          Viral Transcript Engine
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={() => setShowSettings(!showSettings)}>
            <Settings size={18} /> Configurações de IA
          </button>
          {step === 'results' && (
            <button className="btn" onClick={() => { setStep('upload'); setCuts([]); setActiveCut(null); }}>
              <LayoutTemplate size={18} /> Novo Projeto
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
            style={{ marginBottom: '2rem' }}
          >
            <h3 style={{ marginBottom: '1.5rem', color: 'var(--primary)' }}>⚙️ Configurações de IA</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
              <div className="input-group">
                <label>Provedor de Inteligência</label>
                <select value={provider} onChange={(e) => setProvider(e.target.value as AIProvider)}>
                  <option value="openai">OpenAI (GPT-4o)</option>
                  <option value="openrouter">OpenRouter (Claude 3.5 Sonnet)</option>
                </select>
              </div>
              <div className="input-group">
                <label>Chave Secreta (API Key)</label>
                <input 
                  type="password" 
                  placeholder={provider === 'openai' ? 'sk-proj-...' : 'sk-or-v1-...'}
                  value={apiKey} 
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
            </div>
          </motion.div>
        )}

        {error && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'rgba(239, 35, 60, 0.1)', border: '1px solid var(--accent-red)', padding: '1.25rem', borderRadius: '1rem', marginBottom: '2rem', color: '#ff4d4d', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '1.5rem' }}>⚠️</span>
            <div>
              <strong>Erro de Processamento:</strong> {error}
            </div>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {step === 'upload' && (
            <motion.div 
              key="upload"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30, filter: 'blur(10px)' }}
              transition={{ duration: 0.4 }}
              className="glass-panel"
              style={{ maxWidth: '850px', margin: '2rem auto' }}
            >
              <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                <h2 className="text-gradient" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>A Ciência por trás da Viralização.</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>Cole seu texto bruto e nossa IA extrairá os momentos de maior retenção.</p>
              </div>
              
              <div className="input-group" style={{ marginBottom: '2rem' }}>
                <textarea 
                  rows={10} 
                  placeholder="Cole o transcript do vídeo, aula, podcast ou reunião..."
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  style={{ resize: 'vertical', fontSize: '1.1rem', padding: '1.5rem' }}
                ></textarea>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '1rem' }}>
                <div className="input-group">
                  <label>Contexto / Nicho</label>
                  <select value={niche} onChange={(e) => setNiche(e.target.value)}>
                    <option>Negócios & Finanças</option>
                    <option>Saúde & Bem-estar</option>
                    <option>Marketing Digital</option>
                    <option>Humor & Entretenimento</option>
                    <option>Desenvolvimento Pessoal</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Estratégia Neurológica</label>
                  <select value={preset} onChange={(e) => setPreset(e.target.value)}>
                    <option>Viral Agressivo (Alta Tensão)</option>
                    <option>Autoridade Premium (Alta Credibilidade)</option>
                    <option>Storytelling Emocional (Alta Conexão)</option>
                  </select>
                </div>
              </div>

              <div style={{ marginTop: '3rem', textAlign: 'center' }}>
                <button className="btn" onClick={handleProcess} style={{ padding: '1.25rem 4rem', fontSize: '1.2rem' }}>
                  Analisar Conteúdo <TrendingUp size={24} />
                </button>
              </div>
            </motion.div>
          )}

          {step === 'processing' && (
            <motion.div 
              key="processing"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="glass-panel"
              style={{ maxWidth: '500px', margin: '8rem auto', textAlign: 'center', padding: '5rem 3rem' }}
            >
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                style={{ display: 'inline-block', marginBottom: '2.5rem' }}
              >
                <Loader size={72} color="var(--primary)" />
              </motion.div>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Processamento Neural Ativo</h3>
              <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
                O sistema está lendo o texto, identificando gatilhos emocionais, quebras de padrão e calculando o potencial de retenção em background...
              </p>
            </motion.div>
          )}

          {step === 'results' && activeCut && (
            <motion.div 
              key="results"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="dashboard-grid"
            >
              {/* Esquerda: Lista de Cortes */}
              <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ fontSize: '1.4rem' }}>Extratos Ranqueados</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{cuts.length} cortes com potencial encontrados</p>
                  </div>
                  <button className="btn btn-secondary" onClick={exportJSON}>
                    <Download size={18} /> Exportar
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
                        <span className="score-badge"><Flame size={16} /> {cut.totalScore || cut.score}</span>
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
              <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                
                {/* Mockup do Celular */}
                <div className="phone-mockup" style={{ cursor: isPlaying ? 'default' : 'pointer' }} onClick={!isPlaying ? handlePlaySimulation : undefined}>
                  <div className="phone-notch"></div>
                  
                  {!isPlaying && (
                    <motion.div whileHover={{ scale: 1.1 }} style={{ zIndex: 2 }}>
                      <div style={{ background: 'var(--primary)', padding: '1rem', borderRadius: '50%', boxShadow: '0 0 30px var(--primary-glow)' }}>
                        <Play size={40} color="#fff" fill="#fff" />
                      </div>
                    </motion.div>
                  )}
                  
                  <div style={{ 
                    position: 'absolute', bottom: '15%', width: '85%', textAlign: 'center', 
                    fontSize: '1.75rem', fontWeight: '900', textShadow: '0 4px 12px rgba(0,0,0,1)',
                    fontFamily: 'Outfit, sans-serif', lineHeight: '1.15', zIndex: 1
                  }}>
                    {isPlaying ? (
                      activeCut.text.split(' ').map((word, i) => (
                        <motion.span 
                          key={i}
                          initial={{ opacity: 0.2, y: 10, scale: 0.9 }}
                          animate={{ 
                            opacity: i <= activeWordIndex ? 1 : 0.2,
                            color: i === activeWordIndex ? 'var(--accent-green)' : '#fff',
                            scale: i === activeWordIndex ? 1.15 : 1,
                            y: i === activeWordIndex ? -5 : 0
                          }}
                          style={{ display: 'inline-block', marginRight: '0.4rem', transition: 'all 0.1s ease' }}
                        >
                          {word.toUpperCase()}
                        </motion.span>
                      ))
                    ) : (
                      <div style={{ background: 'rgba(0,0,0,0.5)', padding: '1rem', borderRadius: '1rem', backdropFilter: 'blur(5px)' }}>
                        <span className="highlight-word">{activeCut.text.split(' ').slice(0, 3).join(' ').toUpperCase()}</span> {activeCut.text.split(' ').slice(3, 7).join(' ').toUpperCase()}...
                        <div style={{ fontSize: '0.9rem', opacity: 0.7, fontWeight: 'normal', marginTop: '1rem', letterSpacing: '1px' }}>CLIQUE PARA VER A LEGENDA DINÂMICA</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sub Scores Visuals */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  <div className="score-item">
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600 }}>
                      <span style={{ color: 'var(--secondary)' }}>Abertura (Hook)</span>
                      <span>{activeCut.hookScore}/100</span>
                    </div>
                    <div className="score-bar-bg">
                      <div className="score-bar-fill" style={{ width: `${activeCut.hookScore}%` }}></div>
                    </div>
                  </div>
                  <div className="score-item">
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600 }}>
                      <span style={{ color: 'var(--accent-green)' }}>Retenção Final</span>
                      <span>{activeCut.retentionScore}/100</span>
                    </div>
                    <div className="score-bar-bg">
                      <div className="score-bar-fill" style={{ width: `${activeCut.retentionScore}%`, background: 'linear-gradient(90deg, #00f5d4, #06d6a0)' }}></div>
                    </div>
                  </div>
                </div>

                <div className="justification-box">
                  <strong style={{ color: 'var(--primary)', display: 'block', marginBottom: '0.5rem' }}>Análise Cognitiva da IA:</strong>
                  {activeCut.justification}
                </div>

                <div className="input-group">
                  <label>Texto Bruto do Corte (Editável)</label>
                  <textarea rows={3} value={activeCut.text} onChange={(e) => setActiveCut({...activeCut, text: e.target.value})}></textarea>
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: 'auto', paddingTop: '1rem' }}>
                  <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>Descartar</button>
                  <button className="btn btn-success" style={{ flex: 2, justifyContent: 'center', color: '#000' }}>
                    <CheckCircle size={20} /> Aprovar para Edição
                  </button>
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
