const {
  InteractionType,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const { PlayerUCP } = require('../../db');

module.exports = {
  async handleInteraction(interaction) {
    try {

      if (interaction.isButton() && interaction.customId === 'verify_otp') {
        const userData = await PlayerUCP.findOne({
          where: { DiscordID: interaction.user.id }
        });

        if (!userData) {
          return interaction.reply({
            content: '⚠️ Data tidak ditemukan.',
            flags: MessageFlags.Ephemeral
          });
        }

        if (userData.verified) {
          return interaction.reply({
            content: '⚠️ Kamu sudah terverifikasi.',
            flags: MessageFlags.Ephemeral
          });
        }

        const modal = new ModalBuilder()
          .setCustomId('form_verifikasi')
          .setTitle('Verifikasi OTP');

        const otpInput = new TextInputBuilder()
          .setCustomId('otp_code')
          .setLabel('Masukkan kode OTP')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Contoh: 123456')
          .setRequired(true)
          .setMaxLength(6)
          .setMinLength(6);

        modal.addComponents(new ActionRowBuilder().addComponents(otpInput));
        return await interaction.showModal(modal);
      }
      
      if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'form_verifikasi') {
        const otpInput = interaction.fields.getTextInputValue('otp_code').trim();

        if (!/^\d{6}$/.test(otpInput)) {
          return interaction.reply({
            content: '⚠️ OTP harus 6 digit angka.',
            flags: MessageFlags.Ephemeral
          });
        }

        const match = await PlayerUCP.findOne({
          where: {
            verifycode: otpInput,
            DiscordID: interaction.user.id,
            verified: false
          }
        });

        if (!match) {
          return interaction.reply({
            content: '⚠️ OTP tidak valid atau sudah digunakan.',
            flags: MessageFlags.Ephemeral
          });
        }

        await match.update({ verified: true });

        const updatedButton = new ButtonBuilder()
          .setCustomId('verify_otp')
          .setLabel('Sudah Terverifikasi')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true);

        const setPasswordButton = new ButtonBuilder()
          .setCustomId('set_password')
          .setLabel('Buat Password')
          .setStyle(ButtonStyle.Primary);

        return interaction.reply({
          content: `✅ OTP valid! Kamu telah terverifikasi.\nUsername: **${match.ucp}**\nNomor: **${match.phone}**`,
          components: [
            new ActionRowBuilder().addComponents(updatedButton),
            new ActionRowBuilder().addComponents(setPasswordButton)
          ],
          flags: MessageFlags.Ephemeral
        });
      }

    } catch (err) {
      console.error('[\x1b[31mERROR\x1b[0m] Error di verifikasi.js:', err);
      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({
          content: '⚠️ Terjadi kesalahan saat memproses OTP.',
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
};