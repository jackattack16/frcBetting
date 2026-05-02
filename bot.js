require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder } = require('discord.js');
const fs = require('fs');

// ── Config ────────────────────────────────────────────────────────────────────
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const DATA_FILE = './data.json';
const STARTING_POINTS = 1000;
const MIN_POINTS = 50;

// ── Data helpers ──────────────────────────────────────────────────────────────
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users: {}, round: null }));
  }
  const data = JSON.parse(fs.readFileSync(DATA_FILE));

  for (const user of Object.values(data.users)) {
    if (typeof user.points !== 'number' || Number.isNaN(user.points)) {
      user.points = STARTING_POINTS;
    }
    if (user.points < 0) {
      user.points = MIN_POINTS;
    }
  }

  if (!data.round) {
    data.round = null;
  }

  return data;
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getUser(data, id, username) {
  if (!data.users[id]) {
    data.users[id] = { username, points: STARTING_POINTS };
  }

  if (username) {
    data.users[id].username = username;
  }

  return data.users[id];
}

function getDisplayName(interaction, targetUser = interaction.user) {
  if (targetUser.id === interaction.user.id) {
    return interaction.member?.displayName || targetUser.globalName || targetUser.username;
  }

  const guildMember = interaction.guild?.members.cache.get(targetUser.id);
  return guildMember?.displayName || targetUser.globalName || targetUser.username;
}

function getManualUserId(name) {
  return `manual_${name.toLowerCase().replace(/\s+/g, '_')}`;
}

function getBetTarget(interaction, isHost) {
  const targetName = interaction.options.getString('for');
  if (targetName && !isHost) {
    return { error: '❌ Only hosts can bet on behalf of others.' };
  }

  if (targetName) {
    return { id: getManualUserId(targetName), username: targetName };
  }

  return { id: interaction.user.id, username: getDisplayName(interaction) };
}

// ── Slash command definitions ─────────────────────────────────────────────────
const commands = [
  {
    name: 'openbetting',
    description: 'Host only: Open a new betting round',
    options: [
      {
        name: 'label',
        description: 'Optional match label (e.g. "Quals 12")',
        type: 3, // STRING
        required: false,
      },
    ],
  },
  {
    name: 'resetgame',
    description: 'Host only: Reset all users and clear the current round',
  },
  {
    name: 'closebetting',
    description: 'Host only: Close betting (no more bets accepted)',
  },
  {
    name: 'resolve',
    description: 'Host only: Resolve the round and pay out winners',
    options: [
      {
        name: 'alliance',
        description: 'Winning alliance',
        type: 3,
        required: true,
        choices: [
          { name: 'Red', value: 'red' },
          { name: 'Blue', value: 'blue' },
        ],
      },
    ],
  },
  {
    name: 'bet',
    description: 'Place a bet on an alliance',
    options: [
      {
        name: 'alliance',
        description: 'Alliance to bet on',
        type: 3,
        required: true,
        choices: [
          { name: 'Red', value: 'red' },
          { name: 'Blue', value: 'blue' },
        ],
      },
      {
        name: 'amount',
        description: 'Amount of points to bet',
        type: 4,
        required: true,
      },
      {
        name: 'for',
        description: 'Host only: name to place bet on behalf of (for non-Discord users)',
        type: 3, // STRING instead of USER
        required: false,
      },
    ],
  },
  {
    name: 'allin',
    description: 'Bet all available points on an alliance',
    options: [
      {
        name: 'alliance',
        description: 'Alliance to bet on',
        type: 3,
        required: true,
        choices: [
          { name: 'Red', value: 'red' },
          { name: 'Blue', value: 'blue' },
        ],
      },
      {
        name: 'for',
        description: 'Host only: name to place bet on behalf of (for non-Discord users)',
        type: 3,
        required: false,
      },
    ],
  },
  {
    name: 'points',
    description: 'Check your current point balance',
  },
  {
    name: 'leaderboard',
    description: 'Show the points leaderboard',
  },
  {
    name: 'givepoints',
    description: 'Host only: Give points to a user',
    options: [
      {
        name: 'user',
        description: 'User to give points to',
        type: 6, // USER
        required: true,
      },
      {
        name: 'amount',
        description: 'Amount of points',
        type: 4,
        required: true,
      },
    ],
  },
  {
    name: 'resetuser',
    description: 'Host only: Reset a user back to starting points',
    options: [
      {
        name: 'user',
        description: 'User to reset',
        type: 6,
        required: true,
      },
    ],
  },
  {
    name: 'currentbets',
    description: 'Show all bets placed in the current round',
  },
  {
    name: 'clearbets',
    description: 'Host only: Clear all bets for the current round',
  },
  {
    name: 'clearuserbet',
    description: 'Host only: Clear one user bet for the current round',
    options: [
      {
        name: 'user',
        description: 'Discord user whose bet should be cleared',
        type: 6,
        required: false,
      },
      {
        name: 'name',
        description: 'Manual bettor name to clear',
        type: 3,
        required: false,
      },
    ],
  },
];

