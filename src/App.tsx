import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, TrendingUp, Download, Play, CheckCircle,
  Settings, Loader, Flame, LayoutTemplate, X, Upload,
  Clock, History, ChevronRight, Copy
} from 'lucide-react';
import './index.css';

export type AIProvider = 'openai' | 'openrouter';

export interface CutResult {
  id: string;
  title: string;
  headline?: string;
  score?: number;
  totalScore?: number;
  category: string;
  cutTypes?: string[];
  text: string;
  // Scores básicos
  hookScore: number;
  retentionScore: number;
  emotionScore: number;
  // Scores avançados
  clarityScore?: number;
  shareScore?: number;
  closingScore?: number;
  // Emoções e gatilhos
  primaryEmotion?: string;
  secondaryEmotion?: string;
  dominantTrigger?: string;
  // Conteúdo
  justification: string;
  narrativeArc?: string;
  editingNotes?: string;
  captionShort?: string;
  captionCTA?: string;
  // Versões por plataforma
  tiktokVersion?: string;
  reelsVersion?: string;
  shortsVersion?: string;
  xVersion?: string;
  // Metadados
  risk?: string;
  platform?: string;
  startSec: number;
  endSec: number;
  startFormatted: string;
  endFormatted: string;
  durationSec: number;
}

const NICHES = ['Negócios & Finanças','Saúde & Bem-Estar','Marketing Digital','Humor & Entretenimento','Desenvolvimento Pessoal','Educação','Espiritualidade','Relacionamentos','Tecnologia','Games'];
const PRESETS = ['Viral Agressivo (Alta Tensão)','Autoridade Premium (Alta Credibilidade)','Storytelling Emocional (Alta Conexão)','Cortes para Podcast','Cortes para Entrevistas','Cortes para Vendas'];

const CATEGORY_COLORS: Record<string, string> = {
  'Revelação': '#ff6b6b',
  'Storytelling': '#a78bfa',
  'Opinião Polêmica': '#f59e0b',
  'Dor-Solução': '#34d399',
  'Autoridade': '#60a5fa',
};

function getCategoryColor(cat: string): string {
  for (const key of Object.keys(CATEGORY_COLORS)) {
    if (cat?.toLowerCase().includes(key.toLowerCase())) return CATEGORY_COLORS[key];
  }
  return '#9d4edd';
}

function getScore(cut: CutResult): number {
  return cut.totalScore ?? cut.score ?? Math.round(((cut.hookScore||0)+(cut.retentionScore||0)+(cut.emotionScore||0))/3);
}

