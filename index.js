const { default: makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const path = require('path');

// Import modular commands
const downloader = require('./commands/downloader');
const ai = require('./commands/ai');
const tools = require('./commands/tools');
const shopping = require('./commands/shopping');

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.creds, pino({ level: 'silent' }))
        },
        printQRInTerminal: true
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus, mencoba menghubungkan ulang...', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('🤖 Bot WhatsApp Berhasil Terhubung!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (mylevel) => {
        try {
            const mek = mylevel.messages[0];
            if (!mek.message || mek.key.fromMe) return;

            const from = mek.key.remoteJid;
            const type = Object.keys(mek.message)[0];
            const body = (type === 'conversation') ? mek.message.conversation :
                         (type === 'extendedTextMessage') ? mek.message.extendedTextMessage.text :
                         (type === 'imageMessage') ? mek.message.imageMessage.caption :
                         (type === 'videoMessage') ? mek.message.videoMessage.caption : '';

            const args = body.trim().split(/ +/);
            const command = args[0].toLowerCase();

            // Routing Command
            if (command === '.menu' || command === '.help') {
                const menuText = `🤖 *BOT WHATSAPP ALL-IN-ONE*\n\n` +
                                 `📥 *Downloader:* \n` +
                                 `• \`.ig [link]\` (Instagram)\n` +
                                 `• \`.tiktok [link]\` (TikTok)\n` +
                                 `• \`.ytmp4 / .ytmp3 [link]\` (YouTube)\n\n` +
                                 `🛠️ *Tools & Media:* \n` +
                                 `• \`.stiker\` (Buat Stiker dari Foto)\n` +
                                 `• \`.textstiker [teks]\` (Stiker Teks Anomali)\n` +
                                 `• \`.toaudio\` (Video ke MP3)\n\n` +
                                 `🛒 *Smart Shopping:* \n` +
                                 `• \`.cari [nama barang]\` (Cari produk terlaris rating 4.9+)\n\n` +
                                 `🤖 *AI Assistant:* \n` +
                                 `• \`.ai [pertanyaan]\` (Tanya Jawab AI)`;
                await sock.sendMessage(from, { text: menuText }, { quoted: mek });
            } else if (['.ig', '.instagram', '.tiktok', '.ytmp4', '.ytmp3'].includes(command)) {
                await downloader(sock, mek, command, args, from);
            } else if (['.ai', '.chatbot'].includes(command)) {
                await ai(sock, mek, command, args, from);
            } else if (['.stiker', '.textstiker', '.ts', '.toaudio'].includes(command)) {
                await tools(sock, mek, command, args, from);
            } else if (['.cari', '.caribarang'].includes(command)) {
                await shopping(sock, mek, command, args, from);
            }
        } catch (e) {
            console.error('Error handling message:', e);
        }
    });
}

connectToWhatsApp();
