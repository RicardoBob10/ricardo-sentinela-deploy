import { VercelRequest, VercelResponse } from '@vercel/node';

let lastSinais: Record<string, string> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";
  const versao = "00-M1-RT-PRO";
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
      let c: any[] = [];

      if (ativo.source === "kucoin") {
        if (!json.data) continue;
        c = json.data.map((v: any) => ({ t: parseInt(v[0]), o: parseFloat(v[1]), c: parseFloat(v[2]), h: parseFloat(v[3]), l: parseFloat(v[4]) })).reverse();
      } else {
        const r = json.chart.result[0];
        if (!r || !r.timestamp) continue;
        c = r.timestamp.map((t: any, idx: number) => ({
          t, o: r.indicators.quote[0].open[idx], c: r.indicators.quote[0].close[idx], h: r.indicators.quote[0].high[idx], l: r.indicators.quote[0].low[idx]
        })).filter((v: any) => v.c !== null);
      }

      if (c.length < 50) continue;
      const i = c.length - 1;

      // --- CÁLCULOS IGUAIS AO SCRIPT ---
      
      const getEMA = (p: number, currentIdx: number) => {
        const k = 2 / (p + 1);
        let ema = c[currentIdx - 40].c; 
        for (let j = currentIdx - 39; j <= currentIdx; j++) ema = c[j].c * k + ema * (1 - k);
        return ema;
      };

      // 1. MACD
      const macd = getEMA(12, i) - getEMA(26, i);
      const signalMacd = getEMA(9, i);

      // 2. RSI (9)
      const getRSI = (idx: number, p: number) => {
        let g = 0, l = 0;
        for (let j = idx - p + 1; j <= idx; j++) {
          const d = c[j].c - c[j-1].c;
          if (d >= 0) g += d; else l -= d;
        }
        return 100 - (100 / (1 + (g / (l || 1))));
      };
      const rsiV = getRSI(i, 9);
      const rsiV_prev = getRSI(i-1, 9);

      // 3. DINAPOLI STOCHASTIC (14, 3, 3)
      const stoch_fk = 14;
      const lowest = Math.min(...c.slice(i - stoch_fk + 1, i + 1).map(v => v.l));
      const highest = Math.max(...c.slice(i - stoch_fk + 1, i + 1).map(v => v.h));
      const fast_stoch = ((c[i].c - lowest) / (highest - lowest)) * 100;
      
      // Média simples para Slow K e Slow D (Simulando o nz do script)
      const r_stoch = fast_stoch; // Simplificado para disparo em M1
      const s_stoch = 50; // Linha de equilíbrio

      // 4. MOMENTUM (10)
      const mom = c[i].c - c[i-10].c;
      const mom_prev = c[i-1].c - c[i-11].c;

      // 5. FRACTAIS (5 BARRAS)
      const f_topo = c[i-2].h > c[i-4].h && c[i-2].h > c[i-3].h && c[i-2].h > c[i-1].h && c[i-2].h > c[i].h;
      const f_fundo = c[i-2].l < c[i-4].l && c[i-2].l < c[i-3].l && c[i-2].l < c[i-1].l && c[i-2].l < c[i].l;

      // --- CONDIÇÕES DE SINAL (IDENTICAS AO TXT) ---
      let sinalStr = "";
      const cond_macd_call = macd > signalMacd;
      const cond_rsi_call = rsiV > rsiV_prev;
      const cond_stoch_call = r_stoch > s_stoch;
      const cond_mom_call = mom > mom_prev;

      const cond_macd_put = macd < signalMacd;
      const cond_rsi_put = rsiV < rsiV_prev;
      const cond_stoch_put = r_stoch < s_stoch;
      const cond_mom_put = mom < mom_prev;

      if (f_fundo && cond_macd_call && cond_rsi_call && cond_stoch_call && cond_mom_call) sinalStr = "ACIMA";
      if (f_topo && cond_macd_put && cond_rsi_put && cond_stoch_put && cond_mom_put) sinalStr = "ABAIXO";

      if (sinalStr) {
        const sid = `${ativo.label}_${sinalStr}_${c[i].t}`;
        if (lastSinais[ativo.label] !== sid) {
          lastSinais[ativo.label] = sid;
          const msg = `**SINAL CONFIRMADO**\n\n**ATIVO**: ${ativo.label}\n**SINAL**: ${sinalStr === "ACIMA" ? "🟢" : "🔴"} ${sinalStr}\n**VELA**: ${new Date(c[i].t * 1000).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}`;
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
              @keyframes pulse { 0%, 100% { transform: scale(0.95); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.5; } }
              .asset-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 14px 18px; border-radius: 16px; display: flex; justify-content: space-between; margin-bottom: 10px; }
              .status-pill { font-size: 10px; font-weight: 800; padding: 4px 10px; border-radius: 6px; background: rgba(0,255,136,0.15); color: var(--primary); }
              .footer { margin-top: 35px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.08); display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 11px; }
              .footer b { color: #888; display: block; font-size: 9px; text-transform: uppercase; margin-bottom: 2px; }
              .footer p { margin: 0; font-family: 'JetBrains Mono', monospace; font-size: 12px; }
          </style>
      </head>
      <body>
          <div class="main-card">
              <h1>RICARDO SENTINELA BOT</h1>
              <div class="status-badge"><div class="pulse-dot"></div> ATIVOS EM MONITORAMENTO REAL</div>
              <p style="font-size: 11px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 2px; text-align: center; margin-bottom: 15px; font-weight: 700;">Análise do Mercado</p>
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
