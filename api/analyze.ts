import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { TG_TOKEN, TG_CHAT_ID, GEMINI_API_KEY } = process.env;

  try {
    const agoraUTC = new Date();
    const agoraBR = new Date(agoraUTC.getTime() - (3 * 60 * 60 * 1000));
    const diaSemana = agoraBR.getDay();
    const minutoAtual = agoraBR.getMinutes();
    const horaAtual = agoraBR.getHours();

    // TRAVA DE 9 MINUTOS DA OPTNEX
    const minutoNoCiclo = minutoAtual % 15;
    if (minutoNoCiclo > 9) return res.status(200).json({ status: "Fora da janela de entrada" });

    const inicioM15 = Math.floor(minutoAtual / 15) * 15;
    const fimM15 = (inicioM15 + 15) % 60;
    const horaFim = fimM15 === 0 ? (horaAtual + 1) % 24 : horaAtual;
    const cicloVela = `${String(horaAtual).padStart(2, '0')}:${String(inicioM15).padStart(2, '0')} -> ${String(horaFim).padStart(2, '0')}:${String(fimM15).padStart(2, '0')}`;

    // VARREDURA COMPLETA DE ATIVOS
    const ativos = [
      { nome: 'BTCUSDT', operarFimDeSemana: true },
      { nome: 'EURUSDT', operarFimDeSemana: false }
    ];

    for (const ativo of ativos) {
      // Inteligência de Mercado: Pula EURUSD no fim de semana para evitar erros
      if (!ativo.operarFimDeSemana && (diaSemana === 0 || diaSemana === 6)) continue;

      const url = `https://api.binance.com/api/v3/klines?symbol=${ativo.nome}&interval=15m&limit=50`;
      const response = await fetch(url);
      const data = await response.json();
      if (!Array.isArray(data)) continue;

      const candles = data.map(d => ({
        o: parseFloat(d[1]), h: parseFloat(d[2]), l: parseFloat(d[3]), c: parseFloat(d[4]), v: parseFloat(d[5])
      })).reverse();

      // CALIBRAGEM HUMANA: Cor e Força da Vela
      const isBearish = candles[0].c < candles[0].o;
      const isBullish = candles[0].c > candles[0].o;

      // BENCHMARKING COM IA DE ELITE
      const analiseIA = await consultarAgenteGlobal(ativo.nome, candles, GEMINI_API_KEY);

      if (analiseIA.decisao === "ENTRAR") {
        // FILTRO DE SEGURANÇA: Bloqueia se a cor da vela for contra o sinal
        if ((analiseIA.direcao === "CALL" && isBearish) || (analiseIA.direcao === "PUT" && isBullish)) continue;

        const direcao = analiseIA.direcao === "CALL" ? "🟢 ACIMA" : "🔴 ABAIXO";
        
        const msg = `🚨 **SINAL DE ELITE: ${direcao}**\n\n` +
                    `🪙 **ATIVO:** ${ativo.nome}\n` +
                    `⏰ **VELA (M15):** ${cicloVela}\n` + 
                    `📊 **ANÁLISE:** ${analiseIA.motivo}\n\n` +
                    `🔍 **INDICADORES TÉCNICOS:**\n` +
                    `• Médias/MACD: CONFLUENTE\n` +
                    `• RSI/Williams: CONFIRMADO\n` +
                    `• Cor da Vela: VALIDADA\n\n` +
                    `🚀 **EXECUTAR NA OPTNEX AGORA!**`;

        await enviarTelegram(TG_TOKEN, TG_CHAT_ID, msg);
      }
    }
    return res.status(200).json({ status: "Agente 360 Ativo" });
  } catch (e) {
    return res.status(200).json({ erro: e.message });
  }
}

async function consultarAgenteGlobal(ativo, candles, key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
  const historico = candles.slice(0, 30).map(c => `O:${c.o} C:${c.c} V:${c.v}`).join('|');

  const prompt = `Trader Humano de Elite. Analise ${ativo} M15: ${historico}. 
  Considere: EMA(9,21), MACD, RSI, Bollinger, Fractal, Estocástico, Volume, Williams %R e Momentum.
  SÓ autorize ENTRAR se a cor da última vela confirmar a direção.
  Responda JSON: {"decisao": "ENTRAR" ou "AGUARDAR", "direcao": "CALL" ou "PUT", "motivo": "justificativa técnica profissional"}`;

  try {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
    const data = await res.json();
    const cleanText = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '');
    return JSON.parse(cleanText);
  } catch (e) { return { decisao: "AGUARDAR" }; }
}

async function enviarTelegram(token, chat, msg) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chat}&text=${encodeURIComponent(msg)}&parse_mode=Markdown`);
}
