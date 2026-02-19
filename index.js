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

        delete positions[symbol];

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
const finnhub = require("finnhub");

const finnhubClient = new finnhub.DefaultApi();
finnhubClient.apiClient.authentications["api_key"].apiKey = process.env.FINNHUB_KEY;

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
            // VARIATION
            // ----------------------
            if (lastPrices[symbol]) {
                const oldPrice = lastPrices[symbol];
                const change = ((price - oldPrice) / oldPrice) * 100;
                const now = Date.now();

                // ----------------------
                // 1) ALERTE IMPORTANTE +1%
                // ----------------------
                if (change >= 1) {
                    if (!lastAlertTime[symbol] || now - lastAlertTime[symbol] > 10 * 60 * 1000) {

                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`acheter_${symbol}_${price}`)
                                .setLabel("Acheter")
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
                            content: `💡 **${name}** a pris **+${change.toFixed(2)}%** en 1 minute !`,
                            components: [row]
                        });

                        lastAlertTime[symbol] = now;
                    }
                }

                // ----------------------
                // 2) ALERTE FAIBLE +0.1% (SILENCIEUSE)
                // ----------------------
                else if (change >= 0.1) {
                    await adminUser.send(`ℹ️ **${name}** a pris **+${change.toFixed(2)}%** en 1 minute`);
                }

                // ----------------------
                // 3) CHUTE BRUTALE -3%
                // ----------------------
                if (change <= -3) {
                    await adminUser.send(`🚨 **${name}** a chuté de **${change.toFixed(2)}%** en 1 minute !`);
                }
            }

            // ----------------------
            // SURVEILLANCE DES POSITIONS
            // ----------------------
            if (positions[symbol]) {
                const entry = positions[symbol].entry;
                const perf = ((price - entry) / entry) * 100;

                if (perf >= 0.1) {
                    await adminUser.send(`🎉 **${name}** est à **+${perf.toFixed(2)}%** !`);
                    delete positions[symbol];
                }

                if (perf <= -0.1) {
                    await adminUser.send(`⚠️ **${name}** est à **${perf.toFixed(2)}%** !`);
                    delete positions[symbol];
                }

                if (perf <= -3) {
                    await adminUser.send(`🛑 STOP-LOSS AUTOMATIQUE : **${name}** est tombé sous **-3%** !`);
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
