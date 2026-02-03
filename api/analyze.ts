import { VercelRequest, VercelResponse } from '@vercel/node';

// Esta variável impede sinais duplicados no mesmo minuto
let lastProcessedTime = 0;

export default async function handler(req: any, res: any) {
  const { TG_TOKEN, TG_CHAT_ID } = process.env;

  try {
    const response = await fetch(`https://api.kucoin.com/api/v1/market/candles?symbol=BTC-USDT&type=1min`);
    const result = await response.json();
    
    // Organiza as velas (mais antiga para a mais recente)
    const candles = result.data.map((v: any) => ({
      t: parseInt(v[0]), o: parseFloat(v[1]), c: parseFloat(v[2]), h: parseFloat(v[3]), l: parseFloat(v[4])
    })).reverse().slice(-40);

    const lastCandle = candles[candles.length - 1];

    // Se já processamos este minuto, encerra aqui
    if (lastCandle.t <= lastProcessedTime) {
      return res.status(200).json({ status: "Aguardando nova vela..." });
    }

    const getEMA = (data: any[], p: number) => {
      const k = 2 / (p + 1);
      let val = data[0].c;
      for (let i = 1; i < data.length; i++) val = data[i].c * k + val * (1 - k);
      return val;
    };

    const ema9 = getEMA(candles, 9);
    const ema21 = getEMA(candles, 21);

    // Lógica Fractal (Vela index-2 é o pico/fundo)
    const c = candles;
    const i = c.length - 1;
    const f_topo = c[i-2].h > c[i-4].h && c[i-2].h > c[i-3].h && c[i-2].h > c[i-1].h && c[i-2].h > c[i].h;
    const f_fundo = c[i-2].l < c[i-4].l && c[i-2].l < c[i-3].l && c[i-2].l < c[i-1].l && c[i-2].l < c[i].l;

    let sinalAtivo = "";
    // Só envia sinal se a cor da vela coincidir com a direção (Filtro Optnex)
    if (f_topo && ema9 < ema21 && lastCandle.c < lastCandle.o) sinalAtivo = "🔴 ABAIXO";
    if (f_fundo && ema9 > ema21 && lastCandle.c > lastCandle.o) sinalAtivo = "🟢 ACIMA";

    if (sinalAtivo) {
      lastProcessedTime = lastCandle.t; // Marca como processado

      // Cálculo da Expiração M15 (Próxima barreira: :00, :15, :30, :45)
      const dataVela = new Date(lastCandle.t * 1000);
      const minutes = dataVela.getMinutes();
      const nextM15 = Math.ceil((minutes + 1) / 15) * 15;
      
      const dataExp = new Date(dataVela);
      dataExp.setMinutes(nextM15);
      dataExp.setSeconds(0);
      
      const horaExp = dataExp.toLocaleTimeString('pt-BR', { 
        timeZone: 'America/Sao_Paulo', 
        hour: '2-digit', 
        minute: '2-digit' 
      });

      const mensagem = `**SINAL CONFIRMADO**\n**ATIVO**: BTCUSD\n**SINAL**: ${sinalAtivo}\n**VELA**: ${horaExp}`;

      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TG_CHAT_ID, text: mensagem, parse_mode: 'Markdown' })
      });
    }

    return res.status(200).json({ status: "Monitorando", last_candle: lastCandle.t });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno" });
  }
}
