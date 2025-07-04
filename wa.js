const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const Boom = require('@hapi/boom');
const path = require('path');
const logger = require('./logger');
const qrcode = require('qrcode-terminal');

const authFilePath = path.join(__dirname, 'session');

let sock;

async function startWA() {
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
      if (shouldReconnect) await startWA();
      else console.log('[WA] ✅ Sesi logout atau tidak bisa reconnect.');
    }

    if (connection === 'open') {
      console.log('✅ WA Connected!');
      const ownerPhone = process.env.OWNER_PHONE;
      const message = `BOT ONLINE BOS!`;
      await sendWaNotif (`${ownerPhone}@s.whatsapp.net`, message);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  return sock;
}

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