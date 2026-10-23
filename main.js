import { Command } from 'commander';
import fs from 'fs';
import http from 'http';

const program = new Command();

program
  .name('weather-lab4')
  .description('HTTP-сервер: читання weather.json і повернення відфільтрованих записів')
  .requiredOption('-i, --input <path>', 'шлях до файлу даних')
  .requiredOption('-h, --host <address>', 'адреса сервера')
  .requiredOption('-p, --port <number>', 'порт сервера')
  .option('-o, --output <path>', 'файл, у який записується остання надіслана відповідь')
  .helpOption('--help', 'показати довідку');

program.parse(process.argv);
const options = program.opts();

const inputPath = options.input;
const host = options.host;
const portRaw = options.port;
const outputPath = options.output;

const port = Number(portRaw);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`Помилка: порт "${portRaw}" не є цілим числом у діапазоні 0-65535.`);
  process.exit(1);
}

fs.access(inputPath, fs.constants.R_OK, (err) => {
  if (err) {
    console.error('Cannot find input file');
    process.exit(1);
    return;
  }
  startServer();
});

function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);

  if (outputPath) {
    fs.writeFile(outputPath, body, 'utf8', (err) => {
      if (err) {
        console.error(`Не вдалося записати у "${outputPath}": ${err.message}`);
      }
    });
  }

  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function processData(rows, showHumidity, minRainfall) {
  const filtered =
    minRainfall === null
      ? rows
      : rows.filter((row) => {
          const r = toNumber(row.Rainfall);
          return r !== null && r > minRainfall;
        });

  return filtered.map((row) => {
    const item = {
      rainfall: toNumber(row.Rainfall),
      pressure3pm: toNumber(row.Pressure3pm),
    };
    if (showHumidity) {
      item.humidity = toNumber(row.Humidity3pm);
    }
    return item;
  });
}

function handleRequest(req, res) {
  if (req.method !== 'GET') {
    return sendError(res, 400, 'Підтримуються лише GET-запити');
  }

  let url;
  try {
    url = new URL(req.url, `http://${host}:${port}`);
  } catch {
    return sendError(res, 400, 'Некоректний URL');
  }

  if (url.pathname !== '/') {
    return sendError(res, 404, 'Маршрут не знайдено');
  }

  const showHumidity = url.searchParams.get('humidity') === 'true';

  const minRainfallRaw = url.searchParams.get('min_rainfall');
  let minRainfall = null;
  if (minRainfallRaw !== null) {
    const n = Number(minRainfallRaw);
    if (!Number.isFinite(n)) {
      return sendError(res, 400, 'Параметр min_rainfall має бути числом');
    }
    minRainfall = n;
  }

  fs.readFile(inputPath, 'utf8', (err, raw) => {
    if (err) {
      return sendError(res, 500, 'Не вдалося прочитати файл даних');
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return sendError(res, 500, 'Файл даних пошкоджено (некоректний JSON)');
    }

    if (!Array.isArray(data)) {
      return sendError(res, 500, 'Файл даних має містити JSON-масив');
    }

    let result;
    try {
      result = processData(data, showHumidity, minRainfall);
    } catch {
      return sendError(res, 500, 'Помилка обробки даних');
    }

    sendJson(res, 200, result);
  });
}

function startServer() {
  const server = http.createServer(handleRequest);

  server.on('error', (err) => {
    console.error(`Помилка сервера: ${err.message}`);
    process.exit(1);
  });

  server.listen(port, host, () => {
    console.log(`Сервер запущено: http://${host}:${port}/`);
    console.log(`Файл даних: ${inputPath}`);
    if (outputPath) console.log(`Файл виводу: ${outputPath}`);
  });
}