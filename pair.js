/*
  SHANA GIRL MD MINI BOT - MULTI SESSION SUPPORT
  DEVELOPED BY SHANA DEVALOPEE
  FULLY ENC AND PRIVET SOURCE CODE
*/

const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { sms } = require("./msg");
const router = express.Router();
const pino = require('pino');
const mongoose = require('mongoose');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const yts = require('yt-search');
const { ytmp3, ytmp4 } = require('sadaslk-dlcore');
const os = require('os');
const fecth = require('node-fetch');
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
ffmpeg.setFfmpegPath(ffmpegPath);

// ═══ SHANA IMAGE — හැම තැනම මේ එකම image එක ═══
const SHANA_IMG = 'https://i.ibb.co/XfhkHjRM/imagebug.jpg';
const akira = SHANA_IMG;

const {
    default: makeWASocket,
    makeCacheableSignalKeyStore,
    useMultiFileAuthState,
    DisconnectReason,
    downloadMediaMessage,
    generateForwardMessageContent,
    prepareWAMessageMedia,
    fetchLatestBaileysVersion,
    generateWAMessageFromContent,
    generateMessageID,
    downloadContentFromMessage,
    extractMessageContent,
    jidDecode,
    MessageRetryMap,
    jidNormalizedUser,
    proto,
    getContentType,
    areJidsSameUser,
    generateWAMessage,
    delay,
    Browsers
} = require("baileys");

const config = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    MODE: 'public',
    PREFIX: '.',
    MAX_RETRIES: 3,
    ADMIN_LIST_PATH: './admin.json',
    AKIRA_IMG: 'https://i.ibb.co/XfhkHjRM/imagebug.jpg',
    AUTORP_IMG: 'https://i.ibb.co/XfhkHjRM/imagebug.jpg',
    NEWSLETTER_JID: '120363419619460838@newsletter',
    NEWSLETTER_LIST: [
        '120363425584831057@newsletter',
        '120363422562980426@newsletter'
    ],
    NEWSLETTER_MESSAGE_ID: '428',
    OTP_EXPIRY: 300000,
    OWNER_NUMBER: '94761480834',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbAp1d6HVvTSFTYtco0T'
};

const replyFq = (text) => reply(text);
const activeSockets = new Map();
const socketCreationTime = new Map();
const socketHandlersMap = new Map();
const SESSION_BASE_PATH = './session';
const NUMBER_LIST_PATH = './numbers.json';

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
        process.exit(1);
    }
}
connectMongoDB();

if (!fs.existsSync(SESSION_BASE_PATH)) {
    fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });
}

function initialize() {
    activeSockets.clear();
    socketCreationTime.clear();
    console.log('Cleared active sockets and creation times on startup');
}

async function uploadToCatbox(stream, fileName) {
    try {
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', stream, fileName);

        const res = await axios.post(
            'https://catbox.moe/user/api.php',
            form,
            { headers: form.getHeaders(), timeout: 0 }
        );

        if (!res.data.startsWith('https://')) return null;
        return res.data.trim();
    } catch {
        return null;
    }
}

async function saveMediaToCatbox(msg) {
    try {
        const type = Object.keys(msg.message)[0];
        const mediaMap = {
            imageMessage: 'image',
            videoMessage: 'video',
            audioMessage: 'audio',
            documentMessage: 'document'
        };

        if (!mediaMap[type]) return null;

        const mediaMsg = msg.message[type];
        const size = mediaMsg.fileLength || 0;

        if (size > 100 * 1024 * 1024) return null;

        const stream = await downloadContentFromMessage(mediaMsg, mediaMap[type]);

        const ext =
            type === 'imageMessage' ? 'jpg' :
            type === 'videoMessage' ? 'mp4' :
            type === 'audioMessage' ? 'opus' :
            'bin';

        return await uploadToCatbox(stream, `${msg.key.id}.${ext}`);
    } catch {
        return null;
    }
}

async function cleanupInactiveSessions() {
    try {
        const sessions = await Session.find({}, 'number').lean();
        let cleanedCount = 0;

        for (const { number } of sessions) {
            const sanitizedNumber = number.replace(/[^0-9]/g, '');

            if (!activeSockets.has(sanitizedNumber) && !socketCreationTime.has(sanitizedNumber)) {
                const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);

                if (fs.existsSync(sessionPath)) {
                    const stats = fs.statSync(sessionPath);
                    const timeSinceModified = Date.now() - stats.mtime.getTime();

                    if (timeSinceModified > 60 * 60 * 1000) {
                        console.log(`Cleaning up stale session: ${sanitizedNumber}`);
                        fs.removeSync(sessionPath);
                        cleanedCount++;
                    }
                }
            }
        }

        console.log(`Cleaned up ${cleanedCount} stale sessions`);
        return cleanedCount;
    } catch (error) {
        console.error('Cleanup error:', error);
        return 0;
    }
}

function setupNewsletterHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key) return;

        const jid = message.key.remoteJid;

        if (jid !== config.NEWSLETTER_JID) return;

        try {
            const emojis = ['🎀', '🍬', '👽', '🌺', '🍓', '🍫', '🫐', '🥷'];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

            const messageId = message.key.server_id || message.newsletterServerId;

            if (!messageId) {
                console.warn('⚠️ No newsletterServerId found in message:', message);
                return;
            }

            await socket.newsletterReactMessage(jid, messageId.toString(), randomEmoji);
            console.log(`✅ Reacted to official newsletter: ${jid}`);
        } catch (error) {
            console.error('⚠️ Newsletter reaction failed:', error.message);
        }
    });
}

async function autoReconnectOnStartup() {
    try {
        let numbers = [];
        if (fs.existsSync(NUMBER_LIST_PATH)) {
            numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH, 'utf8'));
            console.log(`Loaded ${numbers.length} numbers from numbers.json`);
        }

        const sessions = await Session.find({}, 'number').lean();
        const mongoNumbers = sessions.map(s => s.number);
        numbers = [...new Set([...numbers, ...mongoNumbers])];

        if (numbers.length === 0) {
            console.log('No numbers found for auto-reconnect');
            return;
        }

        console.log(`Attempting to reconnect ${numbers.length} sessions...`);

        for (const number of numbers) {
            const sanitized = number.replace(/[^0-9]/g, '');
            if (activeSockets.has(sanitized)) {
                console.log(`Number ${sanitized} already connected, skipping`);
                continue;
            }

            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };

            try {
                await EmpirePair(sanitized, mockRes);
                console.log(`✅ Initiated reconnect for ${sanitized}`);
            } catch (error) {
                console.error(`❌ Failed to reconnect ${sanitized}:`, error);
            }

            await delay(1500);
        }
    } catch (error) {
        console.error('Auto-reconnect on startup failed:', error);
    }
}

(async () => {
    await initialize();
    setTimeout(autoReconnectOnStartup, 5000);
})();

function loadAdmins() {
    try {
        if (fs.existsSync(config.ADMIN_LIST_PATH)) {
            return JSON.parse(fs.readFileSync(config.ADMIN_LIST_PATH, 'utf8'));
        }
        return [];
    } catch (error) {
        console.error('Failed to load admin list:', error);
        return [];
    }
}

function formatMessage(title, content, footer) {
    return `*${title}*\n\n${content}\n\n> *${footer}*`;
}

function getSriLankaTimestamp() {
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}

const fetchJson = async (url, options) => {
    try {
        options ? options : {}
        const res = await axios({
            method: 'GET',
            url: url,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36'
            },
            ...options
        })
        return res.data
    } catch (err) {
        return err
    }
}

const runtime = (seconds) => {
    seconds = Number(seconds)
    var d = Math.floor(seconds / (3600 * 24))
    var h = Math.floor(seconds % (3600 * 24) / 3600)
    var m = Math.floor(seconds % 3600 / 60)
    var s = Math.floor(seconds % 60)
    var dDisplay = d > 0 ? d + (d == 1 ? ' day, ' : ' days, ') : ''
    var hDisplay = h > 0 ? h + (h == 1 ? ' hour, ' : ' hours, ') : ''
    var mDisplay = m > 0 ? m + (m == 1 ? ' minute, ' : ' minutes, ') : ''
    var sDisplay = s > 0 ? s + (s == 1 ? ' second' : ' seconds') : ''
    return dDisplay + hDisplay + mDisplay + sDisplay;
}

async function setupMessageHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

        const senderNumber = msg.key.participant ? msg.key.participant.split('@')[0] : msg.key.remoteJid.split('@')[0];
        const botNumber = jidNormalizedUser(socket.user.id).split('@')[0];
        const isReact = msg.message.reactionMessage;

        const sanitizedNumber = botNumber.replace(/[^0-9]/g, '');
        const sessionConfig = activeSockets.get(sanitizedNumber)?.config || config;
    });
}

function setupAutoRestart(socket, number) {
    const id = number;
    let reconnecting = false;

    socket.ev.on('connection.update', async ({ connection, lastDisconnect }) => {

        if (connection === 'open') {
            reconnecting = false;
            return;
        }

        if (connection !== 'close' || reconnecting) return;
        reconnecting = true;

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.warn(`[${id}] Connection closed | code:`, statusCode);

        if (statusCode === 401) {
            await destroySocket(id);
            await deleteSession(id);
            return;
        }

        await delay(2000);
        await destroySocket(id);

        const mockRes = {
            headersSent: true,
            send() {},
            status() { return this }
        };

        try {
            await EmpirePair(id, mockRes);
        } catch (e) {
            console.error('Reconnect failed:', e);
        }

        reconnecting = false;
    });
}

async function destroySocket(id) {
    try {
        const data = activeSockets.get(id);
        if (data?.socket) {
            data.socket.ev.removeAllListeners();
            data.socket.ws?.close();
        }
    } catch (e) {
        console.error('Destroy socket error:', e);
    }

    activeSockets.delete(id);
    socketCreationTime.delete(id);
}

async function saveSession(number, creds) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        await Session.findOneAndUpdate({
            number: sanitizedNumber
        }, {
            creds,
            updatedAt: new Date()
        }, {
            upsert: true
        });
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
        console.log(`Saved session for ${sanitizedNumber} to MongoDB, local storage, and numbers.json`);
    } catch (error) {
        console.error(`Failed to save session for ${sanitizedNumber}:`, error);
    }
}

async function restoreSession(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const session = await Session.findOne({
            number: sanitizedNumber
        });
        if (!session) {

            return null;
        }
        if (!session.creds || !session.creds.me || !session.creds.me.id) {
            console.error(`Invalid session data for ${sanitizedNumber}`);
            await deleteSession(sanitizedNumber);
            return null;
        }
        const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        fs.ensureDirSync(sessionPath);
        fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(session.creds, null, 2));
        console.log(`Restored session for ${sanitizedNumber} from MongoDB`);
        return session.creds;
    } catch (error) {
        console.error(`Failed to restore session for ${number}:`, error);
        return null;
    }
}

async function deleteSession(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        await Session.deleteOne({
            number: sanitizedNumber
        });
        const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        if (fs.existsSync(sessionPath)) {
            fs.removeSync(sessionPath);
        }
        if (fs.existsSync(NUMBER_LIST_PATH)) {
            let numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH, 'utf8'));
            numbers = numbers.filter(n => n !== sanitizedNumber);
            fs.writeFileSync(NUMBER_LIST_PATH, JSON.stringify(numbers, null, 2));
        }

    } catch (error) {
        console.error(`Failed to delete session for ${number}:`, error);
    }
}

async function loadUserConfig(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const configDoc = await Session.findOne({
            number: sanitizedNumber
        }, 'config');
        return configDoc?.config || {
            ...config
        };
    } catch (error) {
        console.warn(`No configuration found for ${number}, using default config`);
        return {
            ...config
        };
    }
}

