import { VercelRequest, VercelResponse } from '@vercel/node';

// Memória global para travar reincidências e spam (NC 92-01)
let sinaisEnviados: Record<string, string> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CONFIGURAÇÃO DE IDENTIFICAÇÃO - VERSÃO 93
  const versao = "93";
  const dataRevisao = "16/02/2026";
  const horaRevisao = "22:30"; 
  
  const token = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id = "7625668696";

  const optionsTime = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false } as const;
  const agora = new Date();
  const horaAtualHHMM = agora.toLocaleTimeString('pt-BR', optionsTime);
  const diaSemana = agora.getDay();
  const horaMinutoInt = parseInt(horaAtualHHMM.replace(':', ''));

  // ITEM 6: GESTÃO DE HORÁRIOS FOREX (Rigoroso)
  const statusEUR = (diaSemana >= 1 && diaSemana <= 4) || 
                    (diaSemana === 5 && horaMinutoInt <= 1900) || 
                    (diaSemana === 0 && horaMinutoInt >= 1901) ? "ABERTO" : "FECHADO";

  // REDUNDÂNCIA TRIPLA (AÇÃO PARA NC 89-01 / 89-02)
  async function getCandles(symbol: string) {
    const apis = [
      { name: 'Binance', url: `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=15m&limit=100` },
      { name: 'Bybit', url: `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=15&limit=100` },
      { name: 'Kucoin', url: `https://api.kucoin.com/api/v1/market/candles?symbol=${symbol.replace('USDT', '-USDT')}&type=15min` }
    ];

    for (const api of apis) {
      try {
        const response = await fetch(api.url, { signal: AbortSignal.timeout(3000) });
        if (!response.ok) continue;
        const data = await response.json();
        
        // Normalização de dados para consistência entre exchanges (NC 91-02)
        if (api.name === 'Binance') return data;
        if (api.name === 'Bybit') return data.result.list.map((v: any) => [v[0], v[1], v[2], v[3], v[4]]);
        if (api.name === 'Kucoin') return data.data;
      } catch (e) { console.warn(`${api.name} offline. Tentando próxima...`); }
    }
    return null;
  }

  try {
    const ativos = [
      { symbol: "BTCUSDT", label: "Bitcoin", prec: 2, operando: true },
      { symbol: "EURUSDT", label: "EURUSD", prec: 5, operando: statusEUR === "ABERTO" }
    ];

    for (const ativo of ativos) {
      if (!ativo.operando) continue;

      const candles = await getCandles(ativo.symbol);
      if (!candles || !Array.isArray(candles)) continue;

      // Sincronização e Ordenação (NC 91-01)
      const dados = candles.map((v: any) => ({
        t: Number(v[0]),
        c: parseFloat(v[4]),
        h: parseFloat(v[2]),
        l: parseFloat(v[3])
      })).sort((a, b) => a.t - b.t);

      const i = dados.length - 1;
      const precoAtual = dados[i].c;
      
      // Ajuste de timestamp para garantir o padrão HH:MM da Bullex (NC 91-02)
      const tempoVela = new Date(dados[i].t).toLocaleTimeString('pt-BR', optionsTime);

      // LÓGICA RT_ROBO_SCALPER_V3 (Item 5)
      const ema = (p: number) => {
        const k = 2 / (p + 1);
        let e = dados[0].c;
        for (let j = 1; j < dados.length; j++) e = (dados[j].c * k) + (e * (1 - k));
        return e;
      };

      const m9 = ema(9), m21 = ema(21);
      let g = 0, l = 0;
      for (let j = i - 14; j < i; j++) {
        const d = dados[j+1].c - dados[j].c;
        d >= 0 ? g += d : l += Math.abs(d);
      }
      const rsi = 100 - (100 / (1 + (g / (l || 1))));

      const call = m9 > m21 && rsi > 50;
      const put = m9 < m21 && rsi < 50;

      // TRAVA DE SEGURANÇA CONTRA REPETIÇÕES (NC 92-01)
      if ((call || put) && sinaisEnviados[ativo.label] !== tempoVela) {
        sinaisEnviados[ativo.label] = tempoVela;
        
        const resis = Math.max(...dados.slice(i-20).map(d => d.h));
        const sup = Math.min(...dados.slice(i-20).map(d => d.l));

        const msg71 = `${call ? "🟢" : "🔴"} <b>SINAL EMITIDO!</b>\n` +
                      `<b>ATIVO:</b> ${ativo.label}\n` +
                      `<b>SINAL:</b> ${call ? '↑ COMPRAR' : '↓ VENDER'}\n` +
                      `<b>VELA:</b> ${tempoVela}\n` +
                      `<b>PREÇO:</b> $ ${precoAtual.toFixed(ativo.prec)}\n` +
                      `<b>TP:</b> $ ${call ? resis.toFixed(ativo.prec) : sup.toFixed(ativo.prec)}\n` +
                      `<b>SL:</b> $ ${call ? sup.toFixed(ativo.prec) : resis.toFixed(ativo.prec)}`;

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id, text: msg71, parse_mode: 'HTML' })
        });
      }

      // MONITORAMENTO DE REVERSÃO (Item 7.2)
      if (sinaisEnviados[ativo.label] === tempoVela) {
        if ((call && m9 < m21) || (put && m9 > m21)) {
          const msg72 = `⚠️ <b>AVISO DE REVERSÃO</b>\n\n` +
                        `<b>STATUS:</b> <b>TAKE PROFIT!</b>\n` +
                        `<b>ATIVO:</b> ${ativo.label}\n` +
                        `<b>VELA ANTERIOR:</b> ${tempoVela}\n` +
                        `<b>VELA ATUAL:</b> ${horaAtualHHMM}\n` +
                        `<b>PREÇO ATUAL:</b> $ ${precoAtual.toFixed(ativo.prec)}`;

          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id, text: msg72, parse_mode: 'HTML' })
          });
          delete sinaisEnviados[ativo.label];
        }
      }
    }
  } catch (e) { console.error("Erro no Ciclo Versão 93"); }

  // INTERFACE HTML (Item 4 - Regra de Ouro)
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`
    <html><body style="font-family:sans-serif;padding:40px;line-height:1.5;">
      <div>_________________________________________________________________</div>
      <p><b>RICARDO SENTINELA BOT</b></p>
      <p>&nbsp;</p>
      <p><b>STATUS:</b> <span style="color:green;font-weight:bold;">ATIVADO</span></p>
      <p>&nbsp;</p>
      <p><b>VERSÃO ATUAL:</b> ${versao}</p>
      <p><b>DATA DA REVISÃO:</b> ${dataRevisao}</p>
      <p><b>HORA DA REVISÃO:</b> ${horaRevisao}</p>
      <p><b>MERCADO EURUSD:</b> <b>${statusEUR}</b></p>
      <div>_________________________________________________________________</div>
      <script>setTimeout(() => location.reload(), 30000);</script>
    </body></html>
  `);
}
