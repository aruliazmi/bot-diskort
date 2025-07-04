const {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const axios = require('axios');
const qs = require('qs');

module.exports = {
  async handleInteraction(interaction) {
    if (!interaction.isButton()) return;

    const { guild, user, customId, channel } = interaction;
    const TICKET_ROLE_ID = process.env.TICKET_ROLE_ID;
    const CATEGORY_ID = process.env.TICKET_CATEGORY_ID;
    const ARCHIVE_CATEGORY_ID = process.env.TICKET_ARCHIVE_CATEGORY_ID;

    const supportRole = guild.roles.cache.get(TICKET_ROLE_ID);
    if (!supportRole) {
      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({
          content: '❌ Role support tidak ditemukan.',
          flags: MessageFlags.Ephemeral
        });
      } else {
        return interaction.editReply({
          content: '❌ Role support tidak ditemukan.'
        });
      }
    }

    if (customId === 'create_ticket') {
      const existing = guild.channels.cache.find(c => c.name.startsWith(`ticket-${user.username.toLowerCase()}`));
      if (existing) {
        if (!interaction.replied && !interaction.deferred) {
          return interaction.reply({
            content: '⚠️ Kamu sudah punya ticket terbuka.',
            flags: MessageFlags.Ephemeral
          });
        } else {
          return interaction.editReply({
          });
        }
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

      const ownerPhone = process.env.OWNER_PHONE;
      const message = `🔔 *Ticket baru Dibuat!*\n\nUser: ${user.tag} (${user.id})\nChannel: #${ticketChannel.name}`;

      try {
        await axios.post(
          'https://api.fonnte.com/send',
          qs.stringify({
            target: ownerPhone,
            message
          }),
          {
            headers: {
              Authorization: process.env.FONNTE_TOKEN,
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          }
        );
      } catch (err) {
        console.error('❌ Gagal kirim notifikasi Fonnte:', err.response?.data || err.message);
      }

        const NOTIF_CHANNEL_ID = process.env.TICKET_NOTIFY_CHANNEL;
        const notifChannel = guild.channels.cache.get(NOTIF_CHANNEL_ID);
        if (notifChannel) {
          notifChannel.send({
            content: `📨 Ticket baru telah dibuat di ${ticketChannel}\n\nhandle it immediately <@&${TICKET_ROLE_ID}>`
          }).catch(console.error);
        }

      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({
          content: `✅ Ticket berhasil dibuat: ${ticketChannel}`,
          flags: MessageFlags.Ephemeral
        });
      } else {
        return interaction.editReply({
          content: `✅ Ticket berhasil dibuat: ${ticketChannel}`
        });
      }
    }

    if (customId.startsWith('close_ticket')) {
      const ticketOwner = customId.split('_')[2];

      if (channel.parentId === ARCHIVE_CATEGORY_ID) {
        if (!interaction.replied && !interaction.deferred) {
          return interaction.reply({
            content: '❌ Ticket ini sudah ditutup.',
            flags: MessageFlags.Ephemeral
          });
        } else {
          return interaction.editReply({
            content: '❌ Ticket ini sudah ditutup.'
          });
        }
      }

      if (user.id !== ticketOwner && !interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        if (!interaction.replied && !interaction.deferred) {
          return interaction.reply({
            content: '⚠️ Kamu tidak bisa menutup ticket ini.',
            flags: MessageFlags.Ephemeral
          });
        } else {
          return interaction.editReply({
            content: '⚠️ Kamu tidak bisa menutup ticket ini.'
          });
        }
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_close').setLabel('✅ Ya, tutup').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('cancel_close').setLabel('❎ Batal').setStyle(ButtonStyle.Secondary)
      );

      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({
          content: 'Apakah kamu yakin ingin menutup ticket ini?',
          components: [row],
          flags: MessageFlags.Ephemeral
        });
      } else {
        return interaction.editReply({
          content: 'Apakah kamu yakin ingin menutup ticket ini?',
          components: [row]
        });
      }
    }

    if (customId === 'confirm_close') {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.update({
          content: '📁 Ticket sedang ditutup...',
          components: []
        });
      } else {
        await interaction.editReply({
          content: '📁 Ticket sedang ditutup...',
          components: []
        });
      }

      try {
        await channel.setName(`closed-${channel.name}`);
        await channel.setParent(ARCHIVE_CATEGORY_ID, { lockPermissions: false });

        const targetMember = [...channel.members.values()].find(m => m.user.id !== interaction.client.user.id);
        
        if (targetMember) {
          await channel.permissionOverwrites.edit(targetMember.id, {
            SendMessages: false
          });
        }

        await channel.send('🔒 Ticket ini telah ditutup dan diarsipkan. Hanya bisa dibaca.');
      } catch (err) {
        console.error('❌ Gagal menutup ticket:', err);
        try {
          await channel.send('⚠️ Terjadi kesalahan saat menutup ticket.');
        } catch (sendError) {
          console.error('❌ Gagal kirim error message ke channel:', sendError);
        }
      }
    }

    if (customId === 'cancel_close') {
      return interaction.update({
        content: '✅ Penutupan ticket dibatalkan.',
        components: []
      });
    }
  }
};