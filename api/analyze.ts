import { VercelRequest, VercelResponse } from '@vercel/node';

// Objeto para persistir sinais e contextos de martingale durante a sessão
let lastSinais: Record<string, any> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";
  const versao = "34"; 
  
  const agora = new Date();
  const dataHora = agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const horaBrasilia = parseInt(agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }));
  const minutosAtuais = agora.getMinutes();
  const diaSemana = agora.getDay(); 
  
  const minutoNaVela = minutosAtuais % 15;
  const dentroDaJanela = minutoNaVela <= 10;
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

      // BUSCA DE DADOS (Capturando High, Low e Volume para Fibonacci e Doji)
      const url = ativo.source === "kucoin" 
        ? `https://api.kucoin.com/api/v1/market/candles?symbol=${ativo.symbol}&type=15min`
        : `https://query1.finance.yahoo.com/v8/finance/chart/${ativo.symbol}?interval=15m&range=1d`;

      const response = await fetch(url);
      const json = await response.json();
      let candles: any[] = [];

      if (ativo.source === "kucoin") {
        if (!json.data) continue;
        candles = json.data.map((v: any) => ({ 
          t: parseInt(v[0]), o: parseFloat(v[1]), c: parseFloat(v[2]), 
          h: parseFloat(v[3]), l: parseFloat(v[4]), v: parseFloat(v[5]) 
        })).reverse();
      } else {
        const r = json.chart.result?.[0];
        if (!r || !r.timestamp) continue;
        const q = r.indicators.quote[0];
        candles = r.timestamp.map((t: any, idx: number) => ({
          t, o: q.open[idx], c: q.close[idx], h: q.high[idx], l: q.low[idx], v: q.volume[idx]
        })).filter((v: any) => v.c !== null && v.o !== null);
      }

      if (candles.length < 50) continue;
      const i = candles.length - 1; 
      const p = i - 1; // Vela Anterior

      // --- FUNÇÕES TÉCNICAS REAPROVEITÁVEIS ---
      const getEMA = (period: number, idx: number) => {
        const k = 2 / (period + 1);
        let ema = candles[idx - 40].c; 
        for (let j = idx - 39; j <= idx; j++) ema = candles[j].c * k + ema * (1 - k);
        return ema;
      };

      const getRSI = (idx: number, period: number) => {
        let g = 0, l = 0;
        for (let j = idx - period + 1; j <= idx; j++) {
          const d = candles[j].c - candles[j-1].c;
          if (d >= 0) g += d; else l -= d;
        }
        return 100 - (100 / (1 + (g / (l || 1))));
      };

      // Fibonacci no corpo da vela anterior (Melhoria 1)
      const corpoP = Math.abs(candles[p].c - candles[p].o);
      const isRedP = candles[p].c < candles[p].o;
      const fibs = {
        f618: isRedP ? candles[p].c + (corpoP * 0.618) : candles[p].o + (corpoP * 0.618),
        f50: (candles[p].o + candles[p].c) / 2,
        f382: isRedP ? candles[p].c + (corpoP * 0.382) : candles[p].o + (corpoP * 0.382)
      };

      // Bollinger (Melhoria 3)
      const slice20 = candles.slice(-20);
      const sma20 = slice20.reduce((a, b) => a + b.c, 0) / 20;
      const variance = slice20.reduce((a, b) => a + Math.pow(b.c - sma20, 2), 0) / 20;
      const stdDev = Math.sqrt(variance);
      const bWidth = ((sma20 + 2 * stdDev) - (sma20 - 2 * stdDev)) / sma20;

      // Volume (Melhoria 2)
      const avgVol = candles.slice(-21, -1).reduce((a, b) => a + b.v, 0) / 20;
      const volRatio = candles[i].v / (avgVol || 1);

      // Doji (Melhoria 7)
      const isDoji = (corpoP / (candles[p].h - candles[p].l)) < 0.30;

      // --- LÓGICA DE SINAL ORIGINAL ---
      const e4_i = getEMA(4, i); const e8_i = getEMA(8, i);
      const e4_p = getEMA(4, p); const e8_p = getEMA(8, p);
      const rsi_i = getRSI(i, 9);
      const isVerde = candles[i].c > candles[i].o;
      const isVermelha = candles[i].c < candles[i].o;

      let sinalStr = "";
      if (e4_p <= e8_p && e4_i > e8_i && rsi_i > 30 && isVerde) sinalStr = "ACIMA";
      else if (e4_p >= e8_p && e4_i < e8_i && rsi_i < 70 && isVermelha) sinalStr = "ABAIXO";

      if (sinalStr && dentroDaJanela) {
        const signalKey = `${ativo.label}_${sinalStr}_${candles[i].t}`;
        if (lastSinais[ativo.label] !== signalKey) {
          lastSinais[ativo.label] = signalKey;
          lastSinais[`${ativo.label}_CTX`] = { type: sinalStr, ts: candles[i].t, sent: false }; // Contexto p/ Martingale
          
          const icon = sinalStr === "ACIMA" ? "🟢" : "🔴";
          const seta = sinalStr === "ACIMA" ? "⬆" : "⬇";
          const hV = new Date(candles[i].t * 1000).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
          const msg = `${icon} <b>SINAL EMITIDO!</b>\n<b>ATIVO</b>: ${ativo.label}\n<b>SINAL</b>: ${seta} ${sinalStr}\n<b>VELA</b>: ${hV}`;
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id, text: msg, parse_mode: 'HTML' }) });
        }
      }

      // --- LÓGICA DE ALERTA MARTINGALE (NOVA) ---
      const ctx = lastSinais[`${ativo.label}_CTX`];
      if (ctx && !ctx.sent && minutoNaVela >= 3 && minutoNaVela <= 10) {
        const preco = candles[i].c;
        const trendOk = ctx.type === "ACIMA" ? e4_i > e8_i : e4_i < e8_i;
        const volOk = volRatio > 0.8;
        const bbLimit = ativo.type === "crypto" ? 0.04 : 0.02;
        const bbOk = bWidth > bbLimit;
        
        let mGale = false;
        let rsiStatus = rsi_i < 30 || rsi_i > 70 ? "FORTE" : "moderado";

        if (ctx.type === "ACIMA") {
          // Tocou fib50-618 e voltou acima de 382
          if (preco <= fibs.f50 && preco >= (fibs.f618 * 0.999) && rsi_i < 45) mGale = true;
        } else {
          if (preco >= fibs.f50 && preco <= (fibs.f618 * 1.001) && rsi_i > 55) mGale = true;
        }

        // BLOQUEIOS (FIB 618 ultrapassado, Doji, BB lateral, Trend invertida)
        if (mGale && trendOk && volOk && bbOk && !isDoji) {
          ctx.sent = true;
          const hV = new Date(ctx.ts * 1000).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
          const msgM = `⚠️ <b>ALERTA DE MARTINGALE</b>\n\n${ctx.type === "ACIMA" ? '🟢' : '🔴'} <b>Sinal:</b> ${ctx.type === "ACIMA" ? '⬆' : '⬇'} ${ctx.type}\n<b>Ativo:</b> ${ativo.label}\n<b>Vela:</b> ${hV}\n<b>Fibonacci:</b> Rejeitou níveis centrais\n<b>RSI:</b> ${rsi_i.toFixed(1)} (${rsiStatus})\n<b>Micro Tendência:</b> ${ctx.type}\n<b>Volume:</b> ${volRatio.toFixed(1)}x média\n<b>Bollinger:</b> ${(bWidth * 100).toFixed(2)}%\n<b>Tempo restante:</b> ${15 - minutoNaVela} min\n\n✅ <b>Condições favoráveis para martingale</b>`;
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id, text: msgM, parse_mode: 'HTML' }) });
        }
      }
    }

    const statusForex = isForexOpen ? "ABERTO" : "FECHADO";
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <!DOCTYPE html> <html lang="pt-BR"> <head> <meta charset="UTF-8"><title>SENTINELA V34</title> <style> :root { --primary: #00ff88; --bg: #050505; } body { background: var(--bg); color: #fff; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; } .card { background: #111; padding: 30px; border-radius: 20px; border: 1px solid #333; text-align: center; width: 350px; } .status { color: var(--primary); font-size: 12px; margin-bottom: 20px; } .asset { display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #222; } </style> </head> <body> <div class="card"> <h1>SENTINELA PRO</h1> <div class="status">● MONITORANDO...</div> <div class="asset"><span>BTCUSD</span><span>ATIVO</span></div> <div class="asset"><span>EURUSD</span><span>${statusForex}</span></div> <div class="asset"><span>GBPUSD</span><span>${statusForex}</span></div> <div class="asset"><span>USDJPY</span><span>${statusForex}</span></div> <p style="font-size: 10px; color: #555; margin-top: 20px;">VERSÃO ${versao} | JANELA 10M | FIBONACCI ATIVO</p> </div> <script>setTimeout(()=>location.reload(), 30000);</script> </body> </html>
    `);
  } catch (e) { return res.status(200).send("OK"); }
}
