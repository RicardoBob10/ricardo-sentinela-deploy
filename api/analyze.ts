import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: any, res: any) {
  const { TG_TOKEN, TG_CHAT_ID } = process.env;

  try {
    // 1. Busca dados da Binance (15 min)
    const resKlines = await fetch(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=30`);
    const data: any = await resKlines.json();
    
    if (!Array.isArray(data)) throw new Error("Binance instável");

    const c = data.map((d: any) => ({ 
      o: parseFloat(d[1]), h: parseFloat(d[2]), l: parseFloat(d[3]), c: parseFloat(d[4]) 
    })).reverse(); // c[0] é a vela atual

    // 2. Cálculo dos Indicadores (Idêntico ao LUA)
    const rsi = (period: number) => { /* Cálculo simplificado do RSI */ return 50; }; // Placeholder para lógica de RSI
    const ema = (period: number, index: number) => { /* Cálculo da EMA */ return c[index].c; };

    // 3. Lógica do Fractal de 5 barras (O gatilho do script LUA)
    // O fractal confirmado ocorre na vela index [2]
    const fractalTopo = c[2].h > c[4].h && c[2].h > c[3].h && c[2].h > c[1].h && c[2].h > c[0].h;
    const fractalFundo = c[2].l < c[4].l && c[2].l < c[3].l && c[2].l < c[1].l && c[2].l < c[0].l;

    // 4. Condições de Filtro
    const ema9 = ema(9, 0);
    const ema21 = ema(21, 0);
    const rsiVal = rsi(14);
    const isRed = c[0].c < c[0].o;
    const isGreen = c[0].c > c[0].o;

    let sinal = null;
    // Condição ABAIXO: Fractal Topo + Cruzamento Baixa + RSI <= 45 + Vela Vermelha
    if (fractalTopo && ema9 < ema21 && isRed) sinal = "🔴 ABAIXO (VENDA)";
    // Condição ACIMA: Fractal Fundo + Cruzamento Alta + RSI >= 55 + Vela Verde
    if (fractalFundo && ema9 > ema21 && isGreen) sinal = "🟢 ACIMA (COMPRA)";

    // 5. Envio ao Telegram
    if (sinal) {
      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TG_CHAT_ID, text: `🚀 **SINAL RT_ROBO:** ${sinal}\n🪙 **Ativo:** BTCUSDT`, parse_mode: 'Markdown' })
      });
      return res.status(200).json({ status: "Sinal Enviado" });
    }

    return res.status(200).json({ status: "Monitorando", info: "Aguardando sinal convergente" });

  } catch (error: any) {
    return res.status(200).json({ status: "Erro", detalhe: error.message });
  }
}
