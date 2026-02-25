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

  // Responde RAPIDAMENTE com HTML estático
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
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
        body {
          background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
          color: #333;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          padding: 20px;
          min-height: 100vh;
        }
        .container {
          max-width: 900px;
          margin: 0 auto;
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          padding: 30px;
        }
        h1 {
          color: #2c3e50;
          margin-bottom: 20px;
          font-size: 28px;
          border-bottom: 3px solid #3498db;
          padding-bottom: 10px;
        }
        .status-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
          margin-bottom: 30px;
        }
        .status-item {
          background: #f8f9fa;
          padding: 15px;
          border-radius: 8px;
          border-left: 4px solid #3498db;
        }
        .status-item strong {
          color: #2c3e50;
          font-weight: 600;
        }
        .status-value {
          color: #27ae60;
          font-weight: bold;
          font-size: 16px;
          margin-top: 5px;
        }
        .status-value.offline {
          color: #e74c3c;
        }
        .status-value.closed {
          color: #e67e22;
        }
        .config-box {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px;
          border-radius: 8px;
          margin: 20px 0;
        }
        .config-box h2 {
          font-size: 18px;
          margin-bottom: 15px;
        }
        .config-item {
          display: flex;
          justify-content: space-between;
          margin: 8px 0;
          padding: 8px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        }
        .config-item:last-child {
          border-bottom: none;
        }
        .config-label {
          font-weight: 500;
        }
        .config-value {
          font-weight: bold;
          background: rgba(0, 0, 0, 0.2);
          padding: 2px 8px;
          border-radius: 4px;
        }
        .status-badge {
          display: inline-block;
          background: #27ae60;
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-weight: bold;
          font-size: 14px;
        }
        .status-badge.online {
          background: #27ae60;
        }
        .status-badge.offline {
          background: #e74c3c;
        }
        .status-badge.forex-open {
          background: #27ae60;
        }
        .status-badge.forex-closed {
          background: #e67e22;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          color: #7f8c8d;
          font-size: 12px;
        }
        .assets-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 10px;
          margin: 20px 0;
        }
        .asset-chip {
          background: #ecf0f1;
          padding: 8px 12px;
          border-radius: 6px;
          text-align: center;
          font-size: 13px;
          border: 1px solid #bdc3c7;
        }
        .asset-chip.crypto {
          border-left: 4px solid #f39c12;
        }
        .asset-chip.forex {
          border-left: 4px solid #3498db;
        }
        .update-info {
          background: #e8f4f8;
          border-left: 4px solid #3498db;
          padding: 12px;
          margin: 15px 0;
          border-radius: 4px;
          font-size: 13px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🤖 RICARDO SENTINELA BOT</h1>
        
        <div class="status-grid">
          <div class="status-item">
            <strong>STATUS</strong>
            <div class="status-value"><span class="status-badge online">✅ ATIVADO</span></div>
          </div>
          <div class="status-item">
            <strong>VERSÃO</strong>
            <div class="status-value">122.4 [ULTRA RÁPIDO]</div>
          </div>
          <div class="status-item">
            <strong>DATA</strong>
            <div class="status-value">25/02/2026</div>
          </div>
          <div class="status-item">
            <strong>HORA (BRT)</strong>
            <div class="status-value">${horaBR}</div>
          </div>
        </div>

        <div class="update-info">
          <strong>ℹ️ Última atualização:</strong> Agora (${new Date(agoraUnix).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })})
        </div>

        <div class="config-box">
          <h2>⚙️ CONFIGURAÇÃO</h2>
          <div class="config-item">
            <span class="config-label">Timeframe</span>
            <span class="config-value">M5 (5 minutos)</span>
          </div>
          <div class="config-item">
            <span class="config-label">Ativos Monitorados</span>
            <span class="config-value">16 (2 Cripto + 14 Forex)</span>
          </div>
          <div class="config-item">
            <span class="config-label">Bollinger Bands</span>
            <span class="config-value">(20, 2)</span>
          </div>
          <div class="config-item">
            <span class="config-label">Score Mínimo</span>
            <span class="config-value">75/100</span>
          </div>
          <div class="config-item">
            <span class="config-label">Mercado Forex</span>
            <span class="config-value ${statusForex === 'ABERTO' ? '' : 'offline'}">${statusForex === 'ABERTO' ? '🟢 ABERTO' : '🔴 FECHADO'}</span>
          </div>
        </div>

        <h2 style="margin-top: 30px; color: #2c3e50; font-size: 18px;">📊 ATIVOS MONITORADOS</h2>
        
        <h3 style="color: #e74c3c; font-size: 14px; margin-top: 15px; margin-bottom: 10px;">Criptomoedas (2)</h3>
        <div class="assets-list">
          <div class="asset-chip crypto">₿ Bitcoin</div>
          <div class="asset-chip crypto">Ξ Ethereum</div>
        </div>

        <h3 style="color: #3498db; font-size: 14px; margin-top: 20px; margin-bottom: 10px;">FOREX (14)</h3>
        <div class="assets-list">
          <div class="asset-chip forex">EUR/USD</div>
          <div class="asset-chip forex">USD/JPY</div>
          <div class="asset-chip forex">GBP/USD</div>
          <div class="asset-chip forex">AUD/USD</div>
          <div class="asset-chip forex">USD/CAD</div>
          <div class="asset-chip forex">USD/CHF</div>
          <div class="asset-chip forex">AUD/JPY</div>
          <div class="asset-chip forex">EUR/AUD</div>
          <div class="asset-chip forex">EUR/CAD</div>
          <div class="asset-chip forex">EUR/CHF</div>
          <div class="asset-chip forex">EUR/GBP</div>
          <div class="asset-chip forex">EUR/JPY</div>
          <div class="asset-chip forex">GBP/AUD</div>
          <div class="asset-chip forex">GBP/JPY</div>
        </div>

        <div class="update-info" style="margin-top: 30px;">
          <strong>✅ Sistema Pronto</strong><br>
          O robô está monitorando 16 ativos em M5. Sinais chegam no Telegram conforme confluências são detectadas (Score ≥ 75).
        </div>

        <div class="footer">
          <p>RICARDO SENTINELA BOT v122.4 • Desenvolvido por Claude/Anthropic</p>
          <p>Dashboard atualiza a cada 30 segundos</p>
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
