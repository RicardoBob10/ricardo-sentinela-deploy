import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: any, res: any) {
  const { TG_TOKEN, TG_CHAT_ID } = process.env;

  try {
    // 1. Busca 100 velas para garantir cálculo estável de EMA/RSI
    const resKlines = await fetch(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=100`);
    const data = await resKlines.json();
    
    if (!Array.isArray(data) || data.length < 50) {
      return res.status(200).json({ status: "Erro", detalhe: "Dados insuficientes da Binance" });
    }

    const prices = data.map((d: any) => parseFloat(d[4])); // Fechamentos
    const highs = data.map((d: any) => parseFloat(d[2]));
    const lows = data.map((d: any) => parseFloat(d[3]));
    const opens = data.map((d: any) => parseFloat(d[1]));

    // Inverter para que [0] seja a vela atual (fechando)
    prices.reverse(); highs.reverse(); lows.reverse(); opens.reverse();

    // 2. Funções Matemáticas Reais
    const getEMA = (p: number[], period: number) => {
      const k = 2 / (period + 1);
      let ema = p[p.length - 1];
      for (let i = p.length - 2; i >= 0; i--) ema = p[i] * k + ema * (1 - k);
      return ema;
    };

    const getRSI = (p: number[], period: number) => {
      let gains = 0, losses = 0;
      for (let i = 0; i < period; i++) {
        const diff = p[i] - p[i+1];
        diff > 0 ? gains += diff : losses -= diff;
      }
      return 100 - (100 / (1 + (gains / period) / (losses / period)));
    };

    // 3. Cálculos do momento (Vela 0 e Vela 2 para Fractal)
    const ema9 = getEMA(prices, 9);
    const ema21 = getEMA(prices, 21);
    const rsiVal = getRSI(prices, 14);
    
    // Fractal de 5 velas (Gatilho na vela [2] conforme seu LUA)
    const fractalTopo = highs[2] > highs[4] && highs[2] > highs[3] && highs[2] > highs[1] && highs[2] > highs[0];
    const fractalFundo = lows[2] < lows[4] && lows[2] < lows[3] && lows[2] < lows[1] && lows[2] < lows[0];

    let sinal = null;
    // Lógica IGUAL ao seu script LUA
    if (fractalTopo && ema9 < ema21 && rsiVal <= 45 && prices[0] < opens[0]) sinal = "🔴 ABAIXO (VENDA)";
    if (fractalFundo && ema9 > ema21 && rsiVal >= 55 && prices[0] > opens[0]) sinal = "🟢 ACIMA (COMPRA)";

    if (sinal) {
      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TG_CHAT_ID, text: `🚀 **SINAL RT_ROBO:** ${sinal}`, parse_mode: 'Markdown' })
      });
      return res.status(200).json({ status: "SUCESSO", info: "Sinal enviado!" });
    }

    return res.status(200).json({ status: "MONITORANDO", rsi: rsiVal.toFixed(2), ema9: ema9.toFixed(2) });

  } catch (error: any) {
    return res.status(200).json({ status: "ERRO CRÍTICO", detalhe: error.message });
  }
}