export default function App() {
  const [step, setStep] = useState<'upload'|'processing'|'results'>('upload');
  const [provider, setProvider] = useState<AIProvider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [niche, setNiche] = useState(NICHES[0]);
  const [preset, setPreset] = useState(PRESETS[0]);
  const [cuts, setCuts] = useState<CutResult[]>([]);
  const [activeCut, setActiveCut] = useState<CutResult|null>(null);
  const [error, setError] = useState<string|null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const [isDragging, setIsDragging] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [keySaved, setKeySaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'analysis'|'platforms'|'editing'|'caption'>('analysis');
  // Seletor de cortes
  const [cutCount, setCutCount] = useState(10);
  const [wordCount, setWordCount] = useState(0);
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [transcriptId, setTranscriptId] = useState<string|null>(null);
  // Gerador de legenda
  const [capPlatform, setCapPlatform] = useState('TikTok');
  const [capObjective, setCapObjective] = useState('Engajamento');
  const [capCTAType, setCapCTAType] = useState('Seguir');
  const [capCTAText, setCapCTAText] = useState('');
  const [capTone, setCapTone] = useState('Casual');
  const [capHashtags, setCapHashtags] = useState(true);
  const [capContext, setCapContext] = useState('');
  const [capResult, setCapResult] = useState('');
  const [capLoading, setCapLoading] = useState(false);

  const STEPS = ['Ingerindo transcript...','Limpando e normalizando texto...','Segmentando blocos narrativos...','Detectando gatilhos emocionais...','Calculando Score Viral...','Estimando timestamps...','Montando cortes finais...'];

  // Carrega API Key salva e histórico ao iniciar
  useEffect(() => {
    const savedKey = localStorage.getItem(`apiKey_${provider}`);
    if (savedKey) setApiKey(savedKey);
    fetch('/api/settings/apikeys').then(r=>r.ok?r.json():null).then(keys=>{
      if (keys?.[provider]) setApiKey(keys[provider]);
    }).catch(()=>{});
  }, [provider]);

  useEffect(()=>{
    if (showHistory) {
      fetch('/api/history').then(r=>r.json()).then(setHistory).catch(()=>setHistory([]));
    }
  },[showHistory]);

  // Animação de steps durante processamento
  useEffect(()=>{
    if(step==='processing'){
      const iv = setInterval(()=>setProcessingStep(p=>p<STEPS.length-1?p+1:p),1700);
      return ()=>clearInterval(iv);
    }
  },[step]);

  // Salva API key automaticamente quando muda
  const saveApiKey = useCallback(async (key: string, prov: AIProvider) => {
    localStorage.setItem(`apiKey_${prov}`, key);
    try {
      await fetch('/api/settings/apikey', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ provider: prov, apiKey: key })
      });
    } catch {}
  }, []);

  const handleApiKeyChange = (val: string) => {
    setApiKey(val);
    setKeySaved(false); // reseta indicador ao editar
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return;
    await saveApiKey(apiKey, provider);
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 3000);
  };

  // Legenda chunk-by-chunk
  useEffect(()=>{
    if(!isPlaying||!activeCut) return;
    const words = activeCut.text.split(' ');
    if(activeWordIndex>=words.length-1){
      const t=setTimeout(()=>{setIsPlaying(false);setActiveWordIndex(-1);},1500);
      return ()=>clearTimeout(t);
    }
    const t=setTimeout(()=>setActiveWordIndex(p=>p+1),260);
    return ()=>clearTimeout(t);
  },[isPlaying,activeWordIndex,activeCut]);

  const handleDrop = useCallback((e: React.DragEvent)=>{
    e.preventDefault(); setIsDragging(false);
    const file=e.dataTransfer.files?.[0]; if(!file) return;
    const r=new FileReader();
    r.onload=ev=>{
      const text = ev.target?.result as string||'';
      setTranscript(text);
      const wc = text.trim().split(/\s+/).filter(Boolean).length;
      setWordCount(wc);
      setIsUnlimited(wc > 2000);
    };
    r.readAsText(file);
  },[]);

  const handleTranscriptChange = (val: string) => {
    setTranscript(val);
    const wc = val.trim().split(/\s+/).filter(Boolean).length;
    setWordCount(wc);
    setIsUnlimited(wc > 2000);
  };

  const handleProcess = async ()=>{
    if(!transcript.trim()){ setError('Insira o transcript.'); return; }
    if(!apiKey.trim()){ setError('Insira sua API Key nas ⚙️ Configurações.'); setShowSettings(true); return; }
    setError(null); setProcessingStep(0); setStep('processing');
    try {
      const res = await fetch('/api/transcripts/process',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ originalText:transcript, provider, apiKey, niche, preset, cutCount })
      });
      const json = await res.json();
      if(!res.ok) throw new Error(json.error||'Erro ao iniciar processamento.');
      const { transcriptId: tid } = json;
      setTranscriptId(tid);
      const poll = async ()=>{
        const r = await fetch(`/api/transcripts/${tid}`);
        const d = await r.json();
        if(d.status==='COMPLETED'){
          if(!d.cuts?.length){ setError('Nenhum corte extraído. Tente um texto maior.'); setStep('upload'); return; }
          const sorted = [...d.cuts].sort((a:CutResult,b:CutResult)=>getScore(b)-getScore(a));
          setCuts(sorted); setActiveCut(sorted[0]); setStep('results');
        } else if(d.status==='ERROR'){
          setError(d.error||'Erro no processamento. Verifique sua API Key.');
          setStep('upload');
        } else setTimeout(poll,2000);
      };
      setTimeout(poll,3000);
    } catch(err:any){ setError(err.message); setStep('upload'); }
  };

  const handleGenerateCaption = async () => {
    if (!activeCut || !apiKey.trim()) return;
    setCapLoading(true); setCapResult('');
    try {
      const res = await fetch('/api/captions/generate', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          cutText: activeCut.text, cutId: activeCut.id,
          transcriptId, provider, apiKey,
          platform: capPlatform, objective: capObjective,
          ctaType: capCTAType, ctaText: capCTAText,
          tone: capTone, includeHashtags: capHashtags,
          additionalContext: capContext
        })
      });
      if (!res.ok) throw new Error('Erro ao gerar legenda.');
      // Polling for result
      const pollCap = async (attempt = 0) => {
        await new Promise(r => setTimeout(r, 2000));
        const r = await fetch(`/api/captions/${transcriptId}/${activeCut.id}/${encodeURIComponent(capPlatform)}`);
        const d = await r.json();
        if (d.status === 'READY') { setCapResult(d.caption); setCapLoading(false); }
        else if (attempt < 15) pollCap(attempt + 1);
        else { setCapResult('Tempo esgotado. Tente novamente.'); setCapLoading(false); }
      };
      pollCap();
    } catch(e:any){ setCapResult(e.message); setCapLoading(false); }
  };

  const exportJSON = ()=>{
    const blob=new Blob([JSON.stringify(cuts,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url;
    a.download=`viral_cuts_${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const copyText = async (text:string)=>{
    await navigator.clipboard.writeText(text);
    setCopied(true); setTimeout(()=>setCopied(false),2000);
  };

  const loadFromHistory = async (id:string)=>{
    const r = await fetch(`/api/history/${id}`);
    const d = await r.json();
    if(d.cuts){
      const sorted=[...d.cuts].sort((a:CutResult,b:CutResult)=>getScore(b)-getScore(a));
      setCuts(sorted); setActiveCut(sorted[0]);
      setTranscript(d.originalText||'');
      setStep('results'); setShowHistory(false);
    }
  };

  return (
    <div className="app-container">
      <header>
        <div className="logo"><Sparkles size={30} color="#9d4edd"/><span>Viral Transcript Engine</span></div>
        <div className="header-actions">
          <button className={`btn btn-secondary ${showHistory?'active':''}`} onClick={()=>setShowHistory(p=>!p)}>
            <History size={16}/> Histórico
          </button>
          <button className={`btn btn-secondary ${showSettings?'active':''}`} onClick={()=>setShowSettings(p=>!p)}>
            <Settings size={16}/> Config. IA
          </button>
          {step==='results'&&(
            <button className="btn" onClick={()=>{setStep('upload');setCuts([]);setActiveCut(null);setError(null);}}>
              <LayoutTemplate size={16}/> Novo
            </button>
          )}
        </div>
      </header>

      <AnimatePresence>
        {showSettings&&(
          <motion.div initial={{opacity:0,y:-10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} className="glass-panel settings-panel">
            <div className="settings-header">
              <h3>⚙️ Configurações de IA</h3>
              <button className="icon-btn" onClick={()=>setShowSettings(false)}><X size={18}/></button>
            </div>
            <div className="settings-grid">
              <div className="input-group">
                <label>Provedor de IA</label>
                <div className="provider-toggle">
                  <button className={`toggle-btn ${provider==='openai'?'active':''}`} onClick={()=>setProvider('openai')}>OpenAI GPT-4o-mini</button>
                  <button className={`toggle-btn ${provider==='openrouter'?'active':''}`} onClick={()=>setProvider('openrouter')}>OpenRouter Claude</button>
                </div>
              </div>
              <div className="input-group">
                <label>API Key</label>
                <div className="apikey-row">
                  <input type="password" placeholder={provider==='openai'?'sk-proj-...':'sk-or-v1-...'} value={apiKey} onChange={e=>handleApiKeyChange(e.target.value)}/>
                  <button className={`btn save-key-btn ${keySaved?'saved':''}`} onClick={handleSaveKey}>
                    {keySaved ? <><CheckCircle size={15}/> Salva!</> : <><CheckCircle size={15}/> Salvar</>}
                  </button>
                </div>
              </div>
            </div>
            <p className="settings-note">🔒 Chave salva no localStorage e no arquivo .db/database.json · não enviamos seus dados a terceiros.</p>
          </motion.div>
        )}

        {showHistory&&(
          <motion.div initial={{opacity:0,y:-10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} className="glass-panel history-panel">
            <div className="settings-header">
              <h3>📂 Histórico de Análises</h3>
              <button className="icon-btn" onClick={()=>setShowHistory(false)}><X size={18}/></button>
            </div>
            {history.length===0
              ? <p className="empty-history">Nenhuma análise salva ainda.</p>
              : <div className="history-list">
                  {history.map((h:any)=>(
                    <div key={h.id} className="history-item" onClick={()=>loadFromHistory(h.id)}>
                      <div className="history-item-info">
                        <span className="history-niche">{h.niche}</span>
                        <span className="history-date">{new Date(h.createdAt).toLocaleDateString('pt-BR')} · {h.cutsCount} cortes</span>
                        <span className="history-preview">{h.preview}</span>
                      </div>
                      <ChevronRight size={16} color="var(--text-muted)"/>
                    </div>
                  ))}
                </div>
            }
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error&&(
          <motion.div className="error-banner" initial={{opacity:0,scale:0.97}} animate={{opacity:1,scale:1}} exit={{opacity:0}}>
            <span>⚠️ {error}</span>
            <button className="icon-btn" onClick={()=>setError(null)}><X size={16}/></button>
          </motion.div>
        )}
      </AnimatePresence>

      <main>
        <AnimatePresence mode="wait">
          {step==='upload'&&(
            <motion.div key="upload" initial={{opacity:0,y:24}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-24}} transition={{duration:0.35}}>
              <div className="upload-page">
                <div className="upload-hero">
                  <h1>A Ciência<br/>por trás da<br/>Viralização</h1>
                  <p>Cole seu transcript. A IA extrai <strong>{isUnlimited ? 'cortes ilimitados' : `${cutCount} cortes`}</strong> com timestamps, narrativa e score viral.</p>
                  <div className="hero-badges">
                    <span className="badge">{isUnlimited ? '♾️ Modo Ilimitado' : `🎯 ${cutCount} cortes`}</span>
                    <span className="badge">⏱️ Timestamps precisos</span>
                    <span className="badge">🧠 Análise narrativa</span>
                    <span className="badge">💾 Salvo no banco</span>
                  </div>
                </div>
                <div className="glass-panel upload-card">
                  <div className={`drop-zone ${isDragging?'dragging':''}`}
                    onDragOver={e=>{e.preventDefault();setIsDragging(true);}}
                    onDragLeave={()=>setIsDragging(false)} onDrop={handleDrop}>
                    <Upload size={26} color="var(--primary)"/>
                    <span>Arraste <strong>.txt .srt .vtt .md</strong> ou</span>
                    <label className="file-btn">Escolher arquivo
                      <input type="file" accept=".txt,.srt,.vtt,.md,.json" onChange={e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=ev=>handleTranscriptChange(ev.target?.result as string||'');r.readAsText(f);}} hidden/>
                    </label>
                  </div>
                  <div className="divider"><span>ou cole o texto</span></div>
                  <textarea className="transcript-input" rows={9}
                    placeholder="Cole o transcript bruto aqui (vídeo, podcast, aula, entrevista, live)..."
                    value={transcript} onChange={e=>handleTranscriptChange(e.target.value)}/>
                  {wordCount > 0 && (
                    <div className="transcript-meta">
                      <span>{wordCount.toLocaleString('pt-BR')} palavras</span>
                      <span>~{Math.round(wordCount/2.33)}s de fala</span>
                      {isUnlimited
                        ? <span className="meta-badge unlimited">♾️ Modo Ilimitado (sem limite de cortes)</span>
                        : <span className="meta-badge">Máx {Math.min(30, Math.floor(wordCount/40))} cortes disponíveis</span>
                      }
                    </div>
                  )}
                  {/* Seletor de quantidade de cortes */}
                  <div className="cut-count-selector">
                    <label className="cut-count-label">
                      <span>✂️ Quantidade de Cortes</span>
                      {isUnlimited
                        ? <span className="unlimited-badge">♾️ Ilimitado (transcript &gt; 2.000 palavras)</span>
                        : <span className="count-value">{cutCount}</span>
                      }
                    </label>
                    {!isUnlimited && (
                      <div className="cut-count-controls">
                        <input type="range" min={5} max={30} step={1} value={cutCount}
                          onChange={e=>setCutCount(Number(e.target.value))}
                          className="cut-range"/>
                        <div className="range-marks">
                          {[5,10,15,20,25,30].map(v=>(
                            <button key={v} className={`mark-btn ${cutCount===v?'active':''}`} onClick={()=>setCutCount(v)}>{v}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="options-grid">
                    <div className="input-group"><label>Nicho</label>
                      <select value={niche} onChange={e=>setNiche(e.target.value)}>{NICHES.map(n=><option key={n}>{n}</option>)}</select>
                    </div>
                    <div className="input-group"><label>Estratégia</label>
                      <select value={preset} onChange={e=>setPreset(e.target.value)}>{PRESETS.map(p=><option key={p}>{p}</option>)}</select>
                    </div>
                  </div>
                  <button className="btn btn-cta" onClick={handleProcess}>
                    {isUnlimited ? 'Extrair Cortes Ilimitados' : `Gerar ${cutCount} Cortes`} com {provider==='openai'?'OpenAI':'OpenRouter'} <TrendingUp size={20}/>
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {step==='processing'&&(
            <motion.div key="processing" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="processing-screen">
              <div className="glass-panel processing-card">
                <motion.div animate={{rotate:360}} transition={{repeat:Infinity,duration:2.5,ease:'linear'}}><Loader size={64} color="var(--primary)"/></motion.div>
                <h2>Pipeline Neural Ativo</h2>
                <p className="proc-subtitle">Extraindo 10 cortes virais com timestamps...</p>
                <div className="processing-steps">
                  {STEPS.map((s,i)=>(
                    <div key={i} className={`proc-step ${i<processingStep?'done':i===processingStep?'active':'pending'}`}>
                      <div className="proc-dot"/><span>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {step==='results'&&activeCut&&(
            <motion.div key="results" initial={{opacity:0,y:24}} animate={{opacity:1,y:0}} className="results-layout">
              {/* Lista de cortes */}
              <div className="glass-panel cuts-panel">
                <div className="cuts-panel-header">
                  <div><h2>10 Cortes Ranqueados</h2><p className="sub-text">{cuts.length} cortes · ordenados por potencial viral</p></div>
                  <button className="btn btn-secondary" onClick={exportJSON}><Download size={15}/> JSON</button>
                </div>
                <div className="cuts-list">
                  {cuts.map((cut,idx)=>{
                    const score=getScore(cut);
                    const color=getCategoryColor(cut.category);
                    return(
                      <div key={cut.id} className={`cut-card ${activeCut.id===cut.id?'active':''}`}
                        onClick={()=>{setActiveCut(cut);setIsPlaying(false);setActiveWordIndex(-1);}}>
                        <div className="cut-rank">#{idx+1}</div>
                        <div className="cut-card-body">
                          <div className="cut-card-top">
                            <span className="cut-title">{cut.title}</span>
                            <span className="score-chip" style={{background:`${color}18`,color,border:`1px solid ${color}33`}}>
                              <Flame size={12}/> {score}
                            </span>
                          </div>
                          <div className="cut-timestamp">
                            <Clock size={12}/>
                            <span>{cut.startFormatted} → {cut.endFormatted}</span>
                            <span className="ts-dur">({cut.durationSec}s)</span>
                            {cut.platform&&<span className="ts-platform">{cut.platform}</span>}
                          </div>
                          <p className="cut-preview">{cut.text}</p>
                          <div className="cut-tags">
                            <span className="tag" style={{borderColor:`${color}44`,color}}>{cut.category}</span>
                            <span className="tag tag-dim">{cut.text.split(' ').length} palavras</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Painel de detalhes */}
              <div className="detail-column">
                {/* Phone Mockup */}
                <div className="glass-panel phone-panel">
                  <div className="phone-wrap">
                    <div className="phone-body" onClick={!isPlaying?()=>{setIsPlaying(true);setActiveWordIndex(0);}:undefined} style={{cursor:isPlaying?'default':'pointer'}}>
                      <div className="phone-notch"/>
                      <div className="phone-screen">
                        {!isPlaying&&(
                          <motion.div className="play-overlay" whileHover={{scale:1.08}}>
                            <div className="play-btn-circle"><Play size={34} fill="#fff" color="#fff"/></div>
                            <span className="play-hint">Simular legenda</span>
                          </motion.div>
                        )}
                        <div className="phone-ts-badge">
                          <Clock size={10}/> {activeCut.startFormatted} → {activeCut.endFormatted}
                        </div>
                        <div className="subtitle-area">
                          {isPlaying
                            ? activeCut.text.split(' ').map((word,i)=>(
                                <motion.span key={i} className="subtitle-word"
                                  animate={{opacity:i<=activeWordIndex?1:0.2, color:i===activeWordIndex?'var(--accent-green)':'#fff', scale:i===activeWordIndex?1.14:1}}
                                  transition={{duration:0.1}}>
                                  {word.toUpperCase()}
                                </motion.span>
                              ))
                            : <div className="subtitle-static">
                                <span className="subtitle-highlight">{activeCut.text.split(' ').slice(0,4).join(' ').toUpperCase()}</span>
                                {' '}{activeCut.text.split(' ').slice(4,8).join(' ').toUpperCase()}...
                              </div>
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                  {activeCut.headline&&<p className="headline-badge">🎯 {activeCut.headline}</p>}
                </div>

                {/* Tabs de Análise */}
                <div className="glass-panel tabs-panel">
                  <div className="tab-bar">
                    {(['analysis','platforms','editing','caption'] as const).map(tab=>(
                      <button key={tab} className={`tab-btn ${activeTab===tab?'active':''}`} onClick={()=>setActiveTab(tab)}>
                        {tab==='analysis'?'📊 Análise':tab==='platforms'?'📱 Plataformas':tab==='editing'?'✂️ Edição':'📝 Legenda'}
                      </button>
                    ))}
                  </div>

                  <AnimatePresence mode="wait">
                    {/* Tab: Análise */}
                    {activeTab==='analysis'&&(
                      <motion.div key="analysis" initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}} className="tab-content">
                        {/* Score circle + bars */}
                        <div className="score-circle-wrap">
                          <div className="score-circle" style={{'--pct':getScore(activeCut)} as any}>
                            <span className="score-number">{getScore(activeCut)}</span>
                            <span className="score-label">/ 100</span>
                          </div>
                        </div>
                        <div className="score-bars">
                          {[
                            {label:'Hook',val:activeCut.hookScore,color:'var(--primary)'},
                            {label:'Retenção',val:activeCut.retentionScore,color:'var(--accent-green)'},
                            {label:'Emoção',val:activeCut.emotionScore,color:'var(--accent-orange)'},
                            ...(activeCut.clarityScore?[{label:'Clareza',val:activeCut.clarityScore,color:'var(--secondary)'}]:[]),
                            ...(activeCut.shareScore?[{label:'Compartilhamento',val:activeCut.shareScore,color:'#a78bfa'}]:[]),
                            ...(activeCut.closingScore?[{label:'Fecho (Punch)',val:activeCut.closingScore,color:'#f43f5e'}]:[]),
                          ].map(({label,val,color})=>(
                            <div key={label} className="score-bar-item">
                              <div className="score-bar-label"><span>{label}</span><span>{val}</span></div>
                              <div className="score-bar-track">
                                <motion.div className="score-bar-fill" initial={{width:0}} animate={{width:`${val}%`}} transition={{duration:0.8,ease:'easeOut'}} style={{background:color}}/>
                              </div>
                            </div>
                          ))}
                        </div>
                        {/* Emotion & trigger badges */}
                        <div className="emotion-row">
                          {activeCut.primaryEmotion&&<span className="emotion-badge primary">😮 {activeCut.primaryEmotion}</span>}
                          {activeCut.secondaryEmotion&&<span className="emotion-badge secondary">💫 {activeCut.secondaryEmotion}</span>}
                          {activeCut.dominantTrigger&&<span className="emotion-badge trigger">🎯 {activeCut.dominantTrigger}</span>}
                        </div>
                        {activeCut.risk&&<div className={`risk-badge risk-${activeCut.risk.toLowerCase().split(' ')[0]}`}>⚠️ Risco: {activeCut.risk}</div>}
                        <p className="justification-text">{activeCut.justification}</p>
                        {activeCut.narrativeArc&&<div className="narrative-arc"><span className="arc-label">Arco:</span> {activeCut.narrativeArc}</div>}
                      </motion.div>
                    )}

                    {/* Tab: Plataformas */}
                    {activeTab==='platforms'&&(
                      <motion.div key="platforms" initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}} className="tab-content">
                        {[
                          {icon:'🎵',label:'TikTok',val:activeCut.tiktokVersion},
                          {icon:'📸',label:'Instagram Reels',val:activeCut.reelsVersion},
                          {icon:'▶️',label:'YouTube Shorts',val:activeCut.shortsVersion},
                          {icon:'𝕏',label:'X / Twitter',val:activeCut.xVersion},
                        ].map(({icon,label,val})=>(
                          <div key={label} className="platform-block">
                            <div className="platform-block-header">
                              <span>{icon} {label}</span>
                              <button className="icon-btn" onClick={()=>copyText(val||activeCut.text)} title="Copiar">
                                {copied?<CheckCircle size={13} color="var(--accent-green)"/>:<Copy size={13}/>}
                              </button>
                            </div>
                            <p className="platform-text">{val||<em style={{color:'var(--text-muted)'}}>Mesmo texto do corte principal</em>}</p>
                          </div>
                        ))}
                        <div className="platform-block">
                          <div className="platform-block-header"><span>📝 Caption Curta (mudo)</span></div>
                          <p className="platform-text">{activeCut.captionShort||'—'}</p>
                        </div>
                        <div className="platform-block">
                          <div className="platform-block-header"><span>📣 Caption com CTA</span></div>
                          <p className="platform-text">{activeCut.captionCTA||'—'}</p>
                        </div>
                      </motion.div>
                    )}

                    {/* Tab: Edição */}
                    {activeTab==='editing'&&(
                      <motion.div key="editing" initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}} className="tab-content">
                        {activeCut.editingNotes&&(
                          <div className="editing-notes">
                            <h4>✂️ Instruções de Edição</h4>
                            <p>{activeCut.editingNotes}</p>
                          </div>
                        )}
                        {activeCut.cutTypes&&activeCut.cutTypes.length>0&&(
                          <div className="cut-type-tags">
                            {activeCut.cutTypes.map(t=><span key={t} className="cut-type-tag">{t}</span>)}
                          </div>
                        )}
                        <div className="editor-header" style={{marginTop:'1rem'}}>
                          <h3 className="panel-title">Texto do Corte</h3>
                          <button className="icon-btn" onClick={()=>copyText(activeCut.text)}>
                            {copied?<CheckCircle size={15} color="var(--accent-green)"/>:<Copy size={15}/>}
                          </button>
                        </div>
                        <textarea className="editor-textarea" rows={4} value={activeCut.text} onChange={e=>setActiveCut({...activeCut,text:e.target.value})}/>
                        <div className="editor-actions">
                          <button className="btn btn-danger">Descartar</button>
                          <button className="btn btn-success"><CheckCircle size={15}/> Aprovar Corte</button>
                        </div>
                      </motion.div>
                    )}
                    {/* Tab: Legenda */}
                    {activeTab==='caption'&&(
                      <motion.div key="caption" initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}} className="tab-content caption-tab">
                        <div className="caption-header">
                          <h4>📝 Gerador de Legenda Independente</h4>
                          <p className="caption-subtitle">Configure e gere a legenda deste corte separadamente, em qualquer momento.</p>
                        </div>
                        <div className="caption-form">
                          <div className="cap-row">
                            <div className="cap-group">
                              <label>Plataforma</label>
                              <select value={capPlatform} onChange={e=>{setCapPlatform(e.target.value);setCapResult('');}}>
                                {['TikTok','Instagram Reels','YouTube Shorts','X/Twitter','LinkedIn'].map(p=><option key={p}>{p}</option>)}
                              </select>
                            </div>
                            <div className="cap-group">
                              <label>Objetivo</label>
                              <select value={capObjective} onChange={e=>setCapObjective(e.target.value)}>
                                {['Engajamento','Venda','Educação','Compartilhamento','Seguidores'].map(o=><option key={o}>{o}</option>)}
                              </select>
                            </div>
                          </div>
                          <div className="cap-row">
                            <div className="cap-group">
                              <label>Tipo de CTA</label>
                              <select value={capCTAType} onChange={e=>setCapCTAType(e.target.value)}>
                                {['Seguir','Comentar','Salvar','Compartilhar','Link na bio','Personalizado'].map(c=><option key={c}>{c}</option>)}
                              </select>
                            </div>
                            <div className="cap-group">
                              <label>Tom</label>
                              <select value={capTone} onChange={e=>setCapTone(e.target.value)}>
                                {['Casual','Profissional','Emocional','Direto','Humorístico'].map(t=><option key={t}>{t}</option>)}
                              </select>
                            </div>
                          </div>
                          {capCTAType==='Personalizado'&&(
                            <div className="cap-group full">
                              <label>CTA Personalizado</label>
                              <input type="text" placeholder="Ex: Acesse o link e garanta sua vaga" value={capCTAText} onChange={e=>setCapCTAText(e.target.value)}/>
                            </div>
                          )}
                          <div className="cap-row cap-row-inline">
                            <label className="toggle-label">
                              <span>Incluir hashtags</span>
                              <div className={`toggle-switch ${capHashtags?'on':''}`} onClick={()=>setCapHashtags(h=>!h)}>
                                <div className="toggle-knob"/>
                              </div>
                            </label>
                          </div>
                          <div className="cap-group full">
                            <label>Contexto adicional (opcional)</label>
                            <input type="text" placeholder="Ex: Produto vendido, link da bio, nome do canal..." value={capContext} onChange={e=>setCapContext(e.target.value)}/>
                          </div>
                          <button className={`btn btn-cta cap-generate-btn ${capLoading?'loading':''}`} onClick={handleGenerateCaption} disabled={capLoading}>
                            {capLoading ? <><Loader size={16}/> Gerando legenda...</> : <><Sparkles size={16}/> Gerar Legenda para {capPlatform}</>}
                          </button>
                        </div>
                        {capResult&&(
                          <div className="cap-result">
                            <div className="cap-result-header">
                              <span>✅ Legenda gerada para {capPlatform}</span>
                              <button className="icon-btn" onClick={()=>copyText(capResult)}>
                                {copied?<CheckCircle size={14} color="var(--accent-green)"/>:<Copy size={14}/>}
                              </button>
                            </div>
                            <textarea className="cap-result-text" rows={6} value={capResult} onChange={e=>setCapResult(e.target.value)}/>
                            <div className="cap-char-count">{capResult.length} caracteres</div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
