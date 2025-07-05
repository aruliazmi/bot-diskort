const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  EmbedBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js')

const OWNER_ID = process.env.OWNER_ID;
const REGIST_CHANNEL = process.env.REGIST_CHANNEL;
const tagChannel = `<#${REGIST_CHANNEL}>`;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('handleregist')
    .setDescription('Mulai registrasi OTP dan akun'),

  async execute(interaction) {
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({
        content: '⚠️ Hanya owner yang dapat menggunakan perintah ini.',
        flags: MessageFlags.Ephemeral
      });
    }

    if (interaction.channelId !== REGIST_CHANNEL) {
      return interaction.reply({
        content: `❌ Command ini hanya bisa digunakan di channel ${tagChannel}`,
        flags: MessageFlags.Ephemeral
      });
    }

    const msgEmbed = new EmbedBuilder()
      .setAuthor({
        name: 'Araz BOT | User Control Panel',
        iconURL: 'https://media.discordapp.net/attachments/1387382523918815263/1389936744824307853/pp-aesthetic-anime.jpg'
      })
      .setThumbnail('https://media.discordapp.net/attachments/1387382523918815263/1389936744824307853/pp-aesthetic-anime.jpg')
      .setColor('#FF0000')
      .setDescription(
        "Channel ini merupakan tempat di mana kamu dapat mengatur akun UCP kamu sendiri. Berikut ini adalah fungsi dari setiap tombol yang tersedia:\n\n" +
        "📃 __Register__\n> Membuat akun UCP baru dan mengirim OTP ke WhatsApp kamu untuk verifikasi.\n\n" +
        "♻️ __Refund Role__\n> Jika kamu sudah terverifikasi sebelumnya lalu keluar discord, gunakan tombol ini untuk mengembalikan role dan ucp.\n\n" +
        "📲 __Reset Password__ *\n> Jika kamu ingin mengganti password, sistem akan mengirim OTP baru ke WhatsApp kamu."
      )
      .setFooter({ text: "Aruli Azmi" })
      .setTimestamp();

    const Buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("open_modal")
        .setLabel("Register")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("📃"),

      new ButtonBuilder()
        .setCustomId("button-reffrole")
        .setLabel("Refund Role")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("♻️")
  );

    return interaction.reply({
      embeds: [msgEmbed],
      components: [Buttons]
    });
  },

  async handleInteraction(interaction) {
    if (interaction.isButton() && interaction.customId === 'open_modal') {
      const modal = new ModalBuilder().setCustomId('form_nama').setTitle('Isi Data Kamu');

      const namaInput = new TextInputBuilder()
        .setCustomId('username')
        .setLabel('Masukkan username UCP')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(5);

      const telpInput = new TextInputBuilder()
        .setCustomId('telepon')
        .setLabel('Nomor Telepon (gunakan 62)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(namaInput),
        new ActionRowBuilder().addComponents(telpInput)
      );

      return await interaction.showModal(modal);
    }
  }
};
