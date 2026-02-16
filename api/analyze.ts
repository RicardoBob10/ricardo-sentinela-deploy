import { VercelRequest, VercelResponse } from '@vercel/node';

// Cache global para evitar duplicidade de sinais
let lastSinais: Record<string, boolean> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CONFIGURAÇÕES DA VERSÃO E REVISÃO (CONFORME BRIEFING)
  const versao = "89";
  const dataRevisao = "16/02/2026";
  const horaRevisao = "16:47";
  
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";

  const agora = new Date();
  const optionsTime = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false } as const;
  const horaMinutoInt = parseInt(agora.toLocaleTimeString('pt-BR', optionsTime).replace(':', ''));
  const diaSemana = agora.getDay(); 

  // 1. REGRA DE HORÁRIOS (ITEM 6 DO BRIEFING) 
  const getStatusEur = (): boolean => {
    if (diaSemana >= 1 && diaSemana <= 4) return true; // Seg a Qui: 24h
    if (diaSemana === 5) return horaMinutoInt <= 1900; // Sex: até 19:00
    if (diaSemana === 0) return horaMinutoInt >= 1901; // Dom: após 19:01
    return false; // Sábado: Fechado
  };

  // 2. LÓGICA TÉCNICA (ITEM 5 DO BRIEFING: RT_ROBO_SCALPER_V3) 
  try {
    const ativos = [
      { symbol: "BTCUSDT", label: "Bitcoin", prec: 2, operando: true },
      { symbol: "EURUSDT", label: "EURUSD", prec: 5, operando: getStatusEur() }
    ];

    for (const ativo of ativos) {
      if (!ativo.operando) continue;

      const resApi = await fetch(`https://api.binance.com/api/v3/klines?symbol=${ativo.symbol}&interval=15m&limit=50`);
      const candles = await resApi.json();
      
      if (!Array.isArray(candles)) continue;

      const dados = candles.map((v: any) => ({ t: v[0], c: parseFloat(v[4]) }));
      const i = dados.length - 1;

      // Cálculos EMA 9/21 e RSI 14 
      const calcEMA = (d: any[], p: number) => {
        const k = 2 / (p + 1);
        let ema = d[0].c;
        for (let j = 1; j < d.length; j++) ema = (d[j].c * k) + (ema * (1 - k));
        return ema;
      };
      
      const m9 = calcEMA(dados, 9);
      const m21 = calcEMA(dados, 21);
      const m9_ant = calcEMA(dados.slice(0, i), 9);
      const m21_ant = calcEMA(dados.slice(0, i), 21);

      // Gatilhos de Sinal 
      const sinalCall = m9 > m21 && m9_ant <= m21_ant;
      const sinalPut = m9 < m21 && m9_ant >= m21_ant;

      if (sinalCall || sinalPut) {
        const opId = `${ativo.label}_${dados[i].t}`;
        if (!lastSinais[opId]) {
          lastSinais[opId] = true;
          const emoji = sinalCall ? "🟢" : "🔴";
          const tipo = sinalCall ? "↑ COMPRAR" : "↓ VENDER";
          
          // Formato de Mensagem Regra de Ouro (Item 7.1) 
          const msg = `<b>SINAL EMITIDO!</b> ${emoji}\n` +
                      `<b>ATIVO:</b> ${ativo.label}\n` +
                      `<b>SINAL:</b> ${tipo}\n` +
                      `<b>VELA:</b> ${new Date(dados[i].t).toLocaleTimeString('pt-BR', optionsTime)}\n` +
                      `<b>PREÇO:</b> $ ${dados[i].c.toFixed(ativo.prec)}\n` +
                      `<b>TP:</b> Proporcional\n` +
                      `<b>SL:</b> Proporcional`;

          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id, text: msg, parse_mode: 'HTML' })
          });
        }
      }
    }
  } catch (err) { console.error("Erro técnico silencioso"); }

  // 3. INTERFACE HTML - REGRA DE OURO (ITEM 4 DO BRIEFING) 
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>RICARDO SENTINELA BOT</title>
      <style>
        body { background-color: #ffffff; color: #000000; font-family: sans-serif; padding: 40px; line-height: 1.5; }
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
      <script>setTimeout(() => location.reload(), 30000);</script>
    </body>
    </html>
  `);
}
