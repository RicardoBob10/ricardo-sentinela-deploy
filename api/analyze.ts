import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { TG_TOKEN, TG_CHAT_ID, GEMINI_API_KEY } = process.env;

  try {
    const agoraUTC = new Date();
    const agoraBR = new Date(agoraUTC.getTime() - (3 * 60 * 60 * 1000));
    const diaSemana = agoraBR.getDay();
    const minutoAtual = agoraBR.getMinutes();
    const horaAtual = agoraBR.getHours();

    const proximoM15 = Math.ceil((minutoAtual + 1) / 15) * 15;
    let horaExp = horaAtual;
    let minExp = proximoM15;
    if (minExp === 60) { minExp = 0; horaExp = (horaAtual + 1) % 24; }
    const horaExpiracaoStr = `${String(horaExp).padStart(2, '0')}:${String(minExp).padStart(2, '0')}`;

    const ativos = [
      { nome: 'BTCUSDT', operarFimDeSemana: true },
      { nome: 'EURUSDT', operarFimDeSemana: false }
    ];

    for (const ativo of ativos) {
      if (!ativo.operarFimDeSemana && (diaSemana === 0 || diaSemana === 6)) continue;

      const url = `https://api.binance.com/api/v3/klines?symbol=${ativo.nome}&interval=15m&limit=20`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (!Array.isArray(data)) continue;

      const candles = data.map(d => ({
        o: parseFloat(d[1]), h: parseFloat(d[2]), l: parseFloat(d[3]), c: parseFloat(d[4]), v: parseFloat(d[5])
      })).reverse();

      // 1. Verificação do Script Optnex (Seta)
      const sinalScriptAcima = candles[0].l < candles[1].l;
      const sinalScriptAbaixo = candles[0].h > candles[1].h;

      // 2. CHAMADA PARA ANÁLISE COMPLETA DA IA
      const analiseIA = await consultarIA(ativo.nome, candles, GEMINI_API_KEY);

      // Decisão: Entra se o script mandar OU se a IA achar uma oportunidade única
      if (sinalScriptAcima || sinalScriptAbaixo || analiseIA.oportunidadeUnica) {
        let direcao = "";
        let motivoFinal = analiseIA.motivo;
        let notaExtra = "";

        if (sinalScriptAcima || (analiseIA.oportunidadeUnica && analiseIA.direcao === "CALL")) {
          direcao = "🟢 ACIMA";
        } else if (sinalScriptAbaixo || (analiseIA.oportunidadeUnica && analiseIA.direcao === "PUT")) {
          direcao = "🔴 ABAIXO";
        }

        if (!sinalScriptAcima && !sinalScriptAbaixo && analiseIA.oportunidadeUnica) {
          notaExtra = "\n⚠️ *Nota: Entrada baseada em análise técnica da IA (fora do script).*";
        }

        const msg = `🚨 **SINAL CONFIRMADO: ${direcao}**\n\n` +
                    `🪙 **ATIVO:** ${ativo.nome}\n` +
                    `⏰ **EXPIRAÇÃO:** ${horaExpiracaoStr}\n` + 
                    `📊 **MOTIVO:** ${motivoFinal}\n` +
                    `${notaExtra}\n\n` +
                    `🚀 **ENTRAR AGORA NA OPTNEX!**`;

        await enviarTelegram(TG_TOKEN, TG_CHAT_ID, msg);
      }
    }

    return res.status(200).json({ status: "Sentinela Analista Ativo" });
  } catch (e) {
    return res.status(200).json({ erro: e.message });
  }
}

async function consultarIA(ativo, candles, key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
  
  // Prepara dados técnicos para a IA
  const dadosTexto = candles.slice(0, 10).map(c => `O:${c.o} H:${c.h} L:${c.l} C:${c.c}`).join(' | ');

  const prompt = `Aja como um Trader Senior de Elite. Analise o ativo ${ativo} com base nestes candles M15: ${dadosTexto}.
  Considere: Price Action, Padrões de Candle, Suporte/Resistência e Tendência.
  Se houver uma oportunidade clara (mesmo sem sinal de seta), defina oportunidadeUnica como true.
  Responda APENAS em JSON: 
  {"oportunidadeUnica": boolean, "direcao": "CALL" ou "PUT", "motivo": "Explicação técnica curta"}`;
  
  try {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
    const data = await res.json();
    const cleanText = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '');
    return JSON.parse(cleanText);
  } catch (e) {
    return { oportunidadeUnica: false, motivo: "Análise Técnica Padrão" };
  }
}

async function enviarTelegram(token, chat, msg) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chat}&text=${encodeURIComponent(msg)}&parse_mode=Markdown`);
}
