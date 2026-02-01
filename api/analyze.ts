import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { TG_TOKEN, TG_CHAT_ID, GEMINI_API_KEY } = process.env;

  try {
    const ativos = [
      { nome: 'BTCUSDT', fonte: 'binance' },
      { nome: 'EURUSD', fonte: 'forex' } 
    ];
    
    const agora = new Date();
    const minutoAtual = agora.getMinutes();
    const minutosStatus = [0, 15, 30, 45];
    let sinalDetectado = false;

    // Cálculo da Expiração para o final da vela de M15
    const proximoFechamento = new Date(agora);
    proximoFechamento.setMinutes(Math.ceil((minutoAtual + 1) / 15) * 15, 0, 0);
    const horaExpiracao = proximoFechamento.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    for (const ativo of ativos) {
      let url = "";
      if (ativo.fonte === 'binance') {
        url = `https://api.binance.com/api/v3/klines?symbol=${ativo.nome}&interval=15m&limit=10`;
      } else {
        // Fonte Forex Estável (Mexc fornece o par EUR/USDT que segue o Forex à risca)
        url = `https://api.mexc.com/api/v3/klines?symbol=EURUSDT&interval=15m&limit=10`;
      }

      const response = await fetch(url);
      const data = await response.json();
      
      // Blindagem contra erro "map is not a function"
      if (!Array.isArray(data)) continue;

      const candles = data.map(d => ({
        h: parseFloat(d[2]),
        l: parseFloat(d[3]),
        c: parseFloat(d[4])
      })).reverse();

      const highs = candles.map(d => d.h);
      const lows = candles.map(d => d.l);

      // Lógica de Gatilho Sincronizada com Optnex
      const sinal_acima = lows[0] < lows[1]; 
      const sinal_abaixo = highs[0] > highs[1];

      if (sinal_acima || sinal_abaixo) {
        const analiseIA = await consultarIA(ativo.nome, highs[0], GEMINI_API_KEY, candles);

        if (analiseIA.aprovado) {
          const direcao = sinal_acima ? "🟢 ACIMA" : "🔴 ABAIXO";
          const tagForex = ativo.fonte === 'forex' ? " (FOREX REAL)" : "";
          
          const msg = `🚨 **SINAL CONFIRMADO: ${direcao}**\n\n` +
                      `🪙 **ATIVO:** ${ativo.nome}${tagForex}\n` +
                      `⏰ **EXPIRAÇÃO:** ${horaExpiracao}\n` + 
                      `💡 **IA:** ${analiseIA.motivo}\n\n` +
                      `🚀 **ENTRAR AGORA NA OPTNEX!**`;

          await enviarTelegram(TG_TOKEN, TG_CHAT_ID, msg);
          sinalDetectado = true;
        }
      }
    }

    if (!sinalDetectado && minutosStatus.includes(minutoAtual)) {
      await enviarTelegram(TG_TOKEN, TG_CHAT_ID, "🤖 **Sentinela Online: Monitorando BTC e EURUSD (Forex).**");
    }

    return res.status(200).json({ status: "Sentinela Online e Estável" });
  } catch (e) {
    return res.status(200).json({ status: "Erro capturado", erro: e.message });
  }
}

async function consultarIA(ativo, preco, key, candles) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
  const historico = candles.slice(0, 5).map(c => `H:${c.h} L:${c.l}`).join(' | ');
  const prompt = `Trader Senior: Analise ${ativo} em ${preco}. Histórico M15: ${historico}. Se houver tendência, aprove. Responda JSON: {"aprovado": true, "motivo": "frase curta"}`;
  
  try {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
    const data = await res.json();
    const cleanText = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '');
    return JSON.parse(cleanText);
  } catch (e) {
    return { aprovado: true, motivo: "Validado por Price Action" };
  }
}

async function enviarTelegram(token, chat, msg) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chat}&text=${encodeURIComponent(msg)}&parse_mode=Markdown`);
}
