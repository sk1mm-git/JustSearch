const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
// RelaxDev передаёт порт через переменную окружения
const PORT = process.env.PORT || 3000;

// 1. Раздача статических файлов из папки public
// Express сам найдёт index.html при заходе на корень сайта
app.use(express.static(path.join(__dirname, 'public')));

// 2. Разрешённые хосты для прокси (защита от использования как открытый прокси)
const ALLOWED_HOSTS = [
    'gitlab.com',
    'raw.githubusercontent.com'
];

// 3. CORS-заголовки (нужны, если вдруг захочешь дергать прокси с другого домена, но здесь они не помешают)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

// 4. Эндпоинт прокси
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

// 5. Для SPA (если у тебя всё на одной странице, можно оставить так, или удалить)
// Если используешь клиентский роутинг, этот обработчик вернёт index.html на любые пути
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 6. Запуск сервера на порту, который даёт RelaxDev
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
});
