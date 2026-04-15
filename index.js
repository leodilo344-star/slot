const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

const TOKEN = process.env.TOKEN;
const BUYER_ROLE_ID = process.env.BUYER_ROLE_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const MAX_SLOTS = parseInt(process.env.MAX_SLOTS) || 5;

let currentSlots = 0;
let activeUsers = new Map();
let ticketCounter = 0;

client.on('ready', () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  client.user.setActivity('!help pour l\'aide', { type: 'WATCHING' });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // !help
  if (message.content === '!help') {
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('📋 Commandes disponibles')
      .addFields(
        { name: '!ticket', value: 'Créer un ticket' },
        { name: '!confirm @user <heures>', value: 'Activer l\'accès (Admin)' },
        { name: '!time', value: 'Voir ton temps restant' },
        { name: '!slots', value: 'Voir les slots disponibles' }
      );
    return message.reply({ embeds: [embed] });
  }

  // !ticket
  if (message.content === '!ticket') {
    if (!message.member.roles.cache.has(BUYER_ROLE_ID)) {
      return message.reply('❌ Tu dois avoir le rôle Buyer pour créer un ticket !');
    }

    ticketCounter++;
    const ticketName = `ticket-${ticketCounter}`;
    
    try {
      const ticket = await message.guild.channels.create({
        name: ticketName,
        type: ChannelType.GuildText,
        parent: message.channel.parentId,
        permissionOverwrites: [
          {
            id: message.guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: message.author.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
          }
        ]
      });

      const closeButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('Fermer le ticket')
            .setStyle(ButtonStyle.Danger)
        );

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle(`🎫 Ticket #${ticketCounter}`)
        .setDescription(`Bienvenue ${message.author}!\n\nDécris ton problème et on va t'aider.`)
        .setFooter({ text: 'Clique sur le bouton pour fermer le ticket' });

      await ticket.send({ embeds: [embed], components: [closeButton] });
      message.reply(`✅ Ticket créé : ${ticket}`);
    } catch (error) {
      console.error(error);
      message.reply('❌ Erreur lors de la création du ticket');
    }
  }

  // !confirm
  if (message.content.startsWith('!confirm')) {
    if (!message.member.permissions.has('Administrator')) {
      return message.reply('❌ Tu n\'as pas les permissions !');
    }

    const user = message.mentions.members.first();
    const hours = parseInt(message.content.split(' ')[2]);

    if (!user || !hours) {
      return message.reply('Usage: !confirm @user <heures>');
    }

    if (currentSlots >= MAX_SLOTS) {
      return message.reply('❌ Plus de slots disponibles !');
    }

    currentSlots++;
    await user.roles.add(BUYER_ROLE_ID);
    message.reply(`✅ Accès activé pour ${user} pendant ${hours}h`);

    const duration = hours * 60 * 60 * 1000;
    const endTime = Date.now() + duration;

    setTimeout(() => {
      user.send('⏰ Il te reste 10 minutes d\'accès !').catch(() => {});
    }, duration - 10 * 60 * 1000);

    const timeout = setTimeout(async () => {
      await user.roles.remove(BUYER_ROLE_ID).catch(() => {});
      currentSlots--;
      const channel = await client.channels.fetch(CHANNEL_ID);
      channel.send(`@here Un slot est disponible ! (${user.user.tag} a expiré)`).catch(() => {});
      activeUsers.delete(user.id);
    }, duration);

    activeUsers.set(user.id, { timeout, endTime });
  }

  // !time
  if (message.content === '!time') {
    const data = activeUsers.get(message.author.id);
    if (!data) return message.reply('❌ Tu n\'as pas d\'accès actif');
    const remaining = data.endTime - Date.now();
    const minutes = Math.floor(remaining / 60000);
    message.reply(`⏱️ Temps restant: ${minutes} minutes`);
  }

  // !slots
  if (message.content === '!slots') {
    message.reply(`📊 Slots: ${currentSlots}/${MAX_SLOTS}`);
  }
});

// Bouton fermer ticket
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'close_ticket') {
    if (interaction.channel.name.startsWith('ticket-')) {
      await interaction.reply('⏳ Fermeture du ticket...');
      setTimeout(() => {
        interaction.channel.delete().catch(() => {});
      }, 2000);
    }
  }
});

client.login(TOKEN);