async function updateUserConfig(number, newConfig) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        await Session.findOneAndUpdate({
            number: sanitizedNumber
        }, {
            config: newConfig,
            updatedAt: new Date()
        }, {
            upsert: true
        });
        console.log(`Updated config for ${sanitizedNumber}`);
    } catch (error) {
        console.error(`Failed to update config for ${number}:`, error);
        throw error;
    }
}

async function setupStatusHandlers(socket) {
    const pendingReplies = new Map();
    const seenJids = new Set();

    socket.ev.on('messages.upsert', async ({
        messages
    }) => {
        const msg = messages[0];
        if (!msg?.key ||
            msg.key.remoteJid !== 'status@broadcast' ||
            !msg.key.participant ||
            msg.key.remoteJid === config.NEWSLETTER_JID) return;

        const botJid = jidNormalizedUser(socket.user.id);
        if (msg.key.participant === botJid) return;

        const sanitizedNumber = botJid.split('@')[0].replace(/[^0-9]/g, '');
        const sessionConfig = activeSockets.get(sanitizedNumber)?.config || config;

        let statusViewed = false;

        try {

            if (sessionConfig.AUTO_VIEW_STATUS === 'true') {
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.readMessages([msg.key]);
                        statusViewed = true;
                        break;
                    } catch (error) {
                        retries--;
                        console.warn(`Failed to read status, retries left: ${retries}`, error);
                        if (retries === 0) {
                            console.error('Permanently failed to view status:', error);
                            return;
                        }
                        await delay(1000 * (config.MAX_RETRIES - retries + 1));
                    }
                }
            } else {

                statusViewed = true;
            }

            if (statusViewed && sessionConfig.AUTO_LIKE_STATUS === 'true') {
                const emojis = sessionConfig.AUTO_LIKE_EMOJI || ['🎀'];
                const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.sendMessage(
                            msg.key.remoteJid, {
                                react: {
                                    text: randomEmoji,
                                    key: msg.key
                                }
                            }, {
                                statusJidList: [msg.key.participant]
                            }
                        );
                        break;
                    } catch (error) {
                        retries--;
                        console.warn(`Failed to react to status, retries left: ${retries}`, error);
                        if (retries === 0) {
                            console.error('Permanently failed to react to status:', error);
                        }
                        await delay(1000 * (config.MAX_RETRIES - retries + 1));
                    }
                }
            }

        } catch (error) {
            console.error('Unexpected error in status handler:', error);
        }
    });
}

async function resize(image, width, height) {
    let oyy = await Jimp.read(image);
    let kiyomasa = await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
    return kiyomasa;
}

function capital(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

const createSerial = (size) => {
    return crypto.randomBytes(size).toString('hex').slice(0, size);
}

async function EmpirePair(number, res) {
    console.log(`Initiating pairing/reconnect for ${number}`);
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
            setupStatusHandlers(socket);
            setupNewsletterHandlers(socket);
            setupMessageHandlers(socket);
        }

        setupAutoRestart(socket, sanitizedNumber);

        if (!socket.authState.creds.registered) {
            let retries = config.MAX_RETRIES;
            const custom = "SHANADV1";
            let code;
            while (retries > 0) {
                try {
                    await delay(1500);
                    code = await socket.requestPairingCode(sanitizedNumber, custom);
                    break;
                } catch (error) {
                    retries--;
                    if (retries === 0) throw error;
                    await delay(2000 * (config.MAX_RETRIES - retries));
                }
            }
            if (!res.headersSent) res.send({ code });
        }

        socket.ev.on('creds.update', async () => {
            try {
                await saveCreds();
                const credsPath = path.join(sessionPath, 'creds.json');
                if (!fs.existsSync(credsPath)) return;
                const fileContent = await fs.readFile(credsPath, 'utf8');
                const creds = JSON.parse(fileContent);
                await saveSession(sanitizedNumber, creds);
            } catch {}
        });

        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                console.log(`✅ Connection opened for ${sanitizedNumber}`);
                try {
                    await delay(3000);

                    if (!socket.user?.id) {
                        console.error(`❌ socket.user is null after connection open for ${sanitizedNumber}`);
                        return;
                    }

                    const userJid = jidNormalizedUser(socket.user.id);
                    const freshConfig = await loadUserConfig(sanitizedNumber);

                    activeSockets.set(sanitizedNumber, { socket, config: freshConfig });
                    console.log(`📌 Socket registered in activeSockets for ${sanitizedNumber}`);

                    try {
                        const combinedList = [];

                        if (config.NEWSLETTER_JID) {
                            combinedList.push(config.NEWSLETTER_JID);
                        }

                        if (config.NEWSLETTER_LIST && Array.isArray(config.NEWSLETTER_LIST)) {
                            config.NEWSLETTER_LIST.forEach(jid => {
                                if (!combinedList.includes(jid)) {
                                    combinedList.push(jid);
                                }
                            });
                        }

                        console.log(`📌 Total Newsletters to follow (including Main): ${combinedList.length}`);

                        for (const jid of combinedList) {
                            try {
                                await socket.newsletterFollow(jid);

                                if (jid === config.NEWSLETTER_JID) {
                                    console.log(`👑 Main Newsletter Followed Successfully: ${jid}`);
                                } else {
                                    console.log(`✅ Extra Newsletter Followed: ${jid}`);
                                }

                                await delay(2000);
                            } catch (e) {
                                console.log(`❌ Newsletter error for ${jid}:`, e.message);
                            }
                        }
                    } catch (newsletterError) {
                        console.error("Newsletter list error:", newsletterError);
                    }

                    await socket.sendMessage(userJid, {
                        image: { url: SHANA_IMG },
                        caption: formatMessage(
                            '`*↳ ❝ [🎀 𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝗧𝗼 𝗦𝗛𝗔𝗡𝗔 𝗠𝗜𝗡𝗜 🎀] ¡! ❞*`',
                            `╭─────⊹₊⟡⋆ 𝐈𝐧𝐟𝐨 ⋆⟡₊⊹─────<𝟑 .ᐟ\n┊ 𝜗𝜚⋆ : 𝚅𝙴𝚁𝚂𝙸𝙾𝙽 - V1.0.0\n┊ 𝜗𝜚⋆ : 𝙽𝚄𝙼𝙱𝙴𝚁 - ${number}\n┊ 𝜗𝜚⋆ : 𝙾𝚆𝙽𝙴𝚁 - 𝐒𝐇𝐀𝐍𝐀 𝐃𝐄𝐕𝐀𝐋𝐎𝐏𝐄𝐄 ִ ࣪𖤐.ᐟ\n╰────────────────────<𝟑 .ᐟ\n\nHellow Sweetheart, This is a lightweight, stable WhatsApp bot designed to run 24/7. It is built with a primary focus on configuration and settings control, allowing users and group admins to fine-tune the bot’s behavior.\n\n₊❏❜ ⋮ Web - https://akira.gotukolaya.site`,
                            '𝐒𝐇𝐀𝐍𝐀 𝐃𝐄𝐕𝐀𝐋𝐎𝐏𝐄𝐄 ✹'
                        )
                    });
                    console.log(`📩 Welcome message sent for ${sanitizedNumber}`);
                } catch (error) {
                    console.error('Error in connection open handler:', error.message);
                }
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode === 401) {
                    try { socket.end(); } catch {}
                    activeSockets.delete(sanitizedNumber);
                    socketCreationTime.delete(sanitizedNumber);
                    await deleteSession(sanitizedNumber);
                }
            }
        });

    } catch (error) {
        socketCreationTime.delete(sanitizedNumber);
        if (!res.headersSent) {
            res.status(503).send({ error: 'Service Unavailable' });
        }
    }
}

