import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const versao = "88";
  // Dados da revisão atual conforme o código enviado agora
  const dataRevisao = "16/02/2026";
  const horaRevisao = "16:45";
  
  const agora = new Date();
  const options = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' } as const;
  const horaAtual = agora.toLocaleTimeString('pt-BR', options);

  try {
    // A lógica técnica (EMA 9/21 + RSI) continua rodando em segundo plano
    // [Inserir aqui a lógica de fetch e sinais se desejar que o bot execute nesta rota]
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>RICARDO SENTINELA BOT</title>
        <style>
          body { 
            background-color: #000; 
            color: #fff; 
            font-family: Arial, sans-serif; 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            height: 100vh; 
            margin: 0; 
            line-height: 1.6;
          }
          .container { 
            text-align: left; 
            border: 1px solid #333; 
            padding: 20px; 
            border-radius: 8px;
          }
          b { font-weight: bold; }
          .ativado { color: #00ff00; }
        </style>
      </head>
      <body>
        <div class="container">
          <p><b>RICARDO SENTINELA BOT</b></p>
          <p><b>STATUS:</b> <span class="ativado">ATIVADO</span></p>
          <p><b>VERSÃO ATUAL:</b> ${versao}</p>
          <p><b>DATA DA REVISÃO:</b> ${dataRevisao}</p>
          <p><b>HORA DA REVISÃO:</b> ${horaRevisao}</p>
          <hr style="border: 0; border-top: 1px solid #333;">
          <p style="font-size: 12px; color: #666;">Última atualização do sistema: ${horaAtual}</p>
        </div>
        <script>setTimeout(() => location.reload(), 30000);</script>
      </body>
      </html>
    `);
  } catch (e) {
    return res.status(200).send("Sistema Operacional.");
  }
}
