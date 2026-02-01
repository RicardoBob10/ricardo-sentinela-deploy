import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { TG_TOKEN, TG_CHAT_ID, GEMINI_API_KEY } = process.env;
  const NEWS_API_KEY = '20e7e0b8dec64193a011307551c5f23d';

  // 🛡️ CARIMBO FIXO DE REVISÃO (Muda apenas quando editamos o código)
  const STATUS_FIXO = "SENTINELA: ATIVO - REVISADO EM: 01/02/2026 as 13:10";

  try {
    const agoraBR = new Date(new Date().getTime() - (3 * 60 * 60 * 1000)); // 
    const diaSemana = agoraBR.getDay();
    const minutoAtual = agoraBR.getMinutes();

    // 14. JANELA DE 9 MINUTOS (Check List Item 14) [cite: 19]
    const minutoNoCiclo = minutoAtual % 15;
    if (minutoNoCiclo > 9) return res.status(200).json({ status: STATUS_FIXO, info: "Aguardando abertura de vela M15" });

    const ativos = [
      { nome: 'BTCUSDT', operarFDS: true }, // [cite: 10]
      { nome: 'EURUSDT', operarFDS: false } // [cite: 9]
    ];

    for (const ativo of ativos) {
      if (!ativo.operarFDS && (diaSemana === 0 || diaSemana === 6)) continue; // [cite: 9]

      try {
        const resKlines = await fetch(`https://api.binance.com/api/v3/klines?symbol=${ativo.nome}&interval=15m&limit=10`);
        const data = await resKlines.json();
        const candles = data.map(d => ({
          o: parseFloat(d[1]), h: parseFloat(d[2]), l: parseFloat(d[3]), c: parseFloat(d[4])
        })).reverse();

        // 12. COR DA VELA (Check List Item 12) [cite: 17]
        const isBearish = candles[0].c < candles[0].o;
        const isBullish = candles[0].c > candles[0].o;

        // 10. GATILHO RT_PRO: Fractal 5 barras (Item 10) 
        const fractalTopo = candles[1].h > candles[0].h && candles[1].h > candles[2].h && candles[1].h > candles[3].h && candles[1].h > candles[4].h;
        const fractalFundo = candles[1].l < candles[0].l && candles[1].l < candles[2].l && candles[1].l < candles[3].l && candles[1].l < candles[4].l;

        // 9. ANÁLISE FUNDAMENTALISTA (Item 9) [cite: 14]
        let newsOk = true;
        const resNews = await fetch(`https://newsapi.org/v2/everything?q=${ativo.nome}&apiKey=${NEWS_API_KEY}&pageSize=1`);
        const n = await resNews.json();
        if (n.articles?.[0]?.title.toLowerCase().includes("crash")) newsOk = false;

        // DISPARO SOBERANO RT_PRO [cite: 5]
        let sinal = null;
        if (fractalTopo && isBearish && newsOk) sinal = "🔴 ABAIXO";
        if (fractalFundo && isBullish && newsOk) sinal = "🟢 ACIMA";

        if (sinal) {
          const msg = `🚀 **GATILHO RT_PRO: ${sinal}**\n\n` +
                      `🪙 **ATIVO:** ${ativo.nome}\n` +
                      `📊 **CHECK LIST:** Seta e Cor Validados.\n` +
                      `⚠️ **ENTRADA:** Mesma Vela M15.`; // [cite: 18]
          await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage?chat_id=${TG_CHAT_ID}&text=${encodeURIComponent(msg)}&parse_mode=Markdown`);
        }
      } catch (e) { continue; }
    }
    return res.status(200).json({ status: STATUS_FIXO });
  } catch (e) {
    return res.status(200).json({ status: STATUS_FIXO, erro: "Supervisor em Alerta" });
  }
}
