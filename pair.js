/*                                                                                                                                    
  SHANA SERVICE MINI BOT - MULTI SESSION SUPPORT
  DEVELOPED BY SHANA DEVALOPEE
  FULLY ENC AND PRIVET SOURCE CODE                                                                        
*/

const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const {
    exec
} = require('child_process');
const { sms } = require("./msg");
const router = express.Router();
const pino = require('pino');
const mongoose = require('mongoose');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const yts = require('yt-search');
const os = require('os');
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
ffmpeg.setFfmpegPath(ffmpegPath);

const images = [
    'https://files.catbox.moe/h3nont.jpg'
]; 

const akira = images[Math.floor(Math.random() * images.length)];

const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion, 
    downloadContentFromMessage,
    jidNormalizedUser, 
    getContentType,
    delay
} = require("baileys");

const config = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    MODE: 'public',
    PREFIX: '.',
    MAX_RETRIES: 3,
    ADMIN_LIST_PATH: './admin.json',
    AKIRA_IMG: 'https://files.catbox.moe/h3nont.jpg',
    NEWSLETTER_JID: '120363419619460838@newsletter',
    NEWSLETTER_LIST: [
        '120363425584831057@newsletter',
        '120363422562980426@newsletter'
    ],
    OWNER_NUMBER: '94761480834',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbAp1d6HVvTSFTYtco0T'
};

const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = './session';
const NUMBER_LIST_PATH = './numbers.json';
const autoReplyState = new Map();

const SessionSchema = new mongoose.Schema({
    number: { type: String, unique: true, required: true },
    creds: { type: Object, required: true },
    config: { type: Object },
    updatedAt: { type: Date, default: Date.now }
});
const Session = mongoose.model('Session', SessionSchema);

async function connectMongoDB() {
    try {
        const mongoUri = process.env.MONGO_URI || '<MONGODB-URL>';
        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('MongoDB connection failed:', error);
    }
}
connectMongoDB();

if (!fs.existsSync(SESSION_BASE_PATH)) {
    fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });
}

function initialize() {
    activeSockets.clear();
    socketCreationTime.clear();
}

function formatMessage(title, content, footer) {
    return `*${title}*\n\n${content}\n\n> *${footer}*`;
}

async function saveSession(number, creds) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        await Session.findOneAndUpdate({ number: sanitizedNumber }, { creds, updatedAt: new Date() }, { upsert: true });
        const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        fs.ensureDirSync(sessionPath);
        fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(creds, null, 2));
        
        let numbers = [];
        if (fs.existsSync(NUMBER_LIST_PATH)) {
            numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH, 'utf8'));
        }
        if (!numbers.includes(sanitizedNumber)) {
            numbers.push(sanitizedNumber);
            fs.writeFileSync(NUMBER_LIST_PATH, JSON.stringify(numbers, null, 2));
        }
    } catch (error) {
        console.error(`Failed to save session for ${number}:`, error);
    }
}

async function restoreSession(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const session = await Session.findOne({ number: sanitizedNumber });
        if (!session || !session.creds?.me) return null;
        
        const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        fs.ensureDirSync(sessionPath);
        fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(session.creds, null, 2));
        return session.creds;
    } catch (error) {
        return null;
    }
}

async function loadUserConfig(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const configDoc = await Session.findOne({ number: sanitizedNumber }, 'config');
        return configDoc?.config || { ...config };
    } catch (error) {
        return { ...config };
    }
}

async function updateUserConfig(number, newConfig) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        await Session.findOneAndUpdate({ number: sanitizedNumber }, { config: newConfig, updatedAt: new Date() }, { upsert: true });
    } catch (error) {}
}

