const { 
    Client, 
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle 
} = require("discord.js");

const finnhub = require("finnhub");

// ----------------------
// FINNHUB CLIENT
// ----------------------
const api_key = finnhub.ApiClient.instance.authentications["api_key"];
api_key.apiKey = process.env.FINNHUB_KEY;
const finnhubClient = new finnhub.DefaultApi();

const ADMIN_ID = "1238123426959462432"; 

const lastPrices = {};
const lastAlertTime = {};
const positions = {}; 
const tradeHistory = []; 

// 🔥 Historique pour analyse 1 min / 5 min / 15 min
const priceHistory = {}; 
// Exemple : priceHistory["AAPL"] = [182.4, 182.6, 182.5, ...]

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
    "BRK-B": "Berkshire Hathaway",
    "JPM": "JPMorgan Chase",
    "V": "Visa",
    "MA": "Mastercard",
    "KO": "Coca-Cola",
    "PEP": "PepsiCo",
    "XOM": "Exxon Mobil",
    "CVX": "Chevron",
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

// 🔥 Reverse lookup pour !avis APPLE → AAPL
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
// BOT READY
// ----------------------
client.once("ready", () => {
    console.log(`Bot connecté en tant que ${client.user.tag}`);
    client.users.fetch(ADMIN_ID).then(user => {
        user.send("Le bot fonctionne avec Finnhub !");
    });
});

// ----------------------
// BOUTONS : ACHETER / VENDRE / IGNORER
// ----------------------
client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    const [action, symbol, entry] = interaction.customId.split("_");
    const name = symbolNames[symbol] || symbol;

    // ACHETER
    if (action === "acheter") {
        positions[symbol] = {
            entry: parseFloat(entry),
            time: Date.now()
        };

        return interaction.reply({
            content: `🟢 Position ouverte sur **${name}**`,
            ephemeral: true
        });
    }

    // VENDRE
    if (action === "vendre") {
        if (!positions[symbol]) {
            return interaction.reply({
                content: `❌ Aucune position ouverte sur **${name}**`,
                ephemeral: true
            });
        }

        const entryPrice = positions[symbol].entry;
        const currentPrice = parseFloat(entry);
        const perf = ((currentPrice - entryPrice) / entryPrice) * 100;

        const trade = {
            symbol,
            name,
            entry: entryPrice,
            exit: currentPrice,
            perf: parseFloat(perf.toFixed(2)),
            time: Date.now()
        };

        tradeHistory.push(trade);
        delete positions[symbol];

        await interaction.user.send(
            `📊 **Récapitulatif du trade :**\n` +
            `**${name}**\n` +
            `Entrée → Sortie : ${trade.entry} → ${trade.exit}\n` +
            `Résultat : ${trade.perf >= 0 ? "🟢" : "🔴"} ${trade.perf}%`
        );

        return interaction.reply({
            content: `🔴 Position fermée sur **${name}** (perf : ${perf.toFixed(2)}%)`,
            ephemeral: true
        });
    }

    // IGNORER
    if (action === "ignore") {
        return interaction.reply({
            content: `👌 Alerte ignorée pour **${name}**`,
            ephemeral: true
        });
    }
});
// ----------------------
// COMMANDE !historique
// ----------------------
client.on("messageCreate", async message => {
    if (message.author.bot) return;

    if (message.content === "!historique") {
        if (tradeHistory.length === 0) {
            return message.reply("📭 Aucun trade enregistré pour le moment.");
        }

        let txt = "📘 **Historique des trades**\n\n";

        for (const trade of tradeHistory.slice(-20).reverse()) {
            txt += `**${trade.name}** : ${trade.perf >= 0 ? "🟢" : "🔴"} ${trade.perf}%\n`;
            txt += `Entrée → Sortie : ${trade.entry} → ${trade.exit}\n`;
            txt += `Date : ${new Date(trade.time).toLocaleString()}\n\n`;
        }

        message.reply(txt);
    }

    // ----------------------
    // COMMANDE !avis NOM
    // ----------------------
    if (message.content.startsWith("!avis")) {
        const args = message.content.split(" ");
        if (args.length < 2) return message.reply("❌ Utilisation : `!avis APPLE`");

        const name = args.slice(1).join(" ");
        const symbol = findSymbolByName(name);

        if (!symbol) {
            return message.reply("❌ Nom inconnu. Exemple : `!avis Apple`");
        }

        const history = priceHistory[symbol] || [];
        if (history.length < 2) {
            return message.reply("⏳ Pas assez de données pour analyser cette action.");
        }

        const nameReal = symbolNames[symbol];

        // Variation 1 min
        const shortTrend = history[history.length - 1] - history[history.length - 2];

        // Variation 5 min (10 points)
        const hist5 = history.slice(-10);
        const trend5 = hist5[hist5.length - 1] - hist5[0];

        // Variation 15 min (30 points)
        const hist15 = history.slice(-30);
        const trend15 = hist15[hist15.length - 1] - hist15[0];

        // Volatilité (écart type simple)
        const vol = hist15.length > 5 ? Math.max(...hist15) - Math.min(...hist15) : 0;

        const trendEmoji = shortTrend > 0 ? "📈" : shortTrend < 0 ? "📉" : "➖";
        const trend5Emoji = trend5 > 0 ? "📈" : trend5 < 0 ? "📉" : "➖";
        const trend15Emoji = trend15 > 0 ? "📈" : trend15 < 0 ? "📉" : "➖";

        const volText =
            vol < 0.2 ? "faible" :
            vol < 0.6 ? "modérée" :
            "élevée";

        const variation = ((history[history.length - 1] - history[history.length - 2]) / history[history.length - 2]) * 100;

        const conclusion =
            trend15 > 0
                ? "L’action montre une dynamique favorable à court et moyen terme."
                : trend15 < 0
                ? "L’action présente une dynamique baissière à surveiller."
                : "L’action est globalement stable.";

        message.reply(
            `📊 **Analyse de ${nameReal} :**\n\n` +
            `• 📊 Tendance 1 min : ${trendEmoji}\n` +
            `• 🕒 Tendance 5 min : ${trend5Emoji}\n` +
            `• 🕒 Tendance 15 min : ${trend15Emoji}\n` +
            `• 🎯 Volatilité : ${volText}\n` +
            `• 🔄 Variation récente : ${variation.toFixed(2)}%\n\n` +
            `📝 **Conclusion :** ${conclusion}`
        );
    }
});

