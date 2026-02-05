import { VercelRequest, VercelResponse } from '@vercel/node';

let lastSinais: Record<string, string> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";
  const versao = "02"; // Versão conforme solicitado
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
        ? `https://api.kucoin.com/api/v1/market/candles?symbol=${ativo.symbol}&type=15min`
        : `https://query1.finance.yahoo.com/v8/finance/chart/${ativo.symbol}?interval=15m&range=2d`;

      const response = await fetch(url);
      const json = await response.json();
      let candles: any[] = [];

      if (ativo.source === "kucoin") {
        if (json.data) candles = json.data.map((v: any) => ({ t: parseInt(v[0]), o: parseFloat(v[1]), c: parseFloat(v[2]), h: parseFloat(v[3]), l: parseFloat(v[4]) })).reverse();
      } else {
        const r = json.chart.result[0];
        candles = r.timestamp.map((t: any, idx: number) => ({
          t, o: r.indicators.quote[0].open[idx], c: r.indicators.quote[0].close[idx], h: r.indicators.quote[0].high[idx], l: r.indicators.quote[0].low[idx]
        })).filter((v: any) => v.c !== null);
      }

      if (candles.length < 40) continue;
      const i = candles.length - 1;

      // LÓGICA SYNC RT_PRO (INDICADOR RICARDO TRADER)
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
      const rsi_ok = rsi_v > getRSI(i-1, 9);
      const f_topo = candles[i-2].h > candles[i-4].h && candles[i-2].h > candles[i-3].h && candles[i-2].h > candles[i-1].h && candles[i-2].h > candles[i].h;
      const f_fundo = candles[i-2].l < candles[i-4].l && candles[i-2].l < candles[i-3].l && candles[i-2].l < candles[i-1].l && candles[i-2].l < candles[i].l;

      let sinalStr = "";
      if (f_fundo && macd > signal && rsi_ok) sinalStr = "ACIMA";
      if (f_topo && macd < signal && !rsi_ok) sinalStr = "ABAIXO";

      if (sinalStr) {
        const aberturaVela = new Date(candles[i].t * 1000).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
        const sid = `${ativo.label}_${sinalStr}_${candles[i].t}`;
        if (lastSinais[ativo.label] !== sid) {
          lastSinais[ativo.label] = sid;
          const bolinha = sinalStr === "ACIMA" ? "🟢" : "🔴";
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id, text: `SINAL EMITIDO!\n\n**ATIVO**: ${ativo.label}\n**SINAL**: ${bolinha} ${sinalStr}\n**VELA**: ${aberturaVela}`, parse_mode: 'Markdown' })
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
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>RICARDO SENTINELA BOT</title>
          <style>
              body { background-color: #0a0a0a; color: #00ff41; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; justify-content: center; align-items: flex-start; min-height: 100vh; margin: 0; padding-top: 20px; }
              .container { width: 90%; max-width: 400px; background: rgba(20, 20, 20, 0.95); border: 1px solid #333; border-radius: 15px; padding: 20px; box-shadow: 0 0 30px rgba(0,0,0,0.5); }
              
              h1 { color: white; text-align: center; font-size: 22px; margin: 0 0 20px 0; text-transform: uppercase; letter-spacing: 2px;
                  text-shadow: -1px -1px 0 #FFD700, 1px -1px 0 #FFD700, -1px 1px 0 #FFD700, 1px 1px 0 #FFD700; }
              
              .status-bar { background: rgba(0, 255, 65, 0.1); border-radius: 8px; padding: 10px; margin-bottom: 20px; display: flex; align-items: center; justify-content: center; font-size: 13px; border: 1px solid rgba(0, 255, 65, 0.2); }
              .blink { height: 8px; width: 8px; background-color: #00ff41; border-radius: 50%; display: inline-block; margin-right: 10px; box-shadow: 0 0 10px #00ff41; animation: pulse 1s infinite; }
              @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }

              .market-box { background: #151515; border-radius: 10px; padding: 15px; border-left: 4px solid #FFD700; }
              h2 { font-size: 14px; color: #aaa; margin: 0 0 15px 0; text-align: center; text-transform: uppercase; }
              
              .ativo-item { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #222; font-family: 'Courier New', monospace; font-weight: bold; }
              .ativo-item:last-child { border-bottom: none; }
              .status-tag { color: #00ff41; background: rgba(0,255,65,0.1); padding: 2px 8px; border-radius: 4px; font-size: 12px; }

              .footer { margin-top: 25px; padding-top: 15px; border-top: 1px solid #333; font-size: 11px; color: #666; line-height: 1.6; }
              .version-badge { color: #FFD700; font-weight: bold; }
          </style>
      </head>
      <body>
          <div class="container">
              <h1>RICARDO SENTINELA BOT</h1>
              
              <div class="status-bar">
                  <span class="blink"></span> ATIVOS EM MONITORAMENTO REAL
              </div>

              <div class="market-box">
                  <h2>ANÁLISE DO MERCADO</h2>
                  <div class="ativo-item"><span>BTCUSD</span> <span class="status-tag">ABERTO</span></div>
                  <div class="ativo-item"><span>EURUSD</span> <span class="status-tag">ABERTO</span></div>
                  <div class="ativo-item"><span>GBPUSD</span> <span class="status-tag">ABERTO</span></div>
                  <div class="ativo-item"><span>USDJPY</span> <span class="status-tag">ABERTO</span></div>
              </div>

              <div class="footer">
                  <strong>CONTROLE DE REVISÃO</strong><br>
                  DATA: ${dataHora.split(',')[0]}<br>
                  HORA: ${dataHora.split(',')[1]}<br>
                  VERSÃO: <span class="version-badge">${versao}</span>
              </div>
          </div>
          <script>setTimeout(() => { window.location.reload(); }, 60000);</script>
      </body>
      </html>
    `);
  } catch (e) { return res.status(200).send("SISTEMA ONLINE"); }
}
