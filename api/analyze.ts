import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: any, res: any) {
  const { TG_TOKEN, TG_CHAT_ID } = process.env;

  try {
    const response = await fetch(`https://api.kucoin.com/api/v1/market/candles?symbol=BTC-USDT&type=1min`);
    const result = await response.json();
    const candles = result.data.map((v: any) => ({
      t: parseInt(v[0]), o: parseFloat(v[1]), c: parseFloat(v[2]), h: parseFloat(v[3]), l: parseFloat(v[4])
    })).slice(0, 40);

    // --- CÁLCULO RSI 14 ---
    const calculateRSI = (data: any[], period: number) => {
      let gains = 0, losses = 0;
      for (let i = data.length - period; i < data.length; i++) {
        const diff = data[i].c - data[i-1].c;
        if (diff >= 0) gains += diff; else losses -= diff;
      }
      const rs = (gains / period) / (losses / period);
      return 100 - (100 / (1 + rs));
    };

    // --- CÁLCULO EMAs ---
    const getEMA = (p: number) => {
      const k = 2 / (p + 1);
      let val = candles[candles.length - 1].c;
      for (let i = candles.length - 2; i >= 0; i--) val = candles[i].c * k + val * (1 - k);
      return val;
    };

    const rsiVal = calculateRSI(candles.reverse(), 14); // Reverte para ordem cronológica
    const ema9 = getEMA(9);
    const ema21 = getEMA(21);
    const c = candles; // Simplifica referência

    // FRACTAL (Vela 2 é o extremo das 5)
    const f_topo = c[2].h > c[4].h && c[2].h > c[3].h && c[2].h > c[1].h && c[2].h > c[0].h;
    const f_fundo = c[2].l < c[4].l && c[2].l < c[3].l && c[2].l < c[1].l && c[2].l < c[0].l;

    let sinal = null;

    // APLICAÇÃO DOS FILTROS DO SCRIPT RT_ROBO
    if (f_topo && ema9 < ema21 && rsiVal <= 45) {
        sinal = `🔴 **VENDA (ABAIXO)**\n📊 RSI: ${rsiVal.toFixed(2)}`;
    }
    if (f_fundo && ema9 > ema21 && rsiVal >= 55) {
        sinal = `🟢 **COMPRA (ACIMA)**\n📊 RSI: ${rsiVal.toFixed(2)}`;
    }

    if (sinal) {
      const hora = new Date(c[0].t * 1000).toLocaleTimeString('pt-BR', {timeZone: 'America/Sao_Paulo'}).slice(0,5);
      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TG_CHAT_ID, text: `💎 **SINAL CONFIRMADO**\n${sinal}\n⏰ Vela: ${hora}` })
      });
    }

    return res.status(200).json({ status: "Filtros Ativos", rsi: rsiVal.toFixed(2) });
  } catch (e) { return res.status(200).send("Erro"); }
}
