const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

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
const PAYPAL_EMAIL = process.env.PAYPAL_EMAIL;
const MAX_SLOTS = parseInt(process.env.MAX_SLOTS) || 5;
const PRICE_PER_HOUR = 2;

let currentSlots = 0;
let activeUsers = new Map();
let ticketCounter = 0;
let userPaymentData = new Map();

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
        { name: '!panel', value: 'Afficher le panel de paiement' },
        { name: '!confirm @user <heures>', value: 'Activer l\'accès (Admin)' },
        { name: '!time', value: 'Voir ton temps restant' },
        { name: '!slots', value: 'Voir les slots disponibles' }
      );
    return message.reply({ embeds: [embed] });
  }

  // !panel
  if (message.content === '!panel') {
    const panelButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('create_ticket_panel')
          .setLabel('🎫 Créer un ticket')
          .setStyle(ButtonStyle.Primary)
      );

    const embed = new EmbedBuilder()
      .setColor('#FF6B6B')
      .setTitle('💳 Système de Paiement')
      .setDescription('Clique sur le bouton pour créer un ticket et choisir ton moyen de paiement\n\n**Tarif:** 2€ par heure')
      .setFooter({ text: 'PayPal ou Brainrot' });

    await message.channel.send({ embeds: [embed], components: [panelButton] });
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

// Interactions (boutons, menus, modals)
client.on('interactionCreate', async (interaction) => {
  try {
    // Bouton créer ticket
    if (interaction.isButton() && interaction.customId === 'create_ticket_panel') {
      const modal = new ModalBuilder()
        .setCustomId('hours_modal')
        .setTitle('Combien d\'heures ?');

      const hoursInput = new TextInputBuilder()
        .setCustomId('hours_input')
        .setLabel('Nombre d\'heures (2€/h)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 1, 2, 5...')
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(hoursInput);
      modal.addComponents(row);

      await interaction.showModal(modal);
    }

    // Modal heures
    if (interaction.isModalSubmit() && interaction.customId === 'hours_modal') {
      const hours = parseInt(interaction.fields.getTextInputValue('hours_input'));

      if (isNaN(hours) || hours <= 0) {
        return await interaction.reply({
          content: '❌ Rentre un nombre valide !',
          ephemeral: true
        });
      }

      const totalPrice = hours * PRICE_PER_HOUR;
      userPaymentData.set(interaction.user.id, { hours, totalPrice });

      const paymentMenu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('payment_method')
            .setPlaceholder('Choisir un moyen de paiement')
            .addOptions(
              {
                label: `PayPal - ${totalPrice}€`,
                value: 'paypal',
                emoji: '💳'
              },
              {
                label: `Brainrot - ${totalPrice}€`,
                value: 'brainrot',
                emoji: '🧠'
              }
            )
        );

      await interaction.reply({
        content: `💰 **${hours}h = ${totalPrice}€**\n\nChoisir ton moyen de paiement :`,
        components: [paymentMenu],
        ephemeral: true
      });
    }

    // Menu de sélection du moyen de paiement
    if (interaction.isStringSelectMenu() && interaction.customId === 'payment_method') {
      const method = interaction.values[0];
      const paymentData = userPaymentData.get(interaction.user.id);

      if (method === 'paypal') {
        // Modal pour email PayPal
        const modal = new ModalBuilder()
          .setCustomId('paypal_modal')
          .setTitle('Informations PayPal');

        const emailInput = new TextInputBuilder()
          .setCustomId('paypal_email')
          .setLabel('Email PayPal')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('exemple@gmail.com')
          .setRequired(true);

        const row = new ActionRowBuilder().addComponents(emailInput);
        modal.addComponents(row);

        await interaction.showModal(modal);
      } else if (method === 'brainrot') {
        // Créer le ticket directement pour Brainrot
        await createTicket(interaction.user, interaction.guild, 'brainrot', paymentData.hours, paymentData.totalPrice);
        await interaction.reply({
          content: `✅ Ticket créé ! Brainrot sélectionné.\n💰 **Montant:** ${paymentData.totalPrice}€`,
          ephemeral: true
        });
      }
    }

    // Modal PayPal
    if (interaction.isModalSubmit() && interaction.customId === 'paypal_modal') {
      const paypalEmail = interaction.fields.getTextInputValue('paypal_email');
      const paymentData = userPaymentData.get(interaction.user.id);

      await createTicket(interaction.user, interaction.guild, 'paypal', paymentData.hours, paymentData.totalPrice, paypalEmail);
      await interaction.reply({
        content: `✅ Ticket créé ! PayPal: ${paypalEmail}\n💰 **Montant:** ${paymentData.totalPrice}€`,
        ephemeral: true
      });
    }

    // Bouton fermer ticket
    if (interaction.isButton() && interaction.customId === 'close_ticket') {
      if (interaction.channel.name.startsWith('ticket-')) {
        await interaction.reply('⏳ Fermeture du ticket...');
        setTimeout(() => {
          interaction.channel.delete().catch(() => {});
        }, 2000);
      }
    }
  } catch (error) {
    console.error(error);
    if (!interaction.replied) {
      await interaction.reply({ content: '❌ Erreur', ephemeral: true }).catch(() => {});
    }
  }
});

async function createTicket(user, guild, paymentMethod, hours, totalPrice, paypalEmail = null) {
  ticketCounter++;
  const ticketName = `ticket-${ticketCounter}`;

  try {
    const ticket = await guild.channels.create({
      name: ticketName,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: user.id,
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

    let description = `Bienvenue ${user}!\n\n`;
    description += `⏱️ **Durée:** ${hours}h\n`;
    description += `💰 **Montant:** ${totalPrice}€\n`;
    
    if (paymentMethod === 'paypal') {
      description += `💳 **Moyen de paiement:** PayPal\n`;
      description += `📧 **Email:** ${paypalEmail}\n`;
    } else {
      description += `🧠 **Moyen de paiement:** Brainrot\n`;
    }
    description += `\nDécris ton problème et on va t'aider.`;

    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle(`🎫 Ticket #${ticketCounter}`)
      .setDescription(description)
      .setFooter({ text: 'Clique sur le bouton pour fermer le ticket' });

    await ticket.send({ embeds: [embed], components: [closeButton] });
  } catch (error) {
    console.error(error);
  }
}

client.login(TOKEN);
