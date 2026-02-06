import { VercelRequest, VercelResponse } from '@vercel/node';

let lastSinais: Record<string, string> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";
  const versao = "00-M1";
  const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const ATIVOS = [
    { symbol: "BTC-USDT", label: "BTCUSD", source: "kucoin" },
    { symbol: "EURUSD=X", label: "EURUSD", source: "yahoo" },
    { symbol: "GBPUSD=X", label: "GBPUSD", source: "yahoo" },
    { symbol: "USDJPY=X", label: "USDJPY", source: "yahoo" }
  ];

  try {
    for (const ativo of ATIVOS) {
      const url = ativo.source === "kucoin" 
        ? `https://api.kucoin.com/api/v1/market/candles?symbol=${ativo.symbol}&type=1min`
        : `https://query1.finance.yahoo.com/v8/finance/chart/${ativo.symbol}?interval=1m&range=1d`;

      const response = await fetch(url);
      const json = await response.json();
      let candles: any[] = [];

      if (ativo.source === "kucoin") {
        if (!json.data) continue;
        candles = json.data.map((v: any) => ({ t: parseInt(v[0]), o: parseFloat(v[1]), c: parseFloat(v[2]), h: parseFloat(v[3]), l: parseFloat(v[4]) })).reverse();
      } else {
        const r = json.chart.result[0];
        if (!r || !r.timestamp) continue;
        candles = r.timestamp.map((t: any, idx: number) => ({
          t, o: r.indicators.quote[0].open[idx], c: r.indicators.quote[0].close[idx], h: r.indicators.quote[0].high[idx], l: r.indicators.quote[0].low[idx]
        })).filter((v: any) => v.c !== null);
      }

      if (candles.length < 40) continue;
      const i = candles.length - 1;

      const getEMA = (p: number, idx: number) => {
        const k = 2 / (p + 1);
        let ema = candles[0].c;
        for (let j = 1; j <= idx; j++) ema = candles[j].c * k + ema * (1 - k);
        return ema;
      };

      const getRSI = (idx: number, p: number) => {
        let g = 0, l = 0;
        for (let j = idx - p; j <= idx; j++) {
          const d = candles[j].c - candles[j-1].c;
          if (d >= 0) g += d; else l -= d;
        }
        return 100 - (100 / (1 + (g / (l || 1))));
      };

      const macd = getEMA(12, i) - getEMA(26, i);
      const signal = getEMA(9, i);
      const rsi_v = getRSI(i, 9);
      const momentum = candles[i].c - candles[i-10].c;
      
      const f_topo = candles[i-2].h > candles[i-4].h && candles[i-2].h > candles[i-3].h && candles[i-2].h > candles[i-1].h && candles[i-2].h > candles[i].h;
      const f_fundo = candles[i-2].l < candles[i-4].l && candles[i-2].l < candles[i-3].l && candles[i-2].l < candles[i-1].l && candles[i-2].l < candles[i].l;

      let sinalStr = "";
      if (f_fundo && macd > signal && rsi_v > getRSI(i-1, 9) && momentum > (candles[i-1].c - candles[i-11].c)) sinalStr = "ACIMA";
      if (f_topo && macd < signal && rsi_v < getRSI(i-1, 9) && momentum < (candles[i-1].c - candles[i-11].c)) sinalStr = "ABAIXO";

      if (sinalStr) {
        const velaHora = new Date(candles[i].t * 1000).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
        const sid = `${ativo.label}_${sinalStr}_${candles[i].t}`;
        
        if (lastSinais[ativo.label] !== sid) {
          lastSinais[ativo.label] = sid;
          const bolinha = sinalStr === "ACIMA" ? "🟢" : "🔴";
          const msg = `SINAL EMITIDO!\n\n**ATIVO**: ${ativo.label}\n**SINAL**: ${bolinha} ${sinalStr}\n**VELA**: ${velaHora}`;
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id, text: msg, parse_mode: 'Markdown' })
          });
        }
      }
    }

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
          <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>RICARDO SENTINELA PRO</title>
          <style>
              :root { --primary: #00ff88; --bg: #050505; }
              body { background-color: var(--bg); background-image: radial-gradient(circle at 2px 2px, rgba(255,255,255,0.02) 1px, transparent 0); background-size: 32px 32px; color: #fff; font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
              .main-card { width: 90%; max-width: 380px; background: rgba(17,17,17,0.85); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); border-radius: 32px; padding: 35px 25px; box-shadow: 0 25px 50px rgba(0,0,0,0.8); }
              h1 { font-size: 26px; text-align: center; margin: 0 0 25px 0; font-weight: 900; text-transform: uppercase; color: #FFFFFF; text-shadow: 0 0 10px rgba(255,255,255,0.8), 0 0 20px rgba(255,255,255,0.4); letter-spacing: 1px; }
              .status-badge { display: flex; align-items: center; justify-content: center; gap: 10px; background: rgba(0,255,136,0.08); border: 1px solid rgba(0,255,136,0.2); padding: 10px; border-radius: 14px; font-size: 12px; font-weight: 700; color: var(--primary); margin-bottom: 30px; }
              .pulse-dot { height: 8px; width: 8px; background-color: var(--primary); border-radius: 50%; box-shadow: 0 0 15px var(--primary); animation: pulse 1.5s infinite; }
              .asset-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 14px 18px; border-radius: 16px; display: flex; justify-content: space-between; margin-bottom: 10px; }
              .status-pill { font-size: 10px; font-weight: 800; padding: 4px 10px; border-radius: 6px; background: rgba(0,255,136,0.15); color: var(--primary); }
              .footer { margin-top: 35px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.08); display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 11px; }
              .footer b { color: #888; display: block; font-size: 9px; text-transform: uppercase; margin-bottom: 2px; }
              .footer p { margin: 0; font-family: 'JetBrains Mono', monospace; font-size: 12px; }
              @keyframes pulse { 0%, 100% { transform: scale(0.95); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.5; } }
          </style>
      </head>
      <body>
          <div class="main-card">
              <h1>RICARDO SENTINELA BOT</h1>
              <div class="status-badge"><div class="pulse-dot"></div> ATIVOS EM MONITORAMENTO REAL</div>
              <div class="asset-grid">
                  <div class="asset-card"><span>BTCUSD</span><span class="status-pill">ABERTO</span></div>
                  <div class="asset-card"><span>EURUSD</span><span class="status-pill">ABERTO</span></div>
                  <div class="asset-card"><span>GBPUSD</span><span class="status-pill">ABERTO</span></div>
                  <div class="asset-card"><span>USDJPY</span><span class="status-pill">ABERTO</span></div>
              </div>
              <div class="footer">
                  <div><b>DATA</b><p>${dataHora.split(',')[0]}</p></div>
                  <div><b>HORA</b><p>${dataHora.split(',')[1]}</p></div>
                  <div><b>VERSÃO</b><p style="color:var(--primary); font-weight:bold;">${versao}</p></div>
                  <div><b>STATUS</b><p style="color:var(--primary)">ONLINE</p></div>
              </div>
          </div>
          <script>setTimeout(()=>location.reload(), 30000);</script>
      </body></html>
    `);
  } catch (e) { return res.status(200).send("SERVER ONLINE"); }
}
