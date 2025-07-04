const {
  InteractionType,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder
} = require('discord.js')

const { PlayerUCP } = require('../../db')
const { Op } = require('sequelize')
const { sendWaNotif } = require('../../wa');

module.exports = {
  async handleInteraction(interaction) {
    if (interaction.type !== InteractionType.ModalSubmit || interaction.customId !== 'form_nama') return

    const nama = interaction.fields.getTextInputValue('username').trim()
    const telepon = interaction.fields.getTextInputValue('telepon').trim()

    if (!/^[a-zA-Z0-9]{5,}$/.test(nama)) {
      return interaction.reply({
        content: '❌ Username harus alfanumerik dan minimal 5 karakter.',
        flags: MessageFlags.Ephemeral
      })
    }

    if (!telepon.startsWith('62')) {
      return interaction.reply({
        content: '❌ Nomor telepon harus diawali dengan 62.',
        flags: MessageFlags.Ephemeral
      })
    }

    const ageMs = Date.now() - interaction.user.createdAt.getTime()
    if (ageMs / (1000 * 60 * 60 * 24) < 7) {
      return interaction.reply({
        content: '❌ Akun Discord harus minimal 7 hari.',
        flags: MessageFlags.Ephemeral
      })
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const existing = await PlayerUCP.findOne({
      where: {
        [Op.or]: [
          { ucp: nama },
          { phone: telepon },
          { DiscordID: interaction.user.id }
        ]
      }
    })

    if (existing) {
      return interaction.editReply({
        content: existing.verified
          ? '✅ Kamu sudah terverifikasi sebelumnya.'
          : '❌ Data sudah digunakan. Gunakan yang lain.'
      })
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString()

    try {
      const newUser = await PlayerUCP.create({
        ucp: nama,
        phone: telepon,
        verifycode: otp,
        DiscordID: interaction.user.id,
        verified: false,
        reg_date: new Date()
      })

      const numberJid = `${telepon}@s.whatsapp.net`;
      const pesan = `Hai ${nama}! Kode OTP kamu adalah: ${otp}, jangan bagikan kode ini ke siapapun.`;

      try {
        const sent = await sendWaNotif(numberJid, pesan);

        if (!sent) {
          await newUser.destroy();
          return interaction.editReply({
            content: '❌ Gagal mengirim OTP. Coba lagi nanti.'
          });
        }
      } catch (err) {
        console.error('❌ Gagal kirim OTP WA:', err);
        await newUser.destroy();
        return interaction.editReply({
          content: '❌ Gagal mengirim OTP. Coba lagi nanti.'
        });
      }

      const verifyButton = new ButtonBuilder()
        .setCustomId('verify_otp')
        .setLabel('Verifikasi OTP')
        .setStyle(ButtonStyle.Success)

      const verifyRow = new ActionRowBuilder().addComponents(verifyButton)

      return interaction.editReply({
        content: `✅ OTP telah dikirim ke WhatsApp **${telepon}**\nKlik tombol di bawah untuk memverifikasi.`,
        components: [verifyRow]
      })
    } catch (err) {
      console.error('❌ Error saat proses OTP:', err.response?.data || err.message)
      return interaction.editReply({
        content: '❌ Terjadi error saat pengiriman OTP. Coba lagi nanti atau hubungi admin.'
      })
    }
  }
}