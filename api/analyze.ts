import { VercelRequest, VercelResponse } from '@vercel/node';

// =============================================================================
// TRAVA ANTI-DUPLICIDADE — NC 92-01 [R1 CORRIGIDO]
// =============================================================================
const cacheSinais: Record<string, number> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {

  // ===========================================================================
  // CONFIGURAÇÃO DE IDENTIFICAÇÃO — VERSÃO 115
  // ===========================================================================
  const versao      = "116";
  const dataRevisao = "21/02/2026";
  const horaRevisao = "16:58";

  const token         = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id       = "7625668696";
  const twelveDataKey = "e36e4f3a97124f5c9e2b1d3f5a7c9e1b";

  const agoraUnix = Date.now();
  const optionsBR = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false } as const;
  const horaBR    = new Date(agoraUnix).toLocaleTimeString('pt-BR', optionsBR);

  // ===========================================================================
  // FETCHER BTC — KuCoin (principal) + Bybit (fallback)
  // Aumentado para 250 candles para suportar EMA200
  // KuCoin retorna volume em v[5] — usado na 6ª confluência
  // ===========================================================================
  async function getBTC(): Promise<any[] | null> {
    try {
      // startAt: 500 candles de 15min atrás = 500 * 900s = 450.000s
      const endAt   = Math.floor(Date.now() / 1000);
      const startAt = endAt - 500 * 900;
      const r = await fetch(`https://api.kucoin.com/api/v1/market/candles?symbol=BTC-USDT&type=15min&startAt=${startAt}&endAt=${endAt}`, { signal: AbortSignal.timeout(4000) });
      const d = await r.json();
      if (d?.data && Array.isArray(d.data) && d.data.length > 0) {
        return d.data
          .map((v: any) => ({
            t: Number(v[0]) * 1000,
            o: parseFloat(v[1]),
            c: parseFloat(v[2]),
            h: parseFloat(v[3]),
            l: parseFloat(v[4]),
            v: parseFloat(v[5]),  // volume — obrigatório para 6ª confluência
          }))
          .sort((a: any, b: any) => a.t - b.t);
      }
    } catch (_) {}
    try {
      const r = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=15&limit=500`, { signal: AbortSignal.timeout(4000) });
      const d = await r.json();
      if (d?.result?.list && Array.isArray(d.result.list)) {
        return d.result.list
          .map((v: any) => ({
            t: Number(v[0]),
            o: parseFloat(v[1]),
            h: parseFloat(v[2]),
            l: parseFloat(v[3]),
            c: parseFloat(v[4]),
            v: parseFloat(v[5]),
          }))
          .sort((a: any, b: any) => a.t - b.t);
      }
    } catch (_) {}
    return null;
  }

  // ===========================================================================
  // FETCHER EUR/USD — TwelveData (principal) + Yahoo Finance (fallback)
  // ===========================================================================
  async function getEURUSD(): Promise<any[] | null> {
    try {
      const r = await fetch(`https://api.twelvedata.com/time_series?symbol=EUR/USD&interval=15min&outputsize=500&apikey=${twelveDataKey}`, { signal: AbortSignal.timeout(4000) });
      const d = await r.json();
      if (d?.values && Array.isArray(d.values) && d.values.length > 0) {
        return d.values
          .map((v: any) => { const ts = new Date(v.datetime + 'Z').getTime(); return { t: isNaN(ts) ? new Date(v.datetime).getTime() : ts, c: parseFloat(v.close), h: parseFloat(v.high), l: parseFloat(v.low), o: parseFloat(v.open), v: 0 }; })
          .filter((v: any) => !isNaN(v.t))
          .sort((a: any, b: any) => a.t - b.t);
      }
    } catch (_) {}
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?interval=15m&range=60d`, { signal: AbortSignal.timeout(4000) });
      const d = await r.json();
      const chart = d?.chart?.result?.[0];
      if (chart) {
        return chart.timestamp
          .map((t: number, i: number) => ({ t: t * 1000, c: chart.indicators.quote[0].close[i], h: chart.indicators.quote[0].high[i], l: chart.indicators.quote[0].low[i], o: chart.indicators.quote[0].open[i], v: 0 }))
          .filter((v: any) => v.c != null && !isNaN(v.c))
          .sort((a: any, b: any) => a.t - b.t);
      }
    } catch (_) {}
    return null;
  }

  // ===========================================================================
  // FETCHER YAHOO FOREX — Yahoo (principal) + TwelveData (fallback)
  // range=5d para ter mais candles e suportar EMA200
  // ===========================================================================
  async function getYahooForex(yahooSymbol: string, tdSymbol: string): Promise<any[] | null> {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=15m&range=60d`, { signal: AbortSignal.timeout(4000) });
      const d = await r.json();
      const chart = d?.chart?.result?.[0];
      if (chart && chart.timestamp && chart.indicators?.quote?.[0]) {
        return chart.timestamp
          .map((t: number, i: number) => { const q = chart.indicators.quote[0]; return { t: t * 1000, c: q.close?.[i], h: q.high?.[i], l: q.low?.[i], o: q.open?.[i], v: 0 }; })
          .filter((v: any) => v.c != null && !isNaN(v.c) && !isNaN(v.t))
          .sort((a: any, b: any) => a.t - b.t);
      }
    } catch (_) {}
    try {
      const r = await fetch(`https://api.twelvedata.com/time_series?symbol=${tdSymbol}&interval=15min&outputsize=500&apikey=${twelveDataKey}`, { signal: AbortSignal.timeout(4000) });
      const d = await r.json();
      if (d?.values && Array.isArray(d.values) && d.values.length > 0) {
        return d.values
          .map((v: any) => { const ts = new Date(v.datetime + 'Z').getTime(); return { t: isNaN(ts) ? new Date(v.datetime).getTime() : ts, c: parseFloat(v.close), h: parseFloat(v.high), l: parseFloat(v.low), o: parseFloat(v.open), v: 0 }; })
          .filter((v: any) => !isNaN(v.t))
          .sort((a: any, b: any) => a.t - b.t);
      }
    } catch (_) {}
    return null;
  }

  // ===========================================================================
  // SÉTIMA CONFLUÊNCIA — FILTRO DE NOTÍCIAS (ForexFactory Calendar)
  // Bloqueia 45min antes e 30min após eventos de alto impacto.
  // Se API falhar: assume sem notícia → concede 5 pontos.
  //
  // Moedas monitoradas por par:
  //   Bitcoin  → USD
  //   EURUSD   → EUR, USD
  //   USDJPY   → USD, JPY
  //   GBPUSD   → GBP, USD
  //   AUDUSD   → AUD, USD
  //   USDCAD   → USD, CAD
  //   USDCHF   → USD, CHF
  // ===========================================================================
  const MOEDAS_POR_ATIVO: Record<string, string[]> = {
    'Bitcoin' : ['USD'],
    'EURUSD'  : ['EUR', 'USD'],
    'USDJPY'  : ['USD', 'JPY'],
    'GBPUSD'  : ['GBP', 'USD'],
    'AUDUSD'  : ['AUD', 'USD'],
    'USDCAD'  : ['USD', 'CAD'],
    'USDCHF'  : ['USD', 'CHF'],
  };

  // Finnhub: busca notícias das últimas 2h para a moeda do ativo
  // Bloqueia 45min antes e 30min depois de eventos de alto impacto
  // Se API falhar → assume sem notícia → concede 5 pontos
  const FINNHUB_KEY = 'd6cv5e1r01qgk7mjtr4gd6cv5e1r01qgk7mjtr50';

  async function temNoticiaAltoImpacto(labelAtivo: string): Promise<boolean> {
    const moedas = MOEDAS_POR_ATIVO[labelAtivo] || [];
    if (moedas.length === 0) return false;

    try {
      const agora     = Math.floor(agoraUnix / 1000);
      const de        = agora - 3 * 3600; // últimas 3 horas
      const ate       = agora + 3 * 3600; // próximas 3 horas

      const r = await fetch(
        `https://finnhub.io/api/v1/calendar/economic?from=${new Date(de*1000).toISOString().slice(0,10)}&to=${new Date(ate*1000).toISOString().slice(0,10)}&token=${FINNHUB_KEY}`,
        { signal: AbortSignal.timeout(3000) }
      );
      const d = await r.json();
      const eventos = d?.economicCalendar || [];

      for (const evento of eventos) {
        if (evento.impact !== 'high') continue;

        const moedaEvento = (evento.currency || '').toUpperCase();
        if (!moedas.includes(moedaEvento)) continue;

        const tsEvento = new Date(evento.time || evento.date).getTime();
        if (isNaN(tsEvento)) continue;

        const diffMin = (agoraUnix - tsEvento) / 60000;
        // Bloqueia 45min antes e 30min depois
        if (diffMin > -45 && diffMin < 30) return true;
      }
    } catch (_) {
      return false; // API indisponível → sem bloqueio
    }
    return false;
  }

  // ===========================================================================
  // CONTROLE DE MERCADO FOREX — Item 10 ♦ (REGRA DE OURO)
  // ===========================================================================
  function mercadoForexAberto(): boolean {
    const diaSem = new Date(agoraUnix).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long' });
    const hStr   = new Date(agoraUnix).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
    const [hh, mm] = hStr.split(':').map(Number);
    const minutos  = hh * 60 + mm;
    const dia      = diaSem.toLowerCase();
    if (dia.includes('segunda') || dia.includes('terça') || dia.includes('quarta') || dia.includes('quinta')) return true;
    if (dia.includes('sexta'))   return minutos <= 19 * 60;
    if (dia.includes('domingo')) return minutos >= 19 * 60 + 1;
    return false;
  }

  // ===========================================================================
  // INDICADORES TÉCNICOS
  // ===========================================================================

  // EMA genérica (9, 21 ou 200)
  function calcEMA(dados: any[], periodo: number, ate: number): number {
    const k = 2 / (periodo + 1);
    let ema = dados[0].c;
    for (let j = 1; j <= ate; j++) ema = dados[j].c * k + ema * (1 - k);
    return ema;
  }

  // RSI 14
  function calcRSI(dados: any[], ate: number, periodo: number = 14): number {
    let ganhos = 0, perdas = 0;
    const inicio = ate - periodo;
    if (inicio < 1) return 50;
    for (let j = inicio + 1; j <= ate; j++) {
      const delta = dados[j].c - dados[j - 1].c;
      if (delta > 0) ganhos += delta; else perdas += Math.abs(delta);
    }
    const mediaG = ganhos / periodo;
    const mediaP = perdas / periodo;
    if (mediaP === 0) return 100;
    return 100 - 100 / (1 + mediaG / mediaP);
  }

  // ATR 14
  function calcATR(dados: any[], ate: number, periodo: number = 14): number {
    let trSoma = 0;
    for (let j = ate - periodo + 1; j <= ate; j++) {
      if (j < 1) continue;
      trSoma += Math.max(dados[j].h - dados[j].l, Math.abs(dados[j].h - dados[j-1].c), Math.abs(dados[j].l - dados[j-1].c));
    }
    return trSoma / periodo;
  }

  // Média de volume das últimas N velas
  function calcMediaVolume(dados: any[], ate: number, periodo: number = 20): number {
    let soma = 0;
    for (let j = ate - periodo + 1; j <= ate; j++) {
      if (j < 0) continue;
      soma += (dados[j].v || 0);
    }
    return soma / periodo;
  }

  // ===========================================================================
  // SELEÇÃO DA VELA FECHADA — NC 91-01 / 95-01 [R2 CORRIGIDO]
  // ===========================================================================
  function selecionarVelaFechada(dados: any[]): { vela: any; idx: number } | null {
    const quinzeMin = 15 * 60 * 1000;
    for (let i = dados.length - 1; i >= 1; i--) {
      const vela    = dados[i];
      const minVela = new Date(vela.t).getMinutes();
      const diffSeg = (agoraUnix - (vela.t + quinzeMin)) / 1000;
      if (minVela % 15 !== 0) continue;
      if (diffSeg < -5) continue;
      if (diffSeg > 40) return null;
      return { vela, idx: i };
    }
    return null;
  }

  // ===========================================================================
  // NORMALIZAÇÃO DO ID DE VELA — NC 92-01 [R1 CORRIGIDO]
  // ===========================================================================
  function normalizarIdVela(label: string, ts: number): string {
    const quinzeMin  = 15 * 60 * 1000;
    const janelaNorm = Math.floor(ts / quinzeMin) * quinzeMin;
    return `${label}_${janelaNorm}`;
  }

  // ===========================================================================
  // SISTEMA DE SCORE — 7 CONFLUÊNCIAS
  //
  // Critério                  | Pontos
  // --------------------------|-------
  // 1. Tendência EMA200       |  25
  // 2. Cruzamento EMA9/21     |  15
  // 3. RSI forte (≥55 / ≤45) |  15
  // 4. Distância EMAs forte   |  15
  // 5. Rompimento válido      |  15
  // 6. Volume forte (cripto)  |  10
  // 7. Sem notícia alto impac.|   5
  // Total possível            | 100
  //
  // REGRA: score >= 75 → emite sinal
  // ===========================================================================
  function calcularScore(params: {
    tendenciaAlinhada : boolean;
    cruzamento        : boolean;
    rsiFavoravel      : boolean;
    mercadoForte      : boolean;
    rompimento        : boolean;
    volumeForte       : boolean; // ignorado para Forex (sempre true)
    semNoticia        : boolean;
  }): number {
    let score = 0;
    if (params.tendenciaAlinhada) score += 25;
    if (params.cruzamento)        score += 15;
    if (params.rsiFavoravel)      score += 15;
    if (params.mercadoForte)      score += 15;
    if (params.rompimento)        score += 15;
    if (params.volumeForte)       score += 10;
    if (params.semNoticia)        score +=  5;
    return score;
  }

  // ===========================================================================
  // PROCESSAMENTO PRINCIPAL — V115: 7 CONFLUÊNCIAS + SCORE
  // ===========================================================================
  const logAtivos: string[] = [];

  const ativos = [
    { label: "Bitcoin", data: await getBTC(),                                    prec: 2, isForex: false },
    { label: "EURUSD",  data: await getEURUSD(),                                 prec: 5, isForex: true  },
    { label: "USDJPY",  data: await getYahooForex("USDJPY=X", "USD/JPY"),       prec: 5, isForex: true  },
    { label: "GBPUSD",  data: await getYahooForex("GBPUSD=X", "GBP/USD"),       prec: 5, isForex: true  },
    { label: "AUDUSD",  data: await getYahooForex("AUDUSD=X", "AUD/USD"),       prec: 5, isForex: true  },
    { label: "USDCAD",  data: await getYahooForex("USDCAD=X", "USD/CAD"),       prec: 5, isForex: true  },
    { label: "USDCHF",  data: await getYahooForex("USDCHF=X", "USD/CHF"),       prec: 5, isForex: true  },
  ];

  for (const ativo of ativos) {

    // -----------------------------------------------------------------------
    // PRÉ-VALIDAÇÕES
    // -----------------------------------------------------------------------
    if (!ativo.data || ativo.data.length < 30) {
      logAtivos.push(`[${ativo.label}] ⚠️ Dados insuficientes (${ativo.data?.length || 0} velas).`);
      continue;
    }
    if (ativo.isForex && !mercadoForexAberto()) {
      logAtivos.push(`[${ativo.label}] 🔒 Mercado FOREX FECHADO.`);
      continue;
    }

    const resultado = selecionarVelaFechada(ativo.data);
    if (!resultado) { logAtivos.push(`[${ativo.label}] ⏳ Fora da janela de disparo (40s).`); continue; }

    const { vela, idx: i } = resultado;
    const dataVela = new Date(vela.t);
    if (isNaN(dataVela.getTime())) { logAtivos.push(`[${ativo.label}] ❌ Timestamp inválido.`); continue; }

    const tempoVelaStr = dataVela.toLocaleTimeString('pt-BR', optionsBR);

    // Índice mínimo para EMA200 (precisa de ao menos 200 velas antes)
    if (i < 200) {
      logAtivos.push(`[${ativo.label}] ⚠️ Dados insuficientes para EMA200 (idx ${i}).`);
      continue;
    }

    // -----------------------------------------------------------------------
    // CÁLCULO DOS INDICADORES
    // -----------------------------------------------------------------------
    const ema9Atual  = calcEMA(ativo.data, 9,   i);
    const ema21Atual = calcEMA(ativo.data, 21,  i);
    const ema9Prev   = calcEMA(ativo.data, 9,   i - 1);
    const ema21Prev  = calcEMA(ativo.data, 21,  i - 1);
    const ema200     = calcEMA(ativo.data, 200, i);
    const rsi        = calcRSI(ativo.data, i, 14);
    const atr        = calcATR(ativo.data, i, 14);

    // -----------------------------------------------------------------------
    // 1ª CONFLUÊNCIA — DIREÇÃO DO SINAL (cruzamento EMA9/21)
    // -----------------------------------------------------------------------
    const cruzouAcima  = (ema9Prev <= ema21Prev) && (ema9Atual > ema21Atual);
    const cruzouAbaixo = (ema9Prev >= ema21Prev) && (ema9Atual < ema21Atual);
    const call = cruzouAcima;
    const put  = cruzouAbaixo;

    if (!call && !put) {
      logAtivos.push(`[${ativo.label}] — Sem cruzamento em ${tempoVelaStr} | EMA9:${ema9Atual.toFixed(ativo.prec)} EMA21:${ema21Atual.toFixed(ativo.prec)} RSI:${rsi.toFixed(1)}`);
      continue;
    }

    // -----------------------------------------------------------------------
    // 2ª CONFLUÊNCIA — TENDÊNCIA ALINHADA (EMA200)
    // Preço encostado na EMA200 (dentro de 1x ATR) → zona de indecisão → bloqueia
    // -----------------------------------------------------------------------
    const tendenciaAlta  = vela.c > ema200;
    const tendenciaBaixa = vela.c < ema200;
    const encostadoEMA200 = Math.abs(vela.c - ema200) < atr;

    if (encostadoEMA200) {
      logAtivos.push(`[${ativo.label}] 🚫 Preço encostado na EMA200 — zona de indecisão.`);
      continue;
    }
    if (call && !tendenciaAlta) {
      logAtivos.push(`[${ativo.label}] 🚫 COMPRA bloqueada: preço abaixo da EMA200.`);
      continue;
    }
    if (put && !tendenciaBaixa) {
      logAtivos.push(`[${ativo.label}] 🚫 VENDA bloqueada: preço acima da EMA200.`);
      continue;
    }

    // -----------------------------------------------------------------------
    // 3ª CONFLUÊNCIA — RSI FORTE (zona neutra 45–55 bloqueada)
    // -----------------------------------------------------------------------
    const rsiFavoravel = call ? (rsi >= 55) : (rsi <= 45);
    const rsiNeutro    = rsi > 45 && rsi < 55;

    if (rsiNeutro) {
      logAtivos.push(`[${ativo.label}] 🚫 RSI neutro (${rsi.toFixed(1)}) — zona 45–55 bloqueada.`);
      continue;
    }

    // -----------------------------------------------------------------------
    // 4ª CONFLUÊNCIA — FORÇA REAL (distância entre EMAs)
    // -----------------------------------------------------------------------
    const distanciaEMAs = Math.abs(ema9Atual - ema21Atual);
    const mercadoForte  = distanciaEMAs > (atr * 0.35);

    if (!mercadoForte) {
      logAtivos.push(`[${ativo.label}] 🚫 Mercado lateral — distância EMAs insuficiente (${distanciaEMAs.toFixed(ativo.prec)} ≤ ATR*0.35=${(atr*0.35).toFixed(ativo.prec)}).`);
      continue;
    }

    // -----------------------------------------------------------------------
    // 5ª CONFLUÊNCIA — LOCALIZAÇÃO ESTRATÉGICA (rompimento)
    // Analisa as 15 velas anteriores à vela atual
    // -----------------------------------------------------------------------
    const slice15 = ativo.data.slice(Math.max(0, i - 15), i);
    const maiorTopo  = Math.max(...slice15.map((v: any) => v.h));
    const menorFundo = Math.min(...slice15.map((v: any) => v.l));
    const rompeuTopo  = call ? (vela.c > maiorTopo)  : false;
    const rompeuFundo = put  ? (vela.c < menorFundo) : false;
    const rompimento  = rompeuTopo || rompeuFundo;

    // -----------------------------------------------------------------------
    // 6ª CONFLUÊNCIA — VOLUME (apenas Bitcoin; Forex ignora)
    // -----------------------------------------------------------------------
    let volumeForte = true; // Forex: sempre passa
    if (!ativo.isForex) {
      const volumeAtual  = vela.v || 0;
      const mediaVolume  = calcMediaVolume(ativo.data, i, 20);
      volumeForte = mediaVolume > 0 && volumeAtual > mediaVolume;
    }

    // -----------------------------------------------------------------------
    // 7ª CONFLUÊNCIA — NOTÍCIAS ALTO IMPACTO
    // -----------------------------------------------------------------------
    const temNoticia = await temNoticiaAltoImpacto(ativo.label);
    const semNoticia = !temNoticia;

    // -----------------------------------------------------------------------
    // SISTEMA DE SCORE
    // -----------------------------------------------------------------------
    const score = calcularScore({
      tendenciaAlinhada : (call && tendenciaAlta) || (put && tendenciaBaixa),
      cruzamento        : call || put,
      rsiFavoravel,
      mercadoForte,
      rompimento,
      volumeForte,
      semNoticia,
    });

    const scoreLog = `Score:${score}/100 | T:${(call && tendenciaAlta)||( put && tendenciaBaixa)?'✅':'❌'} C:${(call||put)?'✅':'❌'} R:${rsiFavoravel?'✅':'❌'} F:${mercadoForte?'✅':'❌'} L:${rompimento?'✅':'❌'} V:${volumeForte?'✅':'❌'} N:${semNoticia?'✅':'❌'}`;

    if (score < 75) {
      logAtivos.push(`[${ativo.label}] ⚠️ Score insuficiente (${score}/100) em ${tempoVelaStr} — sinal ignorado. ${scoreLog}`);
      continue;
    }

    // -----------------------------------------------------------------------
    // ANTI-DUPLICIDADE
    // -----------------------------------------------------------------------
    const sinalId = normalizarIdVela(ativo.label, vela.t);
    if (cacheSinais[sinalId]) {
      logAtivos.push(`[${ativo.label}] 🔁 Vela ${tempoVelaStr} já processada.`);
      continue;
    }
    cacheSinais[sinalId] = agoraUnix;

    // -----------------------------------------------------------------------
    // TP e SL via ATR
    // -----------------------------------------------------------------------
    const tp = call ? vela.c + atr * 1.5 : vela.c - atr * 1.5;
    const sl = call ? vela.c - atr * 2.0 : vela.c + atr * 2.0;

    const msg =
      `${call ? "🟢" : "🔴"} <b>SINAL EMITIDO!</b>\n` +
      `<b>ATIVO:</b> ${ativo.label}\n` +
      `<b>SINAL:</b> ${call ? "↑ COMPRAR" : "↓ VENDER"}\n` +
      `<b>VELA:</b> ${tempoVelaStr}\n` +
      `<b>PREÇO:</b> $ ${vela.c.toFixed(ativo.prec)}`;

    // callback_data V116: exec_ATIVO_TIPO_PRECO (TP/SL calculado pelo sentinela via stake)
    try {
      const tgRes  = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id,
          text: msg,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              {
                text: '◯ EXECUTAR',
                callback_data: `exec_${ativo.label}_${call ? 'C' : 'V'}_${vela.c.toFixed(ativo.prec)}`
              }
            ]]
          }
        }),
      });
      const tgData = await tgRes.json();
      if (!tgData.ok) {
        logAtivos.push(`[${ativo.label}] ❌ Telegram erro: ${JSON.stringify(tgData)}`);
      } else {
        logAtivos.push(`[${ativo.label}] ✅ ${call ? "COMPRAR" : "VENDER"} enviado — vela ${tempoVelaStr} | ${scoreLog}`);
      }
    } catch (errTg: any) {
      logAtivos.push(`[${ativo.label}] ❌ Falha Telegram: ${errTg?.message}`);
    }
  }

  // ===========================================================================
  // INTERFACE HTML — Item 8 ♦ (REGRA DE OURO — NÃO ALTERAR)
  // ===========================================================================
  const statusForex = mercadoForexAberto() ? "ABERTO" : "FECHADO";
  const logHtml     = logAtivos.map(l => `<p>${l}</p>`).join('\n');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>RICARDO SENTINELA BOT</title>
      <style>
        body      { background-color: #ffffff; color: #000000; font-family: sans-serif; padding: 40px; line-height: 1.5; }
        p         { margin: 10px 0; font-size: 16px; }
        b         { font-weight: bold; }
        .verde    { color: #008000; font-weight: bold; }
        .vermelho { color: #cc0000; font-weight: bold; }
        .log      { margin-top: 20px; font-size: 13px; color: #444; font-family: monospace; }
      </style>
    </head>
    <body>
      <div>_________________________________________________________________</div>
      <p><b>RICARDO SENTINELA BOT</b></p>
      <p>&nbsp;</p>
      <p><b>STATUS:</b> <span class="verde">ATIVADO</span></p>
      <p>&nbsp;</p>
      <p><b>VERSÃO ATUAL:</b> ${versao}</p>
      <p><b>DATA DA REVISÃO:</b> ${dataRevisao}</p>
      <p><b>HORA DA REVISÃO:</b> ${horaRevisao}</p>
      <p>&nbsp;</p>
      <p><b>HORA ATUAL (BRT):</b> ${horaBR}</p>
      <p><b>MERCADO FOREX:</b> <span class="${statusForex === 'ABERTO' ? 'verde' : 'vermelho'}">${statusForex}</span></p>
      <p><b>ATIVOS MONITORADOS:</b> Bitcoin, EURUSD, USDJPY, GBPUSD, AUDUSD, USDCAD, USDCHF (7 ativos)</p>
      <p><b>LÓGICA:</b> 7 Confluências | Score mínimo: 75/100</p>
      <div>__________________________________________________________________</div>
      <div class="log">
        <p><b>LOG DA ÚLTIMA EXECUÇÃO:</b></p>
        ${logHtml || '<p>Nenhum evento registrado.</p>'}
      </div>
      <script>setTimeout(() => location.reload(), 30000);</script>
    </body>
    </html>
  `);
}
