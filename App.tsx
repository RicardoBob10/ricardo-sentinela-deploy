
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MarketSide, Candle, Signal, TraderConfig, Timeframe } from './types';
import { analyzeMarket } from './services/geminiService';
import { sendBrowserNotification, requestNotificationPermission, sendTelegramHeartbeat, sendTelegramTest, DEFAULT_TG_TOKEN, DEFAULT_TG_CHAT_ID } from './services/notificationService';
import Chart from './components/Chart';

const ALERT_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '1D': 86400
};

const BINANCE_INTERVALS: Record<Timeframe, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '1D': '1d'
};

const App: React.FC = () => {
  const [config, setConfig] = useState<TraderConfig>({
    telegramBotToken: DEFAULT_TG_TOKEN, 
    telegramChatId: DEFAULT_TG_CHAT_ID,   
    active: false,
    intervalMinutes: 1,
    timeframe: '15m'
  });

  const [btcData, setBtcData] = useState<Candle[]>([]);
  const [eurData, setEurData] = useState<Candle[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [activeAlert, setActiveAlert] = useState<Signal | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const [nextAnalysisTime, setNextAnalysisTime] = useState<Date | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const configRef = useRef(config);
  const schedulerRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedCandleRef = useRef<number>(0);
  const lastHeartbeatTimeRef = useRef<number>(0);

  // Sync ref with state for use in callbacks
  useEffect(() => { 
    configRef.current = config; 
  }, [config]);

  useEffect(() => {
    const audio = new Audio(ALERT_SOUND_URL);
    audio.preload = 'auto';
    audioRef.current = audio;
    // Removed automatic test on mount
  }, []);

  const fetchBtcData = async () => {
    try {
      const interval = BINANCE_INTERVALS[config.timeframe];
      const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=60`);
      const raw = await response.json();
      setBtcData(raw.map((d: any) => ({
        time: d[0] / 1000, open: parseFloat(d[1]), high: parseFloat(d[2]),
        low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5])
      })));
    } catch (e) { console.error(e); }
  };

  const fetchEurData = async () => {
    try {
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/EUR');
      const data = await response.json();
      const spot = data.rates.USD;
      setEurData(prev => {
        const now = Math.floor(Date.now() / 1000);
        const interval = TIMEFRAME_SECONDS[config.timeframe];
        if (prev.length === 0) {
          return Array.from({ length: 60 }, (_, i) => ({
            time: (Math.floor(now / interval) * interval) - (interval * (60 - i)),
            open: spot, high: spot + 0.0001, low: spot - 0.0001, close: spot, volume: 1000
          }));
        }
        const last = prev[prev.length - 1];
        if (now >= last.time + interval) {
          return [...prev.slice(1), { time: last.time + interval, open: last.close, high: spot, low: spot, close: spot, volume: 1000 }];
        }
        const updated = [...prev];
        updated[updated.length - 1] = { ...last, close: spot };
        return updated;
      });
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchBtcData(); fetchEurData();
    const t = setInterval(() => { fetchBtcData(); fetchEurData(); }, 30000);
    return () => clearInterval(t);
  }, [config.timeframe]);

  const triggerAlert = (signal: Signal) => {
    setActiveAlert(signal);
    sendBrowserNotification(signal);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
    setTimeout(() => setActiveAlert(null), 15000);
  };

  const handleTestConnection = async () => {
    setIsTestingTelegram(true);
    setTelegramError(null);
    const result = await sendTelegramTest(config.telegramBotToken, config.telegramChatId);
    setIsTestingTelegram(false);
    
    if (result.success) {
      alert("🚀 Sucesso! Verifique seu Telegram.");
    } else {
      setTelegramError(result.error || "Erro desconhecido");
    }
  };

  const runAnalysis = useCallback(async () => {
    // 1. Guard: Check if already analyzing
    if (isAnalyzing || btcData.length < 30) return;

    // 2. Guard: Strictly only one analysis per 15-minute candle
    const now = new Date();
    const currentCandleTime = Math.floor(now.getTime() / (1000 * 60 * 15)) * (1000 * 60 * 15);
    
    if (lastProcessedCandleRef.current === currentCandleTime) {
      console.log("Candle already processed for: ", new Date(currentCandleTime).toLocaleTimeString());
      return;
    }

    setIsAnalyzing(true);
    // Immediately mark candle as processed to avoid race conditions
    lastProcessedCandleRef.current = currentCandleTime;

    try {
      const btcS = await analyzeMarket(
        'BTC/USD', 
        btcData.slice(-40), 
        configRef.current.timeframe,
        configRef.current.telegramBotToken,
        configRef.current.telegramChatId
      );
      if (btcS) { 
        setSignals(p => [btcS, ...p]); 
        triggerAlert(btcS); 
      }
      
      const eurS = await analyzeMarket(
        'EUR/USD', 
        eurData.slice(-40), 
        configRef.current.timeframe,
        configRef.current.telegramBotToken,
        configRef.current.telegramChatId
      );
      if (eurS) { 
        setSignals(p => [eurS, ...p]); 
        triggerAlert(eurS); 
      }
    } catch (e) { 
      console.error("Analysis Error:", e);
      // Optional: reset on error? Usually safer to wait for next candle
    } finally { 
      setIsAnalyzing(false); 
    }
  }, [btcData, eurData, isAnalyzing]);

  const scheduleNext = useCallback(() => {
    if (schedulerRef.current) clearTimeout(schedulerRef.current);
    
    const now = new Date();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    
    // Calculate time to the next 15-minute mark (00, 15, 30, 45)
    const nextIntervalMinutes = 15 - (minutes % 15);
    const msToNext = (nextIntervalMinutes * 60 - seconds + 5) * 1000; // 5s buffer for candle closing

    const nextDate = new Date(now.getTime() + msToNext);
    setNextAnalysisTime(nextDate);

    schedulerRef.current = setTimeout(() => {
      if (configRef.current.active) { 
        runAnalysis(); 
        scheduleNext(); 
      }
    }, msToNext);
  }, [runAnalysis]);

  useEffect(() => {
    if (config.active) {
      // Start scheduler
      scheduleNext();
      
      // Heartbeat Logic: Send only if 1 hour has passed or never sent
      const now = Date.now();
      const oneHourMs = 3600000;
      
      if (now - lastHeartbeatTimeRef.current > oneHourMs) {
        sendTelegramHeartbeat(config.telegramBotToken, config.telegramChatId);
        lastHeartbeatTimeRef.current = now;
      }

      // Interval for subsequent heartbeats
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = setInterval(() => {
        if (configRef.current.active) {
          sendTelegramHeartbeat(configRef.current.telegramBotToken, configRef.current.telegramChatId);
          lastHeartbeatTimeRef.current = Date.now();
        }
      }, oneHourMs);

    } else {
      // Cleanup when deactivated
      if (schedulerRef.current) clearTimeout(schedulerRef.current);
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      setNextAnalysisTime(null);
    }
    
    return () => { 
      if (schedulerRef.current) clearTimeout(schedulerRef.current);
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    };
  }, [config.active, config.telegramBotToken, config.telegramChatId, scheduleNext]);

  return (
    <div className="min-h-screen text-slate-200 p-4 md:p-8 bg-[#020617] font-inter">
      {activeAlert && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-3xl animate-in fade-in">
          <div className={`max-w-md w-full p-10 rounded-[3rem] border-8 text-center ${activeAlert.side === 'BUY' ? 'bg-emerald-950 border-emerald-500' : 'bg-rose-950 border-rose-500'}`}>
            <i className={`fa-solid ${activeAlert.side === 'BUY' ? 'fa-circle-arrow-up text-emerald-400' : 'fa-circle-arrow-down text-rose-400'} text-8xl mb-6 animate-bounce`}></i>
            <h2 className="text-3xl font-black text-white uppercase mb-4 italic">Sinal Confirmado!</h2>
            <div className="text-6xl font-black italic mb-6">{activeAlert.side === 'BUY' ? 'CALL' : 'PUT'}</div>
            <div className="text-2xl font-mono mb-8 bg-black/40 py-4 rounded-2xl">{activeAlert.asset}</div>
            <button onClick={() => setActiveAlert(null)} className="w-full py-5 rounded-2xl bg-white text-black font-black text-xl">OK</button>
          </div>
        </div>
      )}

      <header className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between mb-10 gap-6 border-b border-slate-800 pb-10">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg"><i className="fa-solid fa-robot text-3xl text-slate-900"></i></div>
          <h1 className="text-3xl font-black tracking-tighter uppercase italic">RICARDO <span className="text-emerald-400">TRADER AI</span></h1>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => {
              // Manual override: reset candle ref to allow immediate analysis
              lastProcessedCandleRef.current = 0;
              runAnalysis();
            }} 
            disabled={isAnalyzing} 
            className="px-6 py-4 rounded-xl bg-slate-800 font-bold hover:bg-slate-700 disabled:opacity-50"
          >
            {isAnalyzing ? <i className="fa-solid fa-spinner fa-spin"></i> : 'ANALISAR AGORA'}
          </button>
          <button onClick={async () => {
            if (!config.active) { 
              await requestNotificationPermission(); 
              if (audioRef.current) audioRef.current.play().catch(() => {});
              // Reset last processed to 0 on activation to allow immediate signal check
              lastProcessedCandleRef.current = 0;
            }
            setConfig(p => ({ ...p, active: !p.active }));
          }} className={`px-10 py-4 rounded-xl font-black ${config.active ? 'bg-rose-600' : 'bg-emerald-600'} text-white shadow-lg transition-all active:scale-95`}>
            {config.active ? 'SENTINELA ATIVO' : 'ATIVAR SENTINELA'}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800">
              <div className="flex justify-between items-center mb-4"><span className="font-bold text-orange-400">BTC/USD</span><span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded">Live</span></div>
              <Chart data={btcData} asset="BTC/USD" />
            </div>
            <div className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800">
              <div className="flex justify-between items-center mb-4"><span className="font-bold text-blue-400">EUR/USD</span><span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-1 rounded">Spot</span></div>
              <Chart data={eurData} asset="EUR/USD" />
            </div>
          </div>
          <div className="bg-slate-900 rounded-[2rem] border border-slate-800 h-[500px] flex flex-col">
            <div className="p-6 border-b border-slate-800 font-bold uppercase tracking-widest text-sm flex justify-between items-center">
              <span>Histórico de Sinais Neurais (M15)</span>
              <span className="text-emerald-500 text-[10px] animate-pulse">Next Scan: {nextAnalysisTime?.toLocaleTimeString() || '--:--'}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {signals.length === 0 && <div className="h-full flex items-center justify-center text-slate-500 italic">Aguardando fechamento da vela M15...</div>}
              {signals.map(s => (
                <div key={s.id} className="p-6 bg-slate-800/50 rounded-2xl border border-slate-700 flex items-center gap-6 animate-in slide-in-from-top duration-500">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold ${s.side === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                    {s.side === 'BUY' ? <i className="fa-solid fa-arrow-up"></i> : <i className="fa-solid fa-arrow-down"></i>}
                  </div>
                  <div className="flex-1">
                    <div className="font-black text-lg">{s.asset} <span className="text-xs font-normal text-slate-500 ml-2">{s.timestamp.toLocaleTimeString()}</span></div>
                    <div className="text-xs text-slate-400 italic">"{s.reasoning}"</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-emerald-400">{s.confidence}%</div>
                    <div className="text-[10px] text-slate-500 font-mono">{s.price.toFixed(s.asset.includes('EUR') ? 5 : 2)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="space-y-8">
          <div className="bg-slate-900 p-8 rounded-[2rem] border border-slate-800">
            <h3 className="font-black uppercase mb-6 text-emerald-400 flex items-center gap-2">
              <i className="fa-solid fa-gears"></i> CONFIG. TELEGRAM
            </h3>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Bot Token</label>
                <input 
                  type="password"
                  value={config.telegramBotToken}
                  onChange={(e) => setConfig(p => ({ ...p, telegramBotToken: e.target.value }))}
                  className="w-full bg-black/40 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Chat ID (Ex: 7625668696)</label>
                <input 
                  type="text"
                  value={config.telegramChatId}
                  onChange={(e) => setConfig(p => ({ ...p, telegramChatId: e.target.value }))}
                  className="w-full bg-black/40 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {telegramError && (
              <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl mb-6 animate-in shake duration-300">
                <div className="text-rose-400 text-[10px] font-black uppercase mb-1">ERRO DETECTADO:</div>
                <div className="text-xs text-rose-200 font-mono leading-tight">{telegramError}</div>
              </div>
            )}
            
            <button 
              onClick={handleTestConnection}
              disabled={isTestingTelegram}
              className="w-full py-3 rounded-xl bg-slate-800 text-xs font-black text-slate-300 hover:bg-slate-700 border border-slate-700 transition-all flex items-center justify-center gap-2"
            >
              <i className={`fa-solid ${isTestingTelegram ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i>
              {isTestingTelegram ? 'VALIDANDO...' : 'TESTAR TELEGRAM AGORA'}
            </button>
          </div>

          <div className="bg-slate-900 p-8 rounded-[2rem] border border-slate-800">
            <h3 className="font-black uppercase mb-6 text-slate-400">Log de Sistema</h3>
            <div className="space-y-4 mb-4">
              <div className="flex justify-between text-xs border-b border-slate-800 pb-3"><span>Modelo:</span><span className="text-white font-bold">Gemini 3 Flash</span></div>
              <div className="flex justify-between text-xs border-b border-slate-800 pb-3"><span>Varredura:</span><span className="text-emerald-500 font-bold">15 MIN (Ativo)</span></div>
              <div className="flex justify-between text-xs"><span>Heartbeat:</span><span className="text-emerald-500">1H</span></div>
            </div>
            <p className="text-[10px] text-slate-500 italic leading-relaxed">Proteção contra spam e loop ativa. Sinais limitados a um por vela de M15.</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
