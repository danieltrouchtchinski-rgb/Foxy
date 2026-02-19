// ----------------------
// IMPORTS
// ----------------------
const { 
    Client, 
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle 
} = require("discord.js");

const yahooFinance = require("yahoo-finance2").default;
require("dotenv").config();

// ----------------------
// CONFIG
// ----------------------
const ADMIN_ID = "1238123426959462432";

const lastPrices = {};
const lastAlertTime = {};
const positions = {};
const tradeHistory = [];
const priceHistory = {}; // Pour analyse 1min / 5min / 15min

// ----------------------
// DICTIONNAIRE DES NOMS
// ----------------------
const symbolNames = {
    "AAPL": "Apple",
    "TSLA": "Tesla",
    "NVDA": "Nvidia",
    "AMZN": "Amazon",
    "META": "Meta",
    "MSFT": "Microsoft",
    "GOOGL": "Alphabet",
    "AMD": "AMD",
    "INTC": "Intel",
    "NFLX": "Netflix",
    "DIS": "Disney",
    "UBER": "Uber",
    "PYPL": "PayPal",
    "ADBE": "Adobe",
    "CRM": "Salesforce",
    "ORCL": "Oracle",
    "BA": "Boeing",
    "F": "Ford"
};

const symbols = Object.keys(symbolNames);

// Reverse lookup : APPLE → AAPL
function findSymbolByName(name) {
    name = name.toLowerCase();
    for (const [symbol, realName] of Object.entries(symbolNames)) {
        if (realName.toLowerCase() === name) return symbol;
    }
    return null;
}

// ----------------------
// CLIENT DISCORD
// ----------------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ]
});

// ----------------------
// READY MESSAGE
// ----------------------
client.once("ready", () => {
    console.log(`Bot connecté en tant que ${client.user.tag}`);
    client.users.fetch(ADMIN_ID).then(user => {
        user.send("✅ Le bot vient de redémarrer et est maintenant en ligne.");
    });
});

// ----------------------
// BOUTONS
// ----------------------
client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    const [action, symbol, entry] = interaction.customId.split("_");
    const name = symbolNames[symbol];

    if (action === "acheter") {
        positions[symbol] = { entry: parseFloat(entry), time: Date.now() };
        return interaction.reply({ content: `🟢 Position ouverte sur **${name}**`, ephemeral: true });
    }

    if (action === "vendre") {
        if (!positions[symbol]) {
            return interaction.reply({ content: `❌ Aucune position ouverte sur **${name}**`, ephemeral: true });
        }

        const entryPrice = positions[symbol].entry;
        const currentPrice = parseFloat(entry);
        const perf = ((currentPrice - entryPrice) / entryPrice) * 100;

        tradeHistory.push({
            symbol,
            name,
            entry: entryPrice,
            exit: currentPrice,
            perf: parseFloat(perf.toFixed(2)),
            time: Date.now()
        });

        delete positions[symbol];

        return interaction.reply({
            content: `🔴 Position fermée sur **${name}** (${perf.toFixed(2)}%)`,
            ephemeral: true
        });
    }

    if (action === "ignore") {
        return interaction.reply({ content: `👌 Alerte ignorée pour **${name}**`, ephemeral: true });
    }
});

// ----------------------
// COMMANDES
// ----------------------
client.on("messageCreate", async message => {
    if (message.author.bot) return;

    // HISTORIQUE
    if (message.content === "!historique") {
        if (tradeHistory.length === 0) return message.reply("📭 Aucun trade enregistré.");
        let txt = "📘 **Historique des trades**\n\n";
        for (const t of tradeHistory.slice(-20).reverse()) {
            txt += `**${t.name}** : ${t.perf >= 0 ? "🟢" : "🔴"} ${t.perf}%\n`;
        }
        return message.reply(txt);
    }

    // AVIS
    if (message.content.startsWith("!avis")) {
        const args = message.content.split(" ");
        if (args.length < 2) return message.reply("❌ Utilisation : `!avis APPLE`");

        const name = args.slice(1).join(" ");
        const symbol = findSymbolByName(name);
        if (!symbol) return message.reply("❌ Nom inconnu.");

        const history = priceHistory[symbol] || [];
        if (history.length < 2) return message.reply("⏳ Pas assez de données.");

        const nameReal = symbolNames[symbol];

        const shortTrend = history.at(-1) - history.at(-2);
        const trend5 = history.slice(-10).at(-1) - history.slice(-10)[0];
        const trend15 = history.slice(-30).at(-1) - history.slice(-30)[0];

        const vol = Math.max(...history.slice(-30)) - Math.min(...history.slice(-30));

        const variation = ((history.at(-1) - history.at(-2)) / history.at(-2)) * 100;

        const conclusion =
            trend15 > 0 ? "Dynamique favorable." :
            trend15 < 0 ? "Dynamique baissière." :
            "Tendance stable.";

        return message.reply(
            `📊 **Analyse de ${nameReal} :**\n\n` +
            `• 📊 Tendance 1 min : ${shortTrend > 0 ? "📈" : shortTrend < 0 ? "📉" : "➖"}\n` +
            `• 🕒 Tendance 5 min : ${trend5 > 0 ? "📈" : trend5 < 0 ? "📉" : "➖"}\n` +
            `• 🕒 Tendance 15 min : ${trend15 > 0 ? "📈" : trend15 < 0 ? "📉" : "➖"}\n` +
            `• 🎯 Volatilité : ${vol < 0.2 ? "faible" : vol < 0.6 ? "modérée" : "élevée"}\n` +
            `• 🔄 Variation récente : ${variation.toFixed(2)}%\n\n` +
            `📝 **Conclusion :** ${conclusion}`
        );
    }
});

// ----------------------
// BOUCLE PRINCIPALE
// ----------------------
setInterval(async () => {
    for (const symbol of symbols) {
        try {
            const quote = await yahooFinance.quote(symbol);
            const price = quote.regularMarketPrice;

            if (!priceHistory[symbol]) priceHistory[symbol] = [];
            priceHistory[symbol].push(price);

            if (priceHistory[symbol].length > 200) {
                priceHistory[symbol].shift();
            }

        } catch (e) {
            console.log("Erreur Yahoo:", e);
        }
    }
}, 60000);

// ----------------------
// LOGIN
// ----------------------
client.login(process.env.TOKEN);

