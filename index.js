const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Bot configuration
const config = {
  token: process.env.TOKEN, // Using environment variable for token
  prefix: '!',
  adminRoleId: '1325853526047326250', // Admin ID
  narysRoleId: '', // This will be set with !setnarysrole command
  notificationChannelId: '', // Will be set with !setnotifchannel command
  checkInterval: 12 * 60 * 60 * 1000, // Check every 12 hours
  inactiveThreshold: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
};

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers, // Added to get member roles
  ],
});

// Path to store user data
const DATA_PATH = path.join(__dirname, 'vcUserData.json');
const CONFIG_PATH = path.join(__dirname, 'botConfig.json');

// Load configuration
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      const savedConfig = JSON.parse(data);
      // Update config with saved values
      config.narysRoleId = savedConfig.narysRoleId || '';
      config.notificationChannelId = savedConfig.notificationChannelId || '';
      console.log('Loaded saved configuration');
    }
  } catch (error) {
    console.error('Error loading configuration:', error);
  }
}

// Save configuration
function saveConfig() {
  try {
    const configToSave = {
      narysRoleId: config.narysRoleId,
      notificationChannelId: config.notificationChannelId
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(configToSave, null, 2), 'utf8');
    console.log('Saved configuration');
  } catch (error) {
    console.error('Error saving configuration:', error);
  }
}

// Load user data
function loadUserData() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      const data = fs.readFileSync(DATA_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading user data:', error);
  }
  return {};
}

// Save user data
function saveUserData(data) {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving user data:', error);
  }
}

