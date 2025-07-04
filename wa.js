const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const Boom = require('@hapi/boom');
const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode-terminal');
const logger = require('./logger');

const authFilePath = path.join(__dirname, 'session');

let sock;
const waCommands = new Map(); // Untuk command WA modular

// Load semua command dari folder commands/wa
const waCommandFolder = path.join(__dirname, 'commands', 'wa');
fs.readdirSync(waCommandFolder).forEach(file => {
  const command = require(path.join(waCommandFolder, file));
  if (command.name && typeof command.execute === 'function') {
    waCommands.set(command.name, command);
    console.log(`[WA] Loaded WA command: ${command.name}`);
  }
});

async function startWA(client) {
  const { state, saveCreds } = await useMultiFileAuthState(authFilePath);

  sock = makeWASocket({
    logger,
    auth: state,
    browser: ['Ubuntu', 'Chrome', '22.04.4']
  });

  global.sock = sock;

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('🟡 QR Code ditemukan, scan sekarang:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error &&
        Boom.isBoom(lastDisconnect.error) &&
        lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;

      console.log('[WA] ❌ Koneksi terputus. Reconnect:', shouldReconnect);
      if (shouldReconnect) await startWA(client);
      else console.log('[WA] ✅ Sesi logout atau tidak bisa reconnect.');
    }

    if (connection === 'open') {
      console.log('✅ WA Connected!');
      const ownerPhone = process.env.OWNER_PHONE;
      const message = `🤖 Bot WhatsApp berhasil online dan terhubung ke Discord.`;
      await sendWaNotif(`${ownerPhone}@s.whatsapp.net`, message);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Handle pesan masuk dari WA
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const body = msg.message.conversation || msg.message.extendedTextMessage?.text;
    if (!body || !body.startsWith('!')) return;

    const args = body.slice(1).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    const command = waCommands.get(commandName);

    if (!command) return;

    try {
      const { client } = require('./index');
      await command.execute({ sock, msg, args, client });
    } catch (err) {
      console.error(`[WA] Gagal eksekusi command: ${commandName}`, err);
      await sock.sendMessage(sender, {
        text: '❌ Terjadi kesalahan saat memproses perintah.'
      });
    }
  });

  return sock;
}

// Fungsi global untuk kirim pesan WA
function sendWaNotif(jid, message) {
  if (!global.sock || !global.sock.user || !global.sock.sendMessage) {
    console.log('❌ WhatsApp belum siap, tidak bisa kirim pesan');
    return;
  }

  try {
    return global.sock.sendMessage(jid, { text: message });
  } catch (err) {
    console.error('❌ Gagal kirim WA:', err);
  }
}

module.exports = { startWA, sendWaNotif };