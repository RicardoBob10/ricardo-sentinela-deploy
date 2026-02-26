const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

// Handler simples
function handler(req, res) {
  const agora = new Date();
  const horaBR = agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>RICARDO SENTINELA BOT - V125</title>
  <style>
    body { background: #fff; color: #000; font-family: Arial; padding: 40px; }
    h1 { color: #0066cc; font-size: 32px; }
    .ok { color: #00aa00; font-weight: bold; font-size: 26px; }
    .config { background: #f5f5f5; border-left: 4px solid #0066cc; padding: 20px; margin: 20px 0; }
  </style>
</head>
<body>
  <h1>🤖 RICARDO SENTINELA BOT</h1>
  <p class="ok">✅ SERVIDOR ONLINE</p>
  <div class="config">
    <p><b>V125 - QUALIDADE > QUANTIDADE</b></p>
    <p>Hora: ${horaBR}</p>
    <p>Status: ATIVADO</p>
    <p>Ativos: 8 | Score: 80/100</p>
  </div>
</body>
</html>`;
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
}

// Rotas
app.get('/', handler);
app.get('/api/analyze', handler);

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`✅ Servidor RICARDO SENTINELA online na porta ${PORT}`);
});
