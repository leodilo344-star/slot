const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const TOKEN = process.env.TOKEN;
const BUYER_ROLE_ID = process.env.BUYER_ROLE_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const MAX_SLOTS = parseInt(process.env.MAX_SLOTS) || 5;

let currentSlots = 0;
let activeUsers = new Map();

client.on('ready', () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith('!confirm')) {
    if (!message.member.permissions.has("Administrator")) {
      return message.reply("❌ Tu n'as pas les permissions !");
    }

    const user = message.mentions.members.first();
    const hours = parseInt(message.content.split(" ")[2]);

    if (!user || !hours) {
      return message.reply("Usage: !confirm @user <heures>");
    }

    if (currentSlots >= MAX_SLOTS) {
      return message.reply("❌ Plus de slots disponibles !");
    }

    currentSlots++;
    await user.roles.add(BUYER_ROLE_ID);
    message.reply(`✅ Accès activé pour ${user} pendant ${hours}h`);

    const duration = hours * 60 * 60 * 1000;
    const endTime = Date.now() + duration;

    setTimeout(() => {
      user.send("⏰ Il te reste 10 minutes d'accès !").catch(() => {});
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

  if (message.content === "!time") {
    const data = activeUsers.get(message.author.id);
    if (!data) return message.reply("❌ Tu n'as pas d'accès actif");
    const remaining = data.endTime - Date.now();
    const minutes = Math.floor(remaining / 60000);
    message.reply(`⏱️ Temps restant: ${minutes} minutes`);
  }

  if (message.content === "!slots") {
    message.reply(`📊 Slots: ${currentSlots}/${MAX_SLOTS}`);
  }
});

client.login(TOKEN);
