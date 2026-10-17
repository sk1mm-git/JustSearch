const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = 3000;

// Разрешённые источники для проксирования (чтобы не превратиться в открытый прокси)
const ALLOWED_HOSTS = [
    'gitlab.com',
    'raw.githubusercontent.com'
];

// CORS для всех ответов
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

// Эндпоинт: /proxy?url=<encoded-url>
app.get('/proxy', async (req, res) => {
    const target = req.query.url;
    if (!target) {
        return res.status(400).json({ error: 'Параметр url обязателен' });
    }

    let targetUrl;
    try {
        targetUrl = new URL(target);
    } catch {
        return res.status(400).json({ error: 'Некорректный URL' });
    }

    if (!ALLOWED_HOSTS.includes(targetUrl.hostname)) {
        return res.status(403).json({ error: `Хост ${targetUrl.hostname} не разрешён` });
    }

    try {
        const response = await fetch(targetUrl.toString(), {
            headers: {
                // GitLab иногда отдаёт 403 без User-Agent
                'User-Agent': 'Mozilla/5.0 (JustMC-Catalog-Proxy)'
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({
                error: `Апстрим вернул ${response.status}`,
                url: targetUrl.toString()
            });
        }

        const contentType = response.headers.get('content-type') || 'text/plain; charset=utf-8';
        res.setHeader('Content-Type', contentType);
        // Кэшируем на 5 минут, чтобы не дёргать GitLab при каждом запросе
        res.setHeader('Cache-Control', 'public, max-age=300');

        const body = await response.text();
        res.send(body);
    } catch (err) {
        console.error('Ошибка прокси:', err.message);
        res.status(502).json({ error: `Ошибка прокси: ${err.message}` });
    }
});

// Health-check
app.get('/', (req, res) => {
    res.send('JustMC proxy работает. Используй /proxy?url=<encoded-url>');
});

app.listen(PORT, () => {
    console.log(`✅ Прокси запущен: http://localhost:${PORT}`);
    console.log(`   Пример: http://localhost:${PORT}/proxy?url=${encodeURIComponent(
        'https://gitlab.com/justmc/justmc-localization/-/raw/master/creative_plus/ru_RU.properties?ref_type=heads'
    )}`);
});
