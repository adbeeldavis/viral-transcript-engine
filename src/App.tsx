import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, TrendingUp, Download, Play, CheckCircle,
  Settings, Loader, Flame, LayoutTemplate, X, Upload,
  ChevronDown, ChevronUp, Copy, ExternalLink
} from 'lucide-react';
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

const NICHES = ['Negócios & Finanças', 'Saúde & Bem-Estar', 'Marketing Digital', 'Humor & Entretenimento', 'Desenvolvimento Pessoal', 'Educação', 'Espiritualidade', 'Relacionamentos', 'Tecnologia', 'Games'];
const PRESETS = ['Viral Agressivo (Alta Tensão)', 'Autoridade Premium (Alta Credibilidade)', 'Storytelling Emocional (Alta Conexão)', 'Cortes para Podcast', 'Cortes para Entrevistas', 'Cortes para Vendas'];

export default function App() {
  const [step, setStep] = useState<'upload' | 'processing' | 'results'>('upload');
  const [provider, setProvider] = useState<AIProvider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [niche, setNiche] = useState(NICHES[0]);
  const [preset, setPreset] = useState(PRESETS[0]);
  const [cuts, setCuts] = useState<CutResult[]>([]);
  const [activeCut, setActiveCut] = useState<CutResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const [isDragging, setIsDragging] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [copied, setCopied] = useState(false);

  const PROCESSING_STEPS = [
    'Ingerindo o transcript...',
    'Limpando e normalizando texto...',
    'Segmentando em blocos narrativos...',
    'Detectando gatilhos emocionais...',
    'Calculando Score Viral...',
    'Montando os cortes finais...',
  ];

  useEffect(() => {
    if (step === 'processing') {
      const interval = setInterval(() => {
        setProcessingStep(prev => (prev < PROCESSING_STEPS.length - 1 ? prev + 1 : prev));
      }, 1800);
      return () => clearInterval(interval);
    }
  }, [step]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setTranscript(ev.target?.result as string || '');
    reader.readAsText(file);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setTranscript(ev.target?.result as string || '');
    reader.readAsText(file);
  };

  const handleProcess = async () => {
    if (!transcript.trim()) { setError('Insira o texto do transcript.'); return; }
    if (!apiKey.trim()) { setError('Insira sua API Key nas ⚙️ Configurações de IA.'); setShowSettings(true); return; }
    setError(null);
    setProcessingStep(0);
    setStep('processing');

    try {
      const res = await fetch('/api/transcripts/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalText: transcript, provider, apiKey, niche, preset }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Erro ao iniciar processamento.');
      }

      const { transcriptId } = json;

      // Polling
      const poll = async () => {
        const r = await fetch(`/api/transcripts/${transcriptId}`);
        const d = await r.json();
        if (d.status === 'COMPLETED') {
          if (!d.cuts?.length) { setError('Nenhum corte extraído. Tente um texto maior.'); setStep('upload'); return; }
          setCuts(d.cuts);
          setActiveCut(d.cuts[0]);
          setStep('results');
        } else if (d.status === 'ERROR') {
          setError(d.error || 'Erro no processamento pela IA. Verifique sua API Key.');
          setStep('upload');
        } else {
          setTimeout(poll, 2000);
        }
      };
      setTimeout(poll, 3000);
    } catch (err: any) {
      setError(err.message);
      setStep('upload');
    }
  };

  const exportJSON = () => {
    if (!cuts.length) return;
    const blob = new Blob([JSON.stringify(cuts, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `viral_cuts_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Simulação de legenda chunk-by-chunk
  useEffect(() => {
    if (!isPlaying || !activeCut) return;
    const words = activeCut.text.split(' ');
    if (activeWordIndex >= words.length - 1) {
      const t = setTimeout(() => { setIsPlaying(false); setActiveWordIndex(-1); }, 1500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setActiveWordIndex(p => p + 1), 280);
    return () => clearTimeout(t);
  }, [isPlaying, activeWordIndex, activeCut]);

  const getScore = (cut: CutResult) => cut.totalScore ?? cut.score ?? Math.round(((cut.hookScore || 0) + (cut.retentionScore || 0) + (cut.emotionScore || 0)) / 3);

  const scoreColor = (s: number) => s >= 85 ? 'var(--accent-green)' : s >= 70 ? 'var(--accent-orange)' : 'var(--accent-red)';

  return (
    <div className="app-container">
      {/* Header */}
      <header>
        <div className="logo">
          <Sparkles size={30} color="#9d4edd" />
          <span>Viral Transcript Engine</span>
        </div>
        <div className="header-actions">
          <button className={`btn btn-secondary ${showSettings ? 'active' : ''}`} onClick={() => setShowSettings(p => !p)}>
            <Settings size={16} /> Configurações de IA
            {showSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {step === 'results' && (
            <button className="btn" onClick={() => { setStep('upload'); setCuts([]); setActiveCut(null); setError(null); }}>
              <LayoutTemplate size={16} /> Novo Projeto
            </button>
          )}
        </div>
      </header>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-panel settings-panel"
          >
            <div className="settings-header">
              <h3>⚙️ Configurações de Inteligência Artificial</h3>
              <button className="icon-btn" onClick={() => setShowSettings(false)}><X size={18} /></button>
            </div>
            <div className="settings-grid">
              <div className="input-group">
                <label>Provedor de IA</label>
                <div className="provider-toggle">
                  <button className={`toggle-btn ${provider === 'openai' ? 'active' : ''}`} onClick={() => setProvider('openai')}>
                    OpenAI (GPT-4o)
                  </button>
                  <button className={`toggle-btn ${provider === 'openrouter' ? 'active' : ''}`} onClick={() => setProvider('openrouter')}>
                    OpenRouter (Claude)
                  </button>
                </div>
              </div>
              <div className="input-group">
                <label>
                  API Key — {provider === 'openai' ? 'OpenAI' : 'OpenRouter'}
                  <a href={provider === 'openai' ? 'https://platform.openai.com/api-keys' : 'https://openrouter.ai/keys'} target="_blank" rel="noreferrer" className="label-link">
                    <ExternalLink size={12} /> Obter chave
                  </a>
                </label>
                <input
                  type="password"
                  placeholder={provider === 'openai' ? 'sk-proj-...' : 'sk-or-v1-...'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                />
              </div>
            </div>
            <p className="settings-note">🔒 Sua chave é enviada diretamente para a API — não armazenamos nenhum dado.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Banner */}
      <AnimatePresence>
        {error && (
          <motion.div className="error-banner" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <span>⚠️ {error}</span>
            <button className="icon-btn" onClick={() => setError(null)}><X size={16} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <main>
        <AnimatePresence mode="wait">
          {/* ── UPLOAD STEP ── */}
          {step === 'upload' && (
            <motion.div key="upload" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }} transition={{ duration: 0.35 }}>
              <div className="upload-page">
                <div className="upload-hero">
                  <h1>A Ciência<br />por trás da Viralização</h1>
                  <p>Cole ou arraste seu transcript. A IA extrai os momentos de maior retenção automaticamente.</p>
                </div>

                <div className="glass-panel upload-card">
                  {/* Drop Zone */}
                  <div
                    className={`drop-zone ${isDragging ? 'dragging' : ''}`}
                    onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                  >
                    <Upload size={28} color="var(--primary)" />
                    <span>Arraste um arquivo <strong>.txt .srt .vtt .md</strong> ou</span>
                    <label className="file-btn">
                      Escolher arquivo
                      <input type="file" accept=".txt,.srt,.vtt,.md,.json" onChange={handleFileInput} hidden />
                    </label>
                  </div>

                  <div className="divider"><span>ou cole o texto</span></div>

                  <textarea
                    className="transcript-input"
                    rows={9}
                    placeholder="Cole aqui o transcript bruto do vídeo, podcast, aula ou reunião..."
                    value={transcript}
                    onChange={e => setTranscript(e.target.value)}
                  />

                  {transcript && (
                    <div className="transcript-meta">
                      {transcript.split(' ').filter(Boolean).length} palavras · ~{Math.round(transcript.split(' ').filter(Boolean).length / 2.5)} segundos de fala
                    </div>
                  )}

                  {/* Opções */}
                  <div className="options-grid">
                    <div className="input-group">
                      <label>Nicho / Contexto</label>
                      <select value={niche} onChange={e => setNiche(e.target.value)}>
                        {NICHES.map(n => <option key={n}>{n}</option>)}
                      </select>
                    </div>
                    <div className="input-group">
                      <label>Estratégia Neurológica</label>
                      <select value={preset} onChange={e => setPreset(e.target.value)}>
                        {PRESETS.map(p => <option key={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>

                  <button className="btn btn-cta" onClick={handleProcess}>
                    Analisar com {provider === 'openai' ? 'OpenAI' : 'OpenRouter'}
                    <TrendingUp size={20} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── PROCESSING STEP ── */}
          {step === 'processing' && (
            <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="processing-screen">
              <div className="glass-panel processing-card">
                <motion.div className="loader-ring" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}>
                  <Loader size={56} color="var(--primary)" />
                </motion.div>
                <h2>Pipeline Neural Ativo</h2>
                <div className="processing-steps">
                  {PROCESSING_STEPS.map((s, i) => (
                    <div key={i} className={`proc-step ${i < processingStep ? 'done' : i === processingStep ? 'active' : 'pending'}`}>
                      <div className="proc-dot" />
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
                <p className="proc-note">Usando {provider === 'openai' ? 'OpenAI GPT-4o' : 'Claude 3.5 Sonnet'} via {provider === 'openrouter' ? 'OpenRouter' : 'API direta'}...</p>
              </div>
            </motion.div>
          )}

          {/* ── RESULTS STEP ── */}
          {step === 'results' && activeCut && (
            <motion.div key="results" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="results-layout">

              {/* Coluna Esquerda — Lista de Cortes */}
              <div className="glass-panel cuts-panel">
                <div className="cuts-panel-header">
                  <div>
                    <h2>Extratos Ranqueados</h2>
                    <p className="sub-text">{cuts.length} cortes · ordenados por potencial viral</p>
                  </div>
                  <button className="btn btn-secondary" onClick={exportJSON}>
                    <Download size={16} /> Exportar JSON
                  </button>
                </div>

                <div className="cuts-list">
                  {[...cuts].sort((a, b) => getScore(b) - getScore(a)).map(cut => (
                    <div
                      key={cut.id}
                      className={`cut-card ${activeCut.id === cut.id ? 'active' : ''}`}
                      onClick={() => { setActiveCut(cut); setIsPlaying(false); setActiveWordIndex(-1); }}
                    >
                      <div className="cut-card-top">
                        <span className="cut-title">{cut.title}</span>
                        <span className="score-chip" style={{ background: `${scoreColor(getScore(cut))}22`, color: scoreColor(getScore(cut)), border: `1px solid ${scoreColor(getScore(cut))}44` }}>
                          <Flame size={13} /> {getScore(cut)}
                        </span>
                      </div>
                      <p className="cut-preview">{cut.text}</p>
                      <div className="cut-tags">
                        <span className="tag">{cut.category}</span>
                        <span className="tag tag-dim">{cut.text.split(' ').length} palavras</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Coluna Direita — Editor + Preview */}
              <div className="detail-column">

                {/* Phone mockup */}
                <div className="glass-panel phone-panel">
                  <div className="phone-wrap">
                    <div
                      className="phone-body"
                      onClick={!isPlaying ? () => { setIsPlaying(true); setActiveWordIndex(0); } : undefined}
                      style={{ cursor: isPlaying ? 'default' : 'pointer' }}
                    >
                      <div className="phone-notch" />
                      <div className="phone-screen">
                        {!isPlaying && (
                          <motion.div className="play-overlay" whileHover={{ scale: 1.1 }}>
                            <div className="play-btn-circle">
                              <Play size={36} fill="#fff" color="#fff" />
                            </div>
                            <span className="play-hint">Simular legenda</span>
                          </motion.div>
                        )}
                        <div className="subtitle-area">
                          {isPlaying
                            ? activeCut.text.split(' ').map((word, i) => (
                              <motion.span
                                key={i}
                                className="subtitle-word"
                                animate={{
                                  opacity: i <= activeWordIndex ? 1 : 0.25,
                                  color: i === activeWordIndex ? 'var(--accent-green)' : '#fff',
                                  scale: i === activeWordIndex ? 1.12 : 1,
                                }}
                                transition={{ duration: 0.1 }}
                              >
                                {word.toUpperCase()}
                              </motion.span>
                            ))
                            : (
                              <div className="subtitle-static">
                                <span className="subtitle-highlight">{activeCut.text.split(' ').slice(0, 4).join(' ').toUpperCase()}</span>
                                {' '}{activeCut.text.split(' ').slice(4, 8).join(' ').toUpperCase()}...
                              </div>
                            )
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Scores */}
                <div className="glass-panel scores-panel">
                  <h3 className="panel-title">Score de Viralização</h3>
                  <div className="score-circle-wrap">
                    <div className="score-circle" style={{ '--pct': getScore(activeCut) } as any}>
                      <span className="score-number">{getScore(activeCut)}</span>
                      <span className="score-label">/ 100</span>
                    </div>
                  </div>
                  <div className="score-bars">
                    {[
                      { label: 'Abertura (Hook)', val: activeCut.hookScore, color: 'var(--secondary)' },
                      { label: 'Retenção', val: activeCut.retentionScore, color: 'var(--accent-green)' },
                      { label: 'Intensidade Emocional', val: activeCut.emotionScore, color: 'var(--accent-orange)' },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="score-bar-item">
                        <div className="score-bar-label">
                          <span>{label}</span><span>{val}</span>
                        </div>
                        <div className="score-bar-track">
                          <motion.div className="score-bar-fill" initial={{ width: 0 }} animate={{ width: `${val}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} style={{ background: color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Justificativa */}
                <div className="glass-panel justification-panel">
                  <h3 className="panel-title">Análise Cognitiva da IA</h3>
                  <p className="justification-text">{activeCut.justification}</p>
                </div>

                {/* Editor do Texto */}
                <div className="glass-panel editor-panel">
                  <div className="editor-header">
                    <h3 className="panel-title">Texto do Corte</h3>
                    <button className="icon-btn" title="Copiar" onClick={() => copyText(activeCut.text)}>
                      {copied ? <CheckCircle size={16} color="var(--accent-green)" /> : <Copy size={16} />}
                    </button>
                  </div>
                  <textarea
                    className="editor-textarea"
                    rows={4}
                    value={activeCut.text}
                    onChange={e => setActiveCut({ ...activeCut, text: e.target.value })}
                  />
                  <div className="editor-actions">
                    <button className="btn btn-danger">Descartar</button>
                    <button className="btn btn-success">
                      <CheckCircle size={16} /> Aprovar Corte
                    </button>
                  </div>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
