import { VercelRequest, VercelResponse } from '@vercel/node';

// --- CONTROLE DE DOCUMENTAÇÃO (ISO 9001) ---
const DOC_CONTROL = {
    versao: "v2.0.5",
    revisao: "05",
    data_revisao: "03/02/2026",
    hora_revisao: "21:50",
    status: "ATIVO"
};

let lastSinais: Record<string, string> = {};
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

const ATIVOS = [
  { symbol: "BTC-USDT", label: "BTCUSD 🪙", source: "kucoin" },
  { symbol: "EURUSD=X", label: "EURUSD 💱", source: "yahoo" },
  { symbol: "JPY=X", label: "USDJPY 💱", source: "yahoo" },
  { symbol: "GBPUSD=X", label: "GBPUSD 💱", source: "yahoo" }
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { TG_TOKEN, TG_CHAT_ID } = process.env;

  try {
    for (const ativo of ATIVOS) {
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
        const getEMA = (d: any[], p: number) => {
          const k = 2 / (p + 1);
          let val = d[0].c;
          for (let j = 1; j < d.length; j++) val = d[j].c * k + val * (1 - k);
          return val;
        };
        const calculateRSI = (d: any[], p: number) => {
          let g = 0, l = 0;
          for (let j = d.length - p; j < d.length; j++) {
            const diff = d[j].c - d[j-1].c;
            if (diff >= 0) g += diff; else l -= diff;
          }
          return 100 - (100 / (1 + (g / l)));
        };

        const rsiVal = calculateRSI(candles, 14);
        const ema9 = getEMA(candles, 9);
        const ema21 = getEMA(candles, 21);
        const fT = candles[i-2].h > candles[i-4].h && candles[i-2].h > candles[i-3].h && candles[i-2].h > candles[i-1].h && candles[i-2].h > candles[i].h;
        const fF = candles[i-2].l < candles[i-4].l && candles[i-2].l < candles[i-3].l && candles[i-2].l < candles[i-1].l && candles[i-2].l < candles[i].l;

        let s = null;
        if (fT && ema9 < ema21 && rsiVal <= 45 && candles[i].c < candles[i].o) s = "🔴 ABAIXO";
        if (fF && ema9 > ema21 && rsiVal >= 55 && candles[i].c > candles[i].o) s = "🟢 ACIMA";

        if (s) {
          await delay(10000); 
          const sid = `${ativo.label}_${candles[i].t}_${s}`;
          if (sid !== lastSinais[ativo.label]) {
            lastSinais[ativo.label] = sid;
            const hA = new Date(candles[i].t * 1000).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
            await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: TG_CHAT_ID, text: `**SINAL CONFIRMADO**\n**ATIVO**: ${ativo.label}\n**SINAL**: ${s}\n**VELA**: ${hA}`, parse_mode: 'Markdown' })
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
          <title>SENTINELA - ${DOC_CONTROL.versao}</title>
          <style>
              body { background-color: #020202; color: #00ff00; font-family: 'Courier New', Courier, monospace; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; overflow: hidden; }
              .eye-bg { position: absolute; width: 350px; height: 350px; background: radial-gradient(circle, rgba(0,255,0,0.15) 0%, rgba(0,0,0,0) 70%); border-radius: 50%; display: flex; justify-content: center; align-items: center; z-index: -1; }
              .pupil { width: 30px; height: 30px; background: #00ff00; border-radius: 50%; box-shadow: 0 0 15px #00ff00; animation: scan 3s infinite ease-in-out; }
              @keyframes scan { 0%, 100% { transform: scale(1); opacity: 0.6; } 50% { transform: scale(1.3); opacity: 0.9; } }
              .panel { text-align: center; border: 1px solid rgba(0,255,0,0.4); padding: 50px; border-radius: 8px; background: rgba(0,0,0,0.9); box-shadow: 0 0 40px rgba(0,0,0,1); }
              .title { font-size: 1.8rem; font-weight: bold; margin-bottom: 30px; letter-spacing: 2px; color: #fff; text-shadow: 0 0 8px #00ff00; }
              .status-box { font-size: 1.1rem; color: #00ff00; font-weight: bold; margin: 20px 0; }
              .footer { margin-top: 40px; font-size: 0.85rem; color: #888; border-top: 1px solid #333; padding-top: 20px; line-height: 1.5; }
              .blink { animation: b 1.5s infinite; display: inline-block; margin-right: 8px; }
              @keyframes b { 50% { opacity: 0; } }
          </style>
      </head>
      <body>
          <div class="eye-bg"><div class="pupil"></div></div>
          <div class="panel">
              <div class="title">RICARDO TRADER<br>FOREX E BITCOIN</div>
              <div class="status-box">
                <span class="blink">●</span> STATUS: ${DOC_CONTROL.status}
              </div>
              <div class="footer">
                  ISO 9001 - DOCUMENTO CONTROLADO<br>
                  VERSÃO: ${DOC_CONTROL.versao} | REF: ${DOC_CONTROL.revisao}<br>
                  REVISADO EM ${DOC_CONTROL.data_revisao} às ${DOC_CONTROL.hora_revisao}
              </div>
          </div>
      </body>
      </html>
    `);
  } catch (e) { return res.status(200).send("Erro"); }
}
