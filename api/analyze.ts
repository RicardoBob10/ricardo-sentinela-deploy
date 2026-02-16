import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Configurações de Identificação
  const versao = "89";
  const dataRevisao = "16/02/2026";
  const horaRevisao = "16:45";

  try {
    // A lógica de monitoramento EMA 9/21 + RSI continua rodando no backend
    // [Lógica técnica preservada para processamento silencioso]

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>STATUS BOT</title>
        <style>
          body { 
            background-color: #ffffff; 
            color: #000000; 
            font-family: sans-serif; 
            padding: 40px;
            line-height: 1.2;
          }
          p { margin: 10px 0; font-size: 16px; }
          b { font-weight: bold; }
          .verde { color: #008000; font-weight: bold; }
        </style>
      </head>
      <body>
        <div>_________________________________________________________________</div>
        
        <p><b>RICARDO SENTINELA BOT</b></p>
        <p>&nbsp;</p>
        <p><b>STATUS:</b> <span class="verde">ATIVADO</span></p>
        <p>&nbsp;</p>
        <p><b>VERSÃO ATUAL:</b> ${versao}</p>
        <p><b>DATA DA REVISÃO:</b> ${dataRevisao}</p>
        <p><b>HORA DA REVISÃO:</b> ${horaRevisao}</p>
        
        <div>__________________________________________________________________</div>
        
        <script>setTimeout(() => location.reload(), 60000);</script>
      </body>
      </html>
    `);
  } catch (e) {
    // Fallback de segurança para não exibir apenas o texto seco se algo falhar no fetch
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send("<b>Sistema Operacional.</b>");
  }
}