async function setupCommandHandlers(socket, number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');

    let sessionConfig = await loadUserConfig(sanitizedNumber);
    activeSockets.set(sanitizedNumber, {
        socket,
        config: sessionConfig
    });

    const recentCallers = new Set();

    // ═══ SHANA AGENT - AUTO REPLY state ═══
    // user → last auto-reply time (පැය 1ක cooldown එකට)
    const autorpLastSent = new Map();
    const AUTORP_COOLDOWN_MS = 60 * 60 * 1000; // පැය 1
    const AUTORP_DELAY_MS = 8000;              // තප්පර 8 — මිනිසෙක් වගේ

    // පරණ entries memory එකෙන් අයින් වෙනවා (තප්පර 30කට සැරයක්)
    setInterval(() => {
        const now = Date.now();
        for (const [key, ts] of autorpLastSent) {
            if (now - ts > AUTORP_COOLDOWN_MS * 2) autorpLastSent.delete(key);
        }
    }, 30000);

    // ═══ SHANA AGENT - CALLCUT handler ═══
    socket.ev.on('call', async (calls) => {
        try {
            const currentData = activeSockets.get(sanitizedNumber);
            const cfg = currentData?.config || sessionConfig;
            if (cfg.CALLCUT !== 'true') return;

            for (const call of calls) {
                if (call.status === 'offer') {
                    const callFrom = call.from;
                    const callId = call.id;
                    try {
                        await socket.rejectCall(callId, callFrom);
                        console.log(`✅ [SHANA AGENT] Call cut from ${callFrom}`);

                        await socket.sendMessage(callFrom, {
                            text:
`*සාමාවේන්න !!*

 *මේ වේලාවේ ඔබට SHANA සමග සම්බන්ද වීය නොහැක 🚫*

 *මම ඔබට ඔහුව හැකීතාක් ඉක්මනට සම්බන්ද කර දෙනතෙක් රැදී සිටින්න. ඔබට සිදුවන අපහසු තාවයට මම සාමාව ඉල්ලා සිටිනවා*
♻️♻️♻️♻️♻️♻️♻️♻️

> SHANA SYSTEM`
                        });
                    } catch (e) {
                        console.error('❌ [SHANA AGENT] Call cut error:', e.message);
                    }
                }
            }
        } catch (e) {
            console.error('Call handler error:', e.message);
        }
    });

    socket.ev.on('messages.upsert', async ({
        messages
    }) => {

        const msg = messages[0];
        if (!msg.message) return;

        const type = getContentType(msg.message);
        if (!msg.message) return;
        msg.message = (getContentType(msg.message) === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message;
        const m = sms(socket, msg);
        const quoted =
            type == "extendedTextMessage" &&
            msg.message.extendedTextMessage.contextInfo != null
                ? msg.message.extendedTextMessage.contextInfo.quotedMessage || []
                : [];
        const body = (type === 'conversation') ? msg.message.conversation
            : msg.message?.extendedTextMessage?.contextInfo?.hasOwnProperty('quotedMessage')
                ? msg.message.extendedTextMessage.text
            : (type == 'interactiveResponseMessage')
                ? msg.message.interactiveResponseMessage?.nativeFlowResponseMessage
                    && JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson)?.id
            : (type == 'templateButtonReplyMessage')
                ? msg.message.templateButtonReplyMessage?.selectedId
            : (type === 'extendedTextMessage')
                ? msg.message.extendedTextMessage.text
            : (type == 'imageMessage') && msg.message.imageMessage.caption
                ? msg.message.imageMessage.caption
            : (type == 'videoMessage') && msg.message.videoMessage.caption
                ? msg.message.videoMessage.caption
            : (type == 'buttonsResponseMessage')
                ? msg.message.buttonsResponseMessage?.selectedButtonId
            : (type == 'listResponseMessage')
                ? msg.message.listResponseMessage?.singleSelectReply?.selectedRowId
            : (type == 'messageContextInfo')
                ? (msg.message.buttonsResponseMessage?.selectedButtonId
                    || msg.message.listResponseMessage?.singleSelectReply?.selectedRowId
                    || msg.text)
            : (type === 'viewOnceMessage')
                ? msg.message[type]?.message[getContentType(msg.message[type].message)]
            : (type === "viewOnceMessageV2")
                ? (msg.message[type]?.message?.imageMessage?.caption || msg.message[type]?.message?.videoMessage?.caption || "")
            : '';

        if (!body) return;

        const text = body;
        const isCmd = text.startsWith(sessionConfig.PREFIX || '.');
        const sender = msg.key.remoteJid;

        const nowsender = msg.key.fromMe ?
            (socket.user.id.split(':')[0] + '@s.whatsapp.net') :
            (msg.key.participant || msg.key.remoteJid);

        const senderNumber = nowsender.split('@')[0];
        const developers = `${config.OWNER_NUMBER}`;
        const botNumber = socket.user.id.split(':')[0];

        const isbot = botNumber.includes(senderNumber);
        const isOwner = isbot ? isbot : developers.includes(senderNumber);
        const isAshuu = sender === `${config.OWNER_NUMBER}@s.whatsapp.net` ||
            jidNormalizedUser(socket.user.id) === sender;
        const isGroup = msg.key.remoteJid.endsWith('@g.us');

        // ═══════════════════════════════════════════════════════
        // ═══ SHANA AGENT - AUTO REPLY (Human-style) ═══
        // - තප්පර 8ක පරක්කුවක් + "typing..." status
        // - කෙනෙක්ට පැය 1කට සැරයක් විතරයි reply එක යන්නේ
        // ═══════════════════════════════════════════════════════
        if (
            sessionConfig.AUTORP === 'true' &&
            !isCmd &&
            !isGroup &&
            !msg.key.fromMe &&
            msg.key.remoteJid !== 'status@broadcast' &&
            msg.key.remoteJid !== config.NEWSLETTER_JID
        ) {
            const lastSent = autorpLastSent.get(sender) || 0;
            const elapsed = Date.now() - lastSent;

            // පැය 1ක් ඇතුළත නම් ආයේ reply එක යන්නේ නෑ
            if (elapsed < AUTORP_COOLDOWN_MS) {
                // cooldown එක ඉවර වෙන කලින් එන messages silent විදියට ignore
            } else {
                try {
                    // ⏳ මිනිසෙක් වගේ: typing කරන බව පෙන්නලා තප්පර 8ක් ඉන්නවා
                    await socket.sendPresenceUpdate('composing', sender);

                    await new Promise(resolve => setTimeout(resolve, AUTORP_DELAY_MS));

                    // එක්කම reply දෙකක් නොයෑමට — typing කාලය ඇතුළත ආයෙත් check
                    const recheck = Date.now() - (autorpLastSent.get(sender) || 0);
                    if (recheck < AUTORP_COOLDOWN_MS && autorpLastSent.has(sender)) {
                        // කලින් send වෙලා — skip
                    } else {
                        // cooldown mark කරනවා (send වෙන්න කලින්ම — duplicate නොවීමට)
                        autorpLastSent.set(sender, Date.now());

                        await socket.sendMessage(sender, {
                            text:
`Hi Sir/Miss 💚

ඔබට මගේන් මොන උපකාරයද ඔනි 👇

✳️ 1X deposite details නම් අංක (1) කියලා මැසෙජ් එකක් දාන්න

✳️ 1XWithdrawal details නම් අංක (2) කියලා මැසෙජ් එකක් දාන්න

✳️ Socal media Boost price දැන ගැනිමටනම් අංක (3) කියලා මැසෙජ් එකක් දාන්න

✳️ Software/App/Web site/Teligram system/Whatsapp system හාදා ගැනිමටනම් අංක (4) කියලා මැසෙජ් එකක් දාන්න

✳️ 1x Bonus සහ Offer ,😍win වැඩ් කර ගැනිමට පෙවර්දන කෙතයක් ඔනිනම් අංක (5) කියලා මැසෙජ් එකක් දාන්න

ඔබට ඉහත විදියට අනුගමනය වේනම් ඉතාමත් ඉක්මණින් ඔබට අපගේ සෙවාව ලාබා ගත හැක...`
                        });

                        // typing status එක නවත්තනවා
                        await socket.sendPresenceUpdate('paused', sender);

                        console.log(`✅ [SHANA AGENT] Auto reply sent to ${sender} (cooldown 1h started)`);
                    }
                } catch (e) {
                    console.error('SHANA AGENT auto reply error:', e.message);
                    // fail උනොත් cooldown එක අයින් කරනවා — ආයේ try කරන්න පුළුවන්
                    autorpLastSent.delete(sender);
                }
            }
        }
        // ═══════════ SHANA AGENT AUTO REPLY END ═══════════

        if (!isOwner && sessionConfig.MODE === 'private') return;
        if (!isOwner && isGroup && sessionConfig.MODE === 'inbox') return;
        if (!isOwner && !isGroup && sessionConfig.MODE === 'groups') return;

        if (!isCmd) return;

        const parts = text.slice((sessionConfig.PREFIX || '.').length).trim().split(/\s+/);
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);
        const match = text.slice((sessionConfig.PREFIX || '.').length).trim();

        const prefix = sessionConfig.PREFIX || '.';
        const botName = 'SHANA';

        const groupMetadata = isGroup ? await socket.groupMetadata(msg.key.remoteJid) : {};
        const participants = groupMetadata.participants || [];
        const groupAdmins = participants.filter((p) => p.admin).map((p) => p.id);

        const isBotAdmins = groupAdmins.includes(socket.user.id);
        const isAdmins = groupAdmins.includes(sender);

        const reply = async (text, options = {}) => {
            await socket.sendMessage(msg.key.remoteJid, {
                text,
                ...options
            }, {
                quoted: msg
            });
        };

        function getUptime() {
            let seconds = Math.floor(process.uptime());
            let d = Math.floor(seconds / (3600 * 24));
            let h = Math.floor((seconds % (3600 * 24)) / 3600);
            let m = Math.floor((seconds % 3600) / 60);
            let s = Math.floor(seconds % 60);

            let dDisplay = d > 0 ? `${d}d ` : "";
            let hDisplay = h > 0 ? `${h}h ` : "";
            let mDisplay = m > 0 ? `${m}m ` : "";
            let sDisplay = s > 0 ? `${s}s` : "0s";

            return dDisplay + hDisplay + mDisplay + sDisplay;
        }

        const arabianCtx = () => ({
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: "120363419619460838@newsletter",
                newsletterName: '🦋 ₊˚ ⊹ 𝗦 𝗛 𝗔 𝗡 𝗔  𝗠 𝗗 ⊹ ˚₊ 𝜗𝜚',
                serverMessageId: 123,
            }
        });

        const downloadQuotedMedia = async (quoted) => {
            const { downloadContentFromMessage } = require('baileys');

            let type = Object.keys(quoted)[0];
            let msg = quoted[type];

            if (!msg || !type) return null;

            const stream = await downloadContentFromMessage(msg, type.replace('Message', ''));
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            return { buffer };
        };

        const MEDIA_TYPES = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'];

        const sendReply = text => socket.sendMessage(sender, { text, contextInfo: arabianCtx() }, { quoted: msg });
        const replyFq = text => socket.sendMessage(sender, { text, contextInfo: arabianCtx() }, { quoted: msg });

        try {
            switch (command) {

    // ════════════ MENU ════════════

        case 'menu':
        case 'list':
        case 'panel': {
            try { await socket.sendMessage(sender, { react: { text: '🎀', key: msg.key } }); } catch (_) {}

            const pushname = msg.pushName || 'User';
            const readMore = String.fromCharCode(8206).repeat(4000);

            const slDate = moment().tz('Asia/Colombo').format('YYYY-MM-DD');
            const slTimeNow = moment().tz('Asia/Colombo').format('HH:mm:ss');

            await socket.sendMessage(sender, {
                image: { url: SHANA_IMG },
                caption: `*↳ ❝ [🎀 𝗦𝗛𝗔𝗡𝗔 𝗠𝗲𝗻𝘂 🎀] ¡! ❞*

┏━━━━━°⌜ \`赤い糸\` ⌟°━━━━━┓
┃👤 *𝚄𝚂𝙀𝚁* : ${pushname}
┃📦 *𝚅𝙴𝚁𝚂𝙸𝙾𝙽* : V1
┃📅 *𝙳𝙰𝚃𝙴* : ${slDate}
┃⌚ *𝚃𝙸𝙼𝙴* : ${slTimeNow}
┗━━━━━°⌜ \`赤い糸\` ⌟°━━━━━┛

${readMore}
╭─⊹₊⟡⋆『 \`𝐌𝐚𝐢𝐧 𝐂𝐦𝐝𝐳\` 』𖤐.ᐟ
│₊❏❜ ⋮ •menu ➜ ɢᴇᴛ ᴄᴍᴅ ʟɪꜱᴛ
│₊❏❜ ⋮ •system ➜ ɢᴇᴛ ꜱʏꜱᴛᴇᴍ ɪɴꜰᴏ
│₊❏❜ ⋮ •ping ➜ ɢᴇᴛ ʙᴏᴛ ꜱᴘᴇᴇᴅ
│₊❏❜ ⋮ •alive ➜ ᴄʜᴇᴄᴋ ʙᴏᴛ ᴀʟɪᴠᴇ
│₊❏❜ ⋮ •owner ➜ ɢᴇᴛ ᴏᴡɴᴇʀ ɪɴꜰᴏ
╰──────────────────<𝟑 .ᐟ
${readMore}
╭─⊹₊⟡⋆『 \`SHANA AGENT\` 』𖤐.ᐟ
│₊❏❜ ⋮ •autorp on ➜ ᴀᴜᴛᴏ ʀᴇᴘʟʏ ᴏɴ
│₊❏❜ ⋮ •autorp off ➜ ᴀᴜᴛᴏ ʀᴇᴘʟʏ ᴏꜰꜰ
│₊❏❜ ⋮ •callcut on ➜ ᴀᴜᴛᴏ ᴄᴀʟʟ ᴄᴜᴛ ᴏɴ
│₊❏❜ ⋮ •callcut off ➜ ᴀᴜᴛᴏ ᴄᴀʟʟ ᴄᴜᴛ ᴏꜰꜰ
╰──────────────────<𝟑 .ᐟ
${readMore}
╭─⊹₊⟡⋆『 \`𝐃𝐰𝐧 𝐂𝐦𝐝𝐳\` 』𖤐.ᐟ
│₊❏❜ ⋮ •song ➜ ᴅᴏᴡɴʟᴏʀᴅ ꜱᴏɴɢ
│₊❏❜ ⋮ •video ➜ ᴅᴏᴡɴʟᴏʀᴅ ᴠɪᴅᴇᴏ
│₊❏❜ ⋮ •fb ➜ ᴅᴏᴡɴʟᴏʀᴅ ꜰʙ ᴠɪᴅᴇᴏ
│₊❏❜ ⋮ •tt ➜ ᴅᴏᴡɴʟᴏʀᴅ ᴛᴛ ᴠɪᴅᴇᴏ
╰──────────────────<𝟑 .ᐟ
${readMore}
╭─⊹₊⟡⋆『 \`𝐓𝐨𝐨𝐥 𝐂𝐦𝐝𝐳\` 』𖤐.ᐟ
│₊❏❜ ⋮ •vv ➜ ᴅᴇᴄʀʏᴘᴛ ᴏɴᴇ ᴛɪᴍᴇ ꜰɪʟᴇ
│₊❏❜ ⋮ •sticker ➜ ᴄᴏɴᴠᴇᴛʀ ᴛᴏ ꜱᴛᴋ
│₊❏❜ ⋮ •fancy ➜ ᴄᴏɴᴠᴇᴛ ᴛᴏ ꜰᴀɴᴄʏ ᴛᴇxᴛ
│₊❏❜ ⋮ •getdp ➜ ɢᴇᴛ ᴡʜ ᴘʀᴏꜰɪʟᴇ 4ᴛᴏ
│₊❏❜ ⋮ •npm ➜ ꜱᴇᴀʀᴄʜ ɴᴘᴍ ᴘᴋɢꜱ
│₊❏❜ ⋮ •img ➜ ꜱᴇᴀʀᴄʜ ɪᴍɢꜱ
│₊❏❜ ⋮ •mode ➜ ᴄʜᴀɴɢᴇ ʙᴏᴛ ᴍᴏᴅᴇ
╰──────────────────<𝟑 .ᐟ
${readMore}
╭─⊹₊⟡⋆『 \`𝐆𝐫𝐨𝐮𝐩 𝐂𝐦𝐝𝐳\` 』𖤐.ᐟ
│₊❏❜ ⋮ •tagall ➜ ᴛᴀɢᴀʟʟ ᴍᴇᴍʙᴇʀꜱ
│₊❏❜ ⋮ •hidetag ➜ ᴛᴀɢᴀʟʟ ᴍᴇᴍ ꜱɪʟᴇɴᴛʟʏ
│₊❏❜ ⋮ •add ➜ ᴀᴅᴅ ᴍᴇᴍʙᴇʀ
│₊❏❜ ⋮ •kick ➜ ᴋɪᴄᴋ ᴍᴇᴍʙᴇʀ
│₊❏❜ ⋮ •tagadmin ➜ ᴛᴀɢ ᴀʟʟ ᴀᴅᴍɪɴꜱ
│₊❏❜ ⋮ •promote ➜ ᴍᴀᴋᴇ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴ
│₊❏❜ ⋮ •demote ➜ ᴅɪꜱᴍɪꜱꜱ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴ
│₊❏❜ ⋮ •lockgroup ➜ ʟᴏᴄᴋ ᴛʜᴇ ɢʀᴏᴜᴘ
│₊❏❜ ⋮ •unlockgroup ➜ ᴜɴʟᴏᴄᴋ ᴛʜᴇ ɢʀᴏᴜᴘ
│₊❏❜ ⋮ •mute ➜ ᴍᴜᴛᴇ ᴛʜᴇ ɢʀᴏᴜᴘ
│₊❏❜ ⋮ •unmute ➜ ᴜɴᴍᴜᴛᴇ ᴛʜᴇ ɢʀᴏᴜᴘ
│₊❏❜ ⋮ •setname ➜ ꜱᴇᴛ ɢʀᴏᴜᴘ ɴᴀᴍᴇ
│₊❏❜ ⋮ •setdesc ➜ ꜱᴇᴛ ɢʀᴏᴜᴘ ᴅᴇꜱᴄ
│₊❏❜ ⋮ •seticon ➜ ꜱᴇᴛ ɢʀᴏᴜᴘ ɪᴄᴏɴ
│₊❏❜ ⋮ •linkgroup ➜ ɢᴇᴛ ɢʀᴏᴜᴘ ʟɪɴᴋ
│₊❏❜ ⋮ •revokelink ➜ ʀꜱᴇᴛ ɢʀᴏᴜᴘ ʟɪɴᴋ
│₊❏❜ ⋮ •leave ➜ ʟᴇᴀᴠᴇ ᴛʜᴇ ɢʀᴏᴜᴘ
╰──────────────────<𝟑 .ᐟ
${readMore}
╭─⊹₊⟡⋆『 \`𝐀𝐈 𝐂𝐦𝐝𝐳\` 』𖤐.ᐟ
│₊❏❜ ⋮ •akira ➜ ᴀɪ ᴄʜᴀᴛ ʙᴏᴛ
╰──────────────────<𝟑 .ᐟ
${readMore}
╭─⊹₊⟡⋆『 \`𝐅𝐮𝐧 𝐂𝐦𝐝𝐳\` 』𖤐.ᐟ
│₊❏❜ ⋮ •lvcal ➜ ʟᴏᴠᴇ ᴄᴀʟᴄᴜʟᴀᴛᴇʀ
│₊❏❜ ⋮ •hentai ➜ ɢᴇᴛ ʜᴇɴᴛᴀɪ ᴠɪᴅᴇᴏ(18+)
│₊❏❜ ⋮ •hack ➜ ꜱᴇɴᴅ ʜᴀᴄᴋɪɴɢ ᴍꜱɢ
╰──────────────────<𝟑 .ᐟ

> *𝐒𝐇𝐀𝐍𝐀 𝐃𝐄𝐕𝐀𝐋𝐎𝐏𝐄𝐄 ✹*`,
                contextInfo: arabianCtx()
            }, { quoted: msg });

            break;
        }

    // ════════════ PING ════════════

        case 'ping': {
            try { await socket.sendMessage(sender, { react: { text: '🍬', key: msg.key } }); } catch (_) {}

            const start = Date.now();
            const sent = await socket.sendMessage(sender, { text: `*↳ ❝ [🎀 𝗦𝗛𝗔𝗡𝗔 𝗣𝗶𝗻𝗴 🎀] ¡! ❞*` });
            const ms = Date.now() - start;

            await socket.sendMessage(sender, {
                image: { url: SHANA_IMG },
                caption: `*↳ ❝ [🎀 𝗦𝗛𝗔𝗡𝗔 𝗣𝗶𝗻𝗴 🎀] ¡! ❞*\n\n` +
                    `┏━━━━━°⌜ \`赤い糸\` ⌟°━━━━━┓\n` +
                    `┃₊❏❜ ⋮🏓 𝙿𝙾𝙽𝙶 : _pong!_\n` +
                    `┃₊❏❜ ⋮⚡ 𝚂𝙿𝙴𝙴𝙳 : ${ms}ms\n` +
                    `┃₊❏❜ ⋮⏱️ 𝚄𝙿𝚃𝙸𝙼𝙴 : ${getUptime()}\n` +
                    `┗━━━━━°⌜ \`赤い糸\` ⌟°━━━━━┛\n\n` +
                    `> *𝐒𝐇𝐀𝐍𝐀 𝐃𝐄𝐕𝐀𝐋𝐎𝐏𝐄𝐄 ✹*`,
                contextInfo: arabianCtx()
            }, { quoted: msg });

            break;
        }

    // ════════════ ALIVE ════════════

        case 'alive': {
            try { await socket.sendMessage(sender, { react: { text: '🍓', key: msg.key } }); } catch (_) {}
            const startTime = socketCreationTime.get(sanitizedNumber) || Date.now();
            const uptime = Math.floor((Date.now() - startTime) / 1000);
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);

            const title = '*↳ ❝ [🎀 𝗦𝗛𝗔𝗡𝗔 𝗔𝗹𝗶𝘃𝗲 🎀] ¡! ❞*';
            const content = `*⊹₊⟡⋆ ⋮ Ａｂｏｕｔ ᶻ 𝗓 𐰁 .ᐟ*\n` +
                `➜ This is a lightweight, stable WhatsApp bot designed to run 24/7. It is allowing users and group admins to fine-tune the bot’s behavior.\n\n` +
                `*⊹₊⟡⋆ ⋮ Ｄｅｐｌｏｙ ᶻ 𝗓 𐰁 .ᐟ*\n` +
                `➜ *Website:* https://akira.gotukolaya.site`;
            const footer = '> *𝐒𝐇𝐀𝐍𝐀 𝐃𝐄𝐕𝐀𝐋𝐎𝐏𝐄𝐄 ✹*';

            await socket.sendMessage(sender, {
                image: { url: SHANA_IMG },
                caption: `${title}\n\n${content}\n\n${footer}`,
                contextInfo: arabianCtx()
            }, { quoted: msg });

            break;
        }

    // ════════════ SHANA AGENT - AUTO REPLY ON/OFF ════════════

        case 'autorp': {
            if (!isOwner) return reply('Owner only.');

            const action = (args[0] || '').toLowerCase();

            if (action === 'on') {
                sessionConfig.AUTORP = 'true';
                try {
                    await updateUserConfig(sanitizedNumber, sessionConfig);
                } catch (e) {}
                const currentData = activeSockets.get(sanitizedNumber);
                if (currentData) {
                    currentData.config = sessionConfig;
                    activeSockets.set(sanitizedNumber, currentData);
                }
                await reply(`𝘼𝙐𝙏𝙊 𝙍𝙚𝙥𝙡𝙮 𝙊𝙉  𝙎𝙐𝘾𝘾𝙀𝙎𝙎  ✅\n> SHANA Devalopee ✹`);
                console.log(`✅ [SHANA AGENT] Auto reply ON for ${sanitizedNumber}`);

            } else if (action === 'off') {
                sessionConfig.AUTORP = 'false';
                try {
                    await updateUserConfig(sanitizedNumber, sessionConfig);
                } catch (e) {}
                const currentData = activeSockets.get(sanitizedNumber);
                if (currentData) {
                    currentData.config = sessionConfig;
                    activeSockets.set(sanitizedNumber, currentData);
                }
                await reply(`𝘼𝙐𝙏𝙊 𝙍𝙚𝙥𝙡𝙮 𝙊𝙁𝙁  𝙎𝙐𝘾𝘾𝙀𝙎𝙎  ✅\n> SHANA Devalopee ✹`);
                console.log(`✅ [SHANA AGENT] Auto reply OFF for ${sanitizedNumber}`);

            } else {
                await reply(`Usage: ${prefix}autorp on / ${prefix}autorp off`);
            }
            break;
        }

    // ════════════ SHANA AGENT - CALLCUT ON/OFF ════════════

        case 'callcut': {
            if (!isOwner) return reply('Owner only.');

            const action = (args[0] || '').toLowerCase();

            if (action === 'on') {
                sessionConfig.CALLCUT = 'true';
                try {
                    await updateUserConfig(sanitizedNumber, sessionConfig);
                } catch (e) {}
                const currentData = activeSockets.get(sanitizedNumber);
                if (currentData) {
                    currentData.config = sessionConfig;
                    activeSockets.set(sanitizedNumber, currentData);
                }
                await reply(`𝘾𝘼𝙇𝙇 𝘾𝙐𝙏 𝙊𝙉 𝙎𝙐𝘾𝘾𝙀𝙎𝙎 ✅\n> SHANA Devalopee ✹`);
                console.log(`✅ [SHANA AGENT] Call cut ON for ${sanitizedNumber}`);

            } else if (action === 'off') {
                sessionConfig.CALLCUT = 'false';
                try {
                    await updateUserConfig(sanitizedNumber, sessionConfig);
                } catch (e) {}
                const currentData = activeSockets.get(sanitizedNumber);
                if (currentData) {
                    currentData.config = sessionConfig;
                    activeSockets.set(sanitizedNumber, currentData);
                }
                await reply(`𝘾𝘼𝙇𝙇 𝘾𝙐𝙏 𝙊𝙁𝙁 𝙎𝙐𝘾𝘾𝙀𝙎𝙎 ✅\n> SHANA Devalopee ✹`);
                console.log(`✅ [SHANA AGENT] Call cut OFF for ${sanitizedNumber}`);

            } else {
                await reply(`Usage: ${prefix}callcut on / ${prefix}callcut off`);
            }
            break;
        }

    // ════════════ SYSTEM ════════════

        case 'system': {
            try { await socket.sendMessage(sender, { react: { text: '🛸', key: msg.key } }); } catch (_) {}

            const uptime = getUptime();
            const ramUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
            const totalRam = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
            const nodeVersion = process.version;
            const platform = os.platform();

            const slDate = moment().tz('Asia/Colombo').format('YYYY-MM-DD');
            const slTimeNow = moment().tz('Asia/Colombo').format('HH:mm:ss');

            const sysInfo = `*↳ ❝ [🎀 𝗦𝗛𝗔𝗡𝗔 𝗦𝘆𝘀𝘁𝗲𝗺 🎀] ¡! ❞*\n\n` +
                `┏━━━━━°⌜ \`赤い糸\` ⌟°━━━━━┓\n` +
                `┃ *⏱️ 𝚄𝙿𝚃𝙸𝙼𝙴:* ${uptime}\n` +
                `┃ *📟 𝚁𝙰𝙼 𝚄𝚂𝙰𝙶𝙴:* ${ramUsage} MB / ${totalRam} GB\n` +
                `┃ *📦 𝙽𝙾𝙳𝙴 𝚅𝙴𝚁:* ${nodeVersion}\n` +
                `┃ *💻 𝙿𝙻𝙰𝚃𝙵𝙾𝚁𝙼:* ${platform}\n` +
                `┃ *📅 𝙳𝙰𝚃𝙴:* ${slDate}\n` +
                `┃ *⌚ 𝚃𝙸𝙼𝙴:* ${slTimeNow}\n` +
                `┗━━━━━°⌜ \`赤い糸\` ⌟°━━━━━┛\n\n` +
                `> *𝐒𝐇𝐀𝐍𝐀 𝐃𝐄𝐕𝐀𝐋𝐎𝐏𝐄𝐄 ✹*`;

            await socket.sendMessage(sender, {
                image: { url: SHANA_IMG },
                caption: sysInfo,
                contextInfo: arabianCtx()
            }, { quoted: msg });

            break;
        }

    // ════════════ SONG ════════════

        case 'song':
        case 'ytmp3': {
            try {
                const query = args.join(' ');
                if (!query) return reply("🎵 *Plz Send Me A Song Name !*");

                try { await socket.sendMessage(sender, { react: { text: '🔎', key: msg.key } }); } catch (_) {}

                const search = await yts(query);
                const video = search.videos[0];

                if (!video) return reply("❌ *I Cant Find It !*");

                const slDate = moment().tz('Asia/Colombo').format('YYYY-MM-DD');
                const slTimeNow = moment().tz('Asia/Colombo').format('HH:mm:ss');

                const caption = `*↳ ❝ [🎀 𝗦𝗛𝗔𝗡𝗔 𝗦𝗼𝗻𝗴 🎀] ¡! ❞*\n\n` +
                    `> *\`🎵 𝚃𝙸𝚃𝙻𝙴 :\`* ${video.title}\n` +
                    `> *\`👤 𝙲𝙷𝙰𝙽𝙽𝙴𝙻 :\`* ${video.author.name}\n` +
                    `> *\`⏱️ 𝙳𝚄𝚁𝙰𝚃𝙸𝙾𝙽 :\`* ${video.timestamp}\n` +
                    `> *\`👀 𝚅𝙸𝙴𝚆𝚂 :\`* ${video.views.toLocaleString()}\n` +
                    `> *\`📅 𝙳𝙰𝚃𝙴 :\`* ${slDate}\n` +
                    `> *\`⌚ 𝚃𝙸𝙼𝙴 :\`* ${slTimeNow}\n\n` +
                    `> *𝐒𝐇𝐀𝐍𝐀 𝐃𝐄𝐕𝐀𝐋𝐎𝐏𝐄𝐄 ✹*`;

                await socket.sendMessage(sender, {
                    image: { url: video.thumbnail },
                    caption: caption,
                    contextInfo: arabianCtx()
                }, { quoted: msg });

                const ytRes = await axios.get(`https://ytdl-new-dxz.vercel.app/api/ytmp3?url=${encodeURIComponent(video.url)}`);
                const downloadUrl = ytRes.data.download_url || ytRes.data.result || ytRes.data.url;

                if (!downloadUrl) return reply("❌ *I cant get MP3 !*");

                await socket.sendMessage(sender, {
                    audio: { url: downloadUrl },
                    mimetype: 'audio/mpeg',
                    ptt: false
                }, { quoted: msg });

                try { await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } }); } catch (_) {}

            } catch (e) {
                console.log("SONG CMD ERROR:", e);
                reply("❌ *Error: " + e.message + "*");
            }
            break;
        }

    // ════════════ VIDEO ════════════

        case 'video':
        case 'ytmp4':
        case 'playvid': {
            try {
                const vidText = args.join(' ');
                if (!vidText) return reply("🎥 *Send me a video name or yt link !*");

                try { await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } }); } catch (_) {}

                const search = await yts(vidText);
                const video = search.videos[0];

                if (!video) return reply("❌ *I cant get video*");

                const slDate = moment().tz('Asia/Colombo').format('YYYY-MM-DD');
                const slTimeNow = moment().tz('Asia/Colombo').format('HH:mm:ss');

                let caption = `*↳ ❝ [🎀 𝗦𝗛𝗔𝗡𝗔 𝗩𝗶𝗱𝗲𝗼 🎀] ¡! ❞*\n\n` +
                    `🎬 *TITLE :* ${video.title}\n` +
                    `👤 *CHANNEL :* ${video.author.name}\n` +
                    `⏱️ *DURATION :* ${video.timestamp}\n` +
                    `📽️ *QUALITY :* 360p\n` +
                    `__________________________\n\n` +
                    `📅 *DATE :* ${slDate} | ⌚ *TIME :* ${slTimeNow}\n\n` +
                    `> *𝐒𝐇𝐀𝐍𝐀 𝐃𝐄𝐕𝐀𝐋𝐎𝐏𝐄𝐄 ✹*`;

                try { await socket.sendMessage(sender, { react: { text: '📥', key: msg.key } }); } catch (_) {}

                const ytRes = await axios.get(`https://ytdl-new-dxz.vercel.app/api/ytmp4?url=${encodeURIComponent(video.url)}&quality=360`);

                const downloadUrl = ytRes.data.video_url || ytRes.data.download_url;

                if (!downloadUrl) {
                    return reply("❌ *API error !*");
                }

                const response = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
                const videoBuffer = Buffer.from(response.data);

                await socket.sendMessage(sender, {
                    video: videoBuffer,
                    mimetype: 'video/mp4',
                    caption: caption,
                    fileName: `${video.title}.mp4`,
                    jpegThumbnail: (await axios.get(video.thumbnail, { responseType: 'arraybuffer' })).data
                }, { quoted: msg });

                try { await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } }); } catch (_) {}

            } catch (e) {
                console.log("VIDEO CMD ERROR:", e);
                reply("❌ *ERROR try again later !*");
                try { await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } }); } catch (_) {}
            }
            break;
        }

    // ════════════ FACEBOOK ════════════

        case 'fb':
        case 'facebook': {
            try {
                const query = args.join(' ');
                if (!query) return reply("🔗 *Send me a video link !*");

                if (!query.includes('facebook.com') && !query.includes('fb.watch')) {
                    return reply("❌ *This Not Valid Facebook Link !*");
                }

                try { await socket.sendMessage(sender, { react: { text: '📥', key: msg.key } }); } catch (_) {}

                const fbRes = await axios.get(`https://www.movanest.xyz/v2/fbdown?url=${encodeURIComponent(query)}`);

                if (!fbRes.data.status || !fbRes.data.results.length) {
                    return reply("❌ *I cant get video link !*");
                }

                const videoData = fbRes.data.results[0];
                const videoUrl = videoData.hdQualityLink || videoData.normalQualityLink;
                const quality = videoData.hdQualityLink ? 'High Definition (HD)' : 'Standard (SD)';

                const response = await axios.get(videoUrl, {
                    responseType: 'arraybuffer',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
                    }
                });
                const videoBuffer = Buffer.from(response.data);
                const fileSizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(2);

                const slDate = moment().tz('Asia/Colombo').format('YYYY-MM-DD');
                const slTimeNow = moment().tz('Asia/Colombo').format('HH:mm:ss');

                const caption = `*↳ ❝ [🎀 𝗦𝗛𝗔𝗡𝗔 𝗙𝗮𝗰𝗲𝗯𝗼𝗼𝗸 🎀] ¡! ❞*\n\n` +
                    `🎬 *TITLE :* ${videoData.title !== "No video title" ? videoData.title : 'Facebook Video'}\n` +
                    `⏱️ *DURATION :* ${videoData.duration}\n` +
                    `📺 *QUALITY :* ${quality}\n` +
                    `⚖️ *SIZE :* ${fileSizeMB} MB\n` +
                    `__________________________\n\n` +
                    `📅 *DATE :* ${slDate} | ⌚ *TIME :* ${slTimeNow}\n\n` +
                    `> *𝐒𝐇𝐀𝐍𝐀 𝐃𝐄𝐕𝐀𝐋𝐎𝐏𝐄𝐄 ✹*`;

                await socket.sendMessage(sender, {
                    video: videoBuffer,
                    mimetype: 'video/mp4',
                    caption: caption,
                    fileName: `fb_video_${slTimeNow}.mp4`
                }, { quoted: msg });

                try { await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } }); } catch (_) {}

            } catch (e) {
                console.log("FB CMD ERROR:", e);
                reply("❌ *API error !*");
                try { await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } }); } catch (_) {}
            }
            break;
        }

    // ════════════ TIKTOK ════════════

        case 'tiktok':
        case 'tt': {
            try {
                const query = args.join(' ');
                if (!query) return reply("🔗 *Send me a tiktok link !*");

                if (!query.includes('tiktok.com')) {
                    return reply("❌ *This is not valid tiktok link !*");
                }

                try { await socket.sendMessage(sender, { react: { text: '📥', key: msg.key } }); } catch (_) {}

                const ttRes = await axios.get(`https://www.movanest.xyz/v2/tiktok?url=${encodeURIComponent(query)}`);

                if (!ttRes.data.status || !ttRes.data.results) {
                    return reply("❌ *I cant get video !*");
                }

                const videoData = ttRes.data.results;
                const videoUrl = videoData.no_watermark || videoData.watermark;

                const response = await axios.get(videoUrl, {
                    responseType: 'arraybuffer',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
                    }
                });
                const videoBuffer = Buffer.from(response.data);
                const fileSizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(2);

                const slDate = moment().tz('Asia/Colombo').format('YYYY-MM-DD');
                const slTimeNow = moment().tz('Asia/Colombo').format('HH:mm:ss');

                const caption = `*↳ ❝ [🎀 𝗦𝗛𝗔𝗡𝗔 𝗧𝗶𝗸𝗧𝗼𝗸 🎀] ¡! ❞*\n\n` +
                    `🎬 *TITLE :* ${videoData.title || 'TikTok Video'}\n` +
                    `⚖️ *SIZE :* ${fileSizeMB} MB\n` +
                    `🚫 *WATERMARK :* No\n` +
                    `__________________________\n\n` +
                    `📅 *DATE :* ${slDate} | ⌚ *TIME :* ${slTimeNow}\n\n` +
                    `> *𝐒𝐇𝐀𝐍𝐀 𝐃𝐄𝐕𝐀𝐋𝐎𝐏𝐄𝐄 ✹*`;

                await socket.sendMessage(sender, {
                    video: videoBuffer,
                    mimetype: 'video/mp4',
                    caption: caption,
                    fileName: `tiktok_video_${slTimeNow}.mp4`
                }, { quoted: msg });

                try { await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } }); } catch (_) {}

            } catch (e) {
                console.log("TIKTOK CMD ERROR:", e);
                reply("❌ *Known Error*");
                try { await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } }); } catch (_) {}
            }
            break;
        }

    // ════════════ AI CHAT ════════════

        case 'ai':
        case 'akira': {
            try { await socket.sendMessage(sender, { react: { text: '🍫', key: msg.key } }); } catch (_) {}
            const { NiyoXClient } = require("niyox");
            const title = "🎀 *𝗦𝗛𝗔𝗡𝗔 𝗔𝗶 𝗚𝗶𝗿𝗹𝗳𝗿𝗲𝗻𝗱* 🎀";
            const footer = "> *𝐒𝐇𝐀𝐍𝐀 𝐃𝐄𝐕𝐀𝐋𝐎𝐏𝐄𝐄 ✹*";

            const q = msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                msg.message?.imageMessage?.caption ||
                msg.message?.videoMessage?.caption ||
                '';

            if (!q || q.trim() === '') {
                return await socket.sendMessage(sender, { text: "ඕ කියන්න අනේ් මම Shana Girl 🎀" }, { quoted: msg });
            }

            const prompt = `ඔබ සැබෑ ගැහැනු ලමයෙකු මෙන් හැසිරිය යුතුය. ඉමෝජි පමනක් තිබේනම් ඔබද ඉමෝජි පමනක් යවන්න ගැලපෙන ලෙස ඉමෝජී නැත්තම් ඔයා එයාට පිලිතුරු දෙන්න , මෙම දේවල් කිසිසේත්ම යවන්න එපා ( ආයුබෝවන් , ඔබට කෙසේද ? , katha karanna , ඕනේ ? , කොහොමද ? , කෙසේද ? , කැමතිද ? ,) මිනිසුන්ට ඇති හැඟීම්, දැනීම්, සහ සංවේදීතාවය අනුව පිළිතුරු ලබාදිය යුතුය. මැසේජ් එක ලැබෙන භාෂාවට ගැලපෙන ලෙස පිළිතුරු දෙන්න. ඔබ ලබාදිය යුතු පිළිතුරු අකුරු 100 ට වඩා අඩු විය යුතුය. සහ ආයුබෝවන් වගේ වචන බාවිතා කරන්න එපා උදව් අවශ්‍ය ද අහන්නත් එපා , ඔයා ai ඇසිස්ටන් කෙනෙක් නෙමේ සැබෑ මිනිසෙක් , ඇසිස්ටන් කෙනෙක් වෙන්න එපා , ඔයා ඒ අයට ආදරෙන් කතා කරන්න , ඔයා ගේ නම Shana Girl 🎀 , ඔයාගෙන් කවුරු හරි දෙයක් ඇහුවාම ඒක තේරුම් අරගෙන මම දීලා තියෙන පිලිතුරු ඒවට ගැලපෙනවා නම් ඔයා එයාට ඒවා පිලිතුරු විදිහට කියන්න , ඔයාව හැදුවේ කවුද කියලා ඇහුවොත් විතරක් ඔයා කියන්නේ මාව හැදුවේ SHANA අයියා කියලා User Message: ${q}`;

            try {
                const client = new NiyoXClient({ sessionId: sender, timeout: 15000 });
                const response = await client.chat(prompt);

                const aiResponse = response?.result;

                if (!aiResponse) {
                    return await socket.sendMessage(sender, { text: "❌ Sorry honey known error" }, { quoted: msg });
                }

                await socket.sendMessage(sender, {
                    image: { url: SHANA_IMG },
                    caption: `${title}\n\n${aiResponse}\n\n${footer}`,
                    contextInfo: arabianCtx()
                }, { quoted: msg });

            } catch (err) {
                console.error("NiyoX Error:", err.message);
                await socket.sendMessage(sender, { text: "❌ I need cooldown time" }, { quoted: msg });
            }
            break;
        }

    // ════════════ VV ════════════

        case 'vv': {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quoted) return reply(`Reply to a view-once message with *.vv*`);
            try {
                const media = await downloadQuotedMedia(quoted);
                if (!media?.buffer) return reply('Could not download that media.');
                const qt = MEDIA_TYPES.find(t => quoted[t]);

                if (qt === 'imageMessage') {
                    await socket.sendMessage(sender, { image: media.buffer, caption: 'View-once unlocked 👀', contextInfo: arabianCtx() }, { quoted: msg });
                } else if (qt === 'videoMessage') {
                    await socket.sendMessage(sender, { video: media.buffer, caption: 'View-once unlocked 👀', contextInfo: arabianCtx() }, { quoted: msg });
                } else if (qt === 'audioMessage') {
                    await socket.sendMessage(sender, { audio: media.buffer, mimetype: media.mime || 'audio/mpeg', ptt: quoted.audioMessage?.ptt, contextInfo: arabianCtx() }, { quoted: msg });
                } else if (qt === 'stickerMessage') {
                    await socket.sendMessage(sender, { sticker: media.buffer, contextInfo: arabianCtx() }, { quoted: msg });
                } else {
                    await socket.sendMessage(sender, { document: media.buffer, mimetype: media.mime || 'application/octet-stream', fileName: media.fileName || 'file', contextInfo: arabianCtx() }, { quoted: msg });
                }

                try { await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } }); } catch (_) {}
            } catch (e) { await reply(`Failed: ${e.message}`); }
            break;
        }

    // ════════════ ACTIVE ════════════

        case 'active': {
            if (!isOwner) return reply('Owner only.');

            const sockets = typeof activeSockets !== 'undefined' ? activeSockets : new Map();
            const nums = Array.from(sockets.keys());

            const responseText = `*↳ ❝ [🎀 𝗦𝗛𝗔𝗡𝗔 𝗦𝗲𝘀𝘀𝗶𝗼𝗻𝘀 🎀] ¡! ❞*\n\n` +
                `> *\`📡 𝙲𝙾𝚄𝙽𝚃 :\`* ${nums.length}\n\n` +
                `${nums.map((n, i) => `> *\`${i + 1}.\`* +${n}`).join('\n')}\n\n` +
                `> *𝐒𝐇𝐀𝐍𝐀 𝐃𝐄𝐕𝐀𝐋𝐎𝐏𝐄𝐄 ✹*`;

            await reply(responseText);
            break;
        }

    // ════════════ NPM ════════════

        case 'npm': {
            const pkg = args[0]?.trim();
            if (!pkg) return reply(`Usage: .npm <package>`);

            try {
                const res = await axios.get(`https://registry.npmjs.org/${pkg}`, { timeout: 10000 });
                const d = res.data;

                const npmInfo = `*↳ ❝ [🎀 𝗦𝗛𝗔𝗡𝗔 𝗡𝗣𝗠 🎀] ¡! ❞*\n` +
                    `⊹₊⟡⋆ 𝗡𝗮𝗺𝗲 - ${d.name} 𝜗𝜚⋆\n\n` +
                    `> *\`📦 𝚅𝙴𝚁𝚂𝙸𝙾𝙽 :\`* ${d['dist-tags']?.latest || 'N/A'}\n` +
                    `> *\`📝 𝙳𝙴𝚂𝙲 :\`* ${(d.description || 'N/A').slice(0, 100)}\n` +
                    `> *\`👤 𝙰𝚄𝚃𝙷𝙾𝚁 :\`* ${d.author?.name || 'N/A'}\n` +
                    `> *\`📄 𝙻𝙸𝙲𝙴𝙽𝚂𝙴 :\`* ${d.license || 'N/A'}\n` +
                    `> *\`🔗 𝙻𝙸𝙽𝙺 :\`* https://npmjs.com/package/${d.name}\n\n` +
                    `> *𝐒𝐇𝐀𝐍𝐀 𝐃𝐄𝐕𝐀𝐋𝐎𝐏𝐄𝐄 ✹*`;

                await socket.sendMessage(sender, {
                    image: { url: SHANA_IMG },
                    caption: npmInfo,
                    contextInfo: arabianCtx()
                }, { quoted: msg });

            } catch (e) {
                await reply(`Package not found: ${pkg}`);
            }
            break;
        }

    // ════════════ MODE CHANGE ════════════

        case 'mode':
        case 'wtype': {
            if (!isOwner) return reply('Owner only.');
            if (!args[0]) return reply(`Usage: ${prefix}mode <public/private>`);

            const newMode = args[0].toLowerCase();
            if (newMode !== 'public' && newMode !== 'private') {
                return reply('Please use "public" or "private"');
            }

            try {
                sessionConfig.MODE = newMode;
                await updateUserConfig(sanitizedNumber, sessionConfig);

                const currentData = activeSockets.get(sanitizedNumber);
                if (currentData) {
                    currentData.config = sessionConfig;
                    activeSockets.set(sanitizedNumber, currentData);
                }

                await socket.sendMessage(sender, {
                    react: { text: '⚙️', key: msg.key }
                });

                await reply(`✅ Bot mode successfully changed to *${newMode}* mode.`);
            } catch (e) {
                console.error(e);
                await reply(`Error: ${e.message}`);
            }
            break;
        }

    // ════════════ IMG ════════════

        case 'gimg':
        case 'img': {
            const q = args.join(' ').trim();
            if (!q) return reply(`Usage: .gimg <query>`);
            try {
                await socket.sendMessage(sender, {
                    react: { text: '🖼️', key: msg.key }
                });
            } catch (_) {}

            try {
                const res = await axios.get(
                    `https://www.movanest.xyz/v2/pinterest?query=${encodeURIComponent(q)}&pageSize=10`
                );

                if (res.data && res.data.results && res.data.results.length > 0) {
                    const random =
                        res.data.results[
                            Math.floor(Math.random() * res.data.results.length)
                        ];

                    const imgUrl = random.image;
                    await socket.sendMessage(
                        sender,
                        {
                            image: { url: imgUrl },
                            caption:
`*↳ ❝ [🎀 𝗦𝗛𝗔𝗡𝗔 𝗜𝗠𝗚𝘀 🎀] ¡! ❞*

*₊❏❜ ⋮ 🔍 Search:* ${q}

> *𝐒𝐇𝐀𝐍𝐀 𝐃𝐄𝐕𝐀𝐋𝐎𝐏𝐄𝐄 ✹*`
                        },
                        { quoted: msg }
                    );
                } else {
                    await reply(`I cant find it !`);
                }
            } catch (e) {
                console.error(e);
                await reply(`Image search failed:\n${e.message}`);
            }
            break;
        }

    // ════════════ GETDP ════════════

        case 'getdp':
        case 'pfp': {
            try {
                const qCtx = msg.message?.extendedTextMessage?.contextInfo;
                let target;
                if (qCtx?.mentionedJid?.[0]) {
                    target = qCtx.mentionedJid[0];
                } else if (qCtx?.participant) {
                    target = qCtx.participant;
                } else if (args[0]?.replace(/[^0-9]/g, '')) {
                    target = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                } else {
                    target = sender;
                }

                let dpUrl;
                try {
                    dpUrl = await socket.profilePictureUrl(target, 'image');
                } catch (e) {
                    return reply('No DP or Privacy protected');
                }

                await socket.sendMessage(sender, {
                    image: { url: dpUrl },
                    caption: `*↳ ❝ [🎀 𝗦𝗛𝗔𝗡𝗔 𝗗𝗣 🎀] ¡! ❞*\n\n📷 Profile picture of @${target.split('@')[0]}`,
                    mentions: [target]
                }, { quoted: msg });

            } catch (err) {
                console.error(err);
                reply('Known Error');
            }
            break;
        }

    // ════════════ STICKER ════════════

        case 'sticker':
        case 'stiker':
        case 's': {
            try {
                await socket.sendMessage(sender, { react: { text: '🎨', key: msg.key } });
            } catch (_) {}

            const qCtx = msg.message?.extendedTextMessage?.contextInfo;
            const quoted = qCtx?.quotedMessage;

            if (!quoted || (!quoted.imageMessage && !quoted.videoMessage)) {
                return reply(`Reply to an image or short video with *.sticker*`);
            }

            try {
                const { default: WASticker, StickerTypes } = require('wa-sticker-formatter');

                const media = await downloadQuotedMedia(quoted);
                if (!media?.buffer) return reply('Could not download media.');

                const sticker = new WASticker(media.buffer, {
                    pack: 'SHANA',
                    author: 'SHANA Devalopee',
                    type: StickerTypes.FULL,
                    categories: ['🤩'],
                    id: '12345',
                    quality: 50
                });

                const buffer = await sticker.toBuffer();
                await socket.sendMessage(sender, { sticker: buffer }, { quoted: msg });

            } catch (e) {
                console.error(e);
                await reply(`Sticker creation failed: ${e.message}`);
            }
            break;
        }

    // ════════════ TAGALL ════════════
        case 'tagall': {
            if (!isGroup) return reply('This command only works in groups.');
            try {
                const gm = await socket.groupMetadata(sender);
                const ps = gm.participants || [];
                const tm = args.join(' ').trim() || '*Attention everyone!*';
                const mentions = ps.map(p => p.id);
                let text = `*↳ ❝ [🎀 𝗦𝗛𝗔𝗡𝗔 𝗧𝗮𝗴𝗮𝗹𝗹 🎀] ¡! ❞*\n\n> *\`🗣️ :\`* ${tm}\n\n`;
                for (const p of ps) text += `₊❏❜ ⋮ @${p.id.split('@')[0]}\n`;
                text += `\n> *𝐒𝐇𝐀𝐍𝐀 𝐃𝐄𝐕𝐀𝐋𝐎𝐏𝐄𝐄 ✹*`;
                await socket.sendMessage(sender, { text, mentions }, { quoted: msg });
            } catch (e) { await reply(`tagall failed: ${e.message}`); }
            break;
        }

    // ════════════ HIDETAG ════════════
        case 'hidetag': {
            if (!isGroup) return reply('*Groups only.*');
            try {
                const gm = await socket.groupMetadata(sender);
                await socket.sendMessage(sender, { text: args.join(' ').trim() || '*🗣️ Attention Everybody !*', mentions: gm.participants.map(p => p.id) }, { quoted: msg });
            } catch (e) { await reply(`*hidetag failed: ${e.message}*`); }
            break;
        }

    // ════════════ ADD member ════════════
        case 'add': {
            if (!isOwner) {
                return await socket.sendMessage(sender, {
                    text: '👥 This command use only owner.'
                }, { quoted: msg });
            }

            if (!isGroup) {
                return await socket.sendMessage(sender, {
                    text: '👥 This command use only group.'
                }, { quoted: msg });
            }

            const q = msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text || '';

            const number = q.trim().replace(/[^0-9]/g, '');
            if (!number) {
                return await socket.sendMessage(sender, {
                    text: '*❗ Please provide a phone number!* \n📋 Example: .add 94712345678'
                });
            }

            try {
                await socket.sendMessage(sender, { react: { text: '➕', key: msg.key } });

                const userJid = number + '@s.whatsapp.net';
                await socket.groupParticipantsUpdate(msg.key.remoteJid, [userJid], 'add');

                await socket.sendMessage(sender, {
                    text: `*✅ Successfully added +${number} to the group!*`
                }, { quoted: msg });

                await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

            } catch (err) {
                console.error('Add Error:', err);
                await socket.sendMessage(sender, {
                    text: `*❌ Failed to add member!*\n*Reason:* ${err.message}`
                });
            }
            break;
        }

    // ════════════ KICK ════════════
        case 'kick':
        case 'remove': {
            if (!isGroup) return reply('Groups only.');
            const qCtx = msg.message?.extendedTextMessage?.contextInfo;
            const target = qCtx?.participant || (args[0]?.replace(/[^0-9]/g, '') ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null);
            if (!target) return reply(`Reply to a user's message or use: ${prefix}kick <number>`);
            try { await socket.groupParticipantsUpdate(sender, [target], 'remove'); await reply(`✅ Removed ${target.split('@')[0]}`); }
            catch (e) { await reply(`Kick failed: ${e.message}`); }
            break;
        }

    // ════════════ BIO ════════════
        case 'bio':
        case 'setbio': {
            const text = args.join(' ').trim();
            if (!text) return reply(`Usage: ${prefix}bio <text>`);
            try { await socket.updateProfileStatus(text); await reply(`✅ Bio updated: ${text}`); }
            catch (e) { await reply(`Failed: ${e.message}`); }
            break;
        }

    // ════════════ TAGADMIN ════════════
        case 'tagadmin': {
            if (!isGroup) return reply('This command only works in groups.');
            try {
                const gm = await socket.groupMetadata(sender);
                const admins = gm.participants.filter(p => p.admin);
                if (!admins.length) return reply('No admins found in this group.');
                const tm = args.join(' ').trim() || '*Attention admins!*';
                const mentions = admins.map(p => p.id);
                let text = `╭─⊹₊⟡⋆『 \`𝐀𝐝𝐦𝐢𝐧\` 』𖤐.ᐟ\n*┃* ${tm}\n*┃*\n`;
                for (const p of admins) text += `*┃* @${p.id.split('@')[0]}\n`;
                text += `╰──────────────────<𝟑 .ᐟ\n\n> *𝐒𝐇𝐀𝐍𝐀 𝐃𝐄𝐕𝐀𝐋𝐎𝐏𝐄𝐄 ✹*`;
                await socket.sendMessage(sender, { text, mentions }, { quoted: msg });
            } catch (e) { await replyFq(`tagadmin failed: ${e.message}`); }
            break;
        }

    // ════════════ PROMOTE ════════════
        case 'promote': {
            if (!isGroup) return reply('Groups only.');
            const qCtxP = msg.message?.extendedTextMessage?.contextInfo;
            const targetP = qCtxP?.participant || (args[0]?.replace(/[^0-9]/g, '') ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null);
            if (!targetP) return reply(`Reply to a user's message or use: ${prefix}promote <number>`);
            try {
                await socket.groupParticipantsUpdate(sender, [targetP], 'promote');
                await reply(`✅ @${targetP.split('@')[0]} has been promoted to admin.`);
            } catch (e) { await reply(`Promote failed: ${e.message}`); }
            break;
        }

    // ════════════ DEMOTE ════════════
        case 'demote': {
            if (!isGroup) return reply('Groups only.');
            const qCtxD = msg.message?.extendedTextMessage?.contextInfo;
            const targetD = qCtxD?.participant || (args[0]?.replace(/[^0-9]/g, '') ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null);
            if (!targetD) return reply(`Reply to a user's message or use: ${prefix}demote <number>`);
            try {
                await socket.groupParticipantsUpdate(sender, [targetD], 'demote');
                await reply(`✅ @${targetD.split('@')[0]} has been demoted.`);
            } catch (e) { await reply(`Demote failed: ${e.message}`); }
            break;
        }

    // ════════════ LOCKGROUP ════════════
        case 'lockgroup': {
            if (!isGroup) return reply('Groups only.');
            try {
                await socket.groupSettingUpdate(sender, 'announcement');
                await reply('🔒 Group locked — only admins can send messages.');
            } catch (e) { await replyFq(`Lock failed: ${e.message}`); }
            break;
        }

    // ════════════ UNLOCKGROUP ════════════
        case 'unlockgroup': {
            if (!isGroup) return replyFq('Groups only.');
            try {
                await socket.groupSettingUpdate(sender, 'not_announcement');
                await reply('🔓 Group unlocked — everyone can send messages.');
            } catch (e) { await reply(`Unlock failed: ${e.message}`); }
            break;
        }

    // ════════════ MUTE ════════════
        case 'mute': {
            if (!isGroup) return reply('Groups only.');
            const durStr = (args[0] || '').toLowerCase();
            const durMap = { '1h': 3600, '6h': 21600, '1d': 86400, '7d': 604800 };
            const secs = durMap[durStr];
            if (!secs) return reply(`Usage: .mute <1h|6h|1d|7d>`);
            try {
                await socket.groupSettingUpdate(sender, 'announcement');
                await reply(`🔇 Group muted for *${durStr}*. Use *.unmute* to restore early.`);
                setTimeout(async () => {
                    try { await socket.groupSettingUpdate(sender, 'not_announcement'); } catch (_) {}
                }, secs * 1000);
            } catch (e) { await reply(`Mute failed: ${e.message}`); }
            break;
        }

    // ════════════ UNMUTE ════════════
        case 'unmute': {
            if (!isGroup) return reply('Groups only.');
            try {
                await socket.groupSettingUpdate(sender, 'not_announcement');
                await reply('🔊 Group unmuted — everyone can send messages.');
            } catch (e) { await reply(`Unmute failed: ${e.message}`); }
            break;
        }

    // ════════════ GROUPINFO ════════════
        case 'groupinfo': {
            if (!isGroup) return reply('Groups only.');
            try {
                const gm = await socket.groupMetadata(sender);
                const total = gm.participants.length;
                const admCnt = gm.participants.filter(p => p.admin).length;
                const created = gm.creation ? new Date(gm.creation * 1000).toLocaleDateString() : 'Unknown';
                await reply(
                    `*↳ ❝ [🎀 𝗦𝗛𝗔𝗡𝗔 𝗚𝗜𝗻𝗳𝗼 🎀] ¡! ❞*\n\n` +
                    `₊❏❜ ⋮ *\`📛 𝙽𝙰𝙼𝙴 :\`* ${gm.subject}\n` +
                    `₊❏❜ ⋮ *\`🆔 𝙹𝙸𝙳 :\`* ${gm.id}\n` +
                    `₊❏❜ ⋮ *\`📝 𝙳𝙴𝚂𝙲 :\`* ${(gm.desc || 'None').slice(0, 100)}\n` +
                    `₊❏❜ ⋮ *\`👥 𝙼𝙴𝙼𝙱𝙴𝚁𝚂 :\`* ${total}\n` +
                    `₊❏❜ ⋮ *\`👑 𝙰𝙳𝙼𝙸𝙽𝚂 :\`* ${admCnt}\n` +
                    `₊❏❜ ⋮ *\`📅 𝙲𝚁𝙴𝙰𝚃𝙴𝙳 :\`* ${created}\n\n` +
                    `> *𝐒𝐇𝐀𝐍𝐀 𝐃𝐄𝐕𝐀𝐋𝐎𝐏𝐄𝐄 ✹*`
                );
            } catch (e) { await reply(`groupinfo failed: ${e.message}`); }
            break;
        }

    // ════════════ SETNAME ════════════
        case 'setname': {
            if (!isGroup) return reply('Groups only.');
            const newName = args.join(' ').trim();
            if (!newName) return reply(`Usage: .setname <new name>`);
            try {
                await socket.groupUpdateSubject(sender, newName);
                await reply(`✅ Group name changed to: *${newName}*`);
            } catch (e) { await reply(`setname failed: ${e.message}`); }
            break;
        }

    // ════════════ SETDESC ════════════
        case 'setdesc': {
            if (!isGroup) return reply('Groups only.');
            const newDesc = args.join(' ').trim();
            if (!newDesc) return reply(`Usage: .setdesc <description>`);
            try {
                await socket.groupUpdateDescription(sender, newDesc);
                await reply(`✅ Group description updated.`);
            } catch (e) { await reply(`setdesc failed: ${e.message}`); }
            break;
        }

    // ════════════ SETICON ════════════
        case 'seticon': {
            if (!isGroup) return reply('Groups only.');

            const groupId = msg.key.remoteJid;

            const quotedIcon = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quotedIcon?.imageMessage) return reply(`Reply to an image with *.seticon*`);

            try {
                const media = await downloadQuotedMedia(quotedIcon);

                if (!media || !media.buffer) return reply('Could not download image.');

                await socket.updateProfilePicture(groupId, media.buffer);

                await reply('✅ Group icon updated successfully.');
            } catch (e) {
                console.log(e);
                await reply(`seticon failed: ${e.message}`);
            }
            break;
        }

    // ════════════ LINKGROUP ════════════
        case 'linkgroup': {
            if (!isGroup) return reply('Groups only.');
            try {
                const code = await socket.groupInviteCode(sender);
                await reply(`🔗 *Group Invite Link:*\nhttps://chat.whatsapp.com/${code}`);
            } catch (e) { await reply(`linkgroup failed: ${e.message}`); }
            break;
        }

    // ════════════ REVOKELINK ════════════
        case 'revokelink': {
            if (!isGroup) return reply('Groups only.');
            try {
                const newCode = await socket.groupRevokeInvite(sender);
                await reply(`✅ Invite link revoked.\n🔗 *New link:*\nhttps://chat.whatsapp.com/${newCode}`);
            } catch (e) { await reply(`revokelink failed: ${e.message}`); }
            break;
        }

    // ════════════ LEAVE ════════════
        case 'leave': {
            if (!isGroup) return reply('Groups only.');
            if (!isOwner) return reply('Only owner can make the bot leave.');
            try {
                await reply('👋 Goodbye! Leaving group...');
                await delay(1500);
                await socket.groupLeave(sender);
            } catch (e) { await reply(`leave failed: ${e.message}`); }
            break;
        }

    // ════════════ HENTAI ════════════

        case 'hentai': {
            try {
                await socket.sendMessage(sender, {
                    react: { text: '🔞', key: msg.key }
                });
            } catch (_) {}

            try {
                const response = await axios.get('https://www.movanest.xyz/v2/hentai?query=random');
                const data = response.data;

                if (data && data.status && data.result && data.result.length > 0) {
                    const results = data.result;
                    const randomVideo = results[Math.floor(Math.random() * results.length)];

                    const videoUrl = randomVideo.video_1 || randomVideo.video_2;
                    if (!videoUrl) return reply("No Video Available !");

                    await socket.sendMessage(
                        sender,
                        {
                            video: { url: videoUrl },
                            caption:
`*↳ ❝ [🔞 𝗛𝗲𝗻𝘁𝗮𝗶 𝗥𝗮𝗻𝗱𝗼𝗺 🔞] ¡! ❞*

*₊❏❜ ⋮ 🎬 Title:* ${randomVideo.title}
*₊❏❜ ⋮ 📁 Category:* ${randomVideo.category}
*₊❏❜ ⋮ 👁️ Views:* ${randomVideo.views_count}

> *𝐒𝐇𝐀𝐍𝐀 𝐃𝐄𝐕𝐀𝐋𝐎𝐏𝐄𝐄 ✹*`
                        },
                        { quoted: msg }
                    );
                } else {
                    await reply("Server Error ! pls try again later .");
                }

            } catch (error) {
                console.error(error);
                await reply(`Error! API:\n${error.message}`);
            }
            break;
        }

    // ════════════ FANCY TEXT ════════════

        case 'styletext':
        case 'fancy':
        case 'fancytext': {
            const q = msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                msg.message?.imageMessage?.caption || '';

            const textToStyle = q.replace(/^[^\s]+\s+/, '').trim();

            if (!textToStyle || textToStyle === '') {
                return await socket.sendMessage(sender, {
                    text: '*❓ Text Is Missing.* \n📋 Ex: .styletext Hello World'
                });
            }

            try {
                await socket.sendMessage(sender, { react: { text: '✨', key: msg.key } });

                const response = await axios.get(`https://www.movanest.xyz/v2/fancytext?word=${encodeURIComponent(textToStyle)}`);

                if (!response.data.status) {
                    throw new Error('API processing failed');
                }

                const results = response.data.results;

                let styledMsg = `*✨ FANCY TEXT STYLES *\n\n`;
                styledMsg += `*Original:* ${textToStyle}\n\n`;
                styledMsg += `*┏━━━━━°⌜ \`赤い糸\` ⌟°━━━━━┓*\n`;

                results.slice(0, 25).forEach((styledText, index) => {
                    styledMsg += `*┃ ${index + 1}.* ${styledText}\n`;
                });

                styledMsg += `*┗━━━━━°⌜ \`赤い糸\` ⌟°━━━━━┛*\n\n`;
                styledMsg += `> *𝐒𝐇𝐀𝐍𝐀 𝐃𝐄𝐕𝐀𝐋𝐎𝐏𝐄𝐄 ✹*`;

                await socket.sendMessage(sender, {
                    text: styledMsg
                }, { quoted: msg });

                await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

            } catch (err) {
                console.error('StyleText API Error:', err);
                await socket.sendMessage(sender, {
                    text: `*❌ Known Error Try Again*`
                });
            }
            break;
        }

    // ════════════ OWNER ════════════

        case 'owner': {
            const ownerNum = config.OWNER_NUMBER;
            const ownerName = '✹ 𝐒𝐇𝐀𝐍𝐀 𝐃𝐄𝐕𝐀𝐋𝐎𝐏𝐄𝐄 ✹';

            await socket.sendMessage(sender, { react: { text: '🥷', key: msg.key } });

            await socket.sendMessage(sender, {
                image: { url: SHANA_IMG },
                contacts: {
                    displayName: ownerName,
                    contacts: [{
                        vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${ownerName}\nORG:𝐒𝐇𝐀𝐍𝐀 𝐗 𝐎𝐰𝐧𝐞𝐫;\nTEL;type=CELL;type=VOICE;waid=${ownerNum}:${ownerNum}\nEND:VCARD`
                    }]
                }
            });

            await socket.sendMessage(sender, {
                text: `*↳ ❝ [🎀 𝗦𝗛𝗔𝗡𝗔 𝗢𝘄𝗻𝗲𝗿 🎀] ¡! ❞*\n\n₊❏❜ ⋮👤 Name: ${ownerName}\n₊❏❜ ⋮ 📞 Number: +${ownerNum}\n\n> *𝐒𝐇𝐀𝐍𝐀 𝐃𝐄𝐕𝐀𝐋𝐎𝐏𝐄𝐄 ✹*`,
                contextInfo: {
                    mentionedJid: [`${ownerNum}@s.whatsapp.net`]
                }
            }, {
                quoted: msg
            });

            break;
        }

    // ════════════ LVCAL ════════════

        case 'lvcal': {
            const q = msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text || '';

            const parts = q.trim().split('&');
            if (parts.length !== 2) {
                return await socket.sendMessage(sender, {
                    text: '*❗ Please provide two names!* \n📋 Example: .lvcal John & Jane'
                });
            }

            try {
                await socket.sendMessage(sender, { react: { text: '💕', key: msg.key } });

                const name1 = parts[0].replace(/^[^\s]+\s+/, '').trim();
                const name2 = parts[1].trim();

                const combined = name1.toLowerCase() + name2.toLowerCase();
                let hash = 0;
                for (let i = 0; i < combined.length; i++) {
                    hash = combined.charCodeAt(i) + ((hash << 5) - hash);
                }
                const percentage = Math.abs(hash % 101);

                let hearts = '';
                if (percentage >= 90) hearts = '💖💖💖💖💖';
                else if (percentage >= 70) hearts = '💖💖💖💖';
                else if (percentage >= 50) hearts = '💖💖💖';
                else if (percentage >= 30) hearts = '💖💖';
                else hearts = '💖';

                let shipText = `*↳ ❝ [🎀 𝗦𝗛𝗔𝗡𝗔 𝗟𝘃𝗖𝗮𝗹 🎀] ¡! ❞*\n\n`;
                shipText += `*${name1}* 💑 *${name2}*\n\n`;
                shipText += `${hearts}\n`;
                shipText += `*Love Percentage:* ${percentage}%\n\n`;

                if (percentage >= 80) shipText += `*Perfect Match! 🔥💕*`;
                else if (percentage >= 60) shipText += `*Great Chemistry! ✨💝*`;
                else if (percentage >= 40) shipText += `*Good Potential! 💫💓*`;
                else if (percentage >= 20) shipText += `*Needs Work! 🤔💔*`;
                else shipText += `*Not Meant To Be! 😢💔*`;

                shipText += `\n\n> *𝐒𝐇𝐀𝐍𝐀 𝐃𝐄𝐕𝐀𝐋𝐎𝐏𝐄𝐄 ✹*`;

                await socket.sendMessage(sender, { text: shipText }, { quoted: msg });
                await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

            } catch (err) {
                console.error('Ship Error:', err);
                await socket.sendMessage(sender, { text: '*❌ Love calculator failed!*' });
            }
            break;
        }

    // ════════════ HACK ════════════

        case 'hack': {
            try {
                const from = msg.key.remoteJid;
                const steps = [
                    '✹ *𝐒𝐇𝐀𝐍𝐀 𝐇𝐚𝐜𝐤 𝐒𝐭𝐚𝐫𝐭𝐢𝐧𝐠...* ✹',
                    '`ɪɴɪᴛɪᴀʟɪᴢɪɴɢ ʜᴀᴄᴋɪɴɢ ᴛᴏᴏʟꜱ...` 🛠️',
                    '`ᴄᴏɴɴᴇᴄᴛɪɴɢ ᴛᴏ ʀᴇᴍᴏᴛᴇ ꜱᴇʀᴠᴇʀ...` 🌐',
                    '```[##] 20%``` ⏳',
                    '```[####] 40%``` ⏳',
                    '```[######] 60%``` ⏳',
                    '```[########] 80%``` ⏳',
                    '```[##########] 100%``` ✅',
                    '🔒 *𝐒ystem 𝐁reach: 𝐒uccessful!* 🔓',
                    '*✹ 𝐒𝐡𝐚𝐧𝐚 𝐇𝐚𝐜𝐤𝐢𝐧𝐠 𝐒𝐮𝐜𝐜𝐞𝐬𝐬𝐟𝐮𝐥 ✹*',
                ];

                await socket.sendMessage(from, { react: { text: '💀', key: msg.key } });

                let initialMsg = await socket.sendMessage(from, { text: steps[0] }, { quoted: msg });

                for (let i = 1; i < steps.length; i++) {
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    await socket.sendMessage(from, {
                        text: steps[i],
                        edit: initialMsg.key,
                        contextInfo: arabianCtx()
                    });
                }

            } catch (e) {
                console.log(e);
                reply(`❌ *Error!* ${e.message}`);
            }
            break;
        }

        }
    } catch (error) {
        console.error('Command handler error:', error);
        await socket.sendMessage(sender, {
            text: `❌ ERROR\nAn error occurred: ${error.message}`,
        });
    }
    });
}

router.get('/', async (req, res) => {
    const { number } = req.query;

    if (!number) {
        return res.status(400).send({
            error: 'Number parameter is required'
        });
    }

    if (activeSockets.size >= 77) {
        return res.status(429).send({

            status: 'limit_reached',
            message: 'Active connections limit reached. Please try again in 1 hour.'
        });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    if (activeSockets.has(sanitizedNumber)) {
        return res.status(200).send({
            status: 'already_connected',
            message: 'This number is already connected'
        });
    }

    await EmpirePair(number, res);
});

router.get('/active', (req, res) => {
    console.log('Active sockets:', Array.from(activeSockets.keys()));
    res.status(200).send({
        count: activeSockets.size,
        numbers: Array.from(activeSockets.keys())
    });
});

process.on('exit', () => {
    activeSockets.forEach((socket, number) => {
        socket.ws.close();
        activeSockets.delete(number);
        socketCreationTime.delete(number);
    });
    fs.emptyDirSync(SESSION_BASE_PATH);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    exec(`pm2 restart ${process.env.PM2_NAME || 'dtz-mini-bot-session'}`);
});

module.exports = router;
