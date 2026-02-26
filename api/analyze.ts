import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const agora = new Date().toLocaleTimeString('pt-BR');
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>TESTE</title>
      <style>
        body { background: #fff; color: #000; font-family: Arial; padding: 40px; }
        .ok { color: #00aa00; font-weight: bold; font-size: 32px; }
      </style>
    </head>
    <body>
      <p class="ok">✅ SERVIDOR OK!</p>
      <p>Hora: ${agora}</p>
      <p>Se vês isto, Vercel funciona.</p>
      <p>Problema é as APIs externas.</p>
    </body>
    </html>
  `);
}
