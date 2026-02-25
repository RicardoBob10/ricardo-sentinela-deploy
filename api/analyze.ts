import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const agoraUnix = Date.now();
  const optionsBR = { 
    timeZone: 'America/Sao_Paulo', 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: false 
  } as const;
  const horaBR = new Date(agoraUnix).toLocaleTimeString('pt-BR', optionsBR);

  function mercadoForexAberto(): boolean {
    const diaSem = new Date(agoraUnix).toLocaleDateString('pt-BR', { 
      timeZone: 'America/Sao_Paulo', 
      weekday: 'long' 
    });
    const hStr = new Date(agoraUnix).toLocaleTimeString('pt-BR', { 
      timeZone: 'America/Sao_Paulo', 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false 
    });
    const [hh, mm] = hStr.split(':').map(Number);
    const minutos = hh * 60 + mm;
    const dia = diaSem.toLowerCase();
    
    if (dia.includes('segunda') || dia.includes('terça') || dia.includes('quarta') || dia.includes('quinta')) return true;
    if (dia.includes('sexta')) return minutos <= 17 * 60;
    if (dia.includes('domingo')) return minutos >= 21 * 60;
    return false;
  }

  const statusForex = mercadoForexAberto() ? "ABERTO" : "FECHADO";
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=30');
  
  return res.status(200).send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>RICARDO SENTINELA BOT</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        html, body {
          height: 100%;
        }
        body {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: #fff;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          padding: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }
        .container {
          background: rgba(255, 255, 255, 0.95);
          color: #333;
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          padding: 40px;
          max-width: 700px;
          width: 100%;
          animation: slideIn 0.5s ease-out;
        }
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .header {
          text-align: center;
          margin-bottom: 40px;
        }
        .logo {
          font-size: 48px;
          margin-bottom: 20px;
        }
        h1 {
          color: #2c3e50;
          font-size: 32px;
          margin-bottom: 10px;
          font-weight: 700;
        }
        .status-badge {
          display: inline-block;
          background: linear-gradient(135deg, #27ae60 0%, #229954 100%);
          color: white;
          padding: 10px 20px;
          border-radius: 25px;
          font-weight: bold;
          font-size: 16px;
          margin-bottom: 20px;
          box-shadow: 0 4px 15px rgba(39, 174, 96, 0.3);
        }
        .stats-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 40px;
        }
        .stat-card {
          background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
          padding: 20px;
          border-radius: 10px;
          text-align: center;
          border-left: 4px solid #3498db;
        }
        .stat-label {
          color: #7f8c8d;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .stat-value {
          color: #2c3e50;
          font-size: 24px;
          font-weight: bold;
        }
        .config-section {
          background: #ecf0f1;
          padding: 30px;
          border-radius: 10px;
          margin-bottom: 30px;
          border-left: 4px solid #9b59b6;
        }
        .config-section h2 {
          color: #2c3e50;
          font-size: 18px;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .config-item {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid #bdc3c7;
          font-size: 14px;
        }
        .config-item:last-child {
          border-bottom: none;
        }
        .config-label {
          color: #34495e;
          font-weight: 600;
        }
        .config-value {
          color: #e74c3c;
          font-weight: bold;
          background: white;
          padding: 4px 10px;
          border-radius: 4px;
        }
        .assets-section {
          margin-bottom: 30px;
        }
        .assets-section h3 {
          color: #2c3e50;
          font-size: 16px;
          margin-bottom: 15px;
          font-weight: 600;
        }
        .assets-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
          gap: 10px;
        }
        .asset-tag {
          background: white;
          border: 2px solid #3498db;
          color: #3498db;
          padding: 8px 12px;
          border-radius: 6px;
          text-align: center;
          font-size: 12px;
          font-weight: 600;
          transition: all 0.3s ease;
        }
        .asset-tag:hover {
          background: #3498db;
          color: white;
        }
        .asset-tag.crypto {
          border-color: #f39c12;
          color: #f39c12;
        }
        .asset-tag.crypto:hover {
          background: #f39c12;
          color: white;
        }
        .footer {
          text-align: center;
          color: #95a5a6;
          font-size: 12px;
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #ecf0f1;
        }
        .pulse {
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.7;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">🤖</div>
          <h1>RICARDO SENTINELA BOT</h1>
          <div class="status-badge pulse">✅ ATIVADO</div>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Versão</div>
            <div class="stat-value">123.1</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Status</div>
            <div class="stat-value" style="color: #27ae60;">Online</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Hora (BRT)</div>
            <div class="stat-value" style="font-size: 18px;">${horaBR}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">FOREX</div>
            <div class="stat-value" style="color: ${statusForex === 'ABERTO' ? '#27ae60' : '#e74c3c'};font-size:18px;">${statusForex}</div>
          </div>
        </div>

        <div class="config-section">
          <h2>⚙️ Configuração</h2>
          <div class="config-item">
            <span class="config-label">Timeframe</span>
            <span class="config-value">M5</span>
          </div>
          <div class="config-item">
            <span class="config-label">Ativos</span>
            <span class="config-value">16</span>
          </div>
          <div class="config-item">
            <span class="config-label">Bollinger</span>
            <span class="config-value">(20, 2)</span>
          </div>
          <div class="config-item">
            <span class="config-label">Score Mín.</span>
            <span class="config-value">75/100</span>
          </div>
        </div>

        <div class="assets-section">
          <h3>🪙 Criptomoedas (2)</h3>
          <div class="assets-grid">
            <div class="asset-tag crypto">₿ Bitcoin</div>
            <div class="asset-tag crypto">Ξ Ethereum</div>
          </div>
        </div>

        <div class="assets-section">
          <h3>💱 FOREX (14)</h3>
          <div class="assets-grid">
            <div class="asset-tag">EUR/USD</div>
            <div class="asset-tag">EUR/JPY</div>
            <div class="asset-tag">EUR/AUD</div>
            <div class="asset-tag">EUR/CAD</div>
            <div class="asset-tag">EUR/CHF</div>
            <div class="asset-tag">EUR/GBP</div>
            <div class="asset-tag">USD/JPY</div>
            <div class="asset-tag">USD/CAD</div>
            <div class="asset-tag">USD/CHF</div>
            <div class="asset-tag">GBP/USD</div>
            <div class="asset-tag">GBP/JPY</div>
            <div class="asset-tag">GBP/AUD</div>
            <div class="asset-tag">AUD/USD</div>
            <div class="asset-tag">AUD/JPY</div>
          </div>
        </div>

        <div class="footer">
          <p>✨ Dashboard atualiza a cada 30 segundos</p>
          <p>Desenvolvido por Claude • RICARDO SENTINELA V123.1 LIGHT</p>
          <script>
            setInterval(() => {
              location.reload();
            }, 30000);
          </script>
        </div>
      </div>
    </body>
    </html>
  `);
}
