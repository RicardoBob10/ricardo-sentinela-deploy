import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: any, res: any) {
  const { TG_TOKEN, TG_CHAT_ID } = process.env;

  try {
    // 1. Tentar buscar dados usando uma URL de redundância
    const response = await fetch(`https://api1.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=10`);
    
    if (!response.ok) throw new Error("API Principal Ocupada");
    
    const data = await response.json();
    
    if (!Array.isArray(data)) {
      return res.status(200).json({ status: "Aguardando", info: "Sincronizando com servidor reserva..." });
    }

    const c = data.map((d: any) => ({
      o: parseFloat(d[1]), h: parseFloat(d[2]), l: parseFloat(d[3]), c: parseFloat(d[4])
    })).reverse();

    // 2. Lógica do Fractal (Exatamente do seu LUA)
    const fractalTopo = c[2].h > c[0].h && c[2].h > c[1].h && c[2].h > c[3].h && c[2].h > c[4].h;
    const fractalFundo = c[2].l < c[0].l && c[2].l < c[1].l && c[2].l < c[3].l && c[2].l < c[4].l;

    // 3. Verificação de Cor
    const isRed = c[0].c < c[0].o;
    const isGreen = c[0].c > c[0].o;

    let sinal = null;
    if (fractalTopo && isRed) sinal = "🔴 ABAIXO (VENDA)";
    if (fractalFundo && isGreen) sinal = "🟢 ACIMA (COMPRA)";

    // 4. Envio ao Telegram
    if (sinal) {
      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TG_CHAT_ID, text: `🚀 **SINAL RT_ROBO:** ${sinal}`, parse_mode: 'Markdown' })
      });
      return res.status(200).json({ status: "SUCESSO", sinal });
    }

    return res.status(200).json({ 
      status: "CONECTADO", 
      mensagem: "Monitorando Fractal + Cor da Vela",
      binance_time: new Date().toLocaleTimeString()
    });

  } catch (error: any) {
    // Se tudo falhar, ele avisa o motivo real
    return res.status(200).json({ status: "Erro de Conexão", info: "A Binance bloqueou o acesso temporariamente. Aguarde 2 min." });
  }
}
