import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: any, res: any) {
  const { TG_TOKEN, TG_CHAT_ID } = process.env;

  try {
    const response = await fetch(`https://api.kucoin.com/api/v1/market/candles?symbol=BTC-USDT&type=1min`);
    const result = await response.json();
    const c = result.data.map((v: any) => ({
      o: parseFloat(v[1]), c: parseFloat(v[2]), h: parseFloat(v[3]), l: parseFloat(v[4])
    })).slice(0, 30);

    // Média EMA (Igual ao seu script LUA)
    const getEMA = (p: number) => {
      const k = 2 / (p + 1);
      let val = c[c.length - 1].c;
      for (let i = c.length - 2; i >= 0; i--) val = c[i].c * k + val * (1 - k);
      return val;
    };

    const ema9 = getEMA(9);
    const ema21 = getEMA(21);

    // FRACTAL 5 VELAS (Cálculo exato do seu arquivo .txt)
    // Compara a vela [2] com as duas anteriores e as duas posteriores
    const fractal_topo = c[2].h > c[4].h && c[2].h > c[3].h && c[2].h > c[1].h && c[2].h > c[0].h;
    const fractal_fundo = c[2].l < c[4].l && c[2].l < c[3].l && c[2].l < c[1].l && c[2].l < c[0].l;

    let sinal = null;
    
    // CONDIÇÃO IGUAL AO VISUAL DA TELA:
    if (fractal_topo && ema9 < ema21) {
        sinal = "🔴 ABAIXO (M1)";
    }
    if (fractal_fundo && ema9 > ema21) {
        sinal = "🟢 ACIMA (M1)";
    }

    if (sinal) {
      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TG_CHAT_ID, text: `💎 **RT_ROBO SINAL:** ${sinal}` })
      });
      return res.status(200).json({ status: "DISPARADO", sinal });
    }

    return res.status(200).json({ status: "VARRENDO", ema9: ema9.toFixed(2), ema21: ema21.toFixed(2) });

  } catch (e) { return res.status(200).send("Erro de conexão"); }
}