// ── Register commands ─────────────────────────────────────────────────────────
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  console.log('Registering slash commands...');
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log('Commands registered.');
}

// ── Bot ───────────────────────────────────────────────────────────────────────
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const data = loadData();
  const { commandName, user } = interaction;
  const member = interaction.member;
  const displayName = getDisplayName(interaction);

  // Host = anyone with "Manage Server" permission or the "Host" role
  const isHost =
    member.permissions.has('ManageGuild') ||
    member.roles.cache.some((r) => r.name === 'Host');

  // ── /openbetting ────────────────────────────────────────────────────────────
  if (commandName === 'openbetting') {
    if (!isHost) {
      return interaction.reply({ content: '❌ Hosts only.', ephemeral: true });
    }
    if (data.round && data.round.open) {
      return interaction.reply({ content: '❌ A round is already open. Close or resolve it first.', ephemeral: true });
    }

    const label = interaction.options.getString('label') || 'Match';
    data.round = { label, open: true, bets: {} };
    saveData(data);

    const embed = new EmbedBuilder()
      .setColor(0x00ff88)
      .setTitle('🟢 Betting is OPEN')
      .setDescription(`**${label}**\nUse \`/bet red <amount>\` or \`/bet blue <amount>\` to place your bet!`)
      .setFooter({ text: 'May the odds ever be in your favor!' });

    return interaction.reply({ embeds: [embed] });
  }

  // ── /resetgame ──────────────────────────────────────────────────────────────
  if (commandName === 'resetgame') {
    if (!isHost) {
      return interaction.reply({ content: '❌ Hosts only.', ephemeral: true });
    }

    data.users = {};
    data.round = null;
    saveData(data);

    return interaction.reply({
      content: '🔄 Game reset. All saved users and the current round were completely cleared.',
    });
  }

  // ── /closebetting ───────────────────────────────────────────────────────────
  if (commandName === 'closebetting') {
    if (!isHost) {
      return interaction.reply({ content: '❌ Hosts only.', ephemeral: true });
    }
    if (!data.round || !data.round.open) {
      return interaction.reply({ content: '❌ No open round to close.', ephemeral: true });
    }

    data.round.open = false;
    saveData(data);

    const redTotal = Object.values(data.round.bets)
      .filter((b) => b.alliance === 'red')
      .reduce((s, b) => s + b.amount, 0);
    const blueTotal = Object.values(data.round.bets)
      .filter((b) => b.alliance === 'blue')
      .reduce((s, b) => s + b.amount, 0);

    const embed = new EmbedBuilder()
      .setColor(0xff9900)
      .setTitle('🔒 Betting is CLOSED')
      .setDescription(`**${data.round.label}**`)
      .addFields(
        { name: '🔴 Red', value: `${redTotal} pts`, inline: true },
        { name: '🔵 Blue', value: `${blueTotal} pts`, inline: true },
      )
      .setFooter({ text: 'Waiting for match result...' });

    return interaction.reply({ embeds: [embed] });
  }

  // ── /resolve ────────────────────────────────────────────────────────────────
  if (commandName === 'resolve') {
    if (!isHost) {
      return interaction.reply({ content: '❌ Hosts only.', ephemeral: true });
    }
    if (!data.round || data.round.open) {
      return interaction.reply({ content: '❌ Close betting before resolving.', ephemeral: true });
    }

    const winner = interaction.options.getString('alliance');
    const bets = data.round.bets;
    const nonBettingUsers = Object.entries(data.users).filter(([uid]) => !bets[uid]);

    const winnerBets = Object.entries(bets).filter(([, b]) => b.alliance === winner);
    const loserBets = Object.entries(bets).filter(([, b]) => b.alliance !== winner);

    const winPool = winnerBets.reduce((s, [, b]) => s + b.amount, 0);
    const losePool = loserBets.reduce((s, [, b]) => s + b.amount, 0);
    const totalPool = winPool + losePool;

    const payoutLines = [];

    if (winPool === 0) {
      // Nobody bet on the winner — just refund everyone
      for (const [uid, b] of Object.entries(bets)) {
        getUser(data, uid, b.username).points += b.amount;
        payoutLines.push(`↩️ **${b.username}** — refunded ${b.amount} pts (no winners)`);
      }
    } else {
      // Pay out losers (points already deducted on bet)
      // Pay winners proportionally from the pool
      for (const [uid, b] of winnerBets) {
        const share = Math.floor((b.amount / winPool) * totalPool);
        getUser(data, uid, b.username).points += share;
        const profit = share - b.amount;
        payoutLines.push(`✅ **${b.username}** — bet ${b.amount}, won **+${profit}** (total ${share} pts back)`);
      }
      for (const [uid, b] of loserBets) {
        const loserData = getUser(data, uid, b.username);
        if (loserData.points < MIN_POINTS) {
          loserData.points = MIN_POINTS;
        }
        payoutLines.push(`❌ **${b.username}** — lost ${b.amount} pts`);
      }
    }

    for (const [, userData] of nonBettingUsers) {
      userData.points -= 50;
      if (userData.points < MIN_POINTS) {
        userData.points = MIN_POINTS;
      }
      payoutLines.push(`⚠️ **${userData.username}** — skipped the round and lost 50 pts`);
    }

    data.round = null;
    saveData(data);

    const color = winner === 'red' ? 0xff4444 : 0x4444ff;
    const emoji = winner === 'red' ? '🔴' : '🔵';

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`${emoji} ${winner.toUpperCase()} Alliance Wins!`)
      .setDescription(payoutLines.join('\n') || 'No bets were placed.')
      .setFooter({ text: 'GG | Use /leaderboard to see standings' });

    return interaction.reply({ embeds: [embed] });
  }

  // ── /bet ────────────────────────────────────────────────────────────────────
  if (commandName === 'bet') {
    if (!data.round || !data.round.open) {
      return interaction.reply({ content: '❌ Betting is not open right now.', ephemeral: true });
    }

    const alliance = interaction.options.getString('alliance');
    const amount = interaction.options.getInteger('amount');
    const betTarget = getBetTarget(interaction, isHost);

    if (betTarget.error) {
      return interaction.reply({ content: betTarget.error, ephemeral: true });
    }

    const userData = getUser(data, betTarget.id, betTarget.username);
    const existingBet = data.round.bets[betTarget.id];
    const availableToBet = userData.points + (existingBet ? existingBet.amount : 0);

    if (amount <= 100 && !(availableToBet <= 100)) {
      return interaction.reply({ content: '❌ Bet amount must be greater than 100.', ephemeral: true });
    }

    if (amount > availableToBet) {
      return interaction.reply({
        content: `❌ You only have **${availableToBet} pts** available to bet.`,
        ephemeral: true,
      });
    }

    // Replace existing bet if they already bet this round
    if (existingBet) {
      userData.points += existingBet.amount;
    }

    userData.points -= amount;
    data.round.bets[betTarget.id] = { username: betTarget.username, alliance, amount };
    saveData(data);

    const emoji = alliance === 'red' ? '🔴' : '🔵';
    return interaction.reply({
      content: `${emoji} **${betTarget.username}** bet **${amount} pts** on **${alliance.toUpperCase()}**. Balance: ${userData.points} pts`,
    });
  }

  // ── /allin ──────────────────────────────────────────────────────────────────
  if (commandName === 'allin') {
    if (!data.round || !data.round.open) {
      return interaction.reply({ content: '❌ Betting is not open right now.', ephemeral: true });
    }

    const alliance = interaction.options.getString('alliance');
    const betTarget = getBetTarget(interaction, isHost);

    if (betTarget.error) {
      return interaction.reply({ content: betTarget.error, ephemeral: true });
    }

    const userData = getUser(data, betTarget.id, betTarget.username);
    const existingBet = data.round.bets[betTarget.id];
    const availableToBet = userData.points + (existingBet ? existingBet.amount : 0);

    if (availableToBet <= 0) {
      return interaction.reply({
        content: '❌ There are no points available to bet all in.',
        ephemeral: true,
      });
    }

    if (existingBet) {
      userData.points += existingBet.amount;
    }

    userData.points -= availableToBet;
    data.round.bets[betTarget.id] = { username: betTarget.username, alliance, amount: availableToBet };
    saveData(data);

    const emoji = alliance === 'red' ? '🔴' : '🔵';
    return interaction.reply({
      content: `${emoji} **${betTarget.username}** went **ALL IN** with **${availableToBet} pts** on **${alliance.toUpperCase()}**. Balance: ${userData.points} pts`,
    });
  }

  // ── /points ─────────────────────────────────────────────────────────────────
  if (commandName === 'points') {
    const userData = getUser(data, user.id, displayName);
    saveData(data);
    return interaction.reply({
      content: `💰 **${displayName}** has **${userData.points} pts**`,
      ephemeral: true,
    });
  }

  // ── /leaderboard ────────────────────────────────────────────────────────────
  if (commandName === 'leaderboard') {
    const sorted = Object.values(data.users).sort((a, b) => b.points - a.points);

    if (sorted.length === 0) {
      return interaction.reply({ content: 'No users yet.', ephemeral: true });
    }

    const medals = ['🥇', '🥈', '🥉'];
    const lines = sorted.map((u, i) => {
      const medal = medals[i] || `**${i + 1}.**`;
      return `${medal} **${u.username}** — ${u.points} pts`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle('🏆 Leaderboard')
      .setDescription(lines.join('\n'));

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── /currentbets ────────────────────────────────────────────────────────────
  if (commandName === 'currentbets') {
    if (!data.round) {
      return interaction.reply({ content: '❌ No active round.', ephemeral: true });
    }

    const bets = data.round.bets;
    const redBets = Object.values(bets).filter((b) => b.alliance === 'red');
    const blueBets = Object.values(bets).filter((b) => b.alliance === 'blue');

    const fmt = (arr) =>
      arr.length ? arr.map((b) => `• ${b.username}: ${b.amount} pts`).join('\n') : '_none_';

    const redTotal = redBets.reduce((s, b) => s + b.amount, 0);
    const blueTotal = blueBets.reduce((s, b) => s + b.amount, 0);

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle(`📋 Current Bets — ${data.round.label}`)
      .setDescription(data.round.open ? '🟢 Betting is open' : '🔒 Betting is closed')
      .addFields(
        { name: `🔴 Red (${redTotal} pts)`, value: fmt(redBets), inline: true },
        { name: `🔵 Blue (${blueTotal} pts)`, value: fmt(blueBets), inline: true },
      );

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── /clearbets ──────────────────────────────────────────────────────────────
  if (commandName === 'clearbets') {
    if (!isHost) {
      return interaction.reply({ content: '❌ Hosts only.', ephemeral: true });
    }
    if (!data.round) {
      return interaction.reply({ content: '❌ No active round.', ephemeral: true });
    }

    const bets = Object.entries(data.round.bets);
    if (bets.length === 0) {
      return interaction.reply({ content: '❌ There are no bets to clear.', ephemeral: true });
    }

    for (const [uid, bet] of bets) {
      getUser(data, uid, bet.username).points += bet.amount;
    }

    data.round.bets = {};
    saveData(data);

    return interaction.reply({
      content: `🧹 Cleared **${bets.length}** bet(s) for **${data.round.label}** and refunded all points.`,
    });
  }

  // ── /clearuserbet ───────────────────────────────────────────────────────────
  if (commandName === 'clearuserbet') {
    if (!isHost) {
      return interaction.reply({ content: '❌ Hosts only.', ephemeral: true });
    }
    if (!data.round) {
      return interaction.reply({ content: '❌ No active round.', ephemeral: true });
    }

    const targetUser = interaction.options.getUser('user');
    const manualName = interaction.options.getString('name');

    if (!targetUser && !manualName) {
      return interaction.reply({
        content: '❌ Provide either a Discord user or a manual name.',
        ephemeral: true,
      });
    }

    let betId;
    let label;

    if (targetUser) {
      betId = targetUser.id;
      label = getDisplayName(interaction, targetUser);
    } else {
      betId = getManualUserId(manualName);
      label = manualName;
    }

    let bet = data.round.bets[betId];
    if (!bet && manualName) {
      const fallbackEntry = Object.entries(data.round.bets).find(([, existingBet]) =>
        existingBet.username.toLowerCase() === manualName.toLowerCase()
      );
      if (fallbackEntry) {
        [betId, bet] = fallbackEntry;
        label = bet.username;
      }
    }

    if (!bet) {
      return interaction.reply({
        content: `❌ No current bet found for **${label}**.`,
        ephemeral: true,
      });
    }

    getUser(data, betId, bet.username).points += bet.amount;
    delete data.round.bets[betId];
    saveData(data);

    return interaction.reply({
      content: `🧹 Cleared **${label}**'s bet of **${bet.amount} pts** and refunded the points.`,
    });
  }

  // ── /givepoints ─────────────────────────────────────────────────────────────
  if (commandName === 'givepoints') {
    if (!isHost) {
      return interaction.reply({ content: '❌ Hosts only.', ephemeral: true });
    }
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const targetName = getDisplayName(interaction, target);
    const targetData = getUser(data, target.id, targetName);
    targetData.points += amount;
    if (targetData.points < MIN_POINTS) {
      targetData.points = MIN_POINTS;
    }
    saveData(data);
    return interaction.reply({
      content: `✅ Gave **${amount} pts** to **${targetName}**. New balance: ${targetData.points} pts`,
    });
  }

  // ── /resetuser ──────────────────────────────────────────────────────────────
  if (commandName === 'resetuser') {
    if (!isHost) {
      return interaction.reply({ content: '❌ Hosts only.', ephemeral: true });
    }
    const target = interaction.options.getUser('user');
    const targetName = getDisplayName(interaction, target);
    const targetData = getUser(data, target.id, targetName);
    targetData.points = STARTING_POINTS;
    saveData(data);
    return interaction.reply({
      content: `🔄 Reset **${targetName}** to ${STARTING_POINTS} pts`,
    });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
registerCommands().then(() => client.login(TOKEN));
