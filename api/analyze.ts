import { VercelRequest, VercelResponse } from '@vercel/node';

let lastSinais: Record<string, string> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";
  const versao = "V10-MARUBOZU-FORCE";
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
        candles = json.data.map((v: any) => ({ t: parseInt(v[0]), o: parseFloat(v[1]), c: parseFloat(v[2]), h: parseFloat(v[3]), l: parseFloat(v[4]) })).reverse();
      } else {
        const r = json.chart.result[0];
        candles = r.timestamp.map((t: any, idx: number) => ({
          t, o: r.indicators.quote[0].open[idx], c: r.indicators.quote[0].close[idx], h: r.indicators.quote[0].high[idx], l: r.indicators.quote[0].low[idx]
        })).filter((v: any) => v.c !== null);
      }

      if (candles.length < 30) continue;
      const i = candles.length - 1;

      // CÁLCULOS TÉCNICOS
      const getEMA = (p: number, idx: number) => {
        const k = 2 / (p + 1);
        let ema = candles[0].c;
        for (let j = 1; j <= idx; j++) ema = candles[j].c * k + ema * (1 - k);
        return ema;
      };

      const getRSI = (idx: number) => {
        let g = 0, l = 0;
        for (let j = idx - 14; j <= idx; j++) {
          const d = candles[j].c - candles[j-1].c;
          if (d >= 0) g += d; else l -= d;
        }
        return 100 - (100 / (1 + (g / (l || 1))));
      };

      const ema9_0 = getEMA(9, i); const ema21_0 = getEMA(21, i);
      const ema9_1 = getEMA(9, i-1); const ema21_1 = getEMA(21, i-1);
      const rsi0 = getRSI(i); const rsi1 = getRSI(i-1);

      // FRACTAL (Gatilho na vela i-2 confirmada)
      const f_topo = candles[i-2].h > candles[i-4].h && candles[i-2].h > candles[i-3].h && candles[i-2].h > candles[i-1].h && candles[i-2].h > candles[i].h;
      const f_fundo = candles[i-2].l < candles[i-4].l && candles[i-2].l < candles[i-3].l && candles[i-2].l < candles[i-1].l && candles[i-2].l < candles[i].l;

      // LÓGICA: Cruzamento (nesta vela ou na anterior) + RSI 55/45 + Inclinação + Fractal
      let sinalStr = "";
      
      const cruzouAlta = (ema9_0 > ema21_0 && ema9_1 <= ema21_1) || (ema9_1 > ema21_1 && ema9_1 > ema21_1); // Cruzamento ou vela seguinte
      const rsiAlta = rsi0 >= 55 && rsi0 > rsi1; // RSI >= 55 e subindo
      if (f_fundo && cruzouAlta && rsiAlta && candles[i].c > candles[i].o) sinalStr = "ACIMA";

      const cruzouBaixa = (ema9_0 < ema21_0 && ema9_1 >= ema21_1) || (ema9_1 < ema21_1 && ema9_1 < ema21_1);
      const rsiBaixa = rsi0 <= 45 && rsi0 < rsi1; // RSI <= 45 e descendo
      if (f_topo && cruzouBaixa && rsiBaixa && candles[i].c < candles[i].o) sinalStr = "ABAIXO";

      if (sinalStr) {
        const aberturaVela = new Date(candles[i].t * 1000).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
        const sid = `${ativo.label}_${sinalStr}_${candles[i].t}`;
        
        if (lastSinais[ativo.label] !== sid) {
          lastSinais[ativo.label] = sid;
          const bolinha = sinalStr === "ACIMA" ? "🟢" : "🔴";
          const msg = `SINAL EMITIDO!\n\n**ATIVO**: ${ativo.label}\n**SINAL**: ${bolinha} ${sinalStr}\n**VELA**: ${aberturaVela}`;
          
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id, text: msg, parse_mode: 'Markdown' })
          });
        }
      }
    }

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>RICARDO SENTINELA BOT</title>
      <style>
        body { background: #000; color: #00ff00; font-family: 'Courier New', monospace; display: flex; justify-content: center; padding: 20px; }
        .box { border: 2px solid #00ff00; padding: 20px; width: 100%; max-width: 350px; border-radius: 10px; box-shadow: 0 0 15px rgba(0,255,0,0.2); }
        h1 { font-size: 18px; text-align: center; border-bottom: 1px solid #00ff00; padding-bottom: 10px; margin-top: 0; }
        .status { font-size: 12px; margin: 15px 0; display: flex; align-items: center; }
        .blink { height: 10px; width: 10px; background-color: #00ff00; border-radius: 50%; display: inline-block; animation: blinker 1s linear infinite; margin-right: 8px; }
        @keyframes blinker { 50% { opacity: 0; } }
        .ativo-row { display: flex; justify-content: space-between; margin: 8px 0; font-size: 14px; }
        .footer { font-size: 10px; color: #888; margin-top: 20px; border-top: 1px dotted #00ff00; padding-top: 10px; line-height: 1.4; }
      </style></head>
      <body>
        <div class="box">
          <h1>RICARDO SENTINELA BOT</h1>
          <div class="status"><span class="blink"></span> ATIVOS EM MONITORAMENTO REAL</div>
          <p style="text-align:center; font-weight:bold; font-size:12px; margin: 10px 0;">ANÁLISE DO MERCADO</p>
          <div class="ativo-row"><span>BTCUSD:</span> <span style="color:yellow">Aberto</span></div>
          <div class="ativo-row"><span>EURUSD:</span> <span style="color:yellow">Aberto</span></div>
          <div class="ativo-row"><span>GBPUSD:</span> <span style="color:yellow">Aberto</span></div>
          <div class="ativo-row"><span>USDJPY:</span> <span style="color:yellow">Aberto</span></div>
          <div class="footer">
            CONTROLE DE REVISÃO:<br>
            Data: ${dataHora.split(',')[0]}<br>
            Hora: ${dataHora.split(',')[1]}<br>
            Versão: ${versao}
          </div>
        </div>
        <script>setTimeout(() => { window.location.reload(); }, 60000);</script>
      </body></html>
    `);
  } catch (e) { return res.status(200).send("ERRO NO SERVIDOR"); }
}
