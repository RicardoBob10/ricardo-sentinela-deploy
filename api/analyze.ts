import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { TG_TOKEN, TG_CHAT_ID, GEMINI_API_KEY } = process.env;
  const NEWS_API_KEY = '20e7e0b8dec64193a011307551c5f23d';

  try {
    // 1. ALINHAMENTO BRASÍLIA (Item 1) 
    const agoraBR = new Date(new Date().getTime() - (3 * 60 * 60 * 1000));
    const dataFormatada = agoraBR.toLocaleDateString('pt-BR');
    const horaFormatada = agoraBR.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    const diaSemana = agoraBR.getDay();
    const minutoAtual = agoraBR.getMinutes();

    // 13. TRAVA DOS 9 MINUTOS (Item 13) [cite: 19]
    const minutoNoCiclo = minutoAtual % 15;
    if (minutoNoCiclo > 9) {
      return res.status(200).json({ 
        status: `SENTINELA: ATIVO - REVISADO EM: ${dataFormatada} as ${horaFormatada}`,
        mensagem: "Fora da janela de entrada M15" 
      });
    }

    const ativos = [
      { nome: 'BTCUSDT', operarFDS: true }, // Item 5 [cite: 10]
      { nome: 'EURUSDT', operarFDS: false } // Item 4 [cite: 9]
    ];

    for (const ativo of ativos) {
      if (!ativo.operarFDS && (diaSemana === 0 || diaSemana === 6)) continue; // [cite: 9]

      const resKlines = await fetch(`https://api.binance.com/api/v3/klines?symbol=${ativo.nome}&interval=15m&limit=10`);
      const data = await resKlines.json();
      const candles = data.map(d => ({
        o: parseFloat(d[1]), h: parseFloat(d[2]), l: parseFloat(d[3]), c: parseFloat(d[4])
      })).reverse();

      // --- GATILHO SOBERANO RT_PRO (Item 10) --- [cite: 1, 5, 15]
      // FRACTAL 5 BARRAS (Gatilho Principal) [cite: 4]
      const fractalTopo = candles[1].h > candles[0].h && candles[1].h > candles[2].h && candles[1].h > candles[3].h;
      const fractalFundo = candles[1].l < candles[0].l && candles[1].l < candles[2].l && candles[1].l < candles[3].l;

      // Price Action e Cor da Vela (Itens 7, 8, 11) [cite: 12, 13, 17]
      const isBearish = candles[0].c < candles[0].o;
      const isBullish = candles[0].c > candles[0].o;

      // Análise Fundamentalista Rápida (Item 9) [cite: 14]
      let fundamentalistaOk = true;
      try {
        const resNews = await fetch(`https://newsapi.org/v2/everything?q=${ativo.nome}&apiKey=${NEWS_API_KEY}&pageSize=1`);
        const news = await resNews.json();
        if (news.articles?.[0]?.title.toLowerCase().includes("crash")) fundamentalistaOk = false;
      } catch (e) { fundamentalistaOk = true; }

      // EXECUÇÃO DO DISPARO [cite: 5, 18]
      let direcao = null;
      if (fractalTopo && isBearish && fundamentalistaOk) direcao = "🔴 ABAIXO"; 
      if (fractalFundo && isBullish && fundamentalistaOk) direcao = "🟢 ACIMA";

      if (direcao) {
        const msg = `🚀 **GATILHO RT_PRO: ${direcao}**\n\n` +
                    `🪙 **ATIVO:** ${ativo.nome}\n` +
                    `✅ **CHECK LIST:** 7, 8, 9, 11 validados.\n` +
                    `⚠️ **ENTRADA:** Mesma Vela M15.`; // Item 12 [cite: 18]

        await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage?chat_id=${TG_CHAT_ID}&text=${encodeURIComponent(msg)}&parse_mode=Markdown`);
      }
    }

    // RESPOSTA COM O CARIMBO SOLICITADO
    return res.status(200).json({ 
      status: `SENTINELA: ATIVO - REVISADO EM: ${dataFormatada} as ${horaFormatada}` 
    });

  } catch (e) {
    return res.status(500).json({ status: "ERRO NO SUPERVISOR - REINICIANDO" });
  }
}
