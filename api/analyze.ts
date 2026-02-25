import { VercelRequest, VercelResponse } from '@vercel/node';

// =============================================================================
// TRAVA ANTI-DUPLICIDADE — CORRIGIDA [V119 R00]
// =============================================================================
const cacheSinais: Record<string, number> = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {

  // ===========================================================================
  // CONFIGURAÇÃO DE IDENTIFICAÇÃO — VERSÃO 122 (16 ATIVOS + BOLLINGER)
  // ===========================================================================
  const versao      = "122";
  const dataRevisao = "25/02/2026";
  const horaRevisao = "11:00";

  const token         = "8223429851:AAFl_QtX_Ot9KOiuw1VUEEDBC_32VKLdRkA";
  const chat_id       = "7625668696";
  const twelveDataKey = "e36e4f3a97124f5c9e2b1d3f5a7c9e1b";

  const agoraUnix = Date.now();
  const optionsBR = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false } as const;
  const horaBR    = new Date(agoraUnix).toLocaleTimeString('pt-BR', optionsBR);

  // ===========================================================================
  // FETCHER BTC — KuCoin (principal) + Bybit (fallback)
  // ===========================================================================
  async function getBTC(): Promise<any[] | null> {
    try {
      const endAt   = Math.floor(Date.now() / 1000);
      const startAt = endAt - 500 * 900;
      const r = await fetch(`https://api.kucoin.com/api/v1/market/candles?symbol=BTC-USDT&type=5min&startAt=${startAt}&endAt=${endAt}`, { signal: AbortSignal.timeout(4000) });
      const d = await r.json();
      if (d?.data && Array.isArray(d.data) && d.data.length > 0) {
        return d.data
          .map((v: any) => ({
            t: Number(v[0]) * 1000,
            o: parseFloat(v[1]),
            c: parseFloat(v[2]),
            h: parseFloat(v[3]),
            l: parseFloat(v[4]),
            v: parseFloat(v[5]),
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
      const r = await fetch(`https://api.twelvedata.com/time_series?symbol=EUR/USD&interval=5min&outputsize=500&apikey=${twelveDataKey}`, { signal: AbortSignal.timeout(4000) });
      const d = await r.json();
      if (d?.values && Array.isArray(d.values) && d.values.length > 0) {
        return d.values
          .map((v: any) => { const ts = new Date(v.datetime + 'Z').getTime(); return { t: isNaN(ts) ? new Date(v.datetime).getTime() : ts, c: parseFloat(v.close), h: parseFloat(v.high), l: parseFloat(v.low), o: parseFloat(v.open), v: 0 }; })
          .filter((v: any) => !isNaN(v.t))
          .sort((a: any, b: any) => a.t - b.t);
      }
    } catch (_) {}
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?interval=5m&range=60d`, { signal: AbortSignal.timeout(4000) });
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
  // FETCHER ETH — KuCoin (principal) + Bybit (fallback) [V121 NOVO]
  // ===========================================================================
  async function getETH(): Promise<any[] | null> {
    try {
      const endAt   = Math.floor(Date.now() / 1000);
      const startAt = endAt - 500 * 900;
      const r = await fetch(`https://api.kucoin.com/api/v1/market/candles?symbol=ETH-USDT&type=5min&startAt=${startAt}&endAt=${endAt}`, { signal: AbortSignal.timeout(4000) });
      const d = await r.json();
      if (d?.data && Array.isArray(d.data) && d.data.length > 0) {
        return d.data
          .map((v: any) => ({
            t: Number(v[0]) * 1000,
            o: parseFloat(v[1]),
            c: parseFloat(v[2]),
            h: parseFloat(v[3]),
            l: parseFloat(v[4]),
            v: parseFloat(v[5]),
          }))
          .sort((a: any, b: any) => a.t - b.t);
      }
    } catch (_) {}
    try {
      const r = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=ETHUSDT&interval=15&limit=500`, { signal: AbortSignal.timeout(4000) });
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
  // FETCHER GENÉRICO FOREX — TwelveData (principal) + Yahoo (fallback)
  // ===========================================================================
  async function getYahooForex(yahooSymbol: string, tdSymbol: string): Promise<any[] | null> {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=5m&range=60d`, { signal: AbortSignal.timeout(4000) });
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
      const r = await fetch(`https://api.twelvedata.com/time_series?symbol=${tdSymbol}&interval=5min&outputsize=500&apikey=${twelveDataKey}`, { signal: AbortSignal.timeout(4000) });
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

  const MOEDAS_POR_ATIVO: Record<string, string[]> = {
    // V122: 16 ATIVOS COM MOEDAS PARA NOTÍCIAS
    'Bitcoin'    : ['USD'],
    'Ethereum'   : ['USD'],
    'EUR/USD'    : ['EUR', 'USD'],
    'USD/JPY'    : ['USD', 'JPY'],
    'GBP/USD'    : ['GBP', 'USD'],
    'AUD/USD'    : ['AUD', 'USD'],
    'USD/CAD'    : ['USD', 'CAD'],
    'USD/CHF'    : ['USD', 'CHF'],
    'AUD/JPY'    : ['AUD', 'JPY'],
    'EUR/AUD'    : ['EUR', 'AUD'],
    'EUR/CAD'    : ['EUR', 'CAD'],
    'EUR/CHF'    : ['EUR', 'CHF'],
    'EUR/GBP'    : ['EUR', 'GBP'],
    'EUR/JPY'    : ['EUR', 'JPY'],
    'GBP/AUD'    : ['GBP', 'AUD'],
    'GBP/JPY'    : ['GBP', 'JPY'],
  };

  const FINNHUB_KEY = 'd6cv5e1r01qgk7mjtr4gd6cv5e1r01qgk7mjtr50';

  async function temNoticiaAltoImpacto(labelAtivo: string): Promise<boolean> {
    const moedas = MOEDAS_POR_ATIVO[labelAtivo] || [];
    if (moedas.length === 0) return false;
    try {
      const agora     = Math.floor(agoraUnix / 1000);
      const de        = agora - 3 * 3600;
      const ate       = agora + 3 * 3600;
      const r = await fetch(`https://finnhub.io/api/v1/calendar/economic?from=${new Date(de*1000).toISOString().slice(0,10)}&to=${new Date(ate*1000).toISOString().slice(0,10)}&token=${FINNHUB_KEY}`, { signal: AbortSignal.timeout(3000) });
      const d = await r.json();
      const eventos = d?.economicCalendar || [];
      for (const evento of eventos) {
        if (evento.impact !== 'high') continue;
        const moedaEvento = (evento.currency || '').toUpperCase();
        if (!moedas.includes(moedaEvento)) continue;
        const tsEvento = new Date(evento.time || evento.date).getTime();
        if (isNaN(tsEvento)) continue;
        const diffMin = (agoraUnix - tsEvento) / 60000;
        if (diffMin > -45 && diffMin < 30) return true;
      }
    } catch (_) { return false; }
    return false;
  }

  function mercadoForexAberto(): boolean {
    const diaSem = new Date(agoraUnix).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long' });
    const hStr   = new Date(agoraUnix).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
    const [hh, mm] = hStr.split(':').map(Number);
    const minutos  = hh * 60 + mm;
    const dia      = diaSem.toLowerCase();
    
    // V121: Novos horários FOREX
    // Segunda-feira → 00:00 às 23:59
    // Terça-feira → 00:00 às 23:59
    // Quarta-feira → 00:00 às 23:59
    // Quinta-feira → 00:00 às 23:59
    // Sexta-feira → 00:00 às 17:00
    // Domingo → 21:00 às 00:00
    // Fechado: Sexta (17:01-23:59), Sábado (todo dia), Domingo (00:00-20:59)
    
    if (dia.includes('segunda') || dia.includes('terça') || dia.includes('quarta') || dia.includes('quinta')) return true;
    if (dia.includes('sexta'))   return minutos <= 17 * 60;  // Até 17:00 (nova mudança)
    if (dia.includes('domingo')) return minutos >= 21 * 60;  // A partir de 21:00 (nova mudança)
    return false;  // Sábado sempre fechado
  }

  function calcEMA(dados: any[], periodo: number, ate: number): number {
    const k = 2 / (periodo + 1);
    let ema = dados[0].c;
    for (let j = 1; j <= ate; j++) ema = dados[j].c * k + ema * (1 - k);
    return ema;
  }

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

  function calcATR(dados: any[], ate: number, periodo: number = 14): number {
    let trSoma = 0;
    for (let j = ate - periodo + 1; j <= ate; j++) {
      if (j < 1) continue;
      trSoma += Math.max(dados[j].h - dados[j].l, Math.abs(dados[j].h - dados[j-1].c), Math.abs(dados[j].l - dados[j-1].c));
    }
    return trSoma / periodo;
  }

  function calcMediaVolume(dados: any[], ate: number, periodo: number = 20): number {
    let soma = 0;
    for (let j = ate - periodo + 1; j <= ate; j++) {
      if (j < 0) continue;
      soma += (dados[j].v || 0);
    }
    return soma / periodo;
  }

  // =============================================================================
  // CALCULAR BOLLINGER BANDS (V122)
  // =============================================================================
  // Parâmetros: período=20, desvios=2
  function calcBollingerBands(dados: any[], ate: number) {
    const periodo = 20;
    const desvios = 2;
    const inicio = Math.max(0, ate - periodo + 1);
    const slice = dados.slice(inicio, ate + 1);

    if (slice.length === 0) {
      return { sup: 0, mid: 0, inf: 0 };
    }

    const media = slice.reduce((sum: number, v: any) => sum + parseFloat(v.c), 0) / slice.length;
    const variancia = slice.reduce((sum: number, v: any) => {
      const diff = parseFloat(v.c) - media;
      return sum + diff * diff;
    }, 0) / slice.length;
    const desvPad = Math.sqrt(variancia);

    return {
      sup: parseFloat((media + desvios * desvPad).toFixed(5)),
      mid: parseFloat(media.toFixed(5)),
      inf: parseFloat((media - desvios * desvPad).toFixed(5)),
    };
  }

  // =============================================================================
  // MAPEAMENTO DE PREFIXOS (V122 - 16 ATIVOS)
  // =============================================================================
  const PREFIXO_ID_POR_ATIVO: Record<string, string> = {
    'Bitcoin'    : 'BTC',
    'Ethereum'   : 'ETH',
    'EUR/USD'    : 'EU',
    'USD/JPY'    : 'UJ',
    'GBP/USD'    : 'GU',
    'AUD/USD'    : 'AU',
    'USD/CAD'    : 'UC',
    'USD/CHF'    : 'UF',
    'AUD/JPY'    : 'AJ',
    'EUR/AUD'    : 'EA',
    'EUR/CAD'    : 'EC',
    'EUR/CHF'    : 'EF',
    'EUR/GBP'    : 'EG',
    'EUR/JPY'    : 'EJ',
    'GBP/AUD'    : 'GA',
    'GBP/JPY'    : 'GJ',
  };

  function selecionarVelaFechada(dados: any[]): { vela: any; idx: number } | null {
    const cincoMin = 5 * 60 * 1000;  // V122: M5 (5 minutos)
    for (let i = dados.length - 1; i >= 1; i--) {
      const vela    = dados[i];
      const minVela = new Date(vela.t).getMinutes();
      const diffSeg = (agoraUnix - (vela.t + cincoMin)) / 1000;
      if (minVela % 5 !== 0) continue;  // V122: % 5 em vez de % 15
      if (diffSeg < -5) continue;
      if (diffSeg > 180) return null;  // V122: 180s (3 min) em vez de 40s
      return { vela, idx: i };
    }
    return null;
  }

  // =============================================================================
  // GERAR ID ÚNICO (V122 - TIMESTAMP UTC-3 + MINUTOS)
  // =============================================================================
  function gerarIdUnico(prefixo: string): string {
    const agora = new Date(agoraUnix);
    const dia = String(agora.getDate()).padStart(2, '0');
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const hora = String(agora.getHours()).padStart(2, '0');
    const min = String(agora.getMinutes()).padStart(2, '0');
    return `${prefixo}${dia}${mes}${hora}${min}`;
  }

  // =============================================================================
  // CORREÇÃO V119: normalizarIdVela — sem window.innerWidth (V122: M5)
  // =============================================================================
  function normalizarIdVela(label: string, ts: number): string {
    const cincoMin = 5 * 60 * 1000;  // V122: M5
    const janelaNorm = Math.floor(ts / cincoMin) * cincoMin;
    return `${label}_${janelaNorm}`;
  }

  function calcularScore(params: {
    cruzamento        : boolean;
    rsiFavoravel      : boolean;
    mercadoForte      : boolean;
    rompimento        : boolean;
    volumeForte       : boolean;
    semNoticia        : boolean;
  }): number {
    let score = 0;
    // Redistribuição de pesos sem EMA200 (Total 100)
    if (params.cruzamento)   score += 30;
    if (params.rsiFavoravel) score += 20;
    if (params.mercadoForte) score += 15;
    if (params.rompimento)   score += 15;
    if (params.volumeForte)  score += 10;
    if (params.semNoticia)   score += 10;
    return score;
  }

  const logAtivos: string[] = [];
  const ativos = [
    // CRIPTO (KuCoin principal, Bybit fallback)
    { label: "Bitcoin",   data: await getBTC(), prec: 2, isForex: false },
    { label: "Ethereum",  data: await getETH(), prec: 4, isForex: false },
    
    // FOREX GRUPO 1 - EUR BASE (TwelveData + Yahoo)
    { label: "EUR/USD",   data: await getEURUSD(), prec: 5, isForex: true },
    { label: "EUR/JPY",   data: await getYahooForex("EURJPY=X", "EUR/JPY"), prec: 3, isForex: true },
    { label: "EUR/AUD",   data: await getYahooForex("EURAUD=X", "EUR/AUD"), prec: 5, isForex: true },
    { label: "EUR/CAD",   data: await getYahooForex("EURCAD=X", "EUR/CAD"), prec: 5, isForex: true },
    { label: "EUR/CHF",   data: await getYahooForex("EURCHF=X", "EUR/CHF"), prec: 5, isForex: true },
    { label: "EUR/GBP",   data: await getYahooForex("EURGBP=X", "EUR/GBP"), prec: 5, isForex: true },
    
    // FOREX GRUPO 2 - USD BASE (Yahoo + TwelveData)
    { label: "USD/JPY",   data: await getYahooForex("USDJPY=X", "USD/JPY"), prec: 3, isForex: true },
    { label: "USD/CAD",   data: await getYahooForex("USDCAD=X", "USD/CAD"), prec: 5, isForex: true },
    { label: "USD/CHF",   data: await getYahooForex("USDCHF=X", "USD/CHF"), prec: 5, isForex: true },
    
    // FOREX GRUPO 3 - GBP BASE (Yahoo)
    { label: "GBP/USD",   data: await getYahooForex("GBPUSD=X", "GBP/USD"), prec: 5, isForex: true },
    { label: "GBP/JPY",   data: await getYahooForex("GBPJPY=X", "GBP/JPY"), prec: 3, isForex: true },
    { label: "GBP/AUD",   data: await getYahooForex("GBPAUD=X", "GBP/AUD"), prec: 5, isForex: true },
    
    // FOREX GRUPO 4 - AUD BASE (Yahoo)
    { label: "AUD/USD",   data: await getYahooForex("AUDUSD=X", "AUD/USD"), prec: 5, isForex: true },
    { label: "AUD/JPY",   data: await getYahooForex("AUDJPY=X", "AUD/JPY"), prec: 3, isForex: true },
  ];

  for (const ativo of ativos) {
    if (!ativo.data || ativo.data.length < 30) {
      logAtivos.push(`[${ativo.label}] ⚠️ Dados insuficientes.`);
      continue;
    }
    if (ativo.isForex && !mercadoForexAberto()) {
      logAtivos.push(`[${ativo.label}] 🔒 Mercado FOREX FECHADO.`);
      continue;
    }

    const resultado = selecionarVelaFechada(ativo.data);
    if (!resultado) { logAtivos.push(`[${ativo.label}] ⏳ Fora da janela de disparo.`); continue; }

    const { vela, idx: i } = resultado;
    const tempoVelaStr = new Date(vela.t).toLocaleTimeString('pt-BR', optionsBR);

    const ema9Atual  = calcEMA(ativo.data, 9,   i);
    const ema21Atual = calcEMA(ativo.data, 21,  i);
    const ema9Prev   = calcEMA(ativo.data, 9,   i - 1);
    const ema21Prev  = calcEMA(ativo.data, 21,  i - 1);
    const rsi        = calcRSI(ativo.data, i, 14);
    const atr        = calcATR(ativo.data, i, 14);
    
    // V122: BOLLINGER BANDS (20, 2)
    const bb         = calcBollingerBands(ativo.data, i);

    const cruzouAcima  = (ema9Prev <= ema21Prev) && (ema9Atual > ema21Atual);
    const cruzouAbaixo = (ema9Prev >= ema21Prev) && (ema9Atual < ema21Atual);
    const call = cruzouAcima;
    const put  = cruzouAbaixo;

    if (!call && !put) {
      logAtivos.push(`[${ativo.label}] — Sem cruzamento em ${tempoVelaStr}`);
      continue;
    }

    const rsiFavoravel = call ? (rsi >= 55) : (rsi <= 45);
    const distanciaEMAs = Math.abs(ema9Atual - ema21Atual);
    const mercadoForte  = distanciaEMAs > (atr * 0.35);

    const slice15 = ativo.data.slice(Math.max(0, i - 15), i);

    // =============================================================================
    // CORREÇÃO V119: Rompimento valida close (não apenas high/low)
    // =============================================================================
    const maiorTopo   = Math.max(...slice15.map((v: any) => v.h));
    const menorFundo  = Math.min(...slice15.map((v: any) => v.l));
    const rompeuTopo  = call ? (vela.c > maiorTopo && vela.c >= vela.o) : false;
    const rompeuFundo = put  ? (vela.c < menorFundo && vela.c <= vela.o) : false;
    const rompimento  = rompeuTopo || rompeuFundo;

    let volumeForte = true;
    if (!ativo.isForex) {
      const volumeAtual = vela.v || 0;
      const mediaVolume = calcMediaVolume(ativo.data, i, 20);
      volumeForte = mediaVolume > 0 && volumeAtual > mediaVolume;
    }

    const temNoticia = await temNoticiaAltoImpacto(ativo.label);
    const semNoticia = !temNoticia;

    const score = calcularScore({
      cruzamento: call || put,
      rsiFavoravel,
      mercadoForte,
      rompimento,
      volumeForte,
      semNoticia,
    });

    const scoreLog = `Score:${score}/100 | C:✅ R:${rsiFavoravel?'✅':'❌'} F:${mercadoForte?'✅':'❌'} L:${rompimento?'✅':'❌'} V:${volumeForte?'✅':'❌'} N:${semNoticia?'✅':'❌'}`;

    if (score < 75) {
      logAtivos.push(`[${ativo.label}] ⚠️ Score insuficiente (${score}/100) em ${tempoVelaStr}. ${scoreLog}`);
      continue;
    }

    const sinalId = normalizarIdVela(ativo.label, vela.t);
    if (cacheSinais[sinalId]) {
      logAtivos.push(`[${ativo.label}] 🔄 Sinal duplicado bloqueado em ${tempoVelaStr}`);
      continue;
    }
    cacheSinais[sinalId] = agoraUnix;

    // ← V119 NOVO: Gerar ID com rastreabilidade completa
    const prefixo = PREFIXO_ID_POR_ATIVO[ativo.label];
    const idRastreabilidade = gerarIdUnico(prefixo);

    // ← V122: Mensagem com ID e Bollinger
    const msg = `${call ? "🟢" : "🔴"} <b>SINAL EMITIDO!</b>\n<b>ID:</b> ${idRastreabilidade}\n<b>ATIVO:</b> ${ativo.label}\n<b>SINAL:</b> ${call ? "↑ COMPRAR" : "↓ VENDER"}\n<b>PREÇO:</b> $ ${vela.c.toFixed(ativo.prec)}`;

    try {
      // V122: callback_data com 8 partes: exec_ATIVO_TIPO_PRECO_ATR_BBSUP_BBMID_BBINF_ID
      const callbackData = `exec_${ativo.label}_${call ? 'C' : 'V'}_${vela.c.toFixed(ativo.prec)}_${atr.toFixed(ativo.prec)}_${bb.sup.toFixed(ativo.prec)}_${bb.mid.toFixed(ativo.prec)}_${bb.inf.toFixed(ativo.prec)}_${idRastreabilidade}`;
      
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id,
          text: msg,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '◯ EXECUTAR', callback_data: callbackData }]]
          }
        }),
      });
      logAtivos.push(`[${ativo.label}] ✅ Enviado — ${scoreLog}`);
    } catch (e) {
      logAtivos.push(`[${ativo.label}] ❌ Falha ao enviar — ${scoreLog}`);
    }
  }

  const statusForex = mercadoForexAberto() ? "ABERTO" : "FECHADO";
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head><meta charset="UTF-8"><title>RICARDO SENTINELA BOT</title><style>body{background-color:#ffffff;color:#000000;font-family:sans-serif;padding:40px;line-height:1.5;}p{margin:10px 0;font-size:16px;}.verde{color:#008000;font-weight:bold;}.vermelho{color:#cc0000;font-weight:bold;}.log{margin-top:20px;font-size:13px;color:#444;font-family:monospace;max-height:600px;overflow-y:auto;border:1px solid #ddd;padding:10px;}.config{background:#f5f5f5;border-left:4px solid #008000;padding:10px;margin:10px 0;}</style></head>
    <body>
      <p><b>RICARDO SENTINELA BOT</b></p>
      <p><b>STATUS:</b> <span class="verde">ATIVADO</span></p>
      <p><b>VERSÃO ATUAL:</b> ${versao}</p>
      <p><b>DATA DA REVISÃO:</b> ${dataRevisao}</p>
      <p><b>HORA DA REVISÃO:</b> ${horaRevisao}</p>
      <p><b>HORA ATUAL (BRT):</b> ${horaBR}</p>
      <p><b>MERCADO FOREX:</b> <span class="${statusForex === 'ABERTO' ? 'verde' : 'vermelho'}">${statusForex}</span></p>
      
      <div class="config">
        <p><b>⚙️ CONFIGURAÇÃO:</b></p>
        <p>TIMEFRAME: <b>M5</b> (5 minutos)</p>
        <p>ATIVOS MONITORADOS: <b>16</b> (Bitcoin, Ethereum, 14 Forex)</p>
        <p>BOLLINGER BANDS: <b>(20, 2)</b></p>
        <p>JANELA DE DISPARO: <b>180 segundos</b> (3 minutos)</p>
        <p>SCORE MÍNIMO: <b>70/100</b></p>
        <p>ROMPIMENTO: <b>10 velas</b> (50 minutos)</p>
      </div>
      
      <div class="log"><p><b>LOG DA ÚLTIMA EXECUÇÃO:</b></p>${logAtivos.map(l => `<p>${l}</p>`).join('') || '<p>Aguardando sinais...</p>'}</div>
      <script>setTimeout(() => location.reload(), 30000);</script>
    </body>
    </html>
  `);
}
