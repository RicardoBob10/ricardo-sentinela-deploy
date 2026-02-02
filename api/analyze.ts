import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: any, res: any) {
  const { TG_TOKEN, TG_CHAT_ID } = process.env;

  try {
    const response = await fetch(`https://api.kucoin.com/api/v1/market/candles?symbol=BTC-USDT&type=1min`);
    const result = await response.json();
    
    if (result.code !== "200000" || !result.data) return res.status(200).json({ status: "Erro de Dados" });

    const c = result.data.map((d: any) => ({
      o: parseFloat(d[1]), c: parseFloat(d[2]), h: parseFloat(d[3]), l: parseFloat(d[4])
    })).slice(0, 6); 

    // Lógica Ultra-Sensível: Vela [1] comparada com as vizinhas imediatas
    const fractalTopo = c[1].h > c[0].h && c[1].h > c[2].h;
    const fractalFundo = c[1].l < c[0].l && c[1].l < c[2].l;

    const isRed = c[0].c < c[0].o;
    const isGreen = c[0].c > c[0].o;

    let sinal = null;
    if (fractalTopo && isRed) sinal = "🔴 VENDA RÁPIDA (M1)";
    if (fractalFundo && isGreen) sinal = "🟢 COMPRA RÁPIDA (M1)";

    if (sinal) {
      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TG_CHAT_ID, text: `⚠️ **GATILHO DETECTADO:** ${sinal}`, parse_mode: 'Markdown' })
      });
      return res.status(200).json({ status: "DISPARADO", sinal });
    }

    return res.status(200).json({ status: "VARRENDO M1", preco: c[0].c });

  } catch (error: any) {
    return res.status(200).json({ status: "Erro" });
  }
}
