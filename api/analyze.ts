import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";

  try {
    // 1. TESTE DE VIDA: Envia uma mensagem assim que abrir o link
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text: "🔄 MONITORAMENTO REINICIADO (M1)... AGUARDANDO SINAL V9." })
    });

    const ATIVOS = [{ symbol: "BTC-USDT", label: "BTCUSD", source: "kucoin" }];

    for (const ativo of ATIVOS) {
      const response = await fetch(`https://api.kucoin.com/api/v1/market/candles?symbol=${ativo.symbol}&type=1min`);
      const json = await response.json();
      const candles = json.data.map((v:any)=>({t:v[0], o:parseFloat(v[1]), c:parseFloat(v[2]), h:parseFloat(v[3]), l:parseFloat(v[4])})).reverse();
      
      const i = candles.length - 1;
      // Critério simplificado só para testar se o sinal sai:
      if (candles[i].c > candles[i].o) {
         await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id, text: `✅ TESTE OK: O BTC está em alta agora no M1.` })
        });
      }
    }

    return res.status(200).send("SISTEMA ONLINE - VERIFIQUE O TELEGRAM");
  } catch (e) {
    return res.status(200).send("Erro: " + e.message);
  }
}
