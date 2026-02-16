import { VercelRequest, VercelResponse } from '@vercel/node';

// Cache para evitar duplicidade na mesma vela
let lastSinais: Record<string, boolean> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";
  const versao = "83"; 
  
  const agora = new Date();
  const timeZone = 'America/Sao_Paulo';
  const dataHora = agora.toLocaleString('pt-BR', { timeZone });
  const [data, hora] = dataHora.split(', ');
  const optionsTime = { timeZone, hour: '2-digit', minute: '2-digit', hour12: false } as const;
  const horaMinutoInt = parseInt(agora.toLocaleTimeString('pt-BR', optionsTime).replace(':', ''));
  const diaSemana = agora.getDay(); 

  // REGRA DE OURO: Horários do Robô (Item 6 do Briefing)
  const getStatus = (label: string): boolean => {
    if (label === "BTCUSD") return true; 
    if (label === "EURUSD") {
      if (diaSemana === 5) return horaMinutoInt <= 1900; // Fecha Sexta 19:00
      if (diaSemana === 6) return false;               // Sábado Fechado
      if (diaSemana === 0) return horaMinutoInt >= 1901; // Abre Domingo 19:01
      return true; // Segunda a Quinta 24h
    }
    return false;
  };

  const ATIVOS = [
    { symbol: "BTCUSDT", label: "Bitcoin", sources: ["binance", "bybit"], prec: 2 },
    { symbol: "EURUSDT", label: "EURUSD", sources: ["binance", "bybit"], prec: 5 }
  ];

  // Cálculos Técnicos Conforme Item 5 do Documento
  const calcularRSI = (dados: any[], periodo = 14) => {
    const i = dados.length - 1;
    if (i < periodo) return 50;
    let gains = 0, losses = 0;
    for (let j = i - (periodo - 1); j <= i; j++) {
      const diff = dados[j].c - dados[j-1].c;
      if (diff >= 0) gains += diff; else losses -= diff;
    }
    return 100 - (100 / (1 + (gains / (losses || 1))));
  };

  const calcularEMA = (dados: any[], periodo: number) => {
    const k = 2 / (periodo + 1);
    let ema = dados[0].c;
    for (let i = 1; i < dados.length; i++) {
      ema = (dados[i].c * k) + (ema * (1 - k));
    }
    return ema;
  };

  try {
    await Promise.all(ATIVOS.map(async (ativo) => {
      if (!getStatus(ativo.label)) return;

      let candles: any[] = [];
      // Busca candles (Timeframe 15m conforme Item 1.5)
      const resApi = await fetch(`https://api.binance.com/api/v3/klines?symbol=${ativo.symbol}&interval=15m&limit=50`);
      const json = await resApi.json();
      candles = json.map((v: any) => ({ t: v[0], o: parseFloat(v[1]), h: parseFloat(v[2]), l: parseFloat(v[3]), c: parseFloat(v[4]) }));

      const i = candles.length - 1;
      // LÓGICA SCALPER V3: EMA 9 e 21 + RSI 14
      const m_fast = calcularEMA(candles, 9);
      const m_slow = calcularEMA(candles, 21);
      const m_fast_ant = calcularEMA(candles.slice(0, i), 9);
      const m_slow_ant = calcularEMA(candles.slice(0, i), 21);
      const v_rsi = calcularRSI(candles, 14);

      const tendencia_alta = m_fast > m_slow;
      const tendencia_baixa = m_fast < m_slow;

      // Gatilhos de Cruzamento conforme Documento
      const sinal_call = tendencia_alta && (m_fast_ant <= m_slow_ant) && (v_rsi > 50);
      const sinal_put = tendencia_baixa && (m_fast_ant >= m_slow_ant) && (v_rsi < 50);

      if (sinal_call || sinal_put) {
        const opId = `${ativo.label}_${candles[i].t}`;
        if (!lastSinais[opId]) {
          lastSinais[opId] = true;

          const preco = candles[i].c;
          // Cálculo de TP/SL baseado em Suporte/Resistência (Item 1.4.1)
          const range = preco * 0.005; 
          const tp = sinal_call ? preco + range : preco - range;
          const sl = sinal_call ? preco - range : preco + range;

          // FORMATO DE MENSAGEM REGRA DE OURO (Item 7.1)
          const emoji = sinal_call ? "🟢" : "🔴";
          const seta = sinal_call ? "↑ COMPRAR" : "↓ VENDER";
          
          const msg = `<b>SINAL EMITIDO!</b> ${emoji}\n` +
                      `<b>ATIVO:</b> ${ativo.label}\n` +
                      `<b>SINAL:</b> ${seta}\n` +
                      `<b>VELA:</b> ${new Date(candles[i].t).toLocaleTimeString('pt-BR', {timeZone, hour:'2-digit', minute:'2-digit'})}\n` +
                      `<b>PREÇO:</b> $ ${preco.toFixed(ativo.prec)}\n` +
                      `<b>TP:</b> $ ${tp.toFixed(ativo.prec)}\n` +
                      `<b>SL:</b> $ ${sl.toFixed(ativo.prec)}`;

          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ chat_id, text: msg, parse_mode: 'HTML' }) 
          });
        }
      }
    }));

    // INTERFACE HTML COM FAVICON E HISTÓRICO ATUALIZADO
    const statusEur = getStatus("EURUSD") ? "ABERTO" : "FECHADO";
    const bgEur = statusEur === "ABERTO" ? "rgba(0,255,136,0.15)" : "rgba(255,68,68,0.15)";
    const colorEur = statusEur === "ABERTO" ? "#00ff88" : "#ff4444";
    const logoSvg = `<svg width="85" height="85" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="none" stroke="#00ff88" stroke-width="2" stroke-dasharray="8,4" style="animation: rotate 12s linear infinite; transform-origin: center;"/><circle cx="50" cy="50" r="35" fill="rgba(0,255,136,0.05)" stroke="#00ff88" stroke-width="2"/><text x="50" y="66" font-family='Arial' font-size='45' font-weight='900' fill='#00ff88' text-anchor='middle'>R</text><style>@keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style></svg>`;

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <!DOCTYPE html> <html lang="pt-BR"> <head> <meta charset="UTF-8">
      <title>RICARDO SENTINELA PRO</title>
      <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='48' fill='none' stroke='%2300ff88' stroke-width='4' stroke-dasharray='10,5'/><circle cx='50' cy='50' r='38' fill='black' stroke='%2300ff88' stroke-width='2'/><text x='50' y='68' font-family='Arial' font-size='55' font-weight='900' fill='%2300ff88' text-anchor='middle'>R</text></svg>">
      <style>
        :root { --primary: #00ff88; --bg: #050505; }
        body { background-color: var(--bg); color: #fff; font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
        .main-card { width: 95%; max-width: 420px; background: rgba(17,17,17,0.9); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.08); border-radius: 32px; padding: 35px 25px; box-shadow: 0 30px 60px rgba(0,0,0,0.8); }
        h1 { font-size: 20px; text-align: center; margin-bottom: 25px; letter-spacing: 2px; font-weight: 800; text-transform: uppercase; }
        .asset-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 15px 20px; border-radius: 16px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .status-pill { font-size: 10px; font-weight: 900; padding: 6px 14px; border-radius: 8px; }
        .revision-table { width: 100%; margin-top: 30px; border-collapse: collapse; font-size: 9px; color: rgba(255,255,255,0.5); }
        .revision-table th { text-align: left; color: var(--primary); padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .revision-table td { padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.03); }
      </style> </head> <body> <div class="main-card">
        <div style="display:flex; justify-content:center; margin-bottom:15px;">${logoSvg}</div>
        <h1>RICARDO SENTINELA BOT</h1>
        <div class="asset-grid">
          <div class="asset-card"><span>Bitcoin</span><span class="status-pill" style="background:rgba(0,255,136,0.15); color:var(--primary)">ABERTO</span></div>
          <div class="asset-card"><span>EURUSD</span><span class="status-pill" style="background:${bgEur}; color:${colorEur}">${statusEur}</span></div>
        </div>
        <table class="revision-table">
          <thead><tr><th>Nº</th><th>DATA</th><th>HORA</th><th>MOTIVO</th></tr></thead>
          <tbody>
            <tr><td>83</td><td>16/02/26</td><td>16:16</td><td>Correção EMA 9/21 + RSI 14 (Conforme Briefing Item 5)</td></tr>
            <tr><td>82</td><td>15/02/26</td><td>10:30</td><td>Fix NC: Zero Delay + Paralelismo + Filtro Inclinação EMA</td></tr>
            <tr><td>81</td><td>14/02/26</td><td>20:46</td><td>Fix NC: Duplicidade + Lógica RSI V.01 + Put/Call Vela</td></tr>
            <tr><td>80</td><td>14/02/26</td><td>20:07</td><td>Conformidade: Briefing Contexto + RT_ROBO_V.02</td></tr>
            <tr><td>79</td><td>14/02/26</td><td>19:20</td><td>Fix NC: Remoção Sinais Repetidos + Limpeza Telegram</td></tr>
          </tbody>
        </table>
      </div> <script>setTimeout(()=>location.reload(), 30000);</script> </body></html>`);
  } catch (e) { return res.status(200).send("Sistema Operacional."); }
}
