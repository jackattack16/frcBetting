# FRC Betting Bot — Setup Guide

## Prerequisites
- Node.js v18+ installed
- A Discord account

---

## Step 1: Create the Discord Bot

1. Go to https://discord.com/developers/applications
2. Click **New Application**, give it a name (e.g. "FRC Bets")
3. Go to the **Bot** tab → click **Add Bot**
4. Under **Token**, click **Reset Token** and copy it — this is your `DISCORD_TOKEN`
5. Scroll down and enable **"Send Messages"** and **"Use Slash Commands"** under Bot Permissions
6. Go to the **OAuth2 → General** tab, copy your **Client ID** — this is your `CLIENT_ID`

## Step 2: Invite the Bot to Your Server

1. Go to **OAuth2 → URL Generator**
2. Check **bot** and **applications.commands** under Scopes
3. Under Bot Permissions, check:
   - Send Messages
   - Embed Links
   - Use Slash Commands
4. Copy the generated URL and open it to invite the bot to your server

## Step 3: Run the Bot

```bash
# Install dependencies
npm install

# Set your credentials (Mac/Linux)
export DISCORD_TOKEN=your_token_here
export CLIENT_ID=your_client_id_here

# On Windows (Command Prompt)
set DISCORD_TOKEN=your_token_here
set CLIENT_ID=your_client_id_here

# Start the bot
npm start
```

Or create a `.env` file and use the `dotenv` package if you prefer.

---

## Commands

| Command | Who | Description |
|---|---|---|
| `/openbetting [label]` | Host | Opens a round. Label is optional (e.g. "Quals 12") |
| `/closebetting` | Host | Closes betting — no more bets accepted |
| `/resolve red\|blue` | Host | Pays out winners, closes the round |
| `/bet red\|blue <amount>` | Anyone | Place or replace your bet |
| `/points` | Anyone | Check your own balance (private) |
| `/leaderboard` | Anyone | Show full standings |
| `/currentbets` | Anyone | Show bets placed this round |
| `/givepoints @user <amount>` | Host | Give someone points |
| `/resetuser @user` | Host | Reset someone to starting points (1000) |

## Host Permissions

A user is considered a "Host" if they have the **Manage Server** Discord permission OR have a role named **"Host"** in your server.

---

## Payout Math

Pool-based payouts: winners split the total pot proportionally to their bet size.

Example:
- Total pot: 300 pts (200 on red, 100 on blue)
- Blue wins
- If you bet 75 of the 100 on blue → you get 75% of 300 = 225 pts back (profit of +150)
- If you bet 25 of the 100 on blue → you get 25% of 300 = 75 pts back (profit of +50)

If nobody bet on the winning alliance, all bets are refunded.

---

## Data

Points are stored in `data.json` in the same folder. You can edit it manually if needed.
Default starting balance is **1000 points** per user (first time they interact with the bot).
