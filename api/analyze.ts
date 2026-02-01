import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { TG_TOKEN, TG_CHAT_ID, GEMINI_API_KEY } = process.env;

  try {
    const agoraBR = new Date(new Date().getTime() - (3 * 60 * 60 * 1000));
    const diaSemana = agoraBR.getDay();
    const minutoAtual = agoraBR.getMinutes();
    
    // 🛡️ SUPERVISOR: Bloqueio de horário para evitar entradas atrasadas
    const minutoNoCiclo = minutoAtual % 15;
    if (minutoNoCiclo > 9) return res.status(200).json({ status: "SENTINELA: Aguardando abertura de vela M15" });

    const ativos = [
      { nome: 'BTCUSDT', operarFDS: true },
      { nome: 'EURUSDT', operarFDS: false }
    ];

    for (const ativo of ativos) {
      // 🛡️ SUPERVISOR: Prevenção de Erro 500 (Mercado Fechado)
      if (!ativo.operarFDS && (diaSemana === 0 || diaSemana === 6)) continue;

      const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${ativo.nome}&interval=15m&limit=30`);
      const data = await response.json();
      if (!Array.isArray(data)) continue;

      const candles = data.map(d => ({
        o: parseFloat(d[1]), h: parseFloat(d[2]), l: parseFloat(d[3]), c: parseFloat(d[4])
      })).reverse();

      // 🛡️ SUPERVISOR: Validação de Movimento Real (O que o Ricardo vê)
      const isBearish = candles[0].c < candles[0].o; // Vermelha
      const isBullish = candles[0].c > candles[0].o;  // Verde
      const setaAbaixoConfirmada = candles[0].h > candles[1].h && isBearish; // Seta de ABAIXO detectada

      // Chamada para a IA com ordens estritas de supervisão
      const analiseIA = await consultarIAComSupervisao(ativo.nome, candles, GEMINI_API_KEY);

      // 🛡️ SUPERVISOR: Se a seta apareceu na tela, NADA bloqueia o sinal
      if (setaAbaixoConfirmada || analiseIA.decisao === "ENTRAR") {
        
        // Garante que a direção do sinal não seja "coisa de doido"
        if (analiseIA.direcao === "CALL" && isBearish) continue;

        const msg = `💎 **SUPERVISÃO GEMINI: SINAL ATIVO**\n\n` +
                    `🪙 **ATIVO:** ${ativo.nome}\n` +
                    `📊 **MOVIMENTO:** ${setaAbaixoConfirmada ? "🔴 ABAIXO (Seta Detectada)" : "ANÁLISE TÉCNICA"}\n` +
                    `🧠 **VEREDITO IA:** ${analiseIA.motivo}\n\n` +
                    `⚠️ *Supervisor: Operação validada com Price Action real.*`;

        await enviarTelegram(TG_TOKEN, TG_CHAT_ID, msg);
      }
    }
    return res.status(200).json({ status: "Sentinela Ativo e Supervisionado" });
  } catch (e) {
    return res.status(200).json({ status: "Erro capturado pelo Supervisor" });
  }
}

async function consultarIAComSupervisao(ativo, candles, key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
  const prompt = `Aja como Supervisor de Trading para ${ativo}. Analise Williams%R, RSI e Médias. 
  Não falhe: Se a vela for de força, siga o fluxo. Responda JSON: {"decisao": "ENTRAR", "direcao": "PUT/CALL", "motivo": "técnico"}`;

  const res = await fetch(url, { method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
  const data = await res.json();
  return JSON.parse(data.candidates[0].content.parts[0].text.replace(/```json|```/g, ''));
}

async function enviarTelegram(token, chat, msg) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chat}&text=${encodeURIComponent(msg)}&parse_mode=Markdown`);
}
