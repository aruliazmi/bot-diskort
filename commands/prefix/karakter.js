require('dotenv').config();
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  AttachmentBuilder
} = require('discord.js');
const path = require('path');
const { sequelize } = require('../../db');

const ALLOWED_ROLE_IDS = process.env.ALLOWED_ROLE_IDS
  ? process.env.ALLOWED_ROLE_IDS.split(',').map(id => id.trim())
  : [];

module.exports = {
  name: 'karakter',
  description: 'Menampilkan karakter kamu atau user lain (jika diizinkan)',

  async execute(message, args) {
    const mentionedUser = message.mentions.users.first();

    const targetUser = mentionedUser || message.author;
    const isSelf = targetUser.id === message.author.id;

    if (!isSelf) {
      const hasPermission = message.member.roles.cache.some(role =>
        ALLOWED_ROLE_IDS.includes(role.id)
      );

      if (!hasPermission) {
        return message.reply('❌ Kamu tidak punya izin untuk melihat karakter user lain.');
      }
    }

    try {
      const [characters] = await sequelize.query(`
        SELECT pc.*
        FROM playerucp pu
        JOIN players pc ON pu.ucp = pc.ucp
        WHERE pu.DiscordID = ?
      `, { replacements: [targetUser.id] });

      if (!characters.length) {
        return message.reply(`❌ ${isSelf ? 'Kamu' : `User <@${targetUser.id}>`} belum memiliki karakter.`);
      }

      if (characters.length === 1) {
        return sendCharacterEmbed(message, characters[0], targetUser);
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId(`select-karakter-${targetUser.id}`)
        .setPlaceholder('Pilih karakter yang ingin ditampilkan')
        .addOptions(characters.map(char => ({
          label: char.username,
          value: char.username
        })));

      const row = new ActionRowBuilder().addComponents(select);

      await message.reply({
        content: `Silakan pilih karakter untuk ${isSelf ? 'kamu' : `<@${targetUser.id}>`}:`,
        components: [row]
      });

      const collector = message.channel.createMessageComponentCollector({
        filter: (i) =>
          i.user.id === message.author.id && i.customId === `select-karakter-${targetUser.id}`,
        time: 15000,
        max: 1
      });

      collector.on('collect', async (interaction) => {
        const selected = characters.find(c => c.username === interaction.values[0]);
        if (!selected) {
          return interaction.reply({ content: '❌ Karakter tidak ditemukan.', ephemeral: true });
        }

        await interaction.update({
          content: `✅ Karakter **${selected.username}** dipilih.`,
          components: []
        });

        await sendCharacterEmbed(message, selected, targetUser);
      });

      collector.on('end', (collected) => {
        if (collected.size === 0) {
          message.editReply?.({ content: '⌛ Waktu habis, silakan ketik ulang perintah.', components: [] });
        }
      });

    } catch (err) {
      console.error('[KARAKTER ERROR]', err);
      message.reply('❌ Terjadi kesalahan saat mengambil data karakter.');
    }
  }
};

async function sendCharacterEmbed(message, c, user) {
  const body = [
    `Head ${c.kepala}%`,
    `Stomach ${c.perut}%`,
    `LA ${c.lengankiri}%`,
    `RA ${c.lengankanan}%`,
    `LF ${c.kakikiri}%`,
    `RF ${c.kakikanan}%`,
  ].join(', ');

  const skinId = c.skin;
  const filePath = path.resolve(__dirname, `../../skin/${skinId}.png`);
  const attachment = new AttachmentBuilder(filePath, { name: 'karakter.jpg' });

  const embed = new EmbedBuilder()
    .setTitle(`🧍 Karakter: ${c.username}`)
    .setColor('#FFD700')
    .setAuthor({ name: `Pemilik: ${user.username}`, iconURL: user.displayAvatarURL() })
    .setDescription([
      '**💰 Uang**',
      `Cash: \`$${c.money}\``,
      `Bank: \`$${c.bmoney}\``,
      `Rekening: \`${c.brek}\``,
      '',
      '**❤️ Kesehatan**',
      `Health: \`${c.health}%\` | Armor: \`${c.armour}%\``,
      `Hunger: \`${c.hunger}%\` | Drink: \`${c.energy}%\``,
      `Mental: \`${c.bladder}%\``,
      `Body: ${body}`,
      '',
      '**📈 Progress**',
      `Level: \`${c.level}\` | Exp: \`${c.levelup}\``,
      `Playtime: \`${c.hours} JAM ${c.minutes} MENIT\``,
      '',
      '**📇 Info Tambahan**',
      `Skin ID: \`${c.skin}\``
    ].join('\n'))
    .setImage('attachment://karakter.jpg');

  await message.channel.send({ embeds: [embed], files: [attachment] });
}