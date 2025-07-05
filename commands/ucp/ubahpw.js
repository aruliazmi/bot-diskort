require('dotenv').config()
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  InteractionType,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');

const { PlayerUCP } = require('../../db');
const crypto = require('crypto');

function generateSalt(length = 16) {
  return crypto.randomBytes(length).toString('base64').slice(0, length);
}

function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(password + salt).digest('hex').toUpperCase();
}

module.exports = {
  async handleInteraction(interaction) {
    if (interaction.isButton() && interaction.customId === 'ubah_password') {
      const userData = await PlayerUCP.findOne({
        where: {
          DiscordID: interaction.user.id,
        }
      });

      if (!userData) {
        return interaction.reply({
          content: '⚠️ Data tidak ditemukan atau belum verifikasi.',
          flags: MessageFlags.Ephemeral
        });
      }

      const modal = new ModalBuilder()
        .setCustomId('buat_password')
        .setTitle('Buat Password');

      const passInput = new TextInputBuilder()
        .setCustomId('user_password')
        .setLabel('Masukkan Password')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Minimal 6 karakter')
        .setMinLength(6)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(passInput));
      return interaction.showModal(modal);
    }

    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'buat_password') {
      try {
        const plainPassword = interaction.fields.getTextInputValue('user_password').trim();

        if (plainPassword.length < 6) {
          return interaction.reply({
            content: '⚠️ Password terlalu pendek. Minimal 6 karakter.',
            flags: MessageFlags.Ephemeral
          });
        }

        const userData = await PlayerUCP.findOne({
          where: {
            DiscordID: interaction.user.id,
          }
        });

        if (!userData) {
          return interaction.reply({
            content: '⚠️ Data tidak ditemukan atau belum verifikasi.',
            flags: MessageFlags.Ephemeral
          });
        }

        const salt = generateSalt();
        const hashed = hashPassword(plainPassword, salt);

        await userData.update({ password: hashed, salt });
        await interaction.reply({
          content: '✅ Password berhasil disimpan, Anda Berhasil mengubah password!',
          flags: MessageFlags.Ephemeral
        });
          
        const updatedButton = new ButtonBuilder()
          .setCustomId('ubah_password')
          .setLabel('Berhasil Mengganti Password')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true);

      } catch (err) {
        console.error('⚠️ Gagal menyimpan password:', err);
        return interaction.reply({
          content: '⚠️] Terjadi kesalahan saat menyimpan password.',
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
};