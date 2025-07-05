require('dotenv').config()
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  InteractionType,
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
    if (interaction.isButton() && interaction.customId === 'set_password') {
      const userData = await PlayerUCP.findOne({
        where: {
          DiscordID: interaction.user.id,
          verified: true
        }
      });

      if (!userData) {
        return interaction.reply({
          content: '⚠️ Data tidak ditemukan atau belum verifikasi.',
          flags: MessageFlags.Ephemeral
        });
      }

      if (userData.password) {
        return interaction.reply({
          content: '⚠️ Kamu sudah membuat password. Hubungi admin jika ingin mengganti.',
          flags: MessageFlags.Ephemeral
        });
      }

      const modal = new ModalBuilder()
        .setCustomId('form_password')
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

    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'form_password') {
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
            verified: true
          }
        });

        if (!userData) {
          return interaction.reply({
            content: '⚠️ Data tidak ditemukan atau belum verifikasi.',
            flags: MessageFlags.Ephemeral
          });
        }

        if (userData.password) {
          return interaction.reply({
            content: '⚠️ Password sudah pernah dibuat. Hubungi admin jika ingin mengganti.',
            flags: MessageFlags.Ephemeral
          });
        }

        const salt = generateSalt();
        const hashed = hashPassword(plainPassword, salt);

        await userData.update({ password: hashed, salt });

        await interaction.reply({
          content: '✅ Password berhasil disimpan, Anda Berhasil melakukan Registrasi!',
          flags: MessageFlags.Ephemeral
        });

        const ucpRoleId = process.env.UCP_ROLE_ID;
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

        if (member && ucpRoleId && !member.roles.cache.has(ucpRoleId)) {
          await member.roles.add(ucpRoleId).catch(console.error);
        }

        const logChannelId = process.env.REGISTER_LOG_CHANNEL;
        const logChannel = interaction.client.channels.cache.get(logChannelId);

        if (logChannel) {
          logChannel.send({
            content: `${interaction.user} telah melakukan registrasi UCP`
          }).catch(console.error);
        } else {
          console.warn('⚠️ Register log channel tidak ditemukan atau belum diset.');
        }

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