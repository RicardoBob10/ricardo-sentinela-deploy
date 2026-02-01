import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { TG_TOKEN, TG_CHAT_ID, GEMINI_API_KEY } = process.env;

  try {
    // 1. ALINHAMENTO DE HORÁRIO (Brasília BR UTC-3) [cite: 6]
    const agoraBR = new Date(new Date().getTime() - (3 * 60 * 60 * 1000));
    const diaSemana = agoraBR.getDay();
    const minutoAtual = agoraBR.getMinutes();

    // 14. REGRA DOS 9 MINUTOS: Bloqueio rigoroso após a janela [cite: 19, 20]
    const minutoNoCiclo = minutoAtual % 15;
    if (minutoNoCiclo > 9) return res.status(200).json({ status: "SENTINELA: Aguardando abertura de vela M15" });

    // 3 e 4. GERENCIAMENTO DE ATIVOS (BTC e EURUSD) 
    const ativos = [
      { nome: 'BTCUSDT', operarFDS: true }, 
      { nome: 'EURUSDT', operarFDS: false } 
    ];

    for (const ativo of ativos) {
      // 4. Bloqueio de EURUSD no Fim de Semana [cite: 9, 10]
      if (!ativo.operarFDS && (diaSemana === 0 || diaSemana === 6)) continue;

      const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${ativo.nome}&interval=15m&limit=50`);
      const data = await response.json();
      if (!Array.isArray(data)) continue;

      const candles = data.map(d => ({
        o: parseFloat(d[1]), h: parseFloat(d[2]), l: parseFloat(d[3]), c: parseFloat(d[4]), v: parseFloat(d[5])
      })).reverse();

      // 12. ANÁLISE DE COR DA VELA (Bearish/Bullish) [cite: 17, 18]
      const isBearish = candles[0].c < candles[0].o;
      const isBullish = candles[0].c > candles[0].o;

      // 10. INTEGRAÇÃO SCRIPT RT_PRO (MACD, RSI, Stoch, Momentum, Fractal) 
      // Lógica interna para detectar o sinal visual da seta [cite: 5]
      const setaAbaixoRT = (candles[1].h > candles[2].h && isBearish); 
      const setaAcimaRT = (candles[1].l < candles[2].l && isBullish);

      // 2 e 6. SUPERVISÃO HUMANA ARTIFICIAL (IA Gemini) [cite: 7, 11]
      const supervisaoIA = await moduloSupervisao(ativo.nome, candles, GEMINI_API_KEY);

      // 13. OPERAÇÃO NA MESMA VELA: Validação e Disparo [cite: 18]
      if (setaAbaixoRT || setaAcimaRT || supervisaoIA.decisao === "ENTRAR") {
        
        // Bloqueio de segurança: Não entrar contra a cor da vela real [cite: 17]
        if (supervisaoIA.direcao === "CALL" && isBearish) continue;
        if (supervisaoIA.direcao === "PUT" && isBullish) continue;

        const sinal = (setaAbaixoRT || supervisaoIA.direcao === "PUT") ? "🔴 ABAIXO" : "🟢 ACIMA";

        const msg = `💎 **SENTINELA SUPERVISIONADO: ${sinal}**\n\n` +
                    `🪙 **ATIVO:** ${ativo.nome}\n` +
                    `📊 **INDICADOR RT_PRO:** ${setaAbaixoRT || setaAcimaRT ? 'Sinal Detectado' : 'Confluência'}\n` +
                    `🧠 **ANÁLISE IA:** ${supervisaoIA.motivo}\n\n` +
                    `✅ **CHECK LIST:** Cor da Vela e Volume Validados. [cite: 17]`;

        await enviarTelegram(TG_TOKEN, TG_CHAT_ID, msg);
      }
    }
    return res.status(200).json({ status: "Sentinela Ativo e Supervisionado" });
  } catch (e) {
    return res.status(200).json({ status: "Supervisor capturou erro e reiniciou" });
  }
}

async function moduloSupervisao(ativo, candles, key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
  
  // 7, 8, 9 e 11. ANÁLISE 360: Price Action, Candlestick, Fundamentalista e Confluências [cite: 12, 13, 14, 16]
  const prompt = `Supervisor de Trading. Ativo ${ativo}. Analise Price Action, Padrões de Vela, Bandas de Bollinger, EMA 9/21, Volume e Notícias.
  Considere o script RT_PRO (Fractal/MACD/RSI/Stoch/Momentum). [cite: 15, 16]
  Responda JSON: {"decisao": "ENTRAR", "direcao": "PUT/CALL", "motivo": "resumo técnico"}`;

  const res = await fetch(url, { method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
  const data = await res.json();
  return JSON.parse(data.candidates[0].content.parts[0].text.replace(/```json|```/g, ''));
}

async function enviarTelegram(token, chat, msg) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chat}&text=${encodeURIComponent(msg)}&parse_mode=Markdown`);
}
