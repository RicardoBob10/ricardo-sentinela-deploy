import express from 'express';
import handler from './api/analyze';

const app = express();
const PORT = process.env.PORT || 8080;

app.all('/', (req: any, res: any) => {
  handler(req, res);
});

app.all('/api/analyze', (req: any, res: any) => {
  handler(req, res);
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
