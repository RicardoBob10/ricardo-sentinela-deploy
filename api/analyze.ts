import { VercelRequest, VercelResponse } from '@vercel/node';

const DOC_CONTROL = {
    versao: "v2.2.0",
    revisao: "10",
    data_revisao: "04/02/2026",
    status: "OPERACIONAL"
};

let lastSinais: Record<string, string> = {};
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// LISTA DE ATIVOS CORRIGIDA
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

  const forexAberto = (diaSemana === 0 && hora >= 18) || (diaSemana >= 1 && diaSemana <= 4) || (diaSemana === 5 && hora < 17);

  try {
    for (const ativo of ATIVOS) {
      if (ativo.source === "yahoo" && !forexAberto) continue;

      try {
        let candles = [];
        if (ativo.source === "kucoin") {
          const resK = await fetch(`https://api.kucoin.com/api/v1/market/candles?symbol=${ativo.symbol}&type=15min`);
          const dK = await resK.json();
          candles = dK.data.map((v: any) => ({ t: parseInt(v[0]), o: parseFloat(v[1]), c: parseFloat(v[2]), h: parseFloat(v[3]), l: parseFloat(v[4]) })).reverse();
        } else {
          const resY = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ativo.symbol}?interval=15m&range=1d`);
          const dY = await resY.json();
          const r = dY.chart.result[0];
          candles = r.timestamp.map((t: number, i: number) => ({ t, o: r.indicators.quote[0].open[i], c: r.indicators.quote[0].close[i], h: r.indicators.quote[0].high[i], l: r.indicators.quote[0].low[i] })).filter((v: any) => v.c !== null);
        }

        const i = candles.length - 1;
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

        const fT = candles[i-2].h > candles[i-4].h && candles[i-2].h > candles[i-3].h && candles[i-2].h > candles[i-1].h && candles[i-2].h > candles[i].h;
        const fF = candles[i-2].l < candles[i-4].l && candles[i-2].l < candles[i-3].l && candles[i-2].l < candles[i-1].l && candles[i-2].l < candles[i].l;

        let s = null;
        let sEmoji = "";
        // LÓGICA DE CRUZAMENTO + FORÇA (RSI)
        if (fT && ema9 < ema21 && rsiVal <= 45 && rsiVal < rsiAnt && candles[i].c < candles[i].o) { s = "ABAIXO"; sEmoji = "🔴"; }
        if (fF && ema9 > ema21 && rsiVal >= 55 && rsiVal > rsiAnt && candles[i].c > candles[i].o) { s = "ACIMA"; sEmoji = "🟢"; }

        if (s) {
          const sid = `${ativo.label}_${candles[i].t}_${s}`;
          if (sid !== lastSinais[ativo.label]) {
            lastSinais[ativo.label] = sid;
            const hA = new Date(candles[i].t * 1000).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
            
            // MENSAGEM COM NEGRITO CORRIGIDO (Markdown V2 requer escape ou Markdown simples)
            const text = `*SINAL CONFIRMADO*\n*ATIVO*: ${ativo.label}\n*SINAL*: ${sEmoji} ${s}\n*VELA*: ${hA}`;
            
            await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: TG_CHAT_ID, text: text, parse_mode: 'Markdown' })
            });
          }
        }
      } catch (e) { console.log("Erro no ativo " + ativo.label); }
    }

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="pt-br">
      <head>
          <meta charset="UTF-8">
          <title>SENTINELA V2.2.0</title>
          <style>
              body { background-color: #050505; color: #00ff00; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
              .panel { width: 450px; text-align: center; border: 2px solid #00ff00; padding: 40px; border-radius: 15px; background: rgba(0,0,0,0.95); box-shadow: 0 0 50px rgba(0,255,0,0.2); position: relative; }
              .eye-container { margin-bottom: 20px; }
              .eye { width: 80px; height: 80px; filter: drop-shadow(0 0 10px #00ff00); animation: pulse 2s infinite; }
              @keyframes pulse { 0% { opacity: 0.6; transform: scale(1); } 50% { opacity: 1; transform: scale(1.05); } 100% { opacity: 0.6; transform: scale(1); } }
              .title { font-size: 2.2rem; font-weight: 800; margin-bottom: 10px; color: #fff; text-transform: uppercase; letter-spacing: 2px; }
              .status-box { font-size: 1.4rem; background: rgba(0,255,0,0.1); padding: 15px; border-radius: 10px; margin: 25px 0; border: 1px solid #00ff00; }
              .info-grid { font-size: 1.1rem; color: #ccc; margin-bottom: 30px; line-height: 1.8; }
              .footer { font-size: 0.9rem; color: #666; border-top: 1px solid #222; padding-top: 20px; }
              .blink { animation: b 1s infinite; color: #00ff00; }
              @keyframes b { 50% { opacity: 0; } }
          </style>
      </head>
      <body>
          <div class="panel">
              <div class="eye-container">
                <svg class="eye" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="#00ff00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <circle cx="12" cy="12" r="3" stroke="#00ff00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div class="title">RICARDO TRADER</div>
              <div class="status-box"><span class="blink">●</span> SISTEMA ${DOC_CONTROL.status}</div>
              <div class="info-grid">
                  ESTADO DO FOREX: <b>${forexAberto ? 'ABERTO ✅' : 'FECHADO 🔒'}</b><br>
                  MONITORIZANDO: <b>BTC + FOREX</b>
              </div>
              <div class="footer">
                  CONTROLE: ${DOC_CONTROL.versao} | REV: ${DOC_CONTROL.revisao}<br>
                  DATA: ${DOC_CONTROL.data_revisao}
              </div>
          </div>
      </body>
      </html>
    `);
  } catch (e) { return res.status(200).send("Erro"); }
}
