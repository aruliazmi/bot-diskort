require('dotenv').config()
const fs = require('fs')
const path = require('path')
const { Client, Collection, GatewayIntentBits } = require('discord.js')
const commandsPath = path.join(__dirname, 'commands')
const commandFolders = fs.readdirSync(commandsPath)

const { startWA, sendWaNotif } = require('./wa')
const { startStatusUpdater } = require('./commands/status/updateEmbed')

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
})

client.commands = new Collection()
client.handlers = []

const antiraid = require('./commands/antiraid/antiraid')
antiraid.execute(client)

for (const folder of commandFolders) {
  const folderPath = path.join(commandsPath, folder)
  const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'))

  for (const file of commandFiles) {
    const filePath = path.join(folderPath, file)
    const command = require(filePath)

    if (command.data) {
      client.commands.set(command.data.name, command)
      console.log(`[\x1b[32mLOAD\x1b[0m] Loaded slash command: /${command.data.name} from ${folder}/${file}`)
    }

    if (typeof command.handleInteraction === 'function') {
      client.handlers.push(command)
      console.log(`[\x1b[32mLOAD\x1b[0m] Loaded handler: ${folder}/${file}`)
    }
  }
}

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName)
    if (!command) return
    try {
      await command.execute(interaction)
    } catch (err) {
      console.error(err)
      await interaction.reply({
        content: '[❌] Terjadi kesalahan saat menjalankan command.',
        ephemeral: true
      })
    }
  }

  for (const handler of client.handlers) {
    try {
      await handler.handleInteraction(interaction)
    } catch (err) {
      console.error('[❌] Interaction handler error:', err)
    }
  }
})

client.once('ready', async () => {
  console.log(`[\x1b[36mONLINE\x1b[0m] Bot ready as ${client.user.tag}`)
  
  try {
    await startWA()
  } catch (err) {
    console.error('WA Error:', err)
  }

  startStatusUpdater(client, process.env.STATUS_CHANNEL_ID)
})

client.login(process.env.TOKEN)