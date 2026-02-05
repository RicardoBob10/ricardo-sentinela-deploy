import { VercelRequest, VercelResponse } from '@vercel/node';

let lastSinais: Record<string, string> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { TG_TOKEN, TG_CHAT_ID } = process.env;
  const ATIVOS = [
    { symbol: "BTC-USDT", label: "BTCUSD", source: "kucoin", tf: "1min" },
    { symbol: "EURUSD=X", label: "EURUSD", source: "yahoo", tf: "1m" },
    { symbol: "USDJPY=X", label: "USDJPY", source: "yahoo", tf: "1m" },
    { symbol: "GBPUSD=X", label: "GBPUSD", source: "yahoo", tf: "1m" }
  ];

  try {
    for (const ativo of ATIVOS) {
      const response = await fetch(ativo.source === "kucoin" 
        ? `https://api.kucoin.com/api/v1/market/candles?symbol=${ativo.symbol}&type=${ativo.tf}`
        : `https://query1.finance.yahoo.com/v8/finance/chart/${ativo.symbol}?interval=1m&range=1d`);
      
      const json = await response.json();
      let candles = [];

      if (ativo.source === "kucoin") {
        candles = json.data.map((v:any)=>({t:v[0], c:parseFloat(v[2]), h:parseFloat(v[3]), l:parseFloat(v[4])})).reverse();
      } else {
        const r = json.chart.result[0];
        candles = r.timestamp.map((t:any, i:number)=>({t, c:r.indicators.quote[0].close[i], h:r.indicators.quote[0].high[i], l:r.indicators.quote[0].low[i]}));
      }

      const i = candles.length - 1;
      
      // GATILHO M1: Rompimento imediato da vela de 1 minuto anterior
      const compra = candles[i].c > candles[i-1].h;
      const venda = candles[i].c < candles[i-1].l;

      let s = compra ? "ACIMA" : (venda ? "ABAIXO" : null);

      if (s) {
        const sid = `${ativo.label}_${s}_${candles[i].t}`;
        if (lastSinais[ativo.label] !== sid) {
          lastSinais[ativo.label] = sid;
          await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
              chat_id: TG_CHAT_ID, 
              text: `⚡ *ALERTA M1*\n*ATIVO*: ${ativo.label}\n*DIREÇÃO*: ${s === "ACIMA" ? "🟢" : "🔴"} ${s}`,
              parse_mode:'Markdown'
            })
          });
        }
      }
    }

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <html lang="pt-br">
      <head><meta charset="UTF-8"><title>RICARDO TRADER M1</title>
      <style>body{background:#000;color:#0f0;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}
      .panel{border:3px double #f00;padding:40px;border-radius:20px;text-align:center;box-shadow:0 0 20px #f00;}</style></head>
      <body>
        <div class="panel">
          <h1 style="color:white;">RICARDO TRADER M1</h1>
          <p style="color:yellow; font-weight:bold;">● VELOCIDADE MÁXIMA (1 MINUTO)</p>
          <p>REVISÃO: 00 | STATUS: EMITINDO...</p>
        </div>
        <script>setTimeout(() => { window.location.reload(); }, 10000);</script>
      </body></html>
    `);
  } catch (e) { return res.status(200).send("OK"); }
}
