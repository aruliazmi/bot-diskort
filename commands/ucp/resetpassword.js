const { ActionRowBuilder, ButtonBuilder, MessageFlags, ButtonStyle } = require('discord.js');
const { PlayerUCP } = require('../../db');
const { sendWaNotif } = require('../../wa');

module.exports = {
  // ini wajib, biar ke-load ke client.handlers[]
  async handleInteraction(interaction) {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'button-resetpw') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const data = await PlayerUCP.findOne({ where: { DiscordID: interaction.user.id } });
      if (!data) {
        return interaction.editReply({ content: '❌ Data kamu tidak ditemukan.' });
      }

      const nama = data.ucp?.trim();
      const telepon = data.phone?.trim();

      if (!nama || !telepon) {
        return interaction.editReply({ content: '❌ Nama atau telepon kamu belum lengkap.' });
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const jid = `${telepon}@s.whatsapp.net`;
      const pesan = `Hai ${nama}, Kode OTP Reset Password kamu adalah *${otp}*. Jangan bagikan kode ini ke siapa pun!`;

      const sent = await sendWaNotif(jid, pesan);
      if (!sent) {
        return interaction.editReply({ content: '❌ Gagal kirim OTP ke WhatsApp.' });
      }

      await data.update({ otp });

      const verifyBtn = new ButtonBuilder()
        .setCustomId('reset_otp')
        .setLabel('Verifikasi OTP')
        .setStyle(ButtonStyle.Success);

      const row = new ActionRowBuilder().addComponents(verifyBtn);

      return interaction.editReply({
        content: `✅ OTP telah dikirim ke **${telepon}**. Klik tombol di bawah untuk verifikasi.`,
        components: [row]
      });
    }
  }
};