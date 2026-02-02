import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: any, res: any) {
  const { TG_TOKEN, TG_CHAT_ID } = process.env;

  try {
    // MENSAGEM DE TESTE PURA
    const agora = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const msg = `🔔 **TESTE DE PULSO:** Conexão Ativa às ${agora}`;

    const response = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TG_CHAT_ID,
        text: msg,
        parse_mode: 'Markdown'
      })
    });

    const data: any = await response.json();

    if (!data.ok) {
      return res.status(200).json({ status: "ERRO NO TELEGRAM", detalhe: data.description });
    }

    return res.status(200).json({ status: "PULSO ENVIADO", hora: agora });

  } catch (error: any) {
    return res.status(200).json({ status: "ERRO CRÍTICO", detalhe: error.message });
  }
}
