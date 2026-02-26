import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const agora = new Date().toLocaleTimeString('pt-BR');
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head><meta charset="UTF-8"><title>TESTE</title></head>
    <body>
      <p style="color: green; font-size: 32px; font-weight: bold;">✅ SERVIDOR OK!</p>
      <p>Hora: ${agora}</p>
      <p>Se vês isto, Vercel funciona. Problema é APIs.</p>
    </body>
    </html>
  `);
}
```

### 6. **Scroll até ao fim da página**

### 7. **Clica "Commit Changes"**

### 8. **Escreve mensagem:**
```
DEBUG: Handler minimalista
```

### 9. **Clica "Commit to main"**

### 10. **Espera 30-40 segundos** (Vercel a fazer deploy)

### 11. **Tenta aceder:**
```
https://ricardo-sentinela-deploy-lmgkg23e7.vercel.app
