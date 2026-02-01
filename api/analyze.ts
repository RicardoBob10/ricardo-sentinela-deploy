import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: any, res: any) {
  const { TG_TOKEN, TG_CHAT_ID } = process.env;
  const STATUS_FIXO = "SENTINELA: ATIVO - REVISADO EM: 01/02/2026 as 18:36";

  try {
    const agoraBR = new Date(new Date().getTime() - (3 * 60 * 60 * 1000)); // Item 1: Brasília
    const minutoAtual = agoraBR.getMinutes();
    const minutoNoCiclo = minutoAtual % 15;

    // Item 10: Janela de 9 minutos
    if (minutoNoCiclo > 9) {
      return res.status(200).json({ status: STATUS_FIXO, info: "Aguardando próxima vela" });
    }

    // Item 3: Leitura BTC (Binance)
    const resKlines = await fetch(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=5`);
    const data: any = await resKlines.json(); // Correção erro TS18046
    const c = data.map((d: any) => ({ o: parseFloat(d[1]), h: parseFloat(d[2]), l: parseFloat(d[3]), c: parseFloat(d[4]) })).reverse(); // Correção erro TS7006

    // Item 7 & 8: GATILHO RT_PRO + Cores da Vela
    const fractalTopo = c[1].h > c[0].h && c[1].h > c[2].h && c[1].h > c[3].h;
    const fractalFundo = c[1].l < c[0].l && c[1].l < c[2].l && c[1].l < c[3].l;
    const isBearish = c[0].c < c[0].o;
    const isBullish = c[0].c > c[0].o;

    let sinal = null;
    if (fractalTopo && isBearish) sinal = "🔴 ABAIXO";
    if (fractalFundo && isBullish) sinal = "🟢 ACIMA";

    if (sinal) {
      const msg = `🚀 **GATILHO RT_PRO: ${sinal}**\n✅ **CHECK LIST VALIDADO**\n⚠️ **ENTRADA:** Mesma Vela M15.`;
      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage?chat_id=${TG_CHAT_ID}&text=${encodeURIComponent(msg)}&parse_mode=Markdown`);
      return res.status(200).json({ status: STATUS_FIXO, sinal: "Enviado" });
    }

    return res.status(200).json({ status: STATUS_FIXO, info: "Sem sinal" });

  } catch (error: any) {
    return res.status(200).json({ status: STATUS_FIXO, erro: "Reiniciando Sniper" });
  }
}
