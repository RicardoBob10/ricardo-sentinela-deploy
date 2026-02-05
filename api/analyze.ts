import { VercelRequest, VercelResponse } from '@vercel/node';

let lastSinais: Record<string, string> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";

  const ATIVOS = [
    { symbol: "BTC-USDT", label: "BTCUSD", source: "kucoin" },
    { symbol: "EURUSD=X", label: "EURUSD", source: "yahoo" },
    { symbol: "USDJPY=X", label: "USDJPY", source: "yahoo" },
    { symbol: "GBPUSD=X", label: "GBPUSD", source: "yahoo" }
  ];

  try {
    for (const ativo of ATIVOS) {
      const url = ativo.source === "kucoin" 
        ? `https://api.kucoin.com/api/v1/market/candles?symbol=${ativo.symbol}&type=15min`
        : `https://query1.finance.yahoo.com/v8/finance/chart/${ativo.symbol}?interval=15m&range=2d`;

      const response = await fetch(url);
      const json = await response.json();
      let candles = [];

      if (ativo.source === "kucoin") {
        candles = json.data.map((v:any)=>({t:v[0], o:parseFloat(v[1]), c:parseFloat(v[2]), h:parseFloat(v[3]), l:parseFloat(v[4])})).reverse();
      } else {
        const r = json.chart.result[0];
        candles = r.timestamp.map((t:any, idx:number)=>({
          t, o: r.indicators.quote[0].open[idx], c: r.indicators.quote[0].close[idx], h: r.indicators.quote[0].high[idx], l: r.indicators.quote[0].low[idx]
        })).filter((v:any) => v.c !== null);
      }

      if (candles.length < 30) continue;
      const i = candles.length - 1;

      // CÁLCULOS SNIPER V9
      const calcEMA = (p: number) => {
        const k = 2 / (p + 1);
        let ema = candles[0].c;
        for (let j = 1; j < candles.length; j++) ema = candles[j].c * k + ema * (1 - k);
        return ema;
      };

      const calcRSI = (p: number) => {
        let g = 0, l = 0;
        for (let j = i - p; j <= i; j++) {
          const d = candles[j].c - (candles[j-1]?.c || candles[j].c);
          if (d >= 0) g += d; else l -= d;
        }
        return 100 - (100 / (1 + (g / (l || 1))));
      };

      const e9 = calcEMA(9);
      const e21 = calcEMA(21);
      const rsi = calcRSI(14);

      const fTopo = candles[i-2].h > candles[i-4].h && candles[i-2].h > candles[i-3].h && candles[i-2].h > candles[i-1].h && candles[i-2].h > candles[i].h;
      const fFundo = candles[i-2].l < candles[i-4].l && candles[i-2].l < candles[i-3].l && candles[i-2].l < candles[i-1].l && candles[i-2].l < candles[i].l;

      let sinal = null;
      if (fFundo && e9 > e21 && rsi >= 52 && candles[i].c > candles[i].o) sinal = "ACIMA";
      if (fTopo && e9 < e21 && rsi <= 48 && candles[i].c < candles[i].o) sinal = "ABAIXO";

      if (sinal) {
        const sid = `${ativo.label}_${sinal}_${candles[i-1].t}`;
        if (lastSinais[ativo.label] !== sid) {
          lastSinais[ativo.label] = sid;
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              chat_id, 
              text: `🎯 **RT_ROBO V9 - M15**\n\n*ATIVO*: ${ativo.label}\n*SINAL*: ${sinal === "ACIMA" ? "🟢 COMPRA" : "🔴 VENDA"}\n*CONFIRMAÇÃO*: Checklist Sniper OK`,
              parse_mode: 'Markdown'
            })
          });
        }
      }
    }
    return res.status(200).send("MONITORANDO M15...");
  } catch (e) { return res.status(200).send("OK"); }
}
