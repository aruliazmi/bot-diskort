const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  AttachmentBuilder
} = require('discord.js');

const axios = require('axios');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const produkData = require('../../data/produk.json');

const merchant_code = process.env.TRIPAY_MERCHANT_CODE;
const api_key = process.env.TRIPAY_API_KEY;
const private_key = process.env.TRIPAY_PRIVATE_KEY;
const TOPUP_CHANNEL = process.env.TOPUP_CHANNEL;
const UCP_DONATE_ROLE_ID = process.env.UCP_DONATE_ROLE_ID;

module.exports = {
  async handleInteraction(interaction) {
    if (interaction.channelId !== TOPUP_CHANNEL) return;

    if (interaction.isButton() && interaction.customId === 'start_topup') {
      const kategoriMenu = new StringSelectMenuBuilder()
        .setCustomId('pilih_kategori')
        .setPlaceholder('Pilih kategori produk...')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('Kendaraan').setValue('kategori_kendaraan'),
          new StringSelectMenuOptionBuilder().setLabel('Skin').setValue('kategori_skin')
        );

      const row = new ActionRowBuilder().addComponents(kategoriMenu);
      return interaction.reply({
        content: '✅ Step 1: Pilih kategori terlebih dahulu',
        components: [row],
        flags: MessageFlags.Ephemeral
      });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'pilih_kategori') {
      const kategori = interaction.values[0];
      const pilihan = produkData[kategori];

      if (!pilihan) {
        return interaction.update({ content: '❌ Kategori tidak ditemukan.', components: [], flags: MessageFlags.Ephemeral });
      }

      const produkMenu = new StringSelectMenuBuilder()
        .setCustomId('pilih_produk')
        .setPlaceholder('Pilih produk...')
        .addOptions(pilihan.map(item =>
          new StringSelectMenuOptionBuilder().setLabel(item.label).setValue(item.value)
        ));

      const row = new ActionRowBuilder().addComponents(produkMenu);
      return interaction.update({
        content: '✅ Step 2: Pilih produk yang tersedia',
        components: [row],
        flags: MessageFlags.Ephemeral
      });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'pilih_produk') {
      const selected = interaction.values[0];
      const allProduk = Object.values(produkData).flat().reduce((acc, item) => {
        acc[item.value] = { label: item.label.split(' (')[0], harga: item.harga };
        return acc;
      }, {});

      const item = allProduk[selected];
      if (!item) {
        return interaction.update({
          content: '❌ Produk tidak ditemukan.',
          components: [],
          flags: MessageFlags.Ephemeral
        });
      }

      const merchant_ref = `TX-${Date.now()}`;
      const amount = item.harga;
      const signature = crypto.createHmac('sha256', private_key)
        .update(merchant_code + merchant_ref + amount)
        .digest('hex');

      const payload = {
        method: 'QRIS',
        merchant_ref,
        amount,
        customer_name: interaction.user.username,
        customer_email: 'user@domain.com',
        customer_phone: '081234567890',
        order_items: [{ sku: selected, name: item.label, price: item.harga, quantity: 1 }],
        callback_url: 'https://yourdomain.com/callback',
        return_url: 'https://yourdomain.com/thanks',
        expired_time: Math.floor(Date.now() / 1000) + 3600,
        signature
      };

      try {
        const res = await axios.post('https://tripay.co.id/api-sandbox/transaction/create', payload, {
          headers: {
            Authorization: `Bearer ${api_key}`,
            'Content-Type': 'application/json'
          }
        });

        const data = res.data?.data;
        if (!data || !data.qr_url) throw new Error('Gagal mendapatkan QR');

        const qrBuffer = await axios.get(data.qr_url, { responseType: 'arraybuffer' });
        const attachment = new AttachmentBuilder(Buffer.from(qrBuffer.data), { name: 'qris.png' });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`cekbayar_${data.reference}`).setLabel('Cek Pembayaran').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`cancelbayar_${data.reference}`).setLabel('Batalkan').setStyle(ButtonStyle.Danger)
        );

        await interaction.update({
          content: `🛒 Produk: **${item.label}**\n💰 Harga: Rp${item.harga.toLocaleString()}\n🧾 Biaya Admin: Rp${data.fee_customer.toLocaleString()}\n💸 Total Bayar: **Rp${(item.harga + data.fee_customer).toLocaleString()}**\n\n📲 Scan QR atau klik:\n🔗 ${data.checkout_url}`,
          files: [attachment],
          components: [row],
          flags: MessageFlags.Ephemeral
        });
      } catch (err) {
        console.error('Gagal transaksi:', err.response?.data || err.message);
        await interaction.update({
          content: '❌ Gagal membuat transaksi. Silakan coba lagi.',
          components: [],
          flags: MessageFlags.Ephemeral
        });
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith('cekbayar_')) {
      const reference = interaction.customId.split('_')[1];
      try {
        const res = await axios.get(`https://tripay.co.id/api-sandbox/transaction/detail?reference=${reference}`, {
          headers: { Authorization: `Bearer ${api_key}` }
        });

        const data = res.data?.data;
        if (data.status === 'PAID') {
          const selected = data.order_items[0].sku;
          const produkKendaraan = require('../../data/produk.json').kategori_kendaraan.map(p => p.value);
          const isKendaraan = produkKendaraan.includes(selected);
          const db = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME
          });

          const [ucpRows] = await db.execute('SELECT ucp FROM playerucp WHERE DiscordID = ?', [interaction.user.id]);
          if (!ucpRows.length) return interaction.reply({ content: '❌ UCP tidak ditemukan.', flags: MessageFlags.Ephemeral });

          const ucp = ucpRows[0].ucp;
          const [playerRows] = await db.execute('SELECT reg_id, username FROM players WHERE ucp = ?', [ucp]);
          if (!playerRows.length) return interaction.reply({ content: '❌ Karakter tidak ditemukan.', flags: MessageFlags.Ephemeral });

          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`cekbayar_${reference}`).setLabel('Cek Pembayaran').setStyle(ButtonStyle.Success).setDisabled(true),
            new ButtonBuilder().setCustomId(`cancelbayar_${reference}`).setLabel('Batalkan').setStyle(ButtonStyle.Danger).setDisabled(true)
          );

          if (playerRows.length === 1) {
            const reg_id = playerRows[0].reg_id;
            if (isKendaraan) {
              await db.execute('INSERT INTO vehicle (owner, model, x, y, z, a, park) VALUES (?, ?, ?, ?, ?, ?, ?)', [reg_id, parseInt(selected), 1329.47, -870.249, 39.1901, 144.028, 1]);
            } else {
              await db.execute('UPDATE players SET skin = ? WHERE reg_id = ?', [parseInt(selected), reg_id]);
            }

            // ✅ Berikan role donatur
            const guild = interaction.guild;
            const member = await guild.members.fetch(interaction.user.id).catch(() => null);
            if (member && UCP_DONATE_ROLE_ID && guild.roles.cache.has(UCP_DONATE_ROLE_ID)) {
              await member.roles.add(UCP_DONATE_ROLE_ID).catch(console.error);
            }

            return interaction.update({
              content: `✅ Pembayaran berhasil! Produk diberikan ke karakter **${playerRows[0].username}**.`,
              components: [disabledRow],
              flags: MessageFlags.Ephemeral,
              files: []
            });
          } else {
            const playerMenu = new StringSelectMenuBuilder()
              .setCustomId(`pilih_player_${isKendaraan ? 'kendaraan' : 'skin'}_${reference}_${selected}`)
              .setPlaceholder('Pilih karakter...')
              .addOptions(playerRows.map(p => new StringSelectMenuOptionBuilder().setLabel(p.username).setValue(p.reg_id.toString())));

            const row = new ActionRowBuilder().addComponents(playerMenu);

            // ✅ Berikan role donatur
            const guild = interaction.guild;
            const member = await guild.members.fetch(interaction.user.id).catch(() => null);
            if (member && UCP_DONATE_ROLE_ID && guild.roles.cache.has(UCP_DONATE_ROLE_ID)) {
              await member.roles.add(UCP_DONATE_ROLE_ID).catch(console.error);
            }

            return interaction.update({
              content: '👤 Pilih karakter yang akan menerima produk:',
              components: [disabledRow, row],
              flags: MessageFlags.Ephemeral,
              files: []
            });
          }
        } else {
          await interaction.reply({ content: `⏳ Status: **${data.status}**\nSilakan cek kembali beberapa saat lagi.`, flags: MessageFlags.Ephemeral });
        }
      } catch (err) {
        console.error('❌ Gagal cek status Tripay:', err.response?.data || err.message);
        await interaction.reply({ content: '❌ Gagal memeriksa status pembayaran.', flags: MessageFlags.Ephemeral });
      }
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('pilih_player_')) {
      const parts = interaction.customId.split('_');
      const type = parts[2];
      const reference = parts[3];
      const modelOrSkin = parts[4];
      const reg_id = parseInt(interaction.values[0]);

      try {
        const db = await mysql.createConnection({
          host: process.env.DB_HOST,
          user: process.env.DB_USER,
          password: process.env.DB_PASS,
          database: process.env.DB_NAME
        });

        if (type === 'kendaraan') {
          await db.execute('INSERT INTO vehicle (owner, model, x, y, z, a, park) VALUES (?, ?, ?, ?, ?, ?, ?)', [reg_id, parseInt(modelOrSkin), 1329.47, -870.249, 39.1901, 144.028, 1]);
        } else {
          await db.execute('UPDATE players SET skin = ? WHERE reg_id = ?', [parseInt(modelOrSkin), reg_id]);
        }

        const disabledMenu = new StringSelectMenuBuilder()
          .setCustomId(`done_player_${reference}`)
          .setPlaceholder('✅ Karakter telah dipilih')
          .setDisabled(true)
          .addOptions([new StringSelectMenuOptionBuilder().setLabel(`Karakter ID: ${reg_id}`).setValue(reg_id.toString())]);

        const disabledRow = new ActionRowBuilder().addComponents(disabledMenu);

        await interaction.update({
          content: `✅ Produk berhasil diberikan ke karakter ID: **${reg_id}**`,
          components: [disabledRow],
          flags: MessageFlags.Ephemeral,
          files: []
        });
      } catch (err) {
        console.error('❌ Gagal menyimpan ke karakter:', err);
        await interaction.reply({ content: '❌ Gagal menyimpan produk ke karakter.', flags: MessageFlags.Ephemeral });
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith('cancelbayar_')) {
      return interaction.update({
        content: '❌ Pembayaran dibatalkan oleh pengguna.',
        components: [],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};