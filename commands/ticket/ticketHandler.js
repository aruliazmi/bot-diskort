const {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

module.exports = {
  async handleInteraction(interaction) {
    if (!interaction.isButton()) return;

    const { guild, user, customId, channel } = interaction;
    const TICKET_ROLE_ID = process.env.TICKET_ROLE_ID;
    const CATEGORY_ID = process.env.TICKET_CATEGORY_ID;
    const ARCHIVE_CATEGORY_ID = process.env.TICKET_ARCHIVE_CATEGORY_ID;

    const supportRole = guild.roles.cache.get(TICKET_ROLE_ID);
    if (!supportRole) {
      return interaction.reply({
        content: '❌ Role support tidak ditemukan.',
        flags: MessageFlags.Ephemeral
      });
    }

    // === CREATE TICKET ===
    if (customId === 'create_ticket') {
      const existing = guild.channels.cache.find(c => c.name.startsWith(`ticket-${user.username.toLowerCase()}`));
      if (existing) {
        return interaction.reply({
          content: '⚠️ Kamu sudah punya ticket terbuka.',
          flags: MessageFlags.Ephemeral
        });
      }

      const now = new Date();
      const day = now.getDate(); 
      const month = now.getMonth() + 1; 
      const year = now.getFullYear().toString().slice(-2); 

      const dateFormatted = `${month}-${day}-${year}`;
      const sanitizedUsername = user.username.toLowerCase().replace(/[^a-z0-9]/gi, '-');

      const ticketChannel = await guild.channels.create({
        name: `ticket-${sanitizedUsername}-${dateFormatted}`,
        type: ChannelType.GuildText,
        parent: CATEGORY_ID,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: TICKET_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory] }
        ]
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`close_ticket_${user.id}`).setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({ content: `🎟️ Ticket dibuat oleh ${user}`, components: [row] });

      return interaction.reply({
        content: `✅ Ticket berhasil dibuat: ${ticketChannel}`,
        flags: MessageFlags.Ephemeral
      });
    }

    // === CLOSE TICKET (KONFIRMASI) ===
    if (customId.startsWith('close_ticket')) {
      const ticketOwner = customId.split('_')[2];

      if (channel.parentId === ARCHIVE_CATEGORY_ID) {
        return interaction.reply({
          content: '❌ Ticket ini sudah ditutup.',
          flags: MessageFlags.Ephemeral
        });
      }

      if (user.id !== ticketOwner && !interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({
          content: '⚠️ Kamu tidak bisa menutup ticket ini.',
          flags: MessageFlags.Ephemeral
        });
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_close').setLabel('✅ Ya, tutup').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('cancel_close').setLabel('❎ Batal').setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({
        content: 'Apakah kamu yakin ingin menutup ticket ini?',
        components: [row],
        flags: MessageFlags.Ephemeral
      });
    }

    // === CONFIRM CLOSE ===
    if (customId === 'confirm_close') {
      await interaction.update({
        content: '📁 Ticket sedang ditutup...',
        components: []
      });

      try {
        await channel.setName(`closed-${channel.name}`);
        await channel.setParent(ARCHIVE_CATEGORY_ID, { lockPermissions: false });

        const member = channel.members.find(m => m.user.id !== guild.client.user.id);
        if (member) {
          await channel.permissionOverwrites.edit(member.id, {
            SendMessages: false
          });
        }

        await channel.send('🔒 Ticket ini telah ditutup dan diarsipkan. Hanya bisa dibaca.');
      } catch (err) {
        console.error('❌ Gagal menutup ticket:', err);
        await channel.send('⚠️ Terjadi kesalahan saat menutup ticket.');
      }
    }

    // === CANCEL CLOSE ===
    if (customId === 'cancel_close') {
      return interaction.update({
        content: '✅ Penutupan ticket dibatalkan.',
        components: []
      });
    }
  }
};