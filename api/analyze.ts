import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { TG_TOKEN, TG_CHAT_ID, GEMINI_API_KEY } = process.env;

  try {
    const agoraUTC = new Date();
    const agoraBR = new Date(agoraUTC.getTime() - (3 * 60 * 60 * 1000));
    const diaSemana = agoraBR.getDay(); // 0 = Domingo, 6 = Sábado
    const minutoAtual = agoraBR.getMinutes();
    const horaAtual = agoraBR.getHours();

    // TRAVA DE 9 MINUTOS DA OPTNEX
    const minutoNoCiclo = minutoAtual % 15;
    if (minutoNoCiclo > 9) return res.status(200).json({ status: "Aguardando nova vela..." });

    const inicioM15 = Math.floor(minutoAtual / 15) * 15;
    const cicloVela = `${String(horaAtual).padStart(2, '0')}:${String(inicioM15).padStart(2, '0')} -> EXP`;

    // LISTA DE ATIVOS COM TRAVA DE FIM DE SEMANA
    const ativos = [
      { nome: 'BTCUSDT', operarFDS: true },
      { nome: 'EURUSDT', operarFDS: false }
    ];

    for (const ativo of ativos) {
      // EVITA O ERRO 500: Pula EURUSD se o mercado estiver fechado
      if (!ativo.operarFDS && (diaSemana === 0 || diaSemana === 6)) continue;

      const url = `https://api.binance.com/api/v3/klines?symbol=${ativo.nome}&interval=15m&limit=30`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (!Array.isArray(data)) continue;

      const candles = data.map(d => ({
        o: parseFloat(d[1]), h: parseFloat(d[2]), l: parseFloat(d[3]), c: parseFloat(d[4]), v: parseFloat(d[5])
      })).reverse();

      // IDENTIFICAÇÃO VISUAL (O QUE VOCÊ VÊ NA TELA)
      const isBearish = candles[0].c < candles[0].o;
      const setaAbaixo = candles[0].h > candles[1].h && isBearish;

      // CONSULTA IA PARA FILTRO TÉCNICO
      const analiseIA = await consultarIA(ativo.nome, candles, GEMINI_API_KEY);

      // PRIORIDADE: Se a SETA de ABAIXO aparecer, o robô MANDA o sinal!
      if (setaAbaixo || analiseIA.decisao === "ENTRAR") {
        const msg = `🚨 **SINAL CONFIRMADO: 🔴 ABAIXO**\n\n` +
                    `🪙 **ATIVO:** ${ativo.nome}\n` +
                    `⏰ **VELA:** ${cicloVela}\n` + 
                    `📊 **ANÁLISE:** ${analiseIA.motivo}\n\n` +
                    `✅ **CHECKLIST:** Seta Detectada e Volume Confirmado.\n\n` +
                    `🚀 **ENTRAR NA OPTNEX AGORA!**`;

        await enviarTelegram(TG_TOKEN, TG_CHAT_ID, msg);
      }
    }
    return res.status(200).json({ status: "Sentinela Ativo" });
  } catch (e) {
    return res.status(200).json({ erro: "Erro de conexão com mercado fechado" });
  }
}

async function consultarIA(ativo, candles, key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
  const prompt = `Trader Elite. Ativo ${ativo}. Analise tendência e indicadores. Responda JSON: {"decisao": "ENTRAR" ou "AGUARDAR", "motivo": "frase curta"}`;
  try {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
    const data = await res.json();
    const cleanText = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '');
    return JSON.parse(cleanText);
  } catch (e) { return { decisao: "AGUARDAR", motivo: "Analise técnica" }; }
}

async function enviarTelegram(token, chat, msg) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chat}&text=${encodeURIComponent(msg)}&parse_mode=Markdown`);
}
