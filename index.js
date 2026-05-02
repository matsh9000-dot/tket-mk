const {
  Client,
  GatewayIntentBits,
  Partials,
} = require("discord.js");
var Discord = require("discord.js");
const { readFileSync, writeFileSync, existsSync, mkdirSync } = require("fs");
require('dotenv').config();

const config = JSON.parse(readFileSync("./config.json", "utf8"));
let PREFIX = config.PREFIX || "!";

// ========== TICKET TYPES FROM ENV ==========
const ticketTypes = {
  support: {
    name: process.env.SUPPORT_NAME || "Support",
    roleId: process.env.SUPPORT_ROLE_ID,
    image: process.env.SUPPORT_IMAGE || "https://i.ibb.co/NgDK2W04/30ae4ddbd22d.jpg",
    emoji: process.env.SUPPORT_EMOJI || "<:discotoolsxyzicon20230515T224809:1488784883500449792>"
  },
  dev_team: {
    name: process.env.DEV_TEAM_NAME || "Dev Team",
    roleId: process.env.DEV_TEAM_ROLE_ID,
    image: process.env.DEV_TEAM_IMAGE || "https://i.ibb.co/PZ6Ftt9v/cbf5b7fc19d4.jpg",
    emoji: process.env.DEV_TEAM_EMOJI || "<:discotoolsxyzicon20230515T224546:1488784826441142384>"
  },
  request: {
    name: process.env.REQUEST_NAME || "Request",
    roleId: process.env.REQUEST_ROLE_ID,
    image: process.env.REQUEST_IMAGE || "https://i.ibb.co/V0c5H5Gp/b96cacf67c2f.jpg",
    emoji: process.env.REQUEST_EMOJI || "<:discotoolsxyzicon20230515T224832:1488784896619970680>"
  }
};

// ========== SAVE PREFIX FUNCTION ==========
function savePrefix(prefix) {
  config.PREFIX = prefix;
  writeFileSync("./config.json", JSON.stringify(config, null, 2));
  PREFIX = prefix;
}

// ========== TRANSCRIPT CHANNEL SETTING ==========
let transcriptChannelId = null;
const TRANSCRIPT_CONFIG_FILE = "./logs/transcriptChannel.json";

if (existsSync(TRANSCRIPT_CONFIG_FILE)) {
 const savedData = JSON.parse(readFileSync(TRANSCRIPT_CONFIG_FILE, "utf8"));
 transcriptChannelId = savedData.channelId;
 console.log(`📄 | Loaded transcript channel: ${transcriptChannelId}`);
}

function saveTranscriptChannel(channelId) {
 writeFileSync(TRANSCRIPT_CONFIG_FILE, JSON.stringify({ channelId: channelId, updatedAt: new Date().toISOString() }, null, 2));
 transcriptChannelId = channelId;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.User,
    Partials.GuildMember,
  ],
});

// ========== CREATE LOGS FOLDER ==========
if (!existsSync("./logs")) {
 mkdirSync("./logs");
}

// ========== TICKET SYSTEM ==========
let ticketCounter = 1;
const TICKET_COUNTER_FILE = "./logs/ticketCounter.json";
if (existsSync(TICKET_COUNTER_FILE)) {
 const counterData = JSON.parse(readFileSync(TICKET_COUNTER_FILE, "utf8"));
 ticketCounter = counterData.lastTicket + 1;
}
function saveTicketCounter() {
 writeFileSync(TICKET_COUNTER_FILE, JSON.stringify({ lastTicket: ticketCounter - 1 }));
}
function getNextTicketNumber() {
 const num = ticketCounter;
 ticketCounter++;
 saveTicketCounter();
 return num;
}

let claimedTickets = new Set();
let autoCloseTimers = new Map();
let ticketsEnabled = true;

async function closeAllTickets(guild) {
 let success = 0, failed = 0;
 for (const channel of guild.channels.cache.values()) {
  if (channel.ticketNumber) {
   try { await channel.delete(); success++; } catch { failed++; }
  }
 }
 return { success, failed };
}

