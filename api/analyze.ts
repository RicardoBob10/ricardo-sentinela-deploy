import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: any, res: any) {
  const { TG_TOKEN, TG_CHAT_ID } = process.env;

  try {
    const response = await fetch(`https://api.kucoin.com/api/v1/market/candles?symbol=BTC-USDT&type=1min`);
    const result = await response.json();
    const candles = result.data.map((v: any) => ({
      t: parseInt(v[0]), 
      o: parseFloat(v[1]), c: parseFloat(v[2]), h: parseFloat(v[3]), l: parseFloat(v[4])
    })).slice(0, 30);

    // Converte horário para Brasília (UTC-3)
    const dataVela = new Date(candles[0].t * 1000);
    const horaBrasilia = dataVela.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }).slice(0, 5);

    const getEMA = (p: number) => {
      const k = 2 / (p + 1);
      let val = candles[candles.length - 1].c;
      for (let i = candles.length - 2; i >= 0; i--) val = candles[i].c * k + val * (1 - k);
      return val;
    };

    const ema9 = getEMA(9);
    const ema21 = getEMA(21);

    // Lógica Fractal Exata do Script 
    const f_topo = candles[2].h > candles[4].h && candles[2].h > candles[3].h && candles[2].h > candles[1].h && candles[2].h > candles[0].h;
    const f_fundo = candles[2].l < candles[4].l && candles[2].l < candles[3].l && candles[2].l < candles[1].l && candles[2].l < candles[0].l;

    let sinal = null;
    if (f_topo && ema9 < ema21) sinal = "🔴 ABAIXO";
    if (f_fundo && ema9 > ema21) sinal = "🟢 ACIMA";

    if (sinal) {
      const msg = `💎 **RT_ROBO SINAL**\n\n🎯 Direção: ${sinal}\n⏰ Vela: ${horaBrasilia}\n✅ Confirmado na Optnex`;
      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TG_CHAT_ID, text: msg })
      });
    }

    return res.status(200).json({ status: "Sincronizado", vela_atual: horaBrasilia });
  } catch (e) { return res.status(200).send("Erro"); }
}
