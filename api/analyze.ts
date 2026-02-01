import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { TG_TOKEN, TG_CHAT_ID, GEMINI_API_KEY } = process.env;

  try {
    const agoraUTC = new Date();
    const agoraBR = new Date(agoraUTC.getTime() - (3 * 60 * 60 * 1000));
    
    const diaSemana = agoraBR.getDay();
    const minutoAtual = agoraBR.getMinutes();
    const horaAtual = agoraBR.getHours();

    // TRAVA DE SEGURANÇA: Só manda sinal se estiver nos primeiros 9 minutos da vela M15
    const minutoNoCiclo = minutoAtual % 15;
    if (minutoNoCiclo > 9) {
      return res.status(200).json({ status: "Fora da janela de entrada (limite 9 min)" });
    }

    const inicioM15 = Math.floor(minutoAtual / 15) * 15;
    const fimM15 = inicioM15 + 15;
    let horaFim = horaAtual;
    let minFim = fimM15;
    if (minFim === 60) { minFim = 0; horaFim = (horaAtual + 1) % 24; }
    
    const cicloVela = `${String(horaAtual).padStart(2, '0')}:${String(inicioM15).padStart(2, '0')} -> ${String(horaFim).padStart(2, '0')}:${String(minFim).padStart(2, '0')}`;

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
        o: parseFloat(d[1]), h: parseFloat(d[2]), l: parseFloat(d[3]), c: parseFloat(d[4])
      })).reverse();

      const sinalScriptAcima = candles[0].l < candles[1].l;
      const sinalScriptAbaixo = candles[0].h > candles[1].h;
      const analiseIA = await consultarIA(ativo.nome, candles, GEMINI_API_KEY);

      if (sinalScriptAcima || sinalScriptAbaixo || analiseIA.oportunidadeUnica) {
        let direcao = (sinalScriptAcima || analiseIA.direcao === "CALL") ? "🟢 ACIMA" : "🔴 ABAIXO";
        let notaExtra = (!sinalScriptAcima && !sinalScriptAbaixo) ? "\n⚠️ *Nota: Entrada técnica da IA (fora do script).*" : "";

        const msg = `🚨 **SINAL CONFIRMADO: ${direcao}**\n\n` +
                    `🪙 **ATIVO:** ${ativo.nome}\n` +
                    `⏰ **VELA (M15):** ${cicloVela}\n` + 
                    `📊 **MOTIVO:** ${analiseIA.motivo}\n` +
                    `${notaExtra}\n\n` +
                    `🚀 **ENTRAR AGORA NA OPTNEX!**`;

        await enviarTelegram(TG_TOKEN, TG_CHAT_ID, msg);
      }
    }

    return res.status(200).json({ status: "Monitorando dentro da janela" });
  } catch (e) {
    return res.status(200).json({ erro: e.message });
  }
}

async function consultarIA(ativo, candles, key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
  const dadosTexto = candles.slice(0, 10).map(c => `O:${c.o} H:${c.h} L:${c.l} C:${c.c}`).join(' | ');
  const prompt = `Trader Elite. Ativo ${ativo}. Candles M15: ${dadosTexto}. Se houver oportunidade clara, defina oportunidadeUnica como true. Responda JSON: {"oportunidadeUnica": boolean, "direcao": "CALL" ou "PUT", "motivo": "frase curta"}`;
  try {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
    const data = await res.json();
    const cleanText = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '');
    return JSON.parse(cleanText);
  } catch (e) {
    return { oportunidadeUnica: false, motivo: "Price Action OK" };
  }
}

async function enviarTelegram(token, chat, msg) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chat}&text=${encodeURIComponent(msg)}&parse_mode=Markdown`);
}
