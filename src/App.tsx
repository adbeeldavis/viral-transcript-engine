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
  score?: number;
  totalScore?: number;
  category: string;
  text: string;
  hookScore: number;
  retentionScore: number;
  emotionScore: number;
  justification: string;
  narrativeArc?: string;
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

  const STEPS = ['Ingerindo transcript...','Limpando e normalizando texto...','Segmentando blocos narrativos...','Detectando gatilhos emocionais...','Calculando Score Viral...','Estimando timestamps...','Montando 10 cortes finais...'];

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
    r.onload=ev=>setTranscript(ev.target?.result as string||'');
    r.readAsText(file);
  },[]);

  const handleProcess = async ()=>{
    if(!transcript.trim()){ setError('Insira o transcript.'); return; }
    if(!apiKey.trim()){ setError('Insira sua API Key nas ⚙️ Configurações.'); setShowSettings(true); return; }
    setError(null); setProcessingStep(0); setStep('processing');
    try {
      const res = await fetch('/api/transcripts/process',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ originalText:transcript, provider, apiKey, niche, preset })
      });
      const json = await res.json();
      if(!res.ok) throw new Error(json.error||'Erro ao iniciar processamento.');
      const { transcriptId } = json;
      const poll = async ()=>{
        const r = await fetch(`/api/transcripts/${transcriptId}`);
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
                  <p>Cole seu transcript. A IA extrai <strong>10 cortes</strong> com timestamps, narrativa e score viral.</p>
                  <div className="hero-badges">
                    <span className="badge">🎯 10 cortes ranqueados</span>
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
                      <input type="file" accept=".txt,.srt,.vtt,.md,.json" onChange={e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=ev=>setTranscript(ev.target?.result as string||'');r.readAsText(f);}} hidden/>
                    </label>
                  </div>
                  <div className="divider"><span>ou cole o texto</span></div>
                  <textarea className="transcript-input" rows={9}
                    placeholder="Cole o transcript bruto aqui (vídeo, podcast, aula, entrevista, live)..."
                    value={transcript} onChange={e=>setTranscript(e.target.value)}/>
                  {transcript&&<div className="transcript-meta">{transcript.split(' ').filter(Boolean).length} palavras · ~{Math.round(transcript.split(' ').filter(Boolean).length/2.33)}s de fala</div>}
                  <div className="options-grid">
                    <div className="input-group"><label>Nicho</label>
                      <select value={niche} onChange={e=>setNiche(e.target.value)}>{NICHES.map(n=><option key={n}>{n}</option>)}</select>
                    </div>
                    <div className="input-group"><label>Estratégia</label>
                      <select value={preset} onChange={e=>setPreset(e.target.value)}>{PRESETS.map(p=><option key={p}>{p}</option>)}</select>
                    </div>
                  </div>
                  <button className="btn btn-cta" onClick={handleProcess}>
                    Gerar 10 Cortes com {provider==='openai'?'OpenAI':'OpenRouter'} <TrendingUp size={20}/>
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
                </div>

                {/* Scores */}
                <div className="glass-panel scores-panel">
                  <h3 className="panel-title">Score de Viralização</h3>
                  <div className="score-circle-wrap">
                    <div className="score-circle" style={{'--pct':getScore(activeCut)} as any}>
                      <span className="score-number">{getScore(activeCut)}</span>
                      <span className="score-label">/ 100</span>
                    </div>
                  </div>
                  <div className="score-bars">
                    {[
                      {label:'Abertura (Hook)',val:activeCut.hookScore,color:'var(--secondary)'},
                      {label:'Retenção',val:activeCut.retentionScore,color:'var(--accent-green)'},
                      {label:'Intensidade Emocional',val:activeCut.emotionScore,color:'var(--accent-orange)'},
                    ].map(({label,val,color})=>(
                      <div key={label} className="score-bar-item">
                        <div className="score-bar-label"><span>{label}</span><span>{val}</span></div>
                        <div className="score-bar-track">
                          <motion.div className="score-bar-fill" initial={{width:0}} animate={{width:`${val}%`}} transition={{duration:0.9,ease:'easeOut'}} style={{background:color}}/>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Análise narrativa */}
                <div className="glass-panel justification-panel">
                  <h3 className="panel-title">Análise Cognitiva & Narrativa</h3>
                  <p className="justification-text">{activeCut.justification}</p>
                  {activeCut.narrativeArc&&(
                    <div className="narrative-arc">
                      <span className="arc-label">Arco:</span> {activeCut.narrativeArc}
                    </div>
                  )}
                </div>

                {/* Editor */}
                <div className="glass-panel editor-panel">
                  <div className="editor-header">
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
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
