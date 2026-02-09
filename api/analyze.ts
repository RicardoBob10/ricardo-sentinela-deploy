import { VercelRequest, VercelResponse } from '@vercel/node';

// Memória temporária para sinais e contextos (persiste enquanto a instância estiver ativa)
let lastSinais: Record<string, any> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";
  const versao = "36"; 
  
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

  // --- FUNÇÕES AUXILIARES DE CÁLCULO ---
  const calcularRSI = (dados: any[], idx: number) => {
    let gains = 0, losses = 0;
    for (let j = idx - 8; j <= idx; j++) {
      const diff = dados[j].c - dados[j-1].c;
      if (diff >= 0) gains += diff; else losses -= diff;
    }
    const rs = gains / (losses || 1);
    return 100 - (100 / (1 + rs));
  };

  const getBollinger = (dados: any[], idx: number) => {
    const slice = dados.slice(idx - 19, idx + 1);
    const sma = slice.reduce((a, b) => a + b.c, 0) / 20;
    const variance = slice.reduce((a, b) => a + Math.pow(b.c - sma, 2), 0) / 20;
    const stdDev = Math.sqrt(variance);
    const upper = sma + (2 * stdDev);
    const lower = sma - (2 * stdDev);
    return { upper, lower, width: (upper - lower) / sma };
  };

  const isDoji = (candle: any) => {
    const corpo = Math.abs(candle.c - candle.o);
    const tamanhoTotal = candle.h - candle.l;
    return tamanhoTotal === 0 ? true : (corpo / tamanhoTotal) < 0.30;
  };

  try {
    for (const ativo of ATIVOS) {
      if (ativo.type === "forex" && !isForexOpen) continue;

      // 1. BUSCAR DADOS M15 (SINAL PRINCIPAL)
      const urlM15 = ativo.source === "kucoin" 
        ? `https://api.kucoin.com/api/v1/market/candles?symbol=${ativo.symbol}&type=15min`
        : `https://query1.finance.yahoo.com/v8/finance/chart/${ativo.symbol}?interval=15m&range=1d`;

      const res15 = await fetch(urlM15);
      const json15 = await res15.json();
      let candlesM15: any[] = [];

      if (ativo.source === "kucoin") {
        candlesM15 = json15.data.map((v: any) => ({ 
          t: parseInt(v[0]), o: parseFloat(v[1]), c: parseFloat(v[2]), h: parseFloat(v[3]), l: parseFloat(v[4]), v: parseFloat(v[5])
        })).reverse();
      } else {
        const r = json15.chart.result?.[0];
        const q = r.indicators.quote[0];
        candlesM15 = r.timestamp.map((t: any, idx: number) => ({
          t, o: q.open[idx], c: q.close[idx], h: q.high[idx], l: q.low[idx], v: q.volume[idx]
        })).filter((v: any) => v.c !== null);
      }

      if (candlesM15.length < 30) continue;
      const i = candlesM15.length - 1; 

      // LÓGICA DE SINAL M15
      const rsi_val = calcularRSI(candlesM15, i);
      const rsi_ant = calcularRSI(candlesM15, i - 1);
      const fractal_alta = candlesM15[i-2].l < Math.min(candlesM15[i-4].l, candlesM15[i-3].l, candlesM15[i-1].l, candlesM15[i].l);
      const fractal_baixa = candlesM15[i-2].h > Math.max(candlesM15[i-4].h, candlesM15[i-3].h, candlesM15[i-1].h, candlesM15[i].h);
      
      const rsi_call_valido = (rsi_val >= 55 || rsi_val >= 30) && rsi_val > rsi_ant;
      const rsi_put_valido = (rsi_val <= 45 || rsi_val <= 70) && rsi_val < rsi_ant;

      let sinalStr = "";
      if (fractal_alta && rsi_call_valido && candlesM15[i].c > candlesM15[i].o) sinalStr = "ACIMA";
      if (fractal_baixa && rsi_put_valido && candlesM15[i].c < candlesM15[i].o) sinalStr = "ABAIXO";

      // DISPARO DO SINAL ORIGINAL
      if (sinalStr && dentroDaJanela) {
        const opId = `${ativo.label}_${candlesM15[i].t}`;
        if (!lastSinais[opId]) {
          const hVela = new Date(candlesM15[i].t * 1000).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
          lastSinais[opId] = { enviado: true, tipo: sinalStr, precoEntrada: candlesM15[i].c, mtgEnviado: false };
          
          const emoji = sinalStr === "ACIMA" ? "🟢" : "🔴";
          const seta = sinalStr === "ACIMA" ? "↑" : "↓";
          const msg = `${emoji} <b>SINAL EMITIDO!</b>\n<b>ATIVO:</b> ${ativo.label}\n<b>SINAL:</b> ${seta} ${sinalStr}\n<b>VELA:</b> ${hVela}`;
          
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id, text: msg, parse_mode: 'HTML' }) });
        }
      }

      // --- MONITORAMENTO DE MARTINGALE (NOVA LÓGICA V36) ---
      const context = lastSinais[`${ativo.label}_${candlesM15[i].t}`];
      if (context && !context.mtgEnviado && minutoNaVela >= 3 && minutoNaVela <= 10) {
        
        // Buscar M1 para precisão
        const urlM1 = ativo.source === "kucoin" 
          ? `https://api.kucoin.com/api/v1/market/candles?symbol=${ativo.symbol}&type=1min`
          : `https://query1.finance.yahoo.com/v8/finance/chart/${ativo.symbol}?interval=1m&range=1d`;
        
        const res1 = await fetch(urlM1);
        const json1 = await res1.json();
        let candlesM1: any[] = [];
        
        if (ativo.source === "kucoin") {
          candlesM1 = json1.data.map((v: any) => ({ o: parseFloat(v[1]), c: parseFloat(v[2]), h: parseFloat(v[3]), l: parseFloat(v[4]), v: parseFloat(v[5]) })).reverse();
        } else {
          const qM1 = json1.chart.result[0].indicators.quote[0];
          candlesM1 = json1.chart.result[0].timestamp.map((t: any, idx: number) => ({ o: qM1.open[idx], c: qM1.close[idx], h: qM1.high[idx], l: qM1.low[idx], v: qM1.volume[idx] })).filter((v: any) => v.c !== null);
        }

        const m1Idx = candlesM1.length - 1;
        const precoAtual = candlesM1[m1Idx].c;
        const volM1 = candlesM1[m1Idx].v;
        const avgVol = candlesM1.slice(-21, -1).reduce((a, b) => a + b.v, 0) / 20;
        
        // 1. Fibonacci (Vela M15 anterior)
        const vAnt = candlesM15[i-1];
        const corpo = Math.abs(vAnt.c - vAnt.o);
        const fib50 = (vAnt.o + vAnt.c) / 2;
        const fib618 = vAnt.o > vAnt.c ? vAnt.c + (corpo * 0.618) : vAnt.o + (corpo * 0.618);
        const fib382 = vAnt.o > vAnt.c ? vAnt.c + (corpo * 0.382) : vAnt.o + (corpo * 0.382);

        // 2. Bollinger e Outros
        const bb = getBollinger(candlesM15, i);
        const rsiM1 = calcularRSI(candlesM1, m1Idx);
        const rsiM1Ant = calcularRSI(candlesM1, m1Idx - 1);
        const threshBB = ativo.label === "BTCUSD" ? 0.04 : 0.02;

        let podeMtg = false;
        let fibDesc = "";

        if (context.tipo === "ACIMA" && precoAtual < context.precoEntrada) {
          const tocouFib = precoAtual >= Math.min(fib50, fib618) && precoAtual <= Math.max(fib50, fib618);
          const rejeitou = precoAtual > fib382;
          const rsiOk = rsiM1 < 45 && rsiM1 > rsiM1Ant;
          if (tocouFib && rejeitou && rsiOk) { podeMtg = true; fibDesc = "Rejeitou 50-61.8% e voltou"; }
        } else if (context.tipo === "ABAIXO" && precoAtual > context.precoEntrada) {
          const tocouFib = precoAtual >= Math.min(fib50, fib618) && precoAtual <= Math.max(fib50, fib618);
          const rejeitou = precoAtual < fib382;
          const rsiOk = rsiM1 > 55 && rsiM1 < rsiM1Ant;
          if (tocouFib && rejeitou && rsiOk) { podeMtg = true; fibDesc = "Rejeitou 50-61.8% e voltou"; }
        }

        // Bloqueios
        const bloqueioDoji = isDoji(vAnt);
        const bloqueioVol = (volM1 / avgVol) < 0.8;
        const bloqueioBB = bb.width < threshBB;

        if (podeMtg && !bloqueioDoji && !bloqueioVol && !bloqueioBB) {
          context.mtgEnviado = true;
          const msgMtg = `⚠️ <b>ALERTA DE MARTINGALE</b>\n\n${context.tipo === "ACIMA" ? "🟢" : "🔴"} <b>Sinal:</b> ${context.tipo === "ACIMA" ? "↑" : "↓"} ${context.tipo}\n💰 <b>Ativo:</b> ${ativo.label}\n📊 <b>Fibonacci:</b> ${fibDesc}\n📈 <b>RSI:</b> ${rsiM1.toFixed(1)} ${rsiM1 < 30 || rsiM1 > 70 ? '(FORTE)' : '(MODERADO)'}\n📊 <b>Volume:</b> ${(volM1/avgVol).toFixed(1)}x (OK)\n📏 <b>Bollinger:</b> ${(bb.width*100).toFixed(1)}% (OK)\n⏰ <b>Restam:</b> ${15 - minutoNaVela} min\n\n✅ <b>Condições favoráveis!</b>`;
          
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id, text: msgMtg, parse_mode: 'HTML' }) });
        }
      }
    }

    // --- RENDERIZAÇÃO DASHBOARD ---
    const statusForex = isForexOpen ? "ABERTO" : "FECHADO";
    const bgForex = isForexOpen ? "rgba(0,255,136,0.15)" : "rgba(255,68,68,0.15)";
    const colorForex = isForexOpen ? "var(--primary)" : "#ff4444";
    const logoSvg = `<svg width="80" height="80" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="45" fill="none" stroke="#00ff88" stroke-width="2" stroke-dasharray="5,3"/><circle cx="50" cy="50" r="35" fill="none" stroke="#00ff88" stroke-width="1" opacity="0.5"/><path d="M50 15 L50 35 M85 50 L65 50 M50 85 L50 65 M15 50 L35 50" stroke="#00ff88" stroke-width="2"/><text x="50" y="65" font-family="Arial" font-size="40" font-weight="900" fill="#00ff88" text-anchor="middle">R</text></svg>`;

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <!DOCTYPE html> <html lang="pt-BR"> 
      <head> 
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"> 
        <title>RICARDO SENTINELA PRO</title> 
        <style> 
          :root { --primary: #00ff88; --bg: #050505; } 
          body { background-color: var(--bg); color: #fff; font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; } 
          .main-card { width: 95%; max-width: 420px; background: rgba(17,17,17,0.85); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); border-radius: 32px; padding: 30px 20px; box-shadow: 0 25px 50px rgba(0,0,0,0.8); } 
          .logo-container { display: flex; justify-content: center; margin-bottom: 10px; }
          h1 { font-size: 22px; text-align: center; margin-bottom: 20px; font-weight: 900; color: #FFFFFF; } 
          .status-badge { display: flex; align-items: center; justify-content: center; gap: 10px; background: rgba(0,255,136,0.08); border: 1px solid rgba(0,255,136,0.2); padding: 10px; border-radius: 14px; font-size: 11px; color: var(--primary); margin-bottom: 20px; } 
          .pulse-dot { height: 8px; width: 8px; background-color: var(--primary); border-radius: 50%; animation: pulse 1.5s infinite; } 
          @keyframes pulse { 0%, 100% { transform: scale(0.95); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.5; } } 
          .asset-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 12px 15px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 14px; } 
          .status-pill { font-size: 10px; font-weight: 800; padding: 6px 12px; border-radius: 6px; } 
          .footer { margin-top: 25px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.08); display: grid; grid-template-columns: 1fr 1fr; gap: 15px; text-align: center; } 
          .footer b { color: #888; font-size: 9px; display: block; } 
          .footer p { margin: 0; font-size: 12px; } 
          .revision-table { width: 100%; margin-top: 25px; border-collapse: collapse; font-size: 9px; color: rgba(255,255,255,0.7); } 
          .revision-table th { text-align: left; color: var(--primary); padding: 5px; } 
          .revision-table td { padding: 5px; border-bottom: 1px solid rgba(255,255,255,0.05); } 
        </style> 
      </head> 
      <body> 
        <div class="main-card"> 
          <div class="logo-container">${logoSvg}</div>
          <h1>RICARDO SENTINELA BOT</h1> 
          <div class="status-badge"><div class="pulse-dot"></div> MONITORANDO M15 + M1...</div> 
          <div class="asset-grid"> 
            <div class="asset-card"><span>BTCUSD</span><span class="status-pill" style="background:rgba(0,255,136,0.15); color:var(--primary)">ATIVO</span></div> 
            <div class="asset-card"><span>EURUSD</span><span class="status-pill" style="background:${bgForex}; color:${colorForex}">${statusForex}</span></div> 
            <div class="asset-card"><span>GBPUSD</span><span class="status-pill" style="background:${bgForex}; color:${colorForex}">${statusForex}</span></div> 
            <div class="asset-card"><span>USDJPY</span><span class="status-pill" style="background:${bgForex}; color:${colorForex}">${statusForex}</span></div> 
          </div> 
          <div class="footer"> 
            <div><b>VERSÃO</b><p style="color:var(--primary);">${versao}</p></div> 
            <div><b>DATA/HORA</b><p>${dataHora.split(',')[1]}</p></div> 
          </div> 
          <table class="revision-table"> 
            <thead> <tr><th>Nº</th><th>DATA</th><th>MOTIVO</th></tr> </thead> 
            <tbody> 
              <tr><td>36</td><td>08/02/26</td><td>IA Martingale Pro (Fib/Vol/BB/Doji)</td></tr>
              <tr><td>35</td><td>08/02/26</td><td>Emojis e Formatação Telegram</td></tr>
            </tbody> 
          </table> 
        </div> 
        <script>setTimeout(()=>location.reload(), 30000);</script> 
      </body></html>
    `);
  } catch (e) { return res.status(200).send("OK"); }
}
