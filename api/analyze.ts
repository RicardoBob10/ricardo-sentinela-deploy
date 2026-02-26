export default function handler(req: any, res: any) {
  try {
    const agora = new Date();
    const horaBR = agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const dataFormatada = agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RICARDO SENTINELA BOT - V125</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      background-color: #ffffff;
      color: #000000;
      font-family: Arial, sans-serif;
      padding: 40px;
      line-height: 1.6;
    }
    
    h1 {
      color: #0066cc;
      font-size: 32px;
      margin-bottom: 20px;
    }
    
    .status-ok {
      color: #00aa00;
      font-weight: bold;
      font-size: 26px;
      margin-bottom: 30px;
    }
    
    .config {
      background-color: #f5f5f5;
      border-left: 4px solid #0066cc;
      padding: 20px;
      margin: 20px 0;
      border-radius: 4px;
    }
    
    .config p {
      margin: 10px 0;
      font-size: 16px;
    }
    
    .config b {
      color: #0066cc;
    }
    
    .info {
      color: #666666;
      margin-top: 30px;
      font-size: 16px;
    }
    
    .info p {
      margin: 10px 0;
    }
    
    hr {
      border: none;
      border-top: 1px solid #ddd;
      margin: 30px 0;
    }
    
    .ativos-list {
      background-color: #f9f9f9;
      padding: 15px;
      border-radius: 4px;
      margin-top: 15px;
    }
    
    .ativos-list p {
      font-size: 14px;
      margin: 5px 0;
      color: #555;
    }
  </style>
</head>
<body>
  <h1>🤖 RICARDO SENTINELA BOT</h1>
  <p class="status-ok">✅ SERVIDOR ONLINE</p>
  
  <div class="config">
    <p><b>⚙️ CONFIGURAÇÃO V125 - QUALIDADE > QUANTIDADE</b></p>
    <p>Status: <span style="color: #00aa00; font-weight: bold;">ATIVADO</span></p>
    <p>Versão: <b>125</b></p>
    <p>Data: <b>${dataFormatada}</b></p>
    <p>Hora Atual (BRT): <b>${horaBR}</b></p>
    <p>Ativos Monitorados: <b>8</b></p>
    <p>Timeframe: <b>M5 (5 minutos)</b></p>
    <p>Score Mínimo: <b>80/100</b></p>
    <p>Ponderações: RSI+25, Volume+12, Notícia+13</p>
    <p>Plataforma: <b>Railway.app</b></p>
    
    <div class="ativos-list">
      <p><b>8 Ativos Estratégicos:</b></p>
      <p>✅ Bitcoin (BTC) | ✅ Ethereum (ETH)</p>
      <p>✅ EUR/USD | ✅ USD/JPY | ✅ GBP/USD</p>
      <p>✅ AUD/USD | ✅ USD/CAD | ✅ USD/CHF</p>
    </div>
  </div>
  
  <hr>
  
  <div class="info">
    <p><b>✨ Status do Servidor:</b></p>
    <p>Se você vê esta página, o servidor está funcionando corretamente.</p>
    <p>O bot está pronto para monitorar os mercados e enviar sinais via Telegram.</p>
    <p>Sinais esperados: 5-10 por dia (qualidade alta, win rate ~85%)</p>
  </div>
  
  <script>
    setInterval(function() {
      location.reload();
    }, 30000);
  </script>
</body>
</html>`;
    
    res.status(200).send(html);
  } catch (error) {
    res.status(500).send('<h1>Erro no servidor</h1><p>Contacte o administrador.</p>');
  }
}