async function createTicketForUser(guild, member, ticketType, requestedBy) {
 const type = ticketTypes[ticketType];
 if (!type || !type.roleId) return null;
 
 const ticketNumber = getNextTicketNumber();
 const roomName = `ticket-${ticketNumber}`;
 const ticketChannel = await guild.channels.create({
  name: roomName, type: 0, parent: config.CATEGORY_ID,
  permissionOverwrites: [
   { id: guild.id, deny: ['ViewChannel'] },
   { id: member.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AttachFiles', 'EmbedLinks'] },
   { id: type.roleId, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AttachFiles', 'EmbedLinks', 'ManageChannels'] }
  ]
 });
 ticketChannel.ticketNumber = ticketNumber;
 ticketChannel.ticketOwnerId = member.id;
 ticketChannel.ticketType = type.name;
 ticketChannel.supportRoleId = type.roleId;
 
 const insideContainer = new Discord.ContainerBuilder()
  .addTextDisplayComponents(text => text.setContent(`# 🎫 Ticket #${ticketNumber} - ${type.name}`))
  .addSeparatorComponents(separator => separator.setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
  .addSectionComponents(section => section.addTextDisplayComponents(text => text.setContent(`**User:**\n${member.user.toString()}`)).setThumbnailAccessory(img => img.setURL(member.user.displayAvatarURL({ dynamic: true }))))
  .addSeparatorComponents(separator => separator.setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
  .addTextDisplayComponents(text => text.setContent(`**Opened By:**\n${requestedBy.toString()}`))
  .addSeparatorComponents(separator => separator.setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
  .addTextDisplayComponents(text => text.setContent(`**Support Team:**\n<@&${type.roleId}>`))
  .addSeparatorComponents(separator => separator.setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
  .addTextDisplayComponents(text => text.setContent(`**Opened:**\n<t:${Math.floor(Date.now() / 1000)}:R>`))
  .addSeparatorComponents(separator => separator.setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
  .addMediaGalleryComponents(media => media.addItems(new Discord.MediaGalleryItemBuilder().setURL(type.image).setDescription(`${type.name} ticket system`)))
  .addSeparatorComponents(separator => separator.setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
  .addActionRowComponents(row => row.setComponents(
   new Discord.ButtonBuilder().setStyle(Discord.ButtonStyle.Secondary).setLabel("Claim").setCustomId("claim_ticket"),
   new Discord.ButtonBuilder().setStyle(Discord.ButtonStyle.Secondary).setLabel("Options").setCustomId("options_menu")
  ))
  .addSeparatorComponents(separator => separator.setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));
 
 await ticketChannel.send({ components: [insideContainer], flags: Discord.MessageFlags.IsComponentsV2 });
 return ticketChannel;
}

async function closeTicket(channel, closer) {
 const ticketNumber = channel.ticketNumber;
 
 // Send transcript to configured channel if exists
 if (transcriptChannelId) {
  const transcriptChannel = await channel.guild.channels.fetch(transcriptChannelId).catch(() => null);
  if (transcriptChannel) {
   const messages = [];
   let lastMessage = null;
   let hasMore = true;
   
   while (hasMore) {
    const options = { limit: 100 };
    if (lastMessage) options.before = lastMessage.id;
    const fetched = await channel.messages.fetch(options);
    if (fetched.size === 0) {
     hasMore = false;
    } else {
     messages.push(...fetched.values());
     lastMessage = fetched.last();
    }
   }
   
   messages.reverse();
   
   let transcript = `📄 **Ticket #${ticketNumber} Transcript**\n`;
   transcript += `━━━━━━━━━━━━━━━━━━━━━━\n`;
   transcript += `**Ticket Type:** ${channel.ticketType}\n`;
   transcript += `**Opened By:** <@${channel.ticketOwnerId}>\n`;
   transcript += `**Closed By:** ${closer.toString()}\n`;
   transcript += `**Opened At:** <t:${Math.floor(channel.createdAt / 1000)}:F>\n`;
   transcript += `**Closed At:** <t:${Math.floor(Date.now() / 1000)}:F>\n`;
   transcript += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
   
   for (const msg of messages) {
    const timestamp = `<t:${Math.floor(msg.createdTimestamp / 1000)}:f>`;
    transcript += `[${timestamp}] ${msg.author.tag} (${msg.author.id}):\n${msg.content || "No text content"}\n`;
    if (msg.attachments.size > 0) {
     msg.attachments.forEach(att => {
      transcript += `📎 Attachment: ${att.url}\n`;
     });
    }
    transcript += `\n`;
   }
   
   transcript += `━━━━━━━━━━━━━━━━━━━━━━\n`;
   transcript += `**End of Transcript - Ticket #${ticketNumber}**\n`;
   
   const transcriptBuffer = Buffer.from(transcript, "utf-8");
   await transcriptChannel.send({
    content: `📄 **Transcript from Ticket #${ticketNumber}**`,
    files: [{ attachment: transcriptBuffer, name: `transcript-ticket-${ticketNumber}.txt` }]
   }).catch(() => {});
  }
 }
 
 const closeContainer = new Discord.ContainerBuilder()
  .addTextDisplayComponents(text => text.setContent(`⏳ Ticket #${ticketNumber} will close in 5 seconds...`))
  .addSeparatorComponents(separator => separator.setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
  .addTextDisplayComponents(text => text.setContent("Please save any important information before it closes."));
 
 await channel.send({ components: [closeContainer], flags: Discord.MessageFlags.IsComponentsV2 });
 setTimeout(async () => { await channel.delete().catch(() => {}); }, 5000);
}

// ========== CONTAINERS ==========
function createHelpContainer() {
 return new Discord.ContainerBuilder()
  .addTextDisplayComponents(text => text.setContent(`# 🎫 Ticket System\n**Prefix:** \`${PREFIX}\``))
  .addSeparatorComponents(separator => separator.setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
  .addTextDisplayComponents(text => text.setContent(`${PREFIX}tt - Open ticket panel`))
  .addTextDisplayComponents(text => text.setContent(`${PREFIX}ticketopen @user <type> - Open ticket for someone`))
  .addTextDisplayComponents(text => text.setContent(`${PREFIX}close - Close current ticket`))
  .addTextDisplayComponents(text => text.setContent(`${PREFIX}come @user - Mention user in ticket`))
  .addTextDisplayComponents(text => text.setContent(`${PREFIX}closeall - Close all tickets (Admin)`))
  .addSeparatorComponents(separator => separator.setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
  .addTextDisplayComponents(text => text.setContent(`${PREFIX}tickets on - Enable ticket system (Admin)`))
  .addTextDisplayComponents(text => text.setContent(`${PREFIX}tickets off - Disable ticket system (Admin)`))
  .addSeparatorComponents(separator => separator.setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
  .addTextDisplayComponents(text => text.setContent(`${PREFIX}settranscriptchannel - Set transcript channel (Admin)`))
  .addSeparatorComponents(separator => separator.setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
  .addTextDisplayComponents(text => text.setContent(`${PREFIX}setprefix <new_prefix> - Change bot prefix (Admin)`))
  .addSeparatorComponents(separator => separator.setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
  .addTextDisplayComponents(text => text.setContent(`${PREFIX}help - This menu`))
  .addSeparatorComponents(separator => separator.setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
  .addTextDisplayComponents(text => text.setContent("© EnzoCord Bot"));
}

function createTicketSystemContainer() {
 const options = [];
 for (const [key, type] of Object.entries(ticketTypes)) {
  if (type.roleId) {
   options.push(
    new Discord.StringSelectMenuOptionBuilder()
     .setLabel(type.name)
     .setValue(key)
     .setEmoji(type.emoji)
   );
  }
 }
 options.push(
  new Discord.StringSelectMenuOptionBuilder()
   .setLabel("Refresh")
   .setValue("refresh")
   .setEmoji("🤑")
 );
 
 return new Discord.ContainerBuilder()
  .addTextDisplayComponents(text => text.setContent("## Welcome to our tickets"))
  .addSeparatorComponents(separator => separator.setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
  .addTextDisplayComponents(text => text.setContent("If you need assistance or have any inquiries, you can open a ticket by selecting the type of support you require from the menu below. Our support team will review your request and respond as soon as possible."))
  .addSeparatorComponents(separator => separator.setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
  .addMediaGalleryComponents(media => media.addItems(new Discord.MediaGalleryItemBuilder().setURL("https://i.ibb.co/jkgN3sm3/44e503d68a1c.jpg").setDescription("ticket system")))
  .addSeparatorComponents(separator => separator.setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
  .addActionRowComponents(row => row.setComponents(
    new Discord.StringSelectMenuBuilder()
     .setCustomId("ticket_menu")
     .setPlaceholder("select from the options")
     .addOptions(options)
  ));
}

// ========== MESSAGE COMMANDS ==========
client.on("messageCreate", async (message) => {
 if (message.author.bot) return;
 if (!message.guild) return;
 
 const content = message.content;
 
 // Set prefix command (Admin only)
 if (content.startsWith(`${PREFIX}setprefix`)) {
  if (!message.member.permissions.has(Discord.PermissionFlagsBits.Administrator)) {
   const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("❌ You need admin permissions!"));
   await message.reply({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 });
   return;
  }
  const args = content.split(" ");
  if (args.length < 2) {
   const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent(`⚠️ Usage: ${PREFIX}setprefix <new_prefix>`));
   await message.reply({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 });
   return;
  }
  const newPrefix = args[1];
  if (newPrefix.length > 5) {
   const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("⚠️ Prefix cannot be longer than 5 characters!"));
   await message.reply({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 });
   return;
  }
  savePrefix(newPrefix);
  const successContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent(`✅ Prefix changed from \`${PREFIX}\` to \`${newPrefix}\``));
  await message.reply({ components: [successContainer], flags: Discord.MessageFlags.IsComponentsV2 });
  return;
 }
 
 // Set transcript channel (Admin only)
 if (content === `${PREFIX}settranscriptchannel`) {
  if (!message.member.permissions.has(Discord.PermissionFlagsBits.Administrator)) {
   const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("❌ You need admin permissions!"));
   await message.reply({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 });
   return;
  }
  saveTranscriptChannel(message.channel.id);
  const successContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent(`✅ **Transcript channel set successfully!**\n📍 Channel: ${message.channel.name}\n📄 Transcripts will be sent here when tickets are closed.`));
  await message.reply({ components: [successContainer], flags: Discord.MessageFlags.IsComponentsV2 });
  return;
 }
 
 // Help command
 if (content === `${PREFIX}help`) {
  const container = createHelpContainer();
  await message.channel.send({ components: [container], flags: Discord.MessageFlags.IsComponentsV2 });
  return;
 }
 
 // Ticket panel
 if (content === `${PREFIX}tt`) {
  await message.delete().catch(() => {});
  const container = createTicketSystemContainer();
  await message.channel.send({ components: [container], flags: Discord.MessageFlags.IsComponentsV2 });
  return;
 }
 
 // Close all tickets (Admin only)
 if (content === `${PREFIX}closeall`) {
  if (!message.member.permissions.has(Discord.PermissionFlagsBits.Administrator)) {
   const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("❌ You need admin permissions!"));
   await message.channel.send({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 });
   return;
  }
  const loadingContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("🔄 Closing all tickets..."));
  await message.channel.send({ components: [loadingContainer], flags: Discord.MessageFlags.IsComponentsV2 });
  const result = await closeAllTickets(message.guild);
  const resultContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent(`✅ Closed ${result.success} tickets successfully!${result.failed > 0 ? ` ❌ Failed: ${result.failed}` : ""}`));
  await message.channel.send({ components: [resultContainer], flags: Discord.MessageFlags.IsComponentsV2 });
  return;
 }
 
 // Ticket system control - ON (Admin only)
 if (content === `${PREFIX}tickets on`) {
  if (!message.member.permissions.has(Discord.PermissionFlagsBits.Administrator)) {
   const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("❌ You need admin permissions!"));
   await message.channel.send({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 });
   return;
  }
  ticketsEnabled = true;
  const successContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("✅ Ticket system has been **ENABLED**!"));
  await message.channel.send({ components: [successContainer], flags: Discord.MessageFlags.IsComponentsV2 });
  return;
 }
 
 // Ticket system control - OFF (Admin only)
 if (content === `${PREFIX}tickets off`) {
  if (!message.member.permissions.has(Discord.PermissionFlagsBits.Administrator)) {
   const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("❌ You need admin permissions!"));
   await message.channel.send({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 });
   return;
  }
  ticketsEnabled = false;
  const successContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("✅ Ticket system has been **DISABLED**!"));
  await message.channel.send({ components: [successContainer], flags: Discord.MessageFlags.IsComponentsV2 });
  return;
 }
 
 // Close current ticket
 if (content === `${PREFIX}close`) {
  const channel = message.channel;
  if (!channel.ticketNumber) {
   const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("❌ This command can only be used inside ticket channels!"));
   await message.channel.send({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 });
   return;
  }
  await closeTicket(channel, message.author);
  return;
 }
 
 // Come command
 if (content.startsWith(`${PREFIX}come`)) {
  const channel = message.channel;
  if (!channel.ticketNumber) {
   const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("❌ This command can only be used inside ticket channels!"));
   await message.channel.send({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 });
   return;
  }
  const args = content.split(" ");
  if (args.length < 2) {
   const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent(`⚠️ Usage: ${PREFIX}come @user`));
   await message.channel.send({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 });
   return;
  }
  const userId = args[1].replace(/[<@!>]/g, "");
  const targetMember = await message.guild.members.fetch(userId).catch(() => null);
  if (!targetMember) {
   const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("⚠️ User not found!"));
   await message.channel.send({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 });
   return;
  }
  const comeContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent(`${message.author.toString()} has called ${targetMember.toString()} to ticket #${channel.ticketNumber}`));
  await message.channel.send({ components: [comeContainer], flags: Discord.MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
  await message.delete().catch(() => {});
  return;
 }
 
 // Ticket open command (Admin/Support only)
 if (content.startsWith(`${PREFIX}ticketopen`)) {
  const args = content.split(" ");
  if (args.length < 3) {
   const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent(`⚠️ Usage: ${PREFIX}ticketopen @user <support|dev_team|request>`));
   await message.channel.send({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 });
   return;
  }
  const hasSupportRole = message.member.roles.cache.some(r => 
   r.id === ticketTypes.support.roleId || 
   r.id === ticketTypes.dev_team.roleId || 
   r.id === ticketTypes.request.roleId
  );
  if (!message.member.permissions.has(Discord.PermissionFlagsBits.Administrator) && !hasSupportRole) {
   const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("❌ You need Admin or Support role!"));
   await message.channel.send({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 });
   return;
  }
  if (!ticketsEnabled) {
   const restrictionContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("🔒 Ticket system is currently disabled by an administrator."));
   await message.channel.send({ components: [restrictionContainer], flags: Discord.MessageFlags.IsComponentsV2 });
   return;
  }
  const userId = args[1].replace(/[<@!>]/g, "");
  const targetMember = await message.guild.members.fetch(userId).catch(() => null);
  if (!targetMember) {
   const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("⚠️ User not found!"));
   await message.channel.send({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 });
   return;
  }
  const ticketType = args[2].toLowerCase();
  if (!ticketTypes[ticketType] || !ticketTypes[ticketType].roleId) {
   const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent(`⚠️ Invalid ticket type! Available: ${Object.keys(ticketTypes).join(", ")}`));
   await message.channel.send({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 });
   return;
  }
  for (const channel of message.guild.channels.cache.values()) {
   if (channel.ticketOwnerId === targetMember.id && channel.ticketNumber) {
    const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent(`⚠️ ${targetMember.user.toString()} already has an open ticket!`));
    await message.channel.send({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 });
    return;
   }
  }
  const loadingContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("🔄 Opening ticket..."));
  await message.channel.send({ components: [loadingContainer], flags: Discord.MessageFlags.IsComponentsV2 });
  try {
   const ticketChannel = await createTicketForUser(message.guild, targetMember, ticketType, message.author);
   const successContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent(`✅ Ticket opened: ${ticketChannel.toString()}`));
   await message.channel.send({ components: [successContainer], flags: Discord.MessageFlags.IsComponentsV2 });
   await targetMember.send(`🎫 Ticket opened for you by ${message.author}!\nLink: ${ticketChannel.toString()}\nType: ${ticketTypes[ticketType].name}`).catch(() => {});
  } catch (error) {
   const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("❌ Failed to create ticket."));
   await message.channel.send({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 });
  }
  return;
 }
});