// Format time difference in a human-readable way
function formatTimeDifference(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days !== 1 ? 's' : ''}`;
  } else if (hours > 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } else {
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }
}

// Get relative time string (e.g., "2 days ago")
function getRelativeTimeString(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  return `${formatTimeDifference(diff)} ago`;
}

// Check if a member has the Narys role
function hasNarysRole(member) {
  if (!config.narysRoleId) return false;
  return member.roles.cache.has(config.narysRoleId);
}

// User data object
let userData = loadUserData();

// Client ready event
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  // Load saved configuration
  loadConfig();
  
  console.log(`Tracking voice channel inactivity for users with Narys role (7-day threshold)`);
  
  if (config.narysRoleId) {
    console.log(`Narys Role ID: ${config.narysRoleId}`);
    await refreshNarysMemberTracking();
  } else {
    console.log('Narys Role ID not set. Use !setnarysrole [roleID] to set it');
  }
  
  // Start checking for inactive users
  checkInactiveUsers();
  setInterval(checkInactiveUsers, config.checkInterval);
});

// Function to refresh tracking for all Narys members
async function refreshNarysMemberTracking() {
  if (!config.narysRoleId) {
    console.log('Cannot refresh Narys members: Role ID not set');
    return;
  }
  
  console.log('Refreshing Narys member tracking...');
  let trackedCount = 0;
  
  try {
    // Process all guilds the bot is in
    for (const guild of client.guilds.cache.values()) {
      // Fetch all members with the Narys role
      console.log(`Fetching members for guild: ${guild.name}`);
      
      // Ensure members are cached
      await guild.members.fetch();
      
      // Find members with Narys role
      guild.members.cache.forEach(member => {
        if (hasNarysRole(member)) {
          // Add/update member in tracking data
          const userId = member.id;
          
          // Only update if not already tracking
          if (!userData[userId]) {
            userData[userId] = {
              username: member.user.tag,
              lastActive: Date.now(), // Start tracking from now
              notified: false,
              guildId: guild.id,
              guildName: guild.name
            };
            trackedCount++;
          }
        }
      });
    }
    
    saveUserData(userData);
    console.log(`Added ${trackedCount} new Narys members to tracking`);
  } catch (error) {
    console.error('Error refreshing Narys members:', error);
  }
}

// Voice state update event
client.on('voiceStateUpdate', (oldState, newState) => {
  // If a user joins a voice channel
  if (!oldState.channelId && newState.channelId) {
    const userId = newState.member.id;
    
    // Check if user has Narys role
    if (hasNarysRole(newState.member)) {
      const username = newState.member.user.tag;
      
      // Update the last active timestamp
      userData[userId] = {
        username: username,
        lastActive: Date.now(),
        notified: false,
        guildId: newState.guild.id,
        guildName: newState.guild.name
      };
      
      saveUserData(userData);
      console.log(`Narys member ${username} joined voice channel, updated timestamp.`);
    }
  }
});

// Member update event (track role changes)
client.on('guildMemberUpdate', (oldMember, newMember) => {
  const hadNarysRole = oldMember.roles.cache.has(config.narysRoleId);
  const hasNarysRoleNow = newMember.roles.cache.has(config.narysRoleId);
  
  // If member gained Narys role
  if (!hadNarysRole && hasNarysRoleNow) {
    userData[newMember.id] = {
      username: newMember.user.tag,
      lastActive: Date.now(),
      notified: false,
      guildId: newMember.guild.id,
      guildName: newMember.guild.name
    };
    saveUserData(userData);
    console.log(`User ${newMember.user.tag} gained Narys role, added to tracking.`);
  }
  
  // If member lost Narys role, we could remove them from tracking
  // But let's keep them for historical purposes
});

// Message event
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(config.prefix)) return;
  
  // Check if user is an admin
  const isAdmin = message.author.id === config.adminRoleId;
  
  const args = message.content.slice(config.prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  
  // Command handling
  switch (command) {
    case 'vcstatus':
      // Create an embed for the status report
      const statusEmbed = new EmbedBuilder()
        .setTitle('Narys Members Voice Activity Status')
        .setColor(0x0099FF)
        .setDescription('List of Narys members and their last voice channel activity:')
        .setTimestamp();
      
      let userCount = 0;
      let inactiveCount = 0;
      let userList = '';
      
      // Get entries sorted by lastActive (oldest first)
      const sortedEntries = Object.entries(userData).sort((a, b) => a[1].lastActive - b[1].lastActive);
      
      for (const [userId, data] of sortedEntries) {
        userCount++;
        const relativeTime = getRelativeTimeString(data.lastActive);
        const isInactive = (Date.now() - data.lastActive) >= config.inactiveThreshold;
        
        if (isInactive) inactiveCount++;
        
        // Add status emoji: 🔴 for inactive, 🟢 for active
        const statusEmoji = isInactive ? '🔴' : '🟢';
        
        // Format the entry
        userList += `${statusEmoji} **${data.username}**: Last active ${relativeTime}\n`;
        
        // Discord has a 1024 character limit per field, split into multiple fields if needed
        if (userList.length > 900 || userCount % 15 === 0) {
          statusEmbed.addFields({ name: `Users ${userCount-14}-${userCount}`, value: userList });
          userList = '';
        }
      }
      
      // Add any remaining users
      if (userList.length > 0) {
        statusEmbed.addFields({ name: `Users ${userCount-userList.split('\n').length+1}-${userCount}`, value: userList });
      }
      
      // Add summary field
      statusEmbed.addFields({ 
        name: 'Summary', 
        value: `Total tracked Narys members: ${userCount}\nInactive (>7 days): ${inactiveCount}` 
      });
      
      message.channel.send({ embeds: [statusEmbed] });
      break;
      
    case 'vcinactive':
      // Show only inactive users
      const inactiveEmbed = new EmbedBuilder()
        .setTitle('Inactive Narys Members')
        .setColor(0xFF0000)
        .setDescription('List of Narys members inactive for 7+ days:')
        .setTimestamp();
      
      let inactiveList = '';
      let inactiveUserCount = 0;
      
      // Get entries sorted by lastActive (oldest first)
      const inactiveEntries = Object.entries(userData)
        .filter(([_, data]) => (Date.now() - data.lastActive) >= config.inactiveThreshold)
        .sort((a, b) => a[1].lastActive - b[1].lastActive);
      
      for (const [userId, data] of inactiveEntries) {
        inactiveUserCount++;
        const relativeTime = getRelativeTimeString(data.lastActive);
        const lastActiveDate = new Date(data.lastActive).toLocaleDateString();
        
        // Format the entry
        inactiveList += `🔴 **${data.username}**: Last active ${relativeTime} (${lastActiveDate})\n`;
        
        // Split into multiple fields if needed
        if (inactiveList.length > 900 || inactiveUserCount % 15 === 0) {
          inactiveEmbed.addFields({ name: `Inactive Users ${inactiveUserCount-14}-${inactiveUserCount}`, value: inactiveList });
          inactiveList = '';
        }
      }
      
      // Add any remaining users
      if (inactiveList.length > 0) {
        inactiveEmbed.addFields({ name: `Inactive Users ${inactiveUserCount-inactiveList.split('\n').length+1}-${inactiveUserCount}`, value: inactiveList });
      }
      
      if (inactiveUserCount === 0) {
        inactiveEmbed.setDescription('No Narys members are currently inactive for 7+ days.');
      } else {
        inactiveEmbed.addFields({ 
          name: 'Summary', 
          value: `Total inactive Narys members: ${inactiveUserCount}` 
        });
      }
      
      message.channel.send({ embeds: [inactiveEmbed] });
      break;
      
    case 'vcsearch':
      if (!args[0]) {
        message.reply('Please provide a username to search for.');
        return;
      }
      
      const searchTerm = args.join(' ').toLowerCase();
      const matches = Object.entries(userData).filter(([_, data]) => 
        data.username.toLowerCase().includes(searchTerm)
      );
      
      if (matches.length === 0) {
        message.reply(`No Narys members found matching "${args.join(' ')}".`);
        return;
      }
      
      const searchEmbed = new EmbedBuilder()
        .setTitle(`Search Results for "${args.join(' ')}"`)
        .setColor(0x0099FF)
        .setTimestamp();
      
      let resultList = '';
      matches.forEach(([userId, data]) => {
        const relativeTime = getRelativeTimeString(data.lastActive);
        const isInactive = (Date.now() - data.lastActive) >= config.inactiveThreshold;
        const statusEmoji = isInactive ? '🔴' : '🟢';
        
        resultList += `${statusEmoji} **${data.username}** (${userId}): Last active ${relativeTime}\n`;
      });
      
      searchEmbed.setDescription(resultList);
      message.channel.send({ embeds: [searchEmbed] });
      break;
      
    case 'vcrefresh':
      if (!isAdmin) {
        message.reply('You do not have permission to use this command.');
        return;
      }
      
      if (!config.narysRoleId) {
        message.reply('❌ Narys role ID not set. Use !setnarysrole [roleID] first.');
        return;
      }
      
      message.channel.send('🔄 Refreshing Narys member tracking...');
      await refreshNarysMemberTracking();
      message.channel.send(`✅ Refreshed Narys member tracking. Now tracking ${Object.keys(userData).length} members.`);
      break;
      
    case 'vctest':
      if (!isAdmin) {
        message.reply('You do not have permission to use this command.');
        return;
      }
      
      const testUserId = args[0] || message.author.id;
      const testUsername = (args[0] && message.mentions.users.first()) ? 
        message.mentions.users.first().tag : message.author.tag;
      
      // Set user as inactive for testing
      userData[testUserId] = {
        username: testUsername,
        lastActive: Date.now() - config.inactiveThreshold - 1000, // Already inactive
        notified: false,
        guildId: message.guild.id,
        guildName: message.guild.name
      };
      
      saveUserData(userData);
      message.reply(`Added ${testUsername} to tracking with inactive status for testing. Check notification channel in a few seconds.`);
      
      // Force check for inactive users
      setTimeout(checkInactiveUsers, 2000);
      break;
      
    case 'vchelp':
      const helpEmbed = new EmbedBuilder()
        .setTitle('Narys VC Tracker Bot Help')
        .setColor(0x00FF00)
        .addFields(
          { name: `${config.prefix}vcstatus`, value: 'Show all Narys members\' last voice activity' },
          { name: `${config.prefix}vcinactive`, value: 'Show only inactive Narys members (>7 days)' },
          { name: `${config.prefix}vcsearch [username]`, value: 'Search for Narys members by name' },
          { name: `${config.prefix}vcrefresh`, value: '[Admin] Refresh tracking for all Narys members' },
          { name: `${config.prefix}vctest [@user]`, value: '[Admin] Add yourself or mentioned user to tracking as inactive for testing notifications' },
          { name: `${config.prefix}vcclear`, value: '[Admin] Clear all tracking data' },
          { name: `${config.prefix}vcreset [@user]`, value: '[Admin] Reset a user\'s notification status' },
          { name: `${config.prefix}setnarysrole [roleID]`, value: '[Admin] Set the Narys role ID for tracking' },
          { name: `${config.prefix}setnotifchannel`, value: '[Admin] Set current channel as notification channel' },
          { name: `${config.prefix}vcconfig`, value: '[Admin] Show current bot configuration' },
          { name: `${config.prefix}vchelp`, value: 'Display this help message' }
        )
        .setFooter({ text: 'Inactivity threshold: 7 days' });
      
      message.channel.send({ embeds: [helpEmbed] });
      break;
      
    case 'vcclear':
      if (!isAdmin) {
        message.reply('You do not have permission to use this command.');
        return;
      }
      
      userData = {};
      saveUserData(userData);
      message.reply('✅ Voice activity tracking data has been cleared.');
      break;
      
    case 'vcreset':
      if (!isAdmin) {
        message.reply('You do not have permission to use this command.');
        return;
      }
      
      // If a user is mentioned, reset just that user
      if (args[0] && message.mentions.users.first()) {
        const resetUserId = message.mentions.users.first().id;
        if (userData[resetUserId]) {
          userData[resetUserId].notified = false;
          saveUserData(userData);
          message.reply(`✅ Reset notification status for ${userData[resetUserId].username}.`);
        } else {
          message.reply(`User not found in tracking data.`);
        }
        return;
      }
      
      // Reset all notification statuses
      for (const userId in userData) {
        userData[userId].notified = false;
      }
      
      saveUserData(userData);
      message.reply('✅ Reset notification status for all users.');
      break;
      
    case 'setnarysrole':
      if (!isAdmin) {
        message.reply('You do not have permission to use this command.');
        return;
      }
      
      if (!args[0]) {
        message.reply('Please provide a role ID.');
        return;
      }
      
      const roleId = args[0];
      // Verify this is a valid role ID format
      if (!/^\d+$/.test(roleId)) {
        message.reply('Invalid role ID format. Please provide a valid role ID.');
        return;
      }
      
      config.narysRoleId = roleId;
      saveConfig();
      message.reply(`✅ Set Narys role ID to ${roleId}`);
      
      // Refresh member tracking
      await refreshNarysMemberTracking();
      message.channel.send(`Now tracking ${Object.keys(userData).length} members with Narys role.`);
      break;
      
    case 'setnotifchannel':
      if (!isAdmin) {
        message.reply('You do not have permission to use this command.');
        return;
      }
      
      config.notificationChannelId = message.channel.id;
      saveConfig();
      message.reply(`✅ Set notification channel to this channel (${message.channel.id})`);
      break;
      
    case 'vcconfig':
      if (!isAdmin) {
        message.reply('You do not have permission to use this command.');
        return;
      }
      
      const configEmbed = new EmbedBuilder()
        .setTitle('Narys VC Tracker Bot Configuration')
        .setColor(0x00FFFF)
        .addFields(
          { name: 'Admin ID', value: config.adminRoleId },
          { name: 'Narys Role ID', value: config.narysRoleId || 'Not set' },
          { name: 'Notification Channel', value: config.notificationChannelId || 'Not set' },
          { name: 'Check Interval', value: `${config.checkInterval / (60 * 60 * 1000)} hours` },
          { name: 'Inactive Threshold', value: `${config.inactiveThreshold / (24 * 60 * 60 * 1000)} days` },
          { name: 'Prefix', value: config.prefix },
          { name: 'Narys Members Tracked', value: `${Object.keys(userData).length}` }
        )
        .setTimestamp();
      
      message.channel.send({ embeds: [configEmbed] });
      break;
  }
});

// Function to check for inactive users
async function checkInactiveUsers() {
  console.log('Checking for inactive Narys members...');
  const currentTime = Date.now();
  
  for (const [userId, data] of Object.entries(userData)) {
    const timeSinceActive = currentTime - data.lastActive;
    
    // Check if user is inactive (7+ days) and hasn't been notified yet
    if (timeSinceActive >= config.inactiveThreshold && !data.notified) {
      console.log(`User ${data.username} (${userId}) is inactive for ${Math.floor(timeSinceActive/(24*60*60*1000))} days`);
      
      // Mark as notified to prevent duplicate alerts
      userData[userId].notified = true;
      saveUserData(userData);
      
      // Send notification
      try {
        if (config.notificationChannelId) {
          const channel = await client.channels.fetch(config.notificationChannelId);
          if (channel) {
            const inactiveEmbed = new EmbedBuilder()
              .setTitle('⚠️ Narys Member Inactivity Alert')
              .setColor(0xFF0000)
              .setDescription(`**${data.username}** hasn't joined a voice channel in **${formatTimeDifference(timeSinceActive)}**.`)
              .addFields(
                { name: 'User ID', value: userId },
                { name: 'Last Active', value: new Date(data.lastActive).toLocaleString() },
                { name: 'Server', value: data.guildName || 'Unknown' }
              )
              .setTimestamp();
              
            channel.send({ embeds: [inactiveEmbed] });
            console.log(`Sent inactivity notification for user ${data.username}`);
          }
        } else {
          console.log('No notification channel set. Use !setnotifchannel in a channel to set it.');
        }
      } catch (error) {
        console.error('Error sending notification:', error);
      }
    }
  }
}

// Error handling
client.on('error', console.error);
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

// Login to Discord
client.login(config.token);
