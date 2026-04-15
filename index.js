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
const ROBLOX_USERNAME = process.env.ROBLOX_USERNAME;
const MAX_SLOTS = 5;

let currentSlots = 0;
let activeUsers = new Map();
let ticketCounter = 0;
let userTicketData = new Map();
let ticketChannels = new Map();

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
        { name: '!confirm @user <heures>', value: 'Confirmer le paiement et envoyer le script (Admin)' },
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
      .setDescription('Clique sur le bouton pour créer un ticket\n\n**Tarifs:**\n💳 PayPal: 2€/h\n🧠 Brainrot: 1 Garama/h')
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
      return message.reply(`❌ Tous les slots sont utilisés ! (${currentSlots}/${MAX_SLOTS})`);
    }

    currentSlots++;
    await user.roles.add(BUYER_ROLE_ID);

    // Trouver le ticket de l'utilisateur
    const ticketChannel = ticketChannels.get(user.id);
    if (ticketChannel) {
      // Envoyer le message de confirmation
      const confirmEmbed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ Paiement Confirmé !')
        .setDescription('Voici votre script :');

      await ticketChannel.send({ embeds: [confirmEmbed] });

      // Envoyer le script de test
      const scriptEmbed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('📜 TEST SCRIPT')
        .setDescription('```\nTEST SCRIPT - Ceci est un script de test\n```');

      await ticketChannel.send({ embeds: [scriptEmbed] });

      // Afficher le timer en grand
      displayTimer(ticketChannel, user, hours);
    }

    message.reply(`✅ Accès activé pour ${user} pendant ${hours}h\n📊 Slots: ${currentSlots}/${MAX_SLOTS}`);

    const duration = hours * 60 * 60 * 1000;
    const endTime = Date.now() + duration;

    setTimeout(() => {
      user.send('⏰ Il te reste 10 minutes d\'accès !').catch(() => {});
    }, duration - 10 * 60 * 1000);

    const timeout = setTimeout(async () => {
      await user.roles.remove(BUYER_ROLE_ID).catch(() => {});
      currentSlots--;
      ticketChannels.delete(user.id);

      if (ticketChannel) {
        const expireEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('⏰ Temps Expiré !')
          .setDescription(`Votre accès a expiré. Slot libéré (${currentSlots}/${MAX_SLOTS})`);
        await ticketChannel.send({ embeds: [expireEmbed] }).catch(() => {});
      }

      const channel = await client.channels.fetch(CHANNEL_ID);
      channel.send(`🟢 Un slot est disponible ! (${currentSlots}/${MAX_SLOTS})`).catch(() => {});
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
    const available = MAX_SLOTS - currentSlots;
    if (currentSlots >= MAX_SLOTS) {
      message.reply(`❌ Tous les slots sont utilisés ! (${currentSlots}/${MAX_SLOTS})`);
    } else {
      message.reply(`📊 Slots: ${currentSlots}/${MAX_SLOTS} (${available} disponible${available > 1 ? 's' : ''})`);
    }
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
        .setLabel('Nombre d\'heures')
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

      const priceEuro = hours * 2;
      const priceGarama = hours * 1;

      // Créer le ticket
      await createTicket(interaction.user, interaction.guild, hours, priceEuro, priceGarama);

      await interaction.reply({
        content: `✅ Ticket créé ! Regarde le ticket privé.`,
        ephemeral: true
      });
    }

    // Menu de sélection du moyen de paiement
    if (interaction.isStringSelectMenu() && interaction.customId === 'payment_method') {
      const method = interaction.values[0];
      const ticketData = userTicketData.get(interaction.user.id);

      if (!ticketData) {
        return await interaction.reply({
          content: '❌ Erreur: données du ticket introuvables',
          ephemeral: true
        });
      }

      const { hours, priceEuro, priceGarama, ticketChannel } = ticketData;

      if (method === 'paypal') {
        const paypalLink = `https://paypal.me/zxnllegoatap/${priceEuro}`;
        const embed = new EmbedBuilder()
          .setColor('#003087')
          .setTitle('💳 Paiement PayPal')
          .setDescription(`Voici mon PayPal, vous devez payer **${priceEuro}€** (${hours}h × 2€/h)\n\n[Cliquez ici pour payer](${paypalLink})`);

        await ticketChannel.send({ embeds: [embed] });
      } else if (method === 'brainrot') {
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('🧠 Paiement Brainrot')
          .setDescription(`Voici mon Pseudo Roblox: **${ROBLOX_USERNAME}**\n\nVous devez payer **${priceGarama} Garama** (${hours}h × 1 Garama/h)`);

        await ticketChannel.send({ embeds: [embed] });
      }

      // Message d'attente de confirmation
      const waitEmbed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('⏳ En attente de confirmation')
        .setDescription('Une fois le paiement confirmé vous recevrez le script');

      await ticketChannel.send({ embeds: [waitEmbed] });

      await interaction.reply({
        content: '✅ Message de paiement envoyé !',
        ephemeral: true
      });

      userTicketData.delete(interaction.user.id);
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

async function createTicket(user, guild, hours, priceEuro, priceGarama) {
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

    // Stocker le ticket channel
    ticketChannels.set(user.id, ticket);

    // Ping l'utilisateur
    await ticket.send(`${user}`);

    // Menu de sélection du moyen de paiement
    const paymentMenu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('payment_method')
          .setPlaceholder('Choisir un moyen de paiement')
          .addOptions(
            {
              label: `PayPal - ${priceEuro}€`,
              value: 'paypal',
              emoji: '💳'
            },
            {
              label: `Brainrot - ${priceGarama} Garama`,
              value: 'brainrot',
              emoji: '🧠'
            }
          )
      );

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
      .setDescription(`Bienvenue ${user}!\n\n⏱️ **Durée:** ${hours}h\n\nChoisir ton moyen de paiement :`)
      .setFooter({ text: 'Clique sur le bouton pour fermer le ticket' });

    await ticket.send({ embeds: [embed], components: [paymentMenu, closeButton] });

    // Stocker les données du ticket
    userTicketData.set(user.id, { hours, priceEuro, priceGarama, ticketChannel: ticket });
  } catch (error) {
    console.error(error);
  }
}

function displayTimer(channel, user, hours) {
  const totalSeconds = hours * 3600;
  let remainingSeconds = totalSeconds;
  let timerMessage = null;

  const timerInterval = setInterval(async () => {
    const h = Math.floor(remainingSeconds / 3600);
    const m = Math.floor((remainingSeconds % 3600) / 60);
    const s = remainingSeconds % 60;

    const timerEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('⏱️ TIMER')
      .setDescription(`\`\`\`\n${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}\n\`\`\``)
      .setFooter({ text: `Temps restant pour ${user.username}` });

    if (remainingSeconds === totalSeconds) {
      timerMessage = await channel.send({ embeds: [timerEmbed] });
      timerMessage.pin().catch(() => {});
    } else if (timerMessage) {
      timerMessage.edit({ embeds: [timerEmbed] }).catch(() => {});
    }

    remainingSeconds--;

    if (remainingSeconds < 0) {
      clearInterval(timerInterval);
    }
  }, 1000);
}

client.login(TOKEN);
