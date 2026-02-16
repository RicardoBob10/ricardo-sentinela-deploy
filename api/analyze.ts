import { VercelRequest, VercelResponse } from '@vercel/node';

// Cache para persistência de sinais e controle de reversão (Item 7.2)
let lastSinais: Record<string, { tipo: string, vela: string }> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";
  const versao = "84"; 
  
  const agora = new Date();
  const timeZone = 'America/Sao_Paulo';
  const dataHora = agora.toLocaleString('pt-BR', { timeZone });
  const [data, hora] = dataHora.split(', ');
  const optionsTime = { timeZone, hour: '2-digit', minute: '2-digit', hour12: false } as const;
  const horaMinutoInt = parseInt(agora.toLocaleTimeString('pt-BR', optionsTime).replace(':', ''));
  const diaSemana = agora.getDay(); 

  // REGRA DE OURO: Horários do Robô (Item 6)
  const getStatus = (label: string): boolean => {
    if (label === "Bitcoin") return true; 
    if (label === "EURUSD") {
      if (diaSemana === 5) return horaMinutoInt <= 1900; // Sexta até 19h
      if (diaSemana === 6) return false;               // Sábado fechado
      if (diaSemana === 0) return horaMinutoInt >= 1901; // Domingo abre 19:01
      return true; // Seg a Qui 24h
    }
    return false;
  };

  const ATIVOS = [
    { symbol: "BTCUSDT", label: "Bitcoin", prec: 0 },
    { symbol: "EURUSDT", label: "EURUSD", prec: 5 }
  ];

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
      if (!getStatus(ativo.label)) continue;

      const resApi = await fetch(`https://api.binance.com/api/v3/klines?symbol=${ativo.symbol}&interval=15m&limit=50`);
      const json = await resApi.json();
      const candles = json.map((v: any) => ({ t: v[0], o: parseFloat(v[1]), c: parseFloat(v[4]), h: parseFloat(v[2]), l: parseFloat(v[3]) }));

      const i = candles.length - 1;
      const m9 = calcularEMA(candles, 9);
      const m21 = calcularEMA(candles, 21);
      const rsi = calcularRSI(candles, 14);
      const m9_ant = calcularEMA(candles.slice(0, i), 9);
      const m21_ant = calcularEMA(candles.slice(0, i), 21);

      // LÓGICA RT_ROBO_SCALPER_V3 (Item 5)
      const sinal_call = (m9 > m21) && (m9_ant <= m21_ant) && (rsi > 50);
      const sinal_put = (m9 < m21) && (m9_ant >= m21_ant) && (rsi < 50);

      // GATILHO DE SINAL (Item 7.1)
      if (sinal_call || sinal_put) {
        const opId = `${ativo.label}_${candles[i].t}`;
        if (!lastSinais[opId]) {
          const tipo = sinal_call ? "COMPRAR" : "VENDER";
          const emoji = sinal_call ? "🟢" : "🔴";
          const seta = sinal_call ? "↑ COMPRAR" : "↓ VENDER";
          const preco = candles[i].c;
          const range = ativo.label === "Bitcoin" ? 600 : 0.00100;
          
          lastSinais[ativo.label] = { tipo, vela: new Date(candles[i].t).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) };
          lastSinais[opId] = lastSinais[ativo.label];

          const msg = `<b>SINAL EMITIDO!</b> ${emoji}\n<b>ATIVO:</b> ${ativo.label}\n<b>SINAL:</b> ${seta}\n<b>VELA:</b> ${lastSinais[ativo.label].vela}\n<b>PREÇO:</b> $ ${preco.toFixed(ativo.prec)}\n<b>TP:</b> $ ${(sinal_call ? preco + range : preco - range).toFixed(ativo.prec)}\n<b>SL:</b> $ ${(sinal_call ? preco - range : preco + range).toFixed(ativo.prec)}`;
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id, text: msg, parse_mode: 'HTML' }) });
        }
      }

      // LÓGICA DE REVERSÃO / TAKE PROFIT (Item 7.2)
      const opAtiva = lastSinais[ativo.label];
      if (opAtiva) {
        const rev_call = (opAtiva.tipo === "VENDER" && candles[i].o > m9 && candles[i].o > m21);
        const rev_put = (opAtiva.tipo === "COMPRAR" && candles[i].o < m9 && candles[i].o < m21);

        if (rev_call || rev_put) {
          const msgRev = `<b>TAKE PROFIT !</b>\n<b>AVISO:</b> Abertura da vela ${rev_call ? 'ACIMA' : 'ABAIXO'} da EMA 9/21\n<b>ATIVO:</b> ${ativo.label}\n<b>SINAL ANTERIOR:</b> ${opAtiva.tipo}\n<b>Vela Anterior:</b> ${opAtiva.vela}\n<b>Vela Atual:</b> ${new Date(candles[i].t).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}`;
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id, text: msgRev, parse_mode: 'HTML' }) });
          delete lastSinais[ativo.label];
        }
      }
    }

    // INTERFACE HTML - REGRA DE OURO (Item 4) 
    const statusEur = getStatus("EURUSD") ? "ABERTO" : "FECHADO";
    const bgEur = statusEur === "ABERTO" ? "rgba(0,255,136,0.15)" : "rgba(255,68,68,0.15)";
    const colorEur = statusEur === "ABERTO" ? "#00ff88" : "#ff4444";
    const logoSvg = `<svg width="85" height="85" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="none" stroke="#00ff88" stroke-width="2" stroke-dasharray="8,4" style="animation: rotate 12s linear infinite; transform-origin: center;"/><circle cx="50" cy="50" r="35" fill="rgba(0,255,136,0.05)" stroke="#00ff88" stroke-width="2"/><text x="50" y="66" font-family='Arial' font-size='45' font-weight='900' fill='#00ff88' text-anchor='middle'>R</text><style>@keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style></svg>`;

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <!DOCTYPE html> <html lang="pt-BR"> <head> <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"> 
      <title>RICARDO SENTINELA PRO</title>
      <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='48' fill='none' stroke='%2300ff88' stroke-width='4' stroke-dasharray='10,5'/><circle cx='50' cy='50' r='38' fill='black' stroke='%2300ff88' stroke-width='2'/><text x='50' y='68' font-family='Arial' font-size='55' font-weight='900' fill='%2300ff88' text-anchor='middle'>R</text></svg>">
      <style>
        :root { --primary: #00ff88; --bg: #050505; }
        body { background-color: var(--bg); color: #fff; font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
        .main-card { width: 95%; max-width: 420px; background: rgba(17,17,17,0.9); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.08); border-radius: 32px; padding: 35px 25px; box-shadow: 0 30px 60px rgba(0,0,0,0.8); }
        .logo-container { display: flex; justify-content: center; margin-bottom: 15px; }
        h1 { font-size: 20px; text-align: center; margin-bottom: 25px; letter-spacing: 2px; font-weight: 800; text-transform: uppercase; }
        .status-badge { width: 100%; background: linear-gradient(90deg, rgba(0,255,136,0.02) 0%, rgba(0,255,136,0.12) 50%, rgba(0,255,136,0.02) 100%); border: 1px solid rgba(0,255,136,0.2); padding: 12px; border-radius: 12px; font-size: 11px; color: var(--primary); display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 25px; }
        .asset-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 15px 20px; border-radius: 16px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .status-pill { font-size: 10px; font-weight: 900; padding: 6px 14px; border-radius: 8px; }
        .footer { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 30px; text-align: center; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 20px; }
        .footer b { font-size: 9px; color: #555; text-transform: uppercase; display: block; margin-bottom: 5px; }
        .footer p { margin: 0; font-size: 12px; font-family: 'JetBrains Mono', monospace; }
        .revision-table { width: 100%; margin-top: 30px; border-collapse: collapse; font-size: 9px; color: rgba(255,255,255,0.5); }
        .revision-table th { text-align: left; color: var(--primary); padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .revision-table td { padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.03); }
      </style> </head> <body> <div class="main-card">
        <div class="logo-container">${logoSvg}</div>
        <h1>RICARDO SENTINELA BOT</h1>
        <div class="status-badge">EM MONITORAMENTO...</div>
        <div class="asset-grid">
          <div class="asset-card"><span>Bitcoin</span><span class="status-pill" style="background:rgba(0,255,136,0.15); color:var(--primary)">ABERTO</span></div>
          <div class="asset-card"><span>EURUSD</span><span class="status-pill" style="background:${bgEur}; color:${colorEur}">${statusEur}</span></div>
        </div>
        <div class="footer">
          <div><b>DATA</b><p>${data}</p></div>
          <div><b>HORA</b><p>${hora}</p></div>
          <div><b>VERSÃO</b><p style="color:var(--primary); font-weight:bold;">${versao}</p></div>
          <div><b>STATUS</b><p style="color:var(--primary); font-weight:bold;">ATIVO</p></div>
        </div>
        <table class="revision-table">
          <thead><tr><th>Nº</th><th>DATA</th><th>HORA</th><th>MOTIVO</th></tr></thead>
          <tbody>
            <tr><td>84</td><td>16/02/26</td><td>16:19</td><td>Conformidade Integral: Item 4 (HTML) + Item 5 (EMA 9/21) + Item 7.2 (Take Profit)</td></tr>
            <tr><td>83</td><td>16/02/26</td><td>16:16</td><td>Migração Bullex: Scalper Forex/Cripto + Favicon</td></tr>
            <tr><td>82</td><td>15/02/26</td><td>10:30</td><td>Fix NC: Zero Delay + Paralelismo + Filtro Inclinação EMA</td></tr>
            <tr><td>81</td><td>14/02/26</td><td>20:46</td><td>Fix NC: Duplicidade + Lógica RSI V.01 + Put/Call Vela</td></tr>
            <tr><td>80</td><td>14/02/26</td><td>20:07</td><td>Conformidade: Briefing Contexto + RT_ROBO_V.02</td></tr>
          </tbody>
        </table>
      </div> <script>setTimeout(()=>location.reload(), 30000);</script> </body></html>`);
  } catch (e) { return res.status(200).send("Sistema Operacional."); }
}
