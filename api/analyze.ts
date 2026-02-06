import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = process.env.TG_TOKEN;
  const chat_id = process.env.TG_CHAT_ID;
  const versao = "00-TESTE";
  const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  try {
    // SIMULAÇÃO DE DISPARO FORÇADO
    const msgTeste = `🚀 **TESTE DE CONEXÃO**\n\nO robô está a ler as variáveis da Vercel com sucesso!\n\n**ATIVO**: BTCUSD\n**SINAL**: 🟢 TESTE\n**VELA**: ${new Date().toLocaleTimeString('pt-BR')}`;
    
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text: msgTeste, parse_mode: 'Markdown' })
    });

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
          <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>TESTE DE CONEXÃO</title>
          <style>
              :root { --primary: #00ff88; --bg: #050505; }
              body { background-color: var(--bg); color: #fff; font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
              .main-card { width: 90%; max-width: 380px; background: rgba(17,17,17,0.85); border: 1px solid rgba(255,255,255,0.1); border-radius: 32px; padding: 35px 25px; text-align: center; }
              h1 { font-size: 26px; text-transform: uppercase; color: #FFFFFF; text-shadow: 0 0 10px rgba(255,255,255,0.8); }
              .btn { background: var(--primary); color: #000; padding: 15px; border-radius: 12px; font-weight: bold; text-decoration: none; display: inline-block; margin-top: 20px; }
          </style>
      </head>
      <body>
          <div class="main-card">
              <h1>RICARDO SENTINELA</h1>
              <p style="color: var(--primary)">SINAL DE TESTE ENVIADO!</p>
              <p>Verifique o seu Telegram agora.</p>
              <div style="font-size: 11px; margin-top: 20px; color: #666;">
                  DATA: ${dataHora.split(',')[0]} | HORA: ${dataHora.split(',')[1]}
              </div>
          </div>
      </body></html>
    `);
  } catch (e) { return res.status(200).send("ERRO NO TESTE: Verifique as variáveis no Vercel"); }
}
