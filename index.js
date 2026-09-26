const express = require('express');
const app = express();
const __path = process.cwd();
const PORT = process.env.PORT || 8000;
let code = require('./pair'); 

require('events').EventEmitter.defaultMaxListeners = 500;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// code එක Object එකක් නම් එකේ router එක හෝ function එක ගන්න:
app.use('/code', code.router || code.Router || code);

app.get('/pair', async (req, res, next) => {
    res.sendFile(__path + '/pair.html');
});

app.get('/settings', async (req, res, next) => {
    res.sendFile(__path + '/settings.html');
});

app.get('/', async (req, res, next) => {
    res.sendFile(__path + '/main.html');
});

app.listen(PORT, () => {
  console.log(`╔═══════════════════════════╗`);
  console.log(`║  Akira Bot — ONLINE  Port: ${PORT}   ║`);
  console.log(`╚═══════════════════════════╝`);
});

module.exports = app;
