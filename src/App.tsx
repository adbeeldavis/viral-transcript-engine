import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, TrendingUp, Download, Play, CheckCircle, Settings } from 'lucide-react';
import { processTranscript, CutResult, AIProvider } from './services/ai';
import './index.css';

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
      const generatedCuts = await processTranscript(transcript, provider, apiKey);
      if (generatedCuts.length === 0) {
        throw new Error("Nenhum corte foi gerado pela IA.");
      }
      setCuts(generatedCuts);
      setActiveCut(generatedCuts[0]);
      setStep('results');
    } catch (err: any) {
      setError(err.message || 'Erro inesperado ao processar.');
      setStep('upload');
    }
  };

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
            <button className="btn" onClick={() => { setStep('upload'); setCuts([]); }}>
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
              * Suas chaves de API não são armazenadas em nenhum banco de dados, elas residem apenas na memória do seu navegador.
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
                  Analisar com {provider === 'openai' ? 'OpenAI' : 'OpenRouter'} <TrendingUp size={20} />
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
                <Sparkles size={64} color="var(--primary)" />
              </motion.div>
              <h3>Motor de IA Trabalhando...</h3>
              <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>
                Enviando para {provider === 'openai' ? 'OpenAI' : 'OpenRouter'} e calculando o score de viralização. Aguarde...
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
                  <button className="btn btn-secondary" style={{ padding: '0.5rem' }}>
                    <Download size={18} /> Exportar
                  </button>
                </div>
                
                <div style={{ overflowY: 'auto', paddingRight: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {cuts.map(cut => (
                    <div 
                      key={cut.id} 
                      className={`cut-card ${activeCut.id === cut.id ? 'active' : ''}`}
                      onClick={() => setActiveCut(cut)}
                    >
                      <div className="cut-header">
                        <span className="cut-title">{cut.title}</span>
                        <span className="score-badge">🔥 {cut.score || Math.round((cut.hookScore + cut.retentionScore + cut.emotionScore) / 3)}</span>
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
                <div className="video-preview">
                  <Play size={48} color="rgba(255,255,255,0.5)" />
                  <div style={{ position: 'absolute', bottom: '2rem', width: '80%', textAlign: 'center', fontSize: '1.2rem', fontWeight: 'bold', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                    <span className="highlight-word">{activeCut.text.split(' ').slice(0, 3).join(' ')}</span> {activeCut.text.split(' ').slice(3, 7).join(' ')}...
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
                  <textarea rows={4} value={activeCut.text} onChange={(e) => setActiveCut({...activeCut, text: e.target.value})}></textarea>
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: 'auto' }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }}>Rejeitar</button>
                  <button className="btn" style={{ flex: 2, background: 'var(--accent-green)', color: '#000' }}>
                    <CheckCircle size={18} /> Aprovar Corte
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
