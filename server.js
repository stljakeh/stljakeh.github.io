import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use('/Sports', express.static(path.join(__dirname, 'Sports')));

const rootAssets = ['index.html', 'favicon.ico', 'favicon.svg', 'apple-touch-icon.png'];
for (const file of rootAssets) {
  app.get('/' + file, (_req, res) => {
    res.sendFile(path.join(__dirname, file));
  });
}

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});