async function EmpirePair(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);

    if (activeSockets.has(sanitizedNumber)) {
        try { activeSockets.get(sanitizedNumber).socket?.end?.(); } catch {}
        activeSockets.delete(sanitizedNumber);
    }

    await restoreSession(sanitizedNumber);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    try {
        const socket = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: "silent" }),
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            printQRInTerminal: false,
        });

        socketCreationTime.set(sanitizedNumber, Date.now());

        if (!socket._handlersAttached) {
            socket._handlersAttached = true;
            setupCommandHandlers(socket, sanitizedNumber);
        }

        if (!socket.authState.creds.registered) {
            let retries = config.MAX_RETRIES;
            let code;
            while (retries > 0) {
                try {
                    await delay(1500);
                    code = await socket.requestPairingCode(sanitizedNumber, "AKRAMDV1");
                    break;
                } catch (error) {
                    retries--;
                    if (retries === 0) throw error;
                    await delay(2000);
                }
            }
            if (!res.headersSent) res.send({ code });
        }

        socket.ev.on('creds.update', async () => {
            await saveCreds();
            const credsPath = path.join(sessionPath, 'creds.json');
            if (fs.existsSync(credsPath)) {
                const creds = JSON.parse(await fs.readFile(credsPath, 'utf8'));
                await saveSession(sanitizedNumber, creds);
            }
        });

        socket.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                await delay(3000);
                if (!socket.user?.id) return;

                const userJid = jidNormalizedUser(socket.user.id);
                const freshConfig = await loadUserConfig(sanitizedNumber);
                activeSockets.set(sanitizedNumber, { socket, config: freshConfig });

                try {
                    await socket.sendMessage(userJid, {
                        image: { url: config.AKIRA_IMG },
                        caption: formatMessage(
                            `*↳ ❝ [💚 Wellcome To SHANA SERVICE 💚] ¡! ❞*`,
                            `╭─────⊹₊⟡⋆ 𝐈𝐧𝐟𝐨 ⋆⟡₊⊹─────<𝟑 .ᐟ\n┊ 𝜗𝜚⋆ : 𝚅𝙴𝚁𝚂𝙸𝙾𝙽 - V1.0.0\n┊ 𝜗𝜚⋆ : 𝙽𝚄𝙼𝙱𝙴𝚁 - ${number}\n┊ 𝜗𝜚⋆ : 𝙾𝚆𝙽𝙴𝚁 - 𝐒𝐇𝐀𝐍𝐀 𝙳𝙴𝚅𝙰𝙻𝑶𝙿𝑬𝙴 ִ ࣪𖤐.ᐟ\n╰────────────────────<𝟑 .ᐟ\n\nHello Sir/Miss, This is SHANA SERVICE official automated whatsapp system running 24/7.`,
                            '𝚂𝙷𝙰𝙽𝙰 𝚂𝙴𝚁𝚅𝙸𝙲𝙴 𝐵𝑦 𝑺𝑯𝑨𝑵𝑨 𝑫𝑬𝑽𝑨𝑳𝑶𝙿𝑬𝑬'
                        )
                    });
                } catch (e) {}
            }
        });
    } catch (error) {
        if (!res.headersSent) res.status(503).send({ error: 'Service Unavailable' });
    }
}

