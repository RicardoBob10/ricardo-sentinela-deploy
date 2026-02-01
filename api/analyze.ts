import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { API_KEY, TG_TOKEN, TG_CHAT_ID } = process.env;

  try {
    // 1. Simulação de Teste para confirmar que o robô está vivo
    const message = "🚀 **Sentinela M15 Ativo!**\nConexão com a nuvem estabelecida com sucesso. Monitorando BTC/USD e EUR/USD.";
    
    // 2. Envio para o Telegram
    const tgUrl = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;
    await fetch(tgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TG_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    return res.status(200).json({ status: 'Sucesso', message: 'Notificação enviada!' });
  } catch (error) {
    return res.status(500).json({ status: 'Erro', error: String(error) });
  }
}
