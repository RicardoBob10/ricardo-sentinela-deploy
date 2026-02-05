import { VercelRequest, VercelResponse } from '@vercel/node';

const DOC_CONTROL = {
    versao: "v2.5.3",
    revisao: "00",
    data_revisao: "05/02/2026",
    status: "RICARDO TRADER BTC E FOREX"
};

let lastSinais: Record<string, string> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { TG_TOKEN, TG_CHAT_ID } = process.env;
  const agora = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
  const diaSemana = agora.getDay(); 
  const hora = agora.getHours();

  // Mercado Forex: Abre Domingo 18h e fecha Sexta 17h
  const forexAberto = (diaSemana === 0 && hora >= 18) || (diaSemana >= 1 && diaSemana <= 4) || (diaSemana === 5 && hora < 17);
  
  const ATIVOS = [
    { symbol: "BTC-USDT", label: "BTCUSD", source: "kucoin" },
    { symbol: "EURUSD=X", label: "EURUSD", source: "yahoo" },
    { symbol: "USDJPY=X", label: "USDJPY", source: "yahoo" },
    { symbol: "GBPUSD=X", label: "GBPUSD", source: "yahoo" }
  ];

  try {
    for (const ativo of ATIVOS) {
      if (ativo.source === "yahoo" && !forexAberto) continue;

      let candles = [];
      try {
        const resData = await (ativo.source === "kucoin" 
          ? fetch(`https://api.kucoin.com/api/v1/market/candles?symbol=${ativo.symbol}&type=15min`)
          : fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ativo.symbol}?interval=15m&range=1d`));
        
        const json = await resData.json();
        if (ativo.source === "kucoin") {
          if(!json.data) continue;
          candles = json.data.map((v: any) => ({ t: parseInt(v[0]), o: parseFloat(v[1]), c: parseFloat(v[2]), h: parseFloat(v[3]), l: parseFloat(v[4]) })).reverse();
        } else {
          const r = json.chart.result[0];
          if(!r) continue;
          candles = r.timestamp.map((t: number, i: number) => ({ t, o: r.indicators.quote[0].open[i], c: r.indicators.quote[0].close[i], h: r.indicators.quote[0].high[i], l: r.indicators.quote[0].low[i] })).filter((v: any) => v.c !== null);
        }

        if (candles.length < 30) continue;
        const i = candles.length - 1;

        // LÓGICA V9 SNIPER PURA
        const getEMA = (p: number) => {
          const k = 2 / (p + 1);
          let val = candles[0].c;
          for (let j = 1; j < candles.length; j++) val = candles[j].c * k + val * (1 - k);
          return val;
        };

        const rsiVal = (() => {
            let g = 0, l = 0;
            for (let j = i - 13; j <= i; j++) {
              const d = candles[j].c - candles[j-1].c;
              if (d >= 0) g += d; else l -= d;
            }
            return 100 - (100 / (1 + (g / (l || 0.001))));
        })();

        const ema9 = getEMA(9);
        const ema21 = getEMA(21);

        const fT = candles[i-2].h > candles[i-4].h && candles[i-2].h > candles[i-3].h && candles[i-2].h > candles[i-1].h && candles[i-2].h > candles[i].h;
        const fF = candles[i-2].l < candles[i-4].l && candles[i-2].l < candles[i-3].l && candles[i-2].l < candles[i-1].l && candles[i-2].l < candles[i].l;

        let s = null;
        if (fF && ema9 > ema21 && rsiVal >= 52 && candles[i].c > candles[i].o) s = "ACIMA";
        if (fT && ema9 < ema21 && rsiVal <= 48 && candles[i].c < candles[i].o) s = "ABAIXO";

        if (s) {
          const sid = `${ativo.label}_${candles[i].t}_${s}`;
          if (sid !== lastSinais[ativo.label]) {
            lastSinais[ativo.label] = sid;
            await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: TG_CHAT_ID, text: `*SINAL CONFIRMADO*\n*ATIVO*: *${ativo.label}*\n*SINAL*: ${s === "ACIMA" ? "🟢" : "🔴"} *${s}*`, parse_mode: 'Markdown' })
            });
          }
        }
      } catch (e) {}
    }

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="pt-br">
      <head>
          <meta charset="UTF-8">
          <title>RICARDO TRADER BTC E FOREX</title>
          <style>
              body { background: #000; color: #0f0; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
              .panel { border: 2px solid #0f0; padding: 30px; border-radius: 15px; text-align: center; box-shadow: 0 0 15px #0f0; }
              .dot { height: 12px; width: 12px; background: #0f0; border-radius: 50%; display: inline-block; animation: blink 1s infinite; }
              @keyframes blink { 50% { opacity: 0; } }
          </style>
      </head>
      <body>
          <div class="panel">
              <h1>RICARDO TRADER BTC E FOREX</h1>
              <p><span class="dot"></span> MONITORAMENTO V9 ATIVO</p>
              <p style="font-size: 0.8em; color: #666;">VERSÃO: ${DOC_CONTROL.versao} | REVISÃO: ${DOC_CONTROL.revisao}</p>
          </div>
      </body>
      </html>
    `);
  } catch (e) { return res.status(200).send("OK"); }
}
