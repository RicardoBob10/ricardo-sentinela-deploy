import { VercelRequest, VercelResponse } from '@vercel/node';

const DOC_CONTROL = {
    versao: "v2.3.2",
    revisao: "15",
    data_revisao: "04/02/2026",
    hora_revisao: "23:18",
    status: "INTELIGÊNCIA SNIPER ATIVA"
};

let lastSinais: Record<string, string> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { TG_TOKEN, TG_CHAT_ID } = process.env;
  const agora = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
  const diaSemana = agora.getDay(); 
  const hora = agora.getHours();

  const forexAberto = (diaSemana === 0 && hora >= 18) || (diaSemana >= 1 && diaSemana <= 4) || (diaSemana === 5 && hora < 17);
  
  const ATIVOS = [
    { symbol: "BTC-USDT", label: "BTCUSD", source: "kucoin" },
    { symbol: "EURUSD=X", label: "EURUSD", source: "yahoo" },
    { symbol: "JPY=X", label: "USDJPY", source: "yahoo" },
    { symbol: "GBPUSD=X", label: "GBPUSD", source: "yahoo" }
  ];

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
        const getEMA = (d: any[], p: number) => {
          const k = 2 / (p + 1);
          let val = d[0].c;
          for (let j = 1; j < d.length; j++) val = d[j].c * k + val * (1 - k);
          return val;
        };

        const rsiVal = 50; // Lógica simplificada de RSI para o handler
        const ema9 = getEMA(candles, 9);
        const ema21 = getEMA(candles, 21);

        // LÓGICA V9: FRACTAL + TENDÊNCIA DAS MÉDIAS
        const fT = candles[i-2].h > candles[i-4].h && candles[i-2].h > candles[i-3].h && candles[i-2].h > candles[i-1].h && candles[i-2].h > candles[i].h;
        const fF = candles[i-2].l < candles[i-4].l && candles[i-2].l < candles[i-3].l && candles[i-2].l < candles[i-1].l && candles[i-2].l < candles[i].l;

        let s = null;
        let sEmoji = "";

        if (fT && ema9 < ema21 && candles[i].c < candles[i].o) { s = "ABAIXO"; sEmoji = "🔴"; }
        if (fF && ema9 > ema21 && candles[i].c > candles[i].o) { s = "ACIMA"; sEmoji = "🟢"; }

        if (s) {
          const sid = `${ativo.label}_${candles[i].t}_${s}`;
          if (sid !== lastSinais[ativo.label]) {
            lastSinais[ativo.label] = sid;
            const hA = new Date(candles[i].t * 1000).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
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
          <style>
              body { background-color: #020202; color: #00ff00; font-family: 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
              .panel { width: 700px; text-align: center; border: 4px double #00ff00; padding: 60px; border-radius: 40px; background: #000; box-shadow: 0 0 100px rgba(0,255,0,0.2); }
              .eye { font-size: 110px; filter: drop-shadow(0 0 20px #00ff00); animation: p 2s infinite; display: block; margin-bottom: 20px; }
              @keyframes p { 0%, 100% { opacity: 0.4; transform: scale(1); } 50% { opacity: 1; transform: scale(1.1); } }
              .title { font-size: 3.5rem; font-weight: 900; color: #fff; margin-bottom: 20px; text-shadow: 0 0 15px rgba(255,255,255,0.3); }
              .status-line { font-size: 2.2rem; font-weight: bold; margin: 40px 0; display: flex; align-items: center; justify-content: center; color: #00ff00; }
              .dot { height: 30px; width: 30px; background: #00ff00; border-radius: 50%; display: inline-block; margin-right: 25px; box-shadow: 0 0 20px #00ff00; animation: b 1s infinite; }
              @keyframes b { 50% { opacity: 0; } }
              .info { font-size: 1.5rem; color: #ccc; margin-bottom: 50px; background: rgba(255,255,255,0.05); padding: 25px; border-radius: 20px; }
              .footer { font-size: 1.1rem; color: #444; border-top: 1px solid #222; padding-top: 30px; }
              .highlight { color: #fff; }
          </style>
      </head>
      <body>
          <div class="panel">
              <span class="eye">👁️</span>
              <div class="title">RICARDO TRADER<br>BTC E FOREX</div>
              <div class="status-line"><span class="dot"></span>ROBO EM MONITORAMENTO..</div>
              <div class="info">
                  MERCADO FOREX: <span class="highlight">${forexAberto ? 'ABERTO ✅' : 'FECHADO 🔒'}</span><br>
                  MONITORANDO: <span class="highlight">BTCUSD + EURUSD + GBPUSD + USDJPY</span>
              </div>
              <div class="footer">
                  VERSÃO: <span class="highlight">${DOC_CONTROL.versao}</span> | 
                  REVISÃO: <span class="highlight">${DOC_CONTROL.revisao}</span><br>
                  DATA: <span class="highlight">${DOC_CONTROL.data_revisao}</span> | 
                  HORA: <span class="highlight">${DOC_CONTROL.hora_revisao}</span>
              </div>
          </div>
      </body>
      </html>
    `);
  } catch (e) { return res.status(200).send("Erro"); }
}
