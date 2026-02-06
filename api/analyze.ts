import { VercelRequest, VercelResponse } from '@vercel/node';

let lastSinais: Record<string, string> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = process.env.TG_TOKEN || "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = process.env.TG_CHAT_ID || "7625668696";
  const versao = "08"; 
  const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const ATIVOS = [
    { symbol: "BTC-USDT", label: "BTCUSD", source: "kucoin" },
    { symbol: "EURUSD=X", label: "EURUSD", source: "yahoo" },
    { symbol: "GBPUSD=X", label: "GBPUSD", source: "yahoo" },
    { symbol: "USDJPY=X", label: "USDJPY", source: "yahoo" }
  ];

  try {
    for (const ativo of ATIVOS) {
      // CONFIGURADO PARA M1 (TESTE DE SINAIS RÁPIDOS)
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
      const p = i - 1;

      const getEMA = (period: number, idx: number) => {
        const k = 2 / (period + 1);
        let ema = c[idx - 40].c; 
        for (let j = idx - 39; j <= idx; j++) ema = c[j].c * k + ema * (1 - k);
        return ema;
      };

      const getRSI = (idx: number, period: number) => {
        let g = 0, l = 0;
        for (let j = idx - period + 1; j <= idx; j++) {
          const d = c[j].c - c[j-1].c;
          if (d >= 0) g += d; else l -= d;
        }
        return 100 - (100 / (1 + (g / (l || 1))));
      };

      // LÓGICA: EMA 4, EMA 8, RSI 9 e Cor da Vela
      const e4_atual = getEMA(4, i);
      const e8_atual = getEMA(8, i);
      const e4_prev = getEMA(4, p);
      const e8_prev = getEMA(8, p);
      const rsi9 = getRSI(i, 9);
      const rsi9_prev = getRSI(p, 9);
      const isVerde = c[i].c > c[i].o;
      const isVermelha = c[i].c < c[i].o;

      let sinalStr = "";

      // SINAL ACIMA: EMA4 cruza p/ cima EMA8 + RSI9 > 30 (ou 50) + RSI subindo + Vela Verde
      if (e4_prev <= e8_prev && e4_atual > e8_atual && rsi9 > 30 && rsi9 > rsi9_prev && isVerde) {
        sinalStr = "ACIMA";
      }
      // SINAL ABAIXO: EMA4 cruza p/ baixo EMA8 + RSI9 < 70 (ou 50) + RSI descendo + Vela Vermelha
      if (e4_prev >= e8_prev && e4_atual < e8_atual && rsi9 < 70 && rsi9 < rsi9_prev && isVermelha) {
        sinalStr = "ABAIXO";
      }

      if (sinalStr) {
        const sid = `${ativo.label}_${sinalStr}_${c[i].t}`;
        if (lastSinais[ativo.label] !== sid) {
          lastSinais[ativo.label] = sid;
          
          const icon = sinalStr === "ACIMA" ? "🟢" : "🔴";
          const horaVela = new Date(c[i].t * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

          const msg = `SINAL EMITIDO!\n**ATIVO**: ${ativo.label}\n**SINAL**: ${icon} ${sinalStr}\n**VELA**: ${horaVela}`;
          
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
          <meta charset="UTF-8">
          <title>RICARDO SENTINELA PRO</title>
          <style>
              :root { --primary: #00ff88; --bg: #050505; }
              body { background-color: var(--bg); color: #fff; font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
              .main-card { width: 90%; max-width: 380px; background: rgba(17,17,17,0.85); border: 1px solid rgba(255,255,255,0.1); border-radius: 32px; padding: 35px 25px; box-shadow: 0 25px 50px rgba(0,0,0,0.8); }
              h1 { font-size: 26px; text-align: center; margin-bottom: 25px; font-weight: 900; text-transform: uppercase; text-shadow: 0 0 10px rgba(255,255,255,0.8); }
              .status-badge { display: flex; align-items: center; justify-content: center; gap: 10px; background: rgba(0,255,136,0.08); padding: 10px; border-radius: 14px; font-size: 12px; color: var(--primary); }
              .asset-card { background: rgba(255,255,255,0.03); padding: 14px; border-radius: 16px; display: flex; justify-content: space-between; margin-top: 10px; }
              .footer { margin-top: 35px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.08); display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 11px; }
              .history { font-size: 8px; color: rgba(255,255,255,0.2); margin-top: 20px; text-align: center; }
          </style>
      </head>
      <body>
          <div class="main-card">
              <h1>RICARDO SENTINELA BOT</h1>
              <div class="status-badge">MODO TESTE M1 ATIVO</div>
              <div class="asset-grid">
                  <div class="asset-card"><span>BTCUSD</span><span style="color:var(--primary)">M1</span></div>
                  <div class="asset-card"><span>EURUSD</span><span style="color:var(--primary)">M1</span></div>
                  <div class="asset-card"><span>GBPUSD</span><span style="color:var(--primary)">M1</span></div>
                  <div class="asset-card"><span>USDJPY</span><span style="color:var(--primary)">M1</span></div>
              </div>
              <div class="footer">
                  <div><b>DATA</b><p>${dataHora.split(',')[0]}</p></div>
                  <div><b>VERSÃO</b><p style="color:var(--primary); font-weight:bold;">${versao}</p></div>
              </div>
              <div class="history">
                Versão 07: Lógica EMA 4/8 + RSI 9 + Cor Vela<br>
                Versão 08: Ajuste Timeframe M1 para Teste e Layout Final
              </div>
          </div>
          <script>setTimeout(()=>location.reload(), 30000);</script>
      </body></html>
    `);
  } catch (e) { return res.status(200).send("PROCESSANDO..."); }
}
