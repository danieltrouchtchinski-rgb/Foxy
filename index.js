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

// ----------------------
// DICTIONNAIRE DES NOMS
// ----------------------
const symbolNames = {
    "AAPL": "Apple",
    "TSLA": "Tesla",
    "NVDA": "Nvidia",
    "AMZN": "Amazon",
    "META": "Meta Platforms",
    "MSFT": "Microsoft",

    "GOOGL": "Alphabet (Google)",
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

// ----------------------
// SYMBOLS À SURVEILLER
// ----------------------
const symbols = Object.keys(symbolNames);

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
// BOUTONS : MISER / VENDRE / IGNORER
// ----------------------
client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    const [action, symbol, entry] = interaction.customId.split("_");
    const name = symbolNames[symbol] || symbol;

    // MISER
    if (action === "miser") {
        positions[symbol] = {
            entry: parseFloat(entry),
            time: Date.now()
        };

        return interaction.reply({
            content: `🟢 Position ouverte sur **${name}** à **${entry}**`,
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

        delete positions[symbol];

        return interaction.reply({
            content: `🔴 Position fermée sur **${name}** à **${currentPrice}** (perf : ${perf.toFixed(2)}%)`,
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
// CHECK MARKETS
// ----------------------
async function checkMarkets() {
    try {
        const adminUser = await client.users.fetch(ADMIN_ID);

        console.log("Boucle OK :", new Date().toLocaleTimeString());

        for (const symbol of symbols) {
            let data;

            try {
                data = await new Promise((resolve, reject) => {
                    finnhubClient.quote(symbol, (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    });
                });
            } catch (err) {
                console.log("Erreur Finnhub pour", symbol);
                continue;
            }

            const price = data?.c;
            if (!price) continue;

            const name = symbolNames[symbol] || symbol;

            // ----------------------
            // 1) OPPORTUNITÉ +0.1%
            // ----------------------
            if (lastPrices[symbol]) {
                const oldPrice = lastPrices[symbol];
                const change = ((price - oldPrice) / oldPrice) * 100;
                const now = Date.now();

                // Cooldown 10 minutes
                if (lastAlertTime[symbol] && now - lastAlertTime[symbol] < 10 * 60 * 1000) {
                    continue;
                }

                if (change >= 0.1) {
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`miser_${symbol}_${price}`)
                            .setLabel("Miser")
                            .setStyle(ButtonStyle.Success),

                        new ButtonBuilder()
                            .setCustomId(`vendre_${symbol}_${price}`)
                            .setLabel("Vendre")
                            .setStyle(ButtonStyle.Danger),

                        new ButtonBuilder()
                            .setCustomId(`ignore_${symbol}_${price}`)
                            .setLabel("Ignorer")
                            .setStyle(ButtonStyle.Secondary)
                    );

                    await adminUser.send({
                        content: `💡 **${name}** a pris **+${change.toFixed(2)}%** en 1 minute ! (prix : ${price})`,
                        components: [row]
                    });

                    lastAlertTime[symbol] = now;
                }

                // ----------------------
                // 2) CHUTE BRUTALE -3%
                // ----------------------
                if (change <= -3) {
                    await adminUser.send(
                        `🚨 **${name}** a chuté de **${change.toFixed(2)}%** en 1 minute !`
                    );
                }
            }

            // ----------------------
            // 3) SURVEILLANCE DES POSITIONS
            // ----------------------
            if (positions[symbol]) {
                const entry = positions[symbol].entry;
                const perf = ((price - entry) / entry) * 100;

                // Take profit +0.1%
                if (perf >= 0.1) {
                    await adminUser.send(
                        `🎉 **${name}** est à **+${perf.toFixed(2)}%** !`
                    );
                    delete positions[symbol];
                }

                // Stop-loss -0.1%
                if (perf <= -0.1) {
                    await adminUser.send(
                        `⚠️ **${name}** est à **${perf.toFixed(2)}%** !`
                    );
                    delete positions[symbol];
                }

                // Stop-loss sécurité -3%
                if (perf <= -3) {
                    await adminUser.send(
                        `🛑 STOP-LOSS AUTOMATIQUE : **${name}** est tombé sous **-3%** !`
                    );
                    delete positions[symbol];
                }
            }

            lastPrices[symbol] = price;

            await new Promise(res => setTimeout(res, 500));
        }
    } catch (err) {
        console.error("Erreur dans checkMarkets:", err);
    }
}

setInterval(checkMarkets, 60_000);
client.login(process.env.TOKEN);