// ========== INTERACTION HANDLER ==========
client.on("interactionCreate", async (interaction) => {
 try {
  // Ticket menu
  if (interaction.isStringSelectMenu() && interaction.customId === "ticket_menu") {
   if (!ticketsEnabled) {
    const restrictionContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("🔒 Ticket system is currently disabled by an administrator."));
    await interaction.reply({ components: [restrictionContainer], flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
    return;
   }
   const selectedValue = interaction.values[0];
   if (selectedValue === "refresh") {
    const refreshContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("Refreshed"));
    await interaction.reply({ components: [refreshContainer], flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
    return;
   }
   const type = ticketTypes[selectedValue];
   if (!type || !type.roleId) return;
   
   for (const channel of interaction.guild.channels.cache.values()) {
    if (channel.ticketOwnerId === interaction.member.id && channel.ticketNumber) {
     const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("⚠️ You already have an open ticket!"));
     await interaction.reply({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
     return;
    }
   }
   const ticketNumber = getNextTicketNumber();
   const roomName = `ticket-${ticketNumber}`;
   const ticketChannel = await interaction.guild.channels.create({
    name: roomName, type: 0, parent: config.CATEGORY_ID,
    permissionOverwrites: [
     { id: interaction.guild.id, deny: ['ViewChannel'] },
     { id: interaction.member.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AttachFiles', 'EmbedLinks'] },
     { id: type.roleId, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AttachFiles', 'EmbedLinks', 'ManageChannels'] }
    ]
   });
   ticketChannel.ticketNumber = ticketNumber;
   ticketChannel.ticketOwnerId = interaction.member.id;
   ticketChannel.ticketType = type.name;
   ticketChannel.supportRoleId = type.roleId;
   
   const insideContainer = new Discord.ContainerBuilder()
    .addTextDisplayComponents(text => text.setContent(`# 🎫 Ticket #${ticketNumber} - ${type.name}`))
    .addSeparatorComponents(separator => separator.setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addSectionComponents(section => section.addTextDisplayComponents(text => text.setContent(`**User:**\n${interaction.member.user.toString()}`)).setThumbnailAccessory(img => img.setURL(interaction.member.user.displayAvatarURL({ dynamic: true }))))
    .addSeparatorComponents(separator => separator.setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(text => text.setContent(`**Support Team:**\n<@&${type.roleId}>`))
    .addSeparatorComponents(separator => separator.setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(text => text.setContent(`**Opened:**\n<t:${Math.floor(Date.now() / 1000)}:R>`))
    .addSeparatorComponents(separator => separator.setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addMediaGalleryComponents(media => media.addItems(new Discord.MediaGalleryItemBuilder().setURL(type.image).setDescription(`${type.name} ticket system`)))
    .addSeparatorComponents(separator => separator.setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addActionRowComponents(row => row.setComponents(
     new Discord.ButtonBuilder().setStyle(Discord.ButtonStyle.Secondary).setLabel("Claim").setCustomId("claim_ticket"),
     new Discord.ButtonBuilder().setStyle(Discord.ButtonStyle.Secondary).setLabel("Options").setCustomId("options_menu")
    ))
    .addSeparatorComponents(separator => separator.setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));
   await ticketChannel.send({ components: [insideContainer], flags: Discord.MessageFlags.IsComponentsV2 });
   const successContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent(`${type.name} ticket opened: ${ticketChannel.toString()}`));
   await interaction.reply({ components: [successContainer], flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
   return;
  }
  
  // Options button
  if (interaction.isButton() && interaction.customId === "options_menu") {
   const optionsMenu = new Discord.ActionRowBuilder().addComponents(new Discord.StringSelectMenuBuilder().setCustomId("ticket_options").setPlaceholder("choose an option").addOptions(
    new Discord.StringSelectMenuOptionBuilder().setLabel("Close").setValue("close").setDescription("Close this ticket"),
    new Discord.StringSelectMenuOptionBuilder().setLabel("Rename").setValue("rename").setDescription("Change ticket name"),
    new Discord.StringSelectMenuOptionBuilder().setLabel("Remind").setValue("remind").setDescription("Remind ticket owner"),
    new Discord.StringSelectMenuOptionBuilder().setLabel("Add User").setValue("add_user").setDescription("Add a user"),
    new Discord.StringSelectMenuOptionBuilder().setLabel("Remove User").setValue("remove_user").setDescription("Remove a user"),
    new Discord.StringSelectMenuOptionBuilder().setLabel("Auto Close").setValue("auto_close").setDescription("Auto close after 6 hours")
   ));
   const optionsContainer = new Discord.ContainerBuilder().addActionRowComponents(row => row.setComponents(optionsMenu.components));
   await interaction.reply({ components: [optionsContainer], flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
   return;
  }
  
  // Ticket options select menu
  if (interaction.isStringSelectMenu() && interaction.customId === "ticket_options") {
   const selected = interaction.values[0];
   const channel = interaction.channel;
   
   switch(selected) {
    case "close":
     await closeTicket(channel, interaction.user);
     break;
     
    case "rename":
     const renameModal = new Discord.ModalBuilder().setCustomId("rename_modal").setTitle("Rename Ticket").addComponents(new Discord.ActionRowBuilder().addComponents(new Discord.TextInputBuilder().setCustomId("new_name").setLabel("New Name").setStyle(Discord.TextInputStyle.Short).setRequired(true)));
     await interaction.showModal(renameModal);
     break;
     
    case "remind":
     const ticketOwner = await channel.guild.members.fetch(channel.ticketOwnerId).catch(() => null);
     if (ticketOwner) {
      await ticketOwner.send(`🔔 Reminder: You have a ticket in ${channel.guild.name}\n${channel.toString()}`).catch(() => {});
      const successContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("✅ Reminder sent!"));
      await interaction.reply({ components: [successContainer], flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
     } else {
      const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("❌ Owner not found"));
      await interaction.reply({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
     }
     break;
     
    case "add_user":
     const addModal = new Discord.ModalBuilder().setCustomId("add_user_modal").setTitle("Add User").addComponents(new Discord.ActionRowBuilder().addComponents(new Discord.TextInputBuilder().setCustomId("user_id").setLabel("User ID").setStyle(Discord.TextInputStyle.Short).setRequired(true)));
     await interaction.showModal(addModal);
     break;
     
    case "remove_user":
     const removeModal = new Discord.ModalBuilder().setCustomId("remove_user_modal").setTitle("Remove User").addComponents(new Discord.ActionRowBuilder().addComponents(new Discord.TextInputBuilder().setCustomId("user_id").setLabel("User ID").setStyle(Discord.TextInputStyle.Short).setRequired(true)));
     await interaction.showModal(removeModal);
     break;
     
    case "auto_close":
     if (autoCloseTimers.has(channel.id)) clearTimeout(autoCloseTimers.get(channel.id));
     const timer = setTimeout(async () => {
      const autoCloseMsg = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent(`⏰ Ticket #${channel.ticketNumber} auto-closed after 6 hours`));
      await channel.send({ components: [autoCloseMsg], flags: Discord.MessageFlags.IsComponentsV2 });
      setTimeout(() => channel.delete().catch(() => {}), 3000);
     }, 6 * 60 * 60 * 1000);
     autoCloseTimers.set(channel.id, timer);
     const autoCloseConfirm = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("✅ Auto-close enabled (6 hours)"));
     await interaction.reply({ components: [autoCloseConfirm], flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
     break;
   }
   return;
  }
  
  // Modals
  if (interaction.isModalSubmit() && interaction.customId === "rename_modal") {
   const newName = interaction.fields.getTextInputValue("new_name");
   try {
    await interaction.channel.setName(newName);
    const successContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent(`✅ Renamed to: ${newName}`));
    await interaction.reply({ components: [successContainer], flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
   } catch(e) {
    const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("❌ Failed to rename"));
    await interaction.reply({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
   }
   return;
  }
  
  if (interaction.isModalSubmit() && interaction.customId === "add_user_modal") {
   const userId = interaction.fields.getTextInputValue("user_id");
   try {
    const user = await interaction.guild.members.fetch(userId);
    await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
    const successContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent(`✅ Added ${user}`));
    await interaction.reply({ components: [successContainer], flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
    await interaction.channel.send({ components: [new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent(`${user} added by ${interaction.user}`))], flags: Discord.MessageFlags.IsComponentsV2 });
   } catch(e) {
    const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("❌ User not found"));
    await interaction.reply({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
   }
   return;
  }
  
  if (interaction.isModalSubmit() && interaction.customId === "remove_user_modal") {
   const userId = interaction.fields.getTextInputValue("user_id");
   try {
    const user = await interaction.guild.members.fetch(userId);
    await interaction.channel.permissionOverwrites.delete(user.id);
    const successContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent(`✅ Removed ${user}`));
    await interaction.reply({ components: [successContainer], flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
    await interaction.channel.send({ components: [new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent(`${user} removed by ${interaction.user}`))], flags: Discord.MessageFlags.IsComponentsV2 });
   } catch(e) {
    const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("❌ User not found"));
    await interaction.reply({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
   }
   return;
  }
  
  // Claim button
  if (interaction.isButton() && interaction.customId === "claim_ticket") {
   const channel = interaction.channel;
   const supportRoleId = channel.supportRoleId;
   if (!supportRoleId || !interaction.member.roles.cache.has(supportRoleId)) {
    const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("❌ No permission"));
    await interaction.reply({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
    return;
   }
   if (interaction.user.id === channel.ticketOwnerId) {
    const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("❌ Cannot claim own ticket"));
    await interaction.reply({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
    return;
   }
   if (claimedTickets.has(channel.id)) {
    const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("❌ Already claimed"));
    await interaction.reply({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
    return;
   }
   claimedTickets.add(channel.id);
   const claimContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent(`**${interaction.user}** claimed ticket #${channel.ticketNumber}!`));
   await channel.send({ components: [claimContainer], flags: Discord.MessageFlags.IsComponentsV2 });
   const owner = await channel.guild.members.fetch(channel.ticketOwnerId).catch(() => null);
   if (owner) await owner.send(`✅ Ticket #${channel.ticketNumber} claimed by ${interaction.user}\nLink: ${channel.toString()}`).catch(() => {});
   const successContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("✅ Claimed!"));
   await interaction.reply({ components: [successContainer], flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
   return;
  }
  
 } catch (error) {
  console.log("Error:", error.message);
  const errorContainer = new Discord.ContainerBuilder().addTextDisplayComponents(text => text.setContent("❌ An error occurred. Please try again."));
  await interaction.reply({ components: [errorContainer], flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral }).catch(() => {});
 }
});

client.setMaxListeners(500);
client.login(config.TOKEN);

// ========== ERROR HANDLERS ==========
client.on("error", (err) => console.log(err));
process.on("uncaughtException", (err) => console.log(err));
process.on("uncaughtExceptionMonitor", (err) => console.log(err));
process.on("rejectionHandled", (err) => console.log(err)); 
client.login(process.env.TOKEN);
