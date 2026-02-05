import { VercelRequest, VercelResponse } from '@vercel/node';

const DOC_CONTROL = {
    versao: "v2.2.1",
    revisao: "11",
    data_revisao: "04/02/2026",
    status: "OPERACIONAL"
};

let lastSinais: Record<string, string> = {};
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// LISTA DE ATIVOS - FOCO EM EXECUÇÃO INDIVIDUAL
const ATIVOS = [
  { symbol: "BTC-USDT", label: "BTCUSD", source: "kucoin" },
  { symbol: "EURUSD=X", label: "EURUSD", source: "yahoo" },
  { symbol: "JPY=X", label: "USDJPY", source: "yahoo" },
  { symbol: "GBPUSD=X", label: "GBPUSD", source: "yahoo" }
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { TG_TOKEN, TG_CHAT_ID } = process.env;
  
  const agora = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
  const diaSemana = agora.getDay(); 
  const hora = agora.getHours();

  // Mercado Forex aberto Domingo 18h até Sexta 17h (Horário de Brasília)
  const forexAberto = (diaSemana === 0 && hora >= 18) || (diaSemana >= 1 && diaSemana <= 4) || (diaSemana === 5 && hora < 17);

  try {
    for (const ativo of ATIVOS) {
      // Se for Forex e o mercado estiver fechado, pula para o próximo
      if (ativo.source === "yahoo" && !forexAberto) continue;

      try {
        let candles = [];
        if (ativo.source === "kucoin") {
          const resK = await fetch(`https://api.kucoin.com/api/v1/market/candles?symbol=${ativo.symbol}&type=15min`);
          const dK = await resK.json();
          if(!dK.data) continue;
          candles = dK.data.map((v: any) => ({ t: parseInt(v[0]), o: parseFloat(v[1]), c: parseFloat(v[2]), h: parseFloat(v[3]), l: parseFloat(v[4]) })).reverse();
        } else {
          const resY = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ativo.symbol}?interval=15m&range=1d`);
          const dY = await resY.json();
          const r = dY.chart.result[0];
          if(!r) continue;
          candles = r.timestamp.map((t: number, i: number) => ({
            t,
            o: r.indicators.quote[0].open[i],
            c: r.indicators.quote[0].close[i],
            h: r.indicators.quote[0].high[i],
            l: r.indicators.quote[0].low[i]
          })).filter((v: any) => v.c !== null && v.o !== null);
        }

        if (candles.length < 30) continue;

        const i = candles.length - 1;
        
        // CÁLCULOS TÉCNICOS
        const calculateRSI = (d: any[], p: number) => {
          let g = 0, l = 0;
          for (let j = d.length - p; j < d.length; j++) {
            const diff = d[j].c - d[j-1].c;
            if (diff >= 0) g += diff; else l -= diff;
          }
          return 100 - (100 / (1 + (g / l)));
        };

        const getEMA = (d: any[], p: number) => {
          const k = 2 / (p + 1);
          let val = d[0].c;
          for (let j = 1; j < d.length; j++) val = d[j].c * k + val * (1 - k);
          return val;
        };

        const rsiVal = calculateRSI(candles, 14);
        const rsiAnt = calculateRSI(candles.slice(0, -1), 14);
        const ema9 = getEMA(candles, 9);
        const ema21 = getEMA(candles, 21);

        // FRACTAL (GATILHO)
        const fT = candles[i-2].h > candles[i-4].h && candles[i-2].h > candles[i-3].h && candles[i-2].h > candles[i-1].h && candles[i-2].h > candles[i].h;
        const fF = candles[i-2].l < candles[i-4].l && candles[i-2].l < candles[i-3].l && candles[i-2].l < candles[i-1].l && candles[i-2].l < candles[i].l;

        let s = null;
        let sEmoji = "";

        // NOVA LÓGICA: CRUZAMENTO + FRACTAL + FORÇA RSI
        if (fT && ema9 < ema21 && rsiVal <= 45 && rsiVal < rsiAnt && candles[i].c < candles[i].o) {
            s = "ABAIXO"; sEmoji = "🔴";
        }
        if (fF && ema9 > ema21 && rsiVal >= 55 && rsiVal > rsiAnt && candles[i].c > candles[i].o) {
            s = "ACIMA"; sEmoji = "🟢";
        }

        if (s) {
          const sid = `${ativo.label}_${candles[i].t}_${s}`;
          if (sid !== lastSinais[ativo.label]) {
            lastSinais[ativo.label] = sid;
            const hA = new Date(candles[i].t * 1000).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
            
            // MENSAGEM EM NEGRITO CONFORME PEDIDO
            const message = `*SINAL CONFIRMADO*\n*ATIVO*: *${ativo.label}*\n*SINAL*: ${sEmoji} *${s}*\n*VELA*: *${hA}*`;
            
            await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: TG_CHAT_ID, text: message, parse_mode: 'Markdown' })
            });
          }
        }
      } catch (e) { continue; }
    }

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="pt-br">
      <head>
          <meta charset="UTF-8">
          <title>SENTINELA V2.2.1</title>
          <style>
              body { background-color: #050505; color: #00ff00; font-family: 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
              .panel { width: 480px; text-align: center; border: 2px solid #00ff00; padding: 45px; border-radius: 20px; background: rgba(0,0,0,0.95); box-shadow: 0 0 60px rgba(0,255,0,0.2); }
              .eye-icon { font-size: 60px; margin-bottom: 20px; animation: pulse 2s infinite; }
              @keyframes pulse { 0%, 100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.1); } }
              .title { font-size: 2.5rem; font-weight: 900; color: #fff; margin-bottom: 10px; }
              .status-box { font-size: 1.5rem; background: rgba(0,255,0,0.1); padding: 20px; border-radius: 12px; margin: 25px 0; border: 1px solid #00ff00; }
              .footer { font-size: 0.9rem; color: #555; border-top: 1px solid #222; padding-top: 20px; }
          </style>
      </head>
      <body>
          <div class="panel">
              <div class="eye-icon">👁️</div>
              <div class="title">RICARDO TRADER</div>
              <div class="status-box">SISTEMA OPERACIONAL</div>
              <div style="font-size: 1.2rem; margin-bottom: 20px;">
                FOREX: <b>${forexAberto ? 'ATIVO ✅' : 'FECHADO 🔒'}</b><br>
                ATIVOS: <b>BTC + 3 PARES FOREX</b>
              </div>
              <div class="footer">
                  REV: ${DOC_CONTROL.revisao} | DATA: ${DOC_CONTROL.data_revisao} | VERSÃO: ${DOC_CONTROL.versao}
              </div>
          </div>
      </body>
      </html>
    `);
  } catch (e) { return res.status(200).send("Erro"); }
}
