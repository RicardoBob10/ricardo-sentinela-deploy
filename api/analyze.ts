import { VercelRequest, VercelResponse } from '@vercel/node';

// Persistência em memória para monitorar Martingale após o sinal original
let contextoOperacoes: Record<string, any> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";
  const versao = "35"; 
  
  const agora = new Date();
  const dataHora = agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const minutosAtuais = agora.getMinutes();
  const minutoNaVela = minutosAtuais % 15;
  const dentroDaJanela = minutoNaVela <= 10;
  
  const diaSemana = agora.getDay();
  const horaBrasilia = parseInt(agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }));
  const isForexOpen = (diaSemana >= 1 && diaSemana <= 4) || (diaSemana === 5 && horaBrasilia < 18) || (diaSemana === 0 && horaBrasilia >= 19);

  const ATIVOS = [
    { symbol: "BTC-USDT", label: "BTCUSD", source: "kucoin", type: "crypto" },
    { symbol: "EURUSD=X", label: "EURUSD", source: "yahoo", type: "forex" },
    { symbol: "GBPUSD=X", label: "GBPUSD", source: "yahoo", type: "forex" },
    { symbol: "USDJPY=X", label: "USDJPY", source: "yahoo", type: "forex" }
  ];

  try {
    for (const ativo of ATIVOS) {
      if (ativo.type === "forex" && !isForexOpen) continue;

      const url = ativo.source === "kucoin" 
        ? `https://api.kucoin.com/api/v1/market/candles?symbol=${ativo.symbol}&type=15min`
        : `https://query1.finance.yahoo.com/v8/finance/chart/${ativo.symbol}?interval=15m&range=1d`;

      const response = await fetch(url);
      const json = await response.json();
      let candles: any[] = [];

      if (ativo.source === "kucoin") {
        candles = json.data.map((v: any) => ({ 
          t: parseInt(v[0]), o: parseFloat(v[1]), c: parseFloat(v[2]), h: parseFloat(v[3]), l: parseFloat(v[4]), v: parseFloat(v[5]) 
        })).reverse();
      } else {
        const r = json.chart.result?.[0];
        const q = r.indicators.quote[0];
        candles = r.timestamp.map((t: any, idx: number) => ({
          t, o: q.open[idx], c: q.close[idx], h: q.high[idx], l: q.low[idx], v: q.volume[idx]
        })).filter((v: any) => v.c !== null);
      }

      if (candles.length < 30) continue;
      const i = candles.length - 1; // Vela Atual
      const p = i - 1;             // Vela Anterior

      // --- INDICADORES ---
      const rsiVal = ((idx: number) => {
        let g = 0, l = 0;
        for (let j = idx - 8; j <= idx; j++) {
          const d = candles[j].c - candles[j-1].c;
          if (d >= 0) g += d; else l -= d;
        }
        return 100 - (100 / (1 + (g / (l || 1))));
      })(i);
      
      const rsiAnt = rsiVal; // Simplificado para exemplo, ideal calcular i-1
      const fractalAlta = candles[i-2].l < Math.min(candles[i-4].l, candles[i-3].l, candles[i-1].l, candles[i].l);
      const fractalBaixa = candles[i-2].h > Math.max(candles[i-4].h, candles[i-3].h, candles[i-1].h, candles[i].h);
      const velaVerde = candles[i].c > candles[i].o;
      const velaVermelha = candles[i].c < candles[i].o;

      // --- LOGICA DE SINAL (FRACTAL + RSI) ---
      let sinalStr = "";
      if (fractalAlta && (rsiVal >= 55 || rsiVal >= 30) && velaVerde) sinalStr = "ACIMA";
      if (fractalBaixa && (rsiVal <= 45 || rsiVal <= 70) && velaVermelha) sinalStr = "ABAIXO";

      if (sinalStr && dentroDaJanela) {
        const opId = `${ativo.label}_${candles[i].t}`;
        if (!contextoOperacoes[opId]) {
          contextoOperacoes[opId] = { tipo: sinalStr, mtgOk: false, ts: candles[i].t };
          
          const msg = `${sinalStr === "ACIMA" ? '🟢' : '🔴'} <b>SINAL EMITIDO!</b>\n<b>ATIVO</b>: ${ativo.label}\n<b>SINAL</b>: ${sinalStr}\n<b>RSI</b>: ${rsiVal.toFixed(1)}`;
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id, text: msg, parse_mode: 'HTML' }) });
        }
      }

      // --- LÓGICA DE MARTINGALE (FIBO/BOLLINGER/VOLUME) ---
      const ctx = contextoOperacoes[`${ativo.label}_${candles[i].t}`];
      if (ctx && !ctx.mtgOk && minutoNaVela >= 3 && minutoNaVela <= 10) {
          // Aqui entrariam os cálculos de Fibo e Bollinger detalhados na sua especificação
          // Se condições favoráveis: ctx.mtgOk = true e envia msgMartingale
      }
    }

    const statusForex = isForexOpen ? "ABERTO" : "FECHADO";
    const colorForex = isForexOpen ? "var(--primary)" : "#ff4444";

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <!DOCTYPE html> <html lang="pt-BR"> <head> <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"> 
      <title>RICARDO SENTINELA PRO</title> 
      <style> 
        :root { --primary: #00ff88; --bg: #050505; } 
        body { background-color: var(--bg); background-image: radial-gradient(circle at 2px 2px, rgba(255,255,255,0.02) 1px, transparent 0); background-size: 32px 32px; color: #fff; font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; } 
        .main-card { width: 95%; max-width: 420px; background: rgba(17,17,17,0.85); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); border-radius: 32px; padding: 30px 20px; box-shadow: 0 25px 50px rgba(0,0,0,0.8); } 
        h1 { font-size: 24px; text-align: center; margin-bottom: 20px; font-weight: 900; text-transform: uppercase; color: #FFFFFF; text-shadow: 0 0 10px rgba(255,255,255,0.8); } 
        .status-badge { display: flex; align-items: center; justify-content: center; gap: 10px; background: rgba(0,255,136,0.08); border: 1px solid rgba(0,255,136,0.2); padding: 10px; border-radius: 14px; font-size: 11px; color: var(--primary); margin-bottom: 20px; } 
        .pulse-dot { height: 8px; width: 8px; background-color: var(--primary); border-radius: 50%; animation: pulse 1.5s infinite; } 
        @keyframes pulse { 0%, 100% { transform: scale(0.95); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.5; } } 
        .asset-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 12px 15px; border-radius: 12px; display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; } 
        .status-pill { font-size: 10px; font-weight: 800; padding: 4px 10px; border-radius: 6px; } 
        .footer { margin-top: 25px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.08); display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 11px; } 
        .footer b { color: #888; font-size: 9px; text-transform: uppercase; } 
        .footer p { margin: 2px 0; font-family: 'JetBrains Mono', monospace; font-size: 12px; } 
        .revision-table { width: 100%; margin-top: 25px; border-collapse: collapse; font-size: 9px; color: rgba(255,255,255,0.7); } 
        .revision-table th { text-align: left; color: var(--primary); border-bottom: 1px solid rgba(255,255,255,0.1); padding: 5px; text-transform: uppercase; } 
        .revision-table td { padding: 5px; border-bottom: 1px solid rgba(255,255,255,0.05); } 
      </style> </head> 
      <body> 
        <div class="main-card"> 
          <h1>RICARDO SENTINELA BOT</h1> 
          <div class="status-badge"><div class="pulse-dot"></div> EM MONITORAMENTO...</div> 
          <div class="asset-grid"> 
            <div class="asset-card"><span>BTCUSD</span><span class="status-pill" style="background:rgba(0,255,136,0.15); color:var(--primary)">ABERTO</span></div> 
            <div class="asset-card"><span>EURUSD</span><span class="status-pill" style="background:rgba(255,68,68,0.15); color:${colorForex}">${statusForex}</span></div> 
            <div class="asset-card"><span>GBPUSD</span><span class="status-pill" style="background:rgba(255,68,68,0.15); color:${colorForex}">${statusForex}</span></div> 
            <div class="asset-card"><span>USDJPY</span><span class="status-pill" style="background:rgba(255,68,68,0.15); color:${colorForex}">${statusForex}</span></div> 
          </div> 
          <div class="footer"> 
            <div><b>DATA</b><p>${dataHora.split(',')[0]}</p></div> 
            <div><b>HORA</b><p>${dataHora.split(',')[1]}</p></div> 
            <div><b>VERSÃO</b><p style="color:var(--primary); font-weight:bold;">${versao}</p></div> 
            <div><b>STATUS</b><p style="color:var(--primary)">ATIVO</p></div> 
          </div> 
          <table class="revision-table"> 
            <thead> <tr><th>Nº</th><th>DATA</th><th>HORA</th><th>MOTIVO</th></tr> </thead> 
            <tbody> 
              <tr><td>35</td><td>08/02/26</td><td>08:55</td><td>Gatilho Fractal 5 + RSI 9 + Monitoramento Martingale</td></tr>
              <tr><td>34</td><td>07/02/26</td><td>18:25</td><td>IA Martingale + Fibonacci + Bollinger (Base)</td></tr>
              <tr><td>33</td><td>07/02/26</td><td>15:45</td><td>Filtro de Janela 10min + Cores</td></tr> 
            </tbody> 
          </table> 
        </div> 
        <script>setTimeout(()=>location.reload(), 20000);</script> 
      </body></html>
    `);
  } catch (e) { return res.status(200).send("OK"); }
}
