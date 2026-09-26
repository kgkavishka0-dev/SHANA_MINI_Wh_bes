const express = require('express');
const app = express();
const __path = process.cwd();
const PORT = process.env.PORT || 8000;

// pair file එක require කිරීම
const pair = require('./pair'); 

require('events').EventEmitter.defaultMaxListeners = 500;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// pair එක router එකක්ද නැද්ද යන්න පරීක්ෂා කර route එක සැකසීම:
if (pair && pair.stack) {
    app.use('/code', pair);
} else if (pair && pair.router) {
    app.use('/code', pair.router);
} else {
    // pair එක async function එකක් හෝ object එකක් නම් standard GET route එකක් සාදා ගැනීම
    app.get('/code', async (req, res, next) => {
        if (typeof pair === 'function') {
            return pair(req, res, next);
        } else if (pair && typeof pair.pair === 'function') {
            return pair.pair(req, res, next);
        } else {
            res.json({ error: "Pairing handler function not found in pair.js" });
        }
    });
}

app.get('/pair', async (req, res) => {
    res.sendFile(__path + '/pair.html');
});

app.get('/settings', async (req, res) => {
    res.sendFile(__path + '/settings.html');
});

app.get('/', async (req, res) => {
    res.sendFile(__path + '/main.html');
});

app.listen(PORT, () => {
  console.log(`╔═══════════════════════════╗`);
  console.log(`║  Akira Bot — ONLINE  Port: ${PORT}   ║`);
  console.log(`╚═══════════════════════════╝`);
});

module.exports = app;
