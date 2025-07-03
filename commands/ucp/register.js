const {
  InteractionType,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder
} = require('discord.js')

const { PlayerUCP } = require('../../db')
const { Op } = require('sequelize')
const axios = require('axios')
const qs = require('qs')

module.exports = {
  async handleInteraction(interaction) {
    if (interaction.type !== InteractionType.ModalSubmit || interaction.customId !== 'form_nama') return

    const nama = interaction.fields.getTextInputValue('username').trim()
    const telepon = interaction.fields.getTextInputValue('telepon').trim()

    if (!/^[a-zA-Z0-9]{5,}$/.test(nama)) {
      return interaction.reply({
        content: '[\x1b[31mERROR\x1b[0m] Username harus alfanumerik dan minimal 5 karakter.',
        flags: MessageFlags.Ephemeral
      })
    }

    if (!telepon.startsWith('62')) {
      return interaction.reply({
        content: '[\x1b[31mERROR\x1b[0m] Nomor telepon harus diawali dengan 62.',
        flags: MessageFlags.Ephemeral
      })
    }

    const ageMs = Date.now() - interaction.user.createdAt.getTime()
    if (ageMs / (1000 * 60 * 60 * 24) < 7) {
      return interaction.reply({
        content: '[\x1b[31mERROR\x1b[0m] Akun Discord harus minimal 7 hari.',
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
          ? '[\x1b[32mSUCCESS\x1b[0m] Kamu sudah terverifikasi sebelumnya.'
          : '[\x1b[31mERROR\x1b[0m] Data sudah digunakan. Gunakan yang lain.'
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

      const fonnteRes = await axios.post(
        'https://api.fonnte.com/send',
        qs.stringify({
          target: telepon,
          message: `Hai ${nama}! Kode OTP kamu adalah: ${otp}, jangan bagikan ke siapapun.`
        }),
        {
          headers: {
            Authorization: process.env.FONNTE_TOKEN,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      )

      const fonnteStatus = fonnteRes?.data?.status === true

      if (!fonnteStatus) {
        await newUser.destroy() // rollback data
        return interaction.editReply({
          content: '[\x1b[31mERROR\x1b[0m] Gagal mengirim OTP. Coba lagi nanti.'
        })
      }

      const verifyButton = new ButtonBuilder()
        .setCustomId('verify_otp')
        .setLabel('Verifikasi OTP')
        .setStyle(ButtonStyle.Success)

      const verifyRow = new ActionRowBuilder().addComponents(verifyButton)

      return interaction.editReply({
        content: `[\x1b[32mSUCCESS\x1b[0m] OTP telah dikirim ke WhatsApp **${telepon}**\nKlik tombol di bawah untuk memverifikasi.`,
        components: [verifyRow]
      })
    } catch (err) {
      console.error('[\x1b[31mERROR\x1b[0m] Error saat proses OTP:', err.response?.data || err.message)
      return interaction.editReply({
        content: '[\x1b[31mERROR\x1b[0m] Terjadi error saat pengiriman OTP. Coba lagi nanti atau hubungi admin.'
      })
    }
  }
}