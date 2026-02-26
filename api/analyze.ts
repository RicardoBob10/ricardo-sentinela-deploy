import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>TESTE</title></head>
    <body>
      <p style="color: green; font-size: 28px; font-weight: bold;">✅ SERVIDOR OK!</p>
      <p>Se vês isto, Vercel funciona.</p>
      <p>Problema é as APIs externas.</p>
    </body>
    </html>
  `);
}
