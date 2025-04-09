const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Bot configuration
const config = {
  token: process.env.TOKEN, // Using environment variable for token
  prefix: '!',
  adminRoleId: '959449311366766622', // Your user ID as admin
  notificationChannelId: '', // Set this to your notification channel ID
  checkInterval: 5 * 1000, // Check every 5 seconds (for demo)
  inactiveThreshold: 10 * 1000 // 10 seconds (for demo)
};

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Path to store user data
const DATA_PATH = path.join(__dirname, 'vcUserData.json');

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

// User data object
let userData = loadUserData();

// Client ready event
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  console.log(`DEMO MODE: Checking for inactivity every 5 seconds with 10 second threshold`);
  
  // Start checking for inactive users
  checkInactiveUsers();
  setInterval(checkInactiveUsers, config.checkInterval);
});

// Voice state update event
client.on('voiceStateUpdate', (oldState, newState) => {
  // If a user joins a voice channel
  if (!oldState.channelId && newState.channelId) {
    const userId = newState.member.id;
    const username = newState.member.user.tag;
    
    // Update the last active timestamp
    userData[userId] = {
      username: username,
      lastActive: Date.now(),
      notified: false
    };
    
    saveUserData(userData);
    console.log(`User ${username} (${userId}) joined voice channel, updated timestamp.`);
    
    // Special log for our target user
    if (userId === '959449311366766622') {
      console.log(`TARGET USER ${username} joined voice channel at ${new Date().toLocaleString()}`);
    }
  }
});

// Message event
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(config.prefix)) return;
  
  // Check if user is the specified admin
  const isAdmin = message.author.id === config.adminRoleId;
  
  const args = message.content.slice(config.prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  
  // Command handling
  switch (command) {
    case 'vcstatus':
      const statusEmbed = new EmbedBuilder()
        .setTitle('Voice Channel Activity Status')
        .setColor(0x0099FF)
        .setDescription('List of users and their last voice channel activity:')
        .setTimestamp();
      
      let userList = '';
      for (const [userId, data] of Object.entries(userData)) {
        const secondsSinceActive = Math.floor((Date.now() - data.lastActive) / 1000);
        userList += `${data.username} (${userId}): Last active ${secondsSinceActive} seconds ago\n`;
      }
      
      statusEmbed.addFields({ name: 'Users', value: userList || 'No user data available.' });
      message.channel.send({ embeds: [statusEmbed] });
      break;
      
    case 'vctest':
      if (!isAdmin) {
        message.reply('You do not have permission to use this command.');
        return;
      }
      
      // Force add the user to the tracking list for testing
      userData[message.author.id] = {
        username: message.author.tag,
        lastActive: Date.now() - config.inactiveThreshold - 1000, // Already inactive for testing
        notified: false
      };
      saveUserData(userData);
      message.reply(`Added you to tracking with inactive status for testing. Check notification channel in a few seconds.`);
      break;
      
    case 'vchelp':
      const helpEmbed = new EmbedBuilder()
        .setTitle('VC Tracker Bot Help (DEMO MODE)')
        .setColor(0x00FF00)
        .addFields(
          { name: `${config.prefix}vcstatus`, value: 'Show all users\' last voice activity' },
          { name: `${config.prefix}vctest`, value: 'Add yourself to tracking as inactive for testing notifications' },
          { name: `${config.prefix}vcclear`, value: 'Clear all tracking data' },
          { name: `${config.prefix}vchelp`, value: 'Display this help message' }
        )
        .setFooter({ text: 'Demo Mode: 10 second inactivity threshold' });
      
      message.channel.send({ embeds: [helpEmbed] });
      break;
      
    case 'vcclear':
      if (!isAdmin) {
        message.reply('You do not have permission to use this command.');
        return;
      }
      
      userData = {};
      saveUserData(userData);
      message.reply('Voice activity tracking data has been cleared.');
      break;
      
    case 'setnotifchannel':
      if (!isAdmin) {
        message.reply('You do not have permission to use this command.');
        return;
      }
      
      config.notificationChannelId = message.channel.id;
      message.reply(`Set notification channel to this channel (${message.channel.id})`);
      break;
  }
});

// Function to check for inactive users
async function checkInactiveUsers() {
  console.log('Checking for inactive users...');
  const currentTime = Date.now();
  
  for (const [userId, data] of Object.entries(userData)) {
    const timeSinceActive = currentTime - data.lastActive;
    
    // Check if user is inactive and hasn't been notified yet
    if (timeSinceActive >= config.inactiveThreshold && !data.notified) {
      console.log(`User ${data.username} (${userId}) is inactive for ${Math.floor(timeSinceActive/1000)} seconds`);
      
      // For our target user only
      if (userId === '959449311366766622') {
        // Mark as notified
        userData[userId].notified = true;
        saveUserData(userData);
        
        // Send notification
        try {
          if (config.notificationChannelId) {
            const channel = await client.channels.fetch(config.notificationChannelId);
            if (channel) {
              const inactiveEmbed = new EmbedBuilder()
                .setTitle('⚠️ Inactivity Alert')
                .setColor(0xFF0000)
                .setDescription(`**${data.username}** hasn't joined a voice channel in ${Math.floor(timeSinceActive/1000)} seconds.`)
                .setTimestamp();
                
              channel.send({ content: `<@${userId}> inactivity alert!`, embeds: [inactiveEmbed] });
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
}

// Error handling
client.on('error', console.error);
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

// Login to Discord
client.login(config.token);
