export default async function handler(req: any, res: any) {
  const { TG_TOKEN, TG_CHAT_ID } = process.env;
  
  try {
    // 1. Sinal forçado para validar a conexão de uma vez por todas
    const sinalForçado = "🟢 ACIMA (COMPRA)";
    const msg = `🚀 **SENTINELA: SINAL FORÇADO**\n\n✅ **GATILHO:** ${sinalForçado}\n🪙 **ATIVO:** BTCUSDT\n⚠️ **STATUS:** Teste de Conexão Real.`;

    // 2. Envio direto via fetch
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

    return res.status(200).json({ status: "SUCESSO", info: "Sinal enviado! Verifique o Telegram." });

  } catch (error: any) {
    return res.status(200).json({ status: "ERRO CRÍTICO", detalhe: error.message });
  }
}