async function setupCommandHandlers(socket, number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    let sessionConfig = await loadUserConfig(sanitizedNumber);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });

    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        try {
            const isFromMe = msg.key.fromMe;
            const senderJid = msg.key.remoteJid;
            const isGroupChat = senderJid.endsWith('@g.us');

            if (!isFromMe && autoReplyState.get(sanitizedNumber) === true && !isGroupChat) {
                const incomingText = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
                if (incomingText && !incomingText.startsWith(sessionConfig.PREFIX || '.')) {
                    await delay(1000);
                    const autoReplyCaption = `*Hi Sir/Miss 💚*\n\n` +
                        ` *ඔබට මගේන් මොන උපකාරයද ඔනි 👇*\n\n` +
                        ` *✳️ 1X deposite details නම් අංක  ( 1) කියලා මැසෙජ් එකක් දාන්න*\n\n` +
                        ` *✳️ 1XWithdrawal details නම් අංක  ( 2 ) කියලා මැසෙජ් එකක් දාන්න*\n\n` +
                        ` *✳️ Socal media Boost price දැන ගැනිමටනම් අංක ( 3) කියලා මැසෙජ් එකක් දාන්න*\n\n` +
                        ` *✳️ Software/App/Web site/Teligram system/Whatsapp system හාදා ගැනිමටනම් අංක (4) කියලා මැසෙජ් එකක් දාන්න*\n\n` +
                        ` *✳️ 1x Bonus සහ Offer ,😍win වැඩ් කර ගැනිමට පෙවර්දන කෙතයක් ඔනිනම් අංක (5) කියලා මැසෙජ් එකක් දාන්න*\n\n` +
                        ` *_ඔබට ඉහත විදියට අනුගමනය වේනම් ඉතාමත් ඉක්මණින් ඔබට අපගේ සෙවාව ලාබා ගත හැක..._*`;

                    await socket.sendMessage(senderJid, {
                        image: { url: akira },
                        caption: autoReplyCaption
                    }, { quoted: msg });
                }
            }
        } catch (e) {}

        const type = getContentType(msg.message);
        const body = (type === 'conversation') ? msg.message.conversation 
            : (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text 
            : (type === 'imageMessage') ? msg.message.imageMessage.caption 
            : (type === 'videoMessage') ? msg.message.videoMessage.caption 
            : '';

        if (!body) return;

        const prefix = sessionConfig.PREFIX || '.';
        if (!body.startsWith(prefix)) return;

        const args = body.slice(prefix.length).trim().split(/\s+/);
        const command = args.shift().toLowerCase();
        const sender = msg.key.remoteJid;

        const botNumber = jidNormalizedUser(socket.user.id).split('@')[0];
        const senderNumber = msg.key.participant ? msg.key.participant.split('@')[0] : sender.split('@')[0];
        const isOwner = botNumber.includes(senderNumber) || config.OWNER_NUMBER.includes(senderNumber);
        const isGroup = sender.endsWith('@g.us');

        const reply = async (text, options = {}) => {
            await socket.sendMessage(sender, { text, ...options }, { quoted: msg });
        };

        const downloadQuotedMedia = async (qMsg) => {
            let qType = Object.keys(qMsg)[0];
            let content = qMsg[qType];
            if (!content || !qType) return null;
            const stream = await downloadContentFromMessage(content, qType.replace('Message', ''));
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            return { buffer };
        };

        function getUptime() {
            let seconds = Math.floor(process.uptime());
            let d = Math.floor(seconds / (3600 * 24));
            let h = Math.floor((seconds % (3600 * 24)) / 3600);
            let m = Math.floor((seconds % 3600) / 60);
            let s = Math.floor(seconds % 60);
            return `${d > 0 ? d + 'd ' : ''}${h}h ${m}m ${s}s`;
        }

        const arabianCtx = () => ({
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: "120363419619460838@newsletter",
                newsletterName: '💚 𝗦𝗛𝗔𝗡𝗔 𝗦𝗘𝗥𝗩𝗜𝗖𝗘 🇱🇰',
                serverMessageId: 123,
            }
        });

        try {
            switch (command) {
                case 'menu':
                case 'list':
                case 'panel': {
                    try { await socket.sendMessage(sender, { react: { text: '💚', key: msg.key } }); } catch {}
                    const pushname = msg.pushName || 'User';
                    const slDate = moment().tz('Asia/Colombo').format('YYYY-MM-DD');
                    const slTimeNow = moment().tz('Asia/Colombo').format('HH:mm:ss');

                    await socket.sendMessage(sender, {
                        image: { url: akira },
                        caption: `*↳ ❝ [💚 𝗦𝗛𝗔𝗡𝗔 𝗦𝗘𝗥𝗩𝗜𝗖𝗘 𝗠𝗲𝗻𝘂 💚] ¡! ❞*\n\n` +
                                 `┏━━━━━°⌜ \`ශාන සේවා මුල්ල\` ⌟°━━━━━┓\n` +
                                 `┃👤 *𝚄𝚂𝙴𝚁* : ${pushname}\n` +
                                 `┃📦 *𝚅𝙴𝚁𝚂𝙸𝙾𝙽* : V1\n` +
                                 `┃📅 *𝙳𝙰𝚃𝙴* : ${slDate}\n` +
                                 `┃⌚ *𝚃𝙸𝙼𝙴* : ${slTimeNow}\n` +
                                 `┗━━━━━°⌜ \`ශාන සේවා මුල්ල\` ⌟°━━━━━┛\n\n` +
                                 `╭─⊹₊⟡⋆『 \`𝐌𝐚𝐢𝐧 𝐂𝐦𝐝𝐳\` 』𖤐.ᐟ\n` +
                                 `│ •menu | •system | •ping | •alive | •owner\n` +
                                 `╰──────────────────<𝟑 .ᐟ\n` +
                                 `╭─⊹₊⟡⋆『 \`𝐒𝐇𝐀𝐍𝐀 𝐀𝐆𝐄𝐍𝐓\` 』𖤐.ᐟ\n` +
                                 `│ •autorp on/off\n` +
                                 `╰──────────────────<𝟑 .ᐟ\n` +
                                 `╭─⊹₊⟡⋆『 \`𝐃𝐰𝐧 & 𝐓𝐨𝐨𝐥𝐬\` 』𖤐.ᐟ\n` +
                                 `│ •song | •video | •fb | •tt | •vv | •sticker | •fancy | •getdp | •npm | •img | •mode\n` +
                                 `╰──────────────────<𝟑 .ᐟ\n` +
                                 `╭─⊹₊⟡⋆『 \`𝐆𝐫𝐨𝐮𝐩 & 𝐀𝐈\` 』𖤐.ᐟ\n` +
                                 `│ •tagall | •hidetag | •add | •kick | •tagadmin | •akira | •lvcal | •hack\n` +
                                 `╰──────────────────<𝟑 .ᐟ\n\n` +
                                 `> *𝚂𝙷𝙰𝙽𝙰 𝚂𝙴𝚁𝚅𝙸𝙲𝙴 𝐵𝑦 𝑺𝑯𝑨𝑵𝑨 𝑫𝑬𝑽𝑨𝑳𝑶𝑷𝑬𝑬*`,
                        contextInfo: arabianCtx()
                    }, { quoted: msg });
                    break;
                }

                case 'ping': {
                    const start = Date.now();
                    const ms = Date.now() - start;
                    await socket.sendMessage(sender, {
                        image: { url: akira },
                        caption: `*🏓 PONG:* ${ms}ms\n*⏱️ UPTIME:* ${getUptime()}\n\n> *𝚂𝙷𝙰𝙽𝙰 𝚂𝙴𝚁𝚅𝙸𝙲𝙴*`,
                        contextInfo: arabianCtx()
                    }, { quoted: msg });
                    break;
                }

                case 'autorp': {
                    if (!isOwner) return reply('Owner only.');
                    const opt = args[0]?.toLowerCase();
                    if (opt === 'on') {
                        autoReplyState.set(sanitizedNumber, true);
                        await reply('AUTO Reply ON ✅');
                    } else if (opt === 'off') {
                        autoReplyState.set(sanitizedNumber, false);
                        await reply('AUTO Reply OFF ✅');
                    } else {
                        await reply(`Use: ${prefix}autorp on / off`);
                    }
                    break;
                }

                case 'alive': {
                    await socket.sendMessage(sender, {
                        image: { url: akira },
                        caption: `*💚 SHANA SERVICE is Alive & Running 24/7!*\n\n> *𝚂𝙷𝙰𝙽𝙰 𝚂𝙴𝚁𝚅𝙸𝙲𝙴*`,
                        contextInfo: arabianCtx()
                    }, { quoted: msg });
                    break;
                }

                case 'system': {
                    const ram = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
                    const totalRam = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
                    await socket.sendMessage(sender, {
                        image: { url: akira },
                        caption: `*⏱️ UPTIME:* ${getUptime()}\n*📟 RAM:* ${ram} MB / ${totalRam} GB\n*💻 Platform:* ${os.platform()}\n\n> *𝚂𝙷𝙰𝙽𝙰 𝚂𝙴𝚁𝚅𝙸𝙲𝙴*`,
                        contextInfo: arabianCtx()
                    }, { quoted: msg });
                    break;
                }

                case 'song':
                case 'ytmp3': {
                    const query = args.join(' ');
                    if (!query) return reply("🎵 Send a song name!");
                    const search = await yts(query);
                    const video = search.videos[0];
                    if (!video) return reply("❌ Not found!");

                    await socket.sendMessage(sender, {
                        image: { url: video.thumbnail },
                        caption: `*🎵 TITLE:* ${video.title}\n*👤 CHANNEL:* ${video.author.name}\n\n> *𝚂𝙷𝙰𝙽𝙰 𝚂𝙴𝚁𝚅𝙸𝙲𝙴*`,
                        contextInfo: arabianCtx()
                    }, { quoted: msg });

                    const ytRes = await axios.get(`https://ytdl-new-dxz.vercel.app/api/ytmp3?url=${encodeURIComponent(video.url)}`);
                    const dlUrl = ytRes.data.download_url || ytRes.data.result || ytRes.data.url;
                    if (!dlUrl) return reply("❌ Audio download failed!");

                    await socket.sendMessage(sender, { audio: { url: dlUrl }, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
                    break;
                }

                case 'video':
                case 'ytmp4': {
                    const query = args.join(' ');
                    if (!query) return reply("🎥 Send video name or link!");
                    const search = await yts(query);
                    const video = search.videos[0];
                    if (!video) return reply("❌ Not found!");

                    const ytRes = await axios.get(`https://ytdl-new-dxz.vercel.app/api/ytmp4?url=${encodeURIComponent(video.url)}&quality=360`);
                    const dlUrl = ytRes.data.video_url || ytRes.data.download_url;
                    if (!dlUrl) return reply("❌ Video download failed!");

                    const resBuf = await axios.get(dlUrl, { responseType: 'arraybuffer' });
                    await socket.sendMessage(sender, {
                        video: Buffer.from(resBuf.data),
                        mimetype: 'video/mp4',
                        caption: `🎬 ${video.title}\n\n> *𝚂𝙷𝙰𝙽𝙰 𝚂𝙴𝚁𝚅𝙸𝙲𝙴*`
                    }, { quoted: msg });
                    break;
                }

                case 'fb':
                case 'facebook': {
                    const query = args.join(' ');
                    if (!query) return reply("🔗 Send FB link!");
                    const fbRes = await axios.get(`https://www.movanest.xyz/v2/fbdown?url=${encodeURIComponent(query)}`);
                    if (!fbRes.data.status || !fbRes.data.results.length) return reply("❌ Error fetching FB video!");

                    const vData = fbRes.data.results[0];
                    const vUrl = vData.hdQualityLink || vData.normalQualityLink;
                    const resBuf = await axios.get(vUrl, { responseType: 'arraybuffer' });

                    await socket.sendMessage(sender, {
                        video: Buffer.from(resBuf.data),
                        mimetype: 'video/mp4',
                        caption: `🎬 Facebook Video\n\n> *𝚂𝙷𝙰𝙽𝙰 𝚂𝙴𝚁𝚅𝙸𝙲𝙴*`
                    }, { quoted: msg });
                    break;
                }

                case 'tiktok':
                case 'tt': {
                    const query = args.join(' ');
                    if (!query) return reply("🔗 Send TikTok link!");
                    const ttRes = await axios.get(`https://www.movanest.xyz/v2/tiktok?url=${encodeURIComponent(query)}`);
                    if (!ttRes.data.status || !ttRes.data.results) return reply("❌ Error fetching TikTok!");

                    const vUrl = ttRes.data.results.no_watermark;
                    const resBuf = await axios.get(vUrl, { responseType: 'arraybuffer' });

                    await socket.sendMessage(sender, {
                        video: Buffer.from(resBuf.data),
                        mimetype: 'video/mp4',
                        caption: `🎬 TikTok Video (No Watermark)\n\n> *𝚂𝙷𝙰𝙽𝙰 𝚂𝙴𝚁𝚅𝙸𝙲𝙴*`
                    }, { quoted: msg });
                    break;
                }

                case 'ai':
                case 'akira':
                case 'shana': {
                    const { NiyoXClient } = require("niyox");
                    const q = args.join(' ');
                    if (!q) return reply("ඕ කියන්න, මම SHANA SERVICE Assistant 💚");

                    try {
                        const client = new NiyoXClient({ sessionId: sender, timeout: 15000 });
                        const response = await client.chat(`ඔබ SHANA SERVICE හි නිල සහායිකාවයි. කෙටියෙන් පිළිතුරු දෙන්න: ${q}`);
                        await socket.sendMessage(sender, {
                            image: { url: akira },
                            caption: `💚 *Shana AI* 💚\n\n${response?.result || 'Error'}\n\n> *𝚂𝙷𝙰𝙽𝙰 𝚂𝙴𝚁𝚅𝙸𝙲𝙴*`,
                            contextInfo: arabianCtx()
                        }, { quoted: msg });
                    } catch (e) {
                        reply("❌ AI Cooldown / Error");
                    }
                    break;
                }

                case 'vv': {
                    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (!quoted) return reply("Reply to a view-once message with .vv");
                    const media = await downloadQuotedMedia(quoted);
                    if (!media?.buffer) return reply("Could not download media.");

                    if (quoted.imageMessage) {
                        await socket.sendMessage(sender, { image: media.buffer, caption: 'View-once unlocked 👀' }, { quoted: msg });
                    } else if (quoted.videoMessage) {
                        await socket.sendMessage(sender, { video: media.buffer, caption: 'View-once unlocked 👀' }, { quoted: msg });
                    }
                    break;
                }

                case 'sticker':
                case 's': {
                    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (!quoted || (!quoted.imageMessage && !quoted.videoMessage)) return reply("Reply to an image/video with .sticker");
                    
                    const { default: WASticker, StickerTypes } = require('wa-sticker-formatter');
                    const media = await downloadQuotedMedia(quoted);
                    if (!media?.buffer) return reply("Download failed.");

                    const sticker = new WASticker(media.buffer, {
                        pack: 'SHANA SERVICE',
                        author: 'SHANA DEVALOPEE',
                        type: StickerTypes.FULL,
                        quality: 50
                    });
                    const buffer = await sticker.toBuffer();
                    await socket.sendMessage(sender, { sticker: buffer }, { quoted: msg });
                    break;
                }

                case 'mode': {
                    if (!isOwner) return reply("Owner only.");
                    const newMode = args[0]?.toLowerCase();
                    if (newMode !== 'public' && newMode !== 'private') return reply("Use: .mode public / private");

                    sessionConfig.MODE = newMode;
                    await updateUserConfig(sanitizedNumber, sessionConfig);
                    await reply(`✅ Mode changed to *${newMode}*`);
                    break;
                }

                case 'img':
                case 'gimg': {
                    const query = args.join(' ');
                    if (!query) return reply("Send query!");
                    const res = await axios.get(`https://www.movanest.xyz/v2/pinterest?query=${encodeURIComponent(query)}&pageSize=5`);
                    if (res.data?.results?.length > 0) {
                        const rand = res.data.results[Math.floor(Math.random() * res.data.results.length)];
                        await socket.sendMessage(sender, { image: { url: rand.image }, caption: `🔍 Search: ${query}\n\n> *𝚂𝙷𝙰𝙽𝙰 𝚂𝙴𝚁𝚅𝙸𝙲𝙴*` }, { quoted: msg });
                    } else {
                        reply("Not found!");
                    }
                    break;
                }

                case 'getdp': {
                    const qCtx = msg.message?.extendedTextMessage?.contextInfo;
                    const target = qCtx?.mentionedJid?.[0] || qCtx?.participant || sender;
                    const dpUrl = await socket.profilePictureUrl(target, 'image').catch(() => null);
                    if (!dpUrl) return reply("No DP or Protected!");
                    await socket.sendMessage(sender, { image: { url: dpUrl }, caption: `DP of @${target.split('@')[0]}`, mentions: [target] }, { quoted: msg });
                    break;
                }

                case 'tagall': {
                    if (!isGroup) return reply("Groups only.");
                    const gm = await socket.groupMetadata(sender);
                    let txt = `*🗣️ ${args.join(' ') || 'Attention!'}*\n\n`;
                    const mentions = gm.participants.map(p => {
                        txt += `@${p.id.split('@')[0]}\n`;
                        return p.id;
                    });
                    await socket.sendMessage(sender, { text: txt, mentions }, { quoted: msg });
                    break;
                }

                case 'hidetag': {
                    if (!isGroup) return reply("Groups only.");
                    const gm = await socket.groupMetadata(sender);
                    await socket.sendMessage(sender, { text: args.join(' ') || 'Attention!', mentions: gm.participants.map(p => p.id) }, { quoted: msg });
                    break;
                }

                case 'kick': {
                    if (!isGroup) return reply("Groups only.");
                    const qCtx = msg.message?.extendedTextMessage?.contextInfo;
                    const target = qCtx?.participant || (args[0] ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null);
                    if (!target) return reply("Reply or give number to kick.");
                    await socket.groupParticipantsUpdate(sender, [target], 'remove');
                    await reply(`✅ Removed successfully.`);
                    break;
                }

                case 'add': {
                    if (!isGroup) return reply("Groups only.");
                    const num = args[0]?.replace(/[^0-9]/g, '');
                    if (!num) return reply("Provide number to add!");
                    await socket.groupParticipantsUpdate(sender, [num + '@s.whatsapp.net'], 'add');
                    await reply(`✅ Added +${num}`);
                    break;
                }

                case 'fancy':
                case 'fancytext': {
                    const text = args.join(' ');
                    if (!text) return reply("Send text!");
                    const res = await axios.get(`https://www.movanest.xyz/v2/fancytext?word=${encodeURIComponent(text)}`);
                    if (res.data?.status) {
                        let msgOut = `*✨ FANCY TEXT *\n\n`;
                        res.data.results.slice(0, 15).forEach((t, i) => msgOut += `${i+1}. ${t}\n`);
                        await reply(msgOut);
                    } else {
                        reply("API Error");
                    }
                    break;
                }

                case 'owner': {
                    const ownerNum = '+94761480834';
                    await socket.sendMessage(sender, {
                        contacts: {
                            displayName: 'SHANA DEVALOPEE',
                            contacts: [{ vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:SHANA DEVALOPEE\nTEL;type=CELL;type=VOICE;waid=${ownerNum.slice(1)}:${ownerNum}\nEND:VCARD` }]
                        }
                    }, { quoted: msg });
                    break;
                }

                case 'lvcal': {
                    const names = args.join(' ').split('&');
                    if (names.length !== 2) return reply("Use: .lvcal John & Jane");
                    const score = Math.abs((names[0].trim().toLowerCase() + names[1].trim().toLowerCase()).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 101);
                    await reply(`💖 *Love Calculator* 💖\n\n${names[0].trim()} 💑 ${names[1].trim()}\n*Match Score:* ${score}%\n\n> *𝚂𝙷𝙰𝙽𝙰 𝚂𝙴𝚁𝚅𝙸𝙲𝙴*`);
                    break;
                }

                case 'hack': {
                    const steps = ['Hacking starting...', 'Connecting...', '[#####] 50%', '[##########] 100%', 'Hack Successful! 🔓'];
                    let initial = await socket.sendMessage(sender, { text: steps[0] }, { quoted: msg });
                    for (let i = 1; i < steps.length; i++) {
                        await delay(800);
                        await socket.sendMessage(sender, { text: steps[i], edit: initial.key });
                    }
                    break;
                }
            }
        } catch (err) {
            console.error("CMD Error:", err);
        }
    });
}

router.get('/', async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).send({ error: 'Number required' });
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    if (activeSockets.has(sanitizedNumber)) {
        return res.status(200).send({ status: 'already_connected' });
    }
    await EmpirePair(number, res);
});

module.exports = router;
