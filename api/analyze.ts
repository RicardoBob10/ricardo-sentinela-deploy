import { VercelRequest, VercelResponse } from '@vercel/node';

// Cache para evitar spam e controlar reversão (Item 7.2)
let lastSinais: Record<string, any> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";
  const versao = "85"; 
  
  const agora = new Date();
  const timeZone = 'America/Sao_Paulo';
  const dataHora = agora.toLocaleString('pt-BR', { timeZone });
  const [data, hora] = dataHora.split(', ');

  const ATIVOS = [
    { symbol: "BTCUSDT", label: "Bitcoin", prec: 2 },
    { symbol: "EURUSDT", label: "EURUSD", prec: 5 }
  ];

  // Cálculos Técnicos Rigorosos (Item 5)
  const calcularEMA = (dados: any[], periodo: number) => {
    const k = 2 / (periodo + 1);
    let ema = dados[0].c;
    for (let i = 1; i < dados.length; i++) ema = (dados[i].c * k) + (ema * (1 - k));
    return ema;
  };

  const calcularRSI = (dados: any[], periodo = 14) => {
    const i = dados.length - 1;
    let gains = 0, losses = 0;
    for (let j = i - (periodo - 1); j <= i; j++) {
      const diff = dados[j].c - dados[j-1].c;
      if (diff >= 0) gains += diff; else losses -= diff;
    }
    return 100 - (100 / (1 + (gains / (losses || 1))));
  };

  try {
    for (const ativo of ATIVOS) {
      const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${ativo.symbol}&interval=15m&limit=100`);
      if (!response.ok) continue;
      const json = await response.json();
      const candles = json.map((v: any) => ({ t: v[0], o: parseFloat(v[1]), h: parseFloat(v[2]), l: parseFloat(v[3]), c: parseFloat(v[4]) }));

      const i = candles.length - 1;
      const m9 = calcularEMA(candles, 9);
      const m21 = calcularEMA(candles, 21);
      const m9_ant = calcularEMA(candles.slice(0, i), 9);
      const m21_ant = calcularEMA(candles.slice(0, i), 21);
      const rsi = calcularRSI(candles, 14);

      // Gatilhos de Estratégia (Item 5)
      const call = (m9 > m21) && (m9_ant <= m21_ant) && (rsi > 50);
      const put = (m9 < m21) && (m9_ant >= m21_ant) && (rsi < 50);

      if (call || put) {
        const id = `${ativo.label}_${candles[i].t}`;
        if (!lastSinais[id]) {
          lastSinais[id] = true;
          const emoji = call ? "🟢" : "🔴";
          const acao = call ? "↑ COMPRAR" : "↓ VENDER";
          const preco = candles[i].c;
          const sl = call ? preco * 0.995 : preco * 1.005;
          const tp = call ? preco * 1.01 : preco * 0.99;

          const msg = `<b>SINAL EMITIDO!</b> ${emoji}\n<b>ATIVO:</b> ${ativo.label}\n<b>SINAL:</b> ${acao}\n<b>VELA:</b> 15m\n<b>PREÇO:</b> $ ${preco.toFixed(ativo.prec)}\n<b>TP:</b> $ ${tp.toFixed(ativo.prec)}\n<b>SL:</b> $ ${sl.toFixed(ativo.prec)}`;
          
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id, text: msg, parse_mode: 'HTML' })
          });
        }
      }
    }

    // DASHBOARD HTML - REGRA DE OURO (Item 4)
    const logoSvg = `<svg width="85" height="85" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="none" stroke="#00ff88" stroke-width="2" stroke-dasharray="8,4" style="animation: rotate 12s linear infinite; transform-origin: center;"/><circle cx="50" cy="50" r="35" fill="rgba(0,255,136,0.05)" stroke="#00ff88" stroke-width="2"/><text x="50" y="66" font-family='Arial' font-size='45' font-weight='900' fill='#00ff88' text-anchor='middle'>R</text><style>@keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style></svg>`;

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <!DOCTYPE html> <html lang="pt-BR"> <head> <meta charset="UTF-8">
      <title>RICARDO SENTINELA PRO</title>
      <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='48' fill='none' stroke='%2300ff88' stroke-width='4' stroke-dasharray='10,5'/><circle cx='50' cy='50' r='38' fill='black' stroke='%2300ff88' stroke-width='2'/><text x='50' y='68' font-family='Arial' font-size='55' font-weight='900' fill='%2300ff88' text-anchor='middle'>R</text></svg>">
      <style>
        :root { --primary: #00ff88; --bg: #050505; }
        body { background-color: var(--bg); color: #fff; font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
        .main-card { width: 95%; max-width: 420px; background: rgba(17,17,17,0.9); border: 1px solid rgba(255,255,255,0.08); border-radius: 32px; padding: 35px 25px; text-align: center; }
        .status-badge { background: rgba(0,255,136,0.1); border: 1px solid var(--primary); padding: 10px; border-radius: 12px; color: var(--primary); font-size: 12px; margin: 20px 0; }
        .footer { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); }
        .revision-table { width: 100%; margin-top: 25px; font-size: 10px; border-collapse: collapse; color: #888; }
        .revision-table th { color: var(--primary); text-align: left; border-bottom: 1px solid #333; padding-bottom: 5px; }
      </style> </head> <body> <div class="main-card">
        <div>${logoSvg}</div>
        <h1 style="font-size: 18px; letter-spacing: 2px;">RICARDO SENTINELA BOT</h1>
        <div class="status-badge">SISTEMA ATIVO - MONITORANDO BULLEX</div>
        <div class="footer">
          <div><b>VERSÃO</b><p style="color:var(--primary)">${versao}</p></div>
          <div><b>STATUS</b><p style="color:var(--primary)">OPERACIONAL</p></div>
        </div>
        <table class="revision-table">
          <thead><tr><th>Nº</th><th>DATA</th><th>MOTIVO</th></tr></thead>
          <tbody>
            <tr><td>85</td><td>16/02</td><td>Correção Erro "Sistema Operacional" + Favicon Fix</td></tr>
            <tr><td>84</td><td>16/02</td><td>Implementação EMA 9/21 + RSI 14 Conforme Briefing</td></tr>
            <tr><td>83</td><td>16/02</td><td>Ajuste Dash HTML e Identidade Visual</td></tr>
          </tbody>
        </table>
      </div> </body> </html>`);
  } catch (e) {
    // Se der erro, mostra o erro real para debug em vez de mensagem genérica
    return res.status(500).send(`Erro Técnico: ${e.message}`);
  }
}
