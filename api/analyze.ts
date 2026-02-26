import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const agora = new Date();
  const horaBR = agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RICARDO SENTINELA BOT - V125</title>
  <style>
    body {
      background-color: #ffffff;
      color: #000000;
      font-family: Arial, sans-serif;
      padding: 40px;
      line-height: 1.5;
    }
    h1 {
      color: #0066cc;
      font-size: 28px;
    }
    .status-ok {
      color: #00aa00;
      font-weight: bold;
      font-size: 24px;
    }
    .info {
      color: #666666;
      margin-top: 20px;
      font-size: 16px;
    }
    .config {
      background-color: #f5f5f5;
      border-left: 4px solid #0066cc;
      padding: 15px;
      margin: 20px 0;
    }
    hr {
      border: none;
      border-top: 1px solid #ddd;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <h1>RICARDO SENTINELA BOT</h1>
  <p class="status-ok">✅ SERVIDOR ONLINE</p>
  
  <div class="config">
    <p><b>⚙️ CONFIGURAÇÃO V125:</b></p>
    <p>Status: <span class="status-ok">ATIVADO</span></p>
    <p>Versão: 125</p>
    <p>Hora Atual (BRT): ${horaBR}</p>
    <p>Ativos Monitorados: 8 (Bitcoin, Ethereum, 6 Forex)</p>
    <p>Timeframe: M5 (5 minutos)</p>
    <p>Score Mínimo: 80/100</p>
    <p>Plataforma: Railway.app</p>
  </div>
  
  <hr>
  
  <div class="info">
    <p><b>✨ Status:</b></p>
    <p>Se você vê esta página, o servidor está funcionando corretamente.</p>
    <p>O bot está monitorando os mercados e enviando sinais via Telegram.</p>
  </div>
  
  <script>
    setTimeout(function() {
      location.reload();
    }, 30000);
  </script>
</body>
</html>`;
  
  res.status(200).send(html);
}
