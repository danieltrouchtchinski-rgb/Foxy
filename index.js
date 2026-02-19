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
const lastAlertTime1 = {};
const lastAlertTime01 = {};
const positions = {};

// ----------------------
// LISTE DES ACTIONS
// ----------------------
const symbolNames = {
    AAPL: "Apple",
    TSLA: "Tesla",
    NVDA: "Nvidia",
    AMZN: "Amazon",
    META: "Meta",
    MSFT: "Microsoft",
    GOOGL: "Alphabet",
    AMD: "AMD",
    INTC: "Intel",
    NFLX: "Netflix",
    DIS: "Disney",
    UBER: "Uber",
    PYPL: "PayPal",
    ADBE: "Adobe",
    CRM: "Salesforce",
    ORCL: "Oracle",
    BA: "Boeing",
    F: "Ford"
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
// READY
// ----------------------
client.once("ready", async () => {
    console.log(`Bot connecté en tant que ${client.user.tag}`);
    const admin = await client.users.fetch(ADMIN_ID);
    admin.send("✅ Bot démarré. Surveillance des actions en cours.");
});

// ----------------------
// BOUTONS
// ----------------------
client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    const [action, symbol, entry] = interaction.customId.split("_");
    const price = parseFloat(entry);
    const name = symbolNames[symbol];

    if (action === "acheter") {
        positions[symbol] = { entry: price, time: Date.now() };
        return interaction.reply({ content: `🟢 Achat ouvert sur **${name}**`, ephemeral: true });
    }

    if (action === "vendre") {
        if (!positions[symbol]) {
            return interaction.reply({ content: `❌ Aucune position sur ${name}`, ephemeral: true });
        }

        const perf = ((price - positions[symbol].entry) / positions[symbol].entry) * 100;
        delete positions[symbol];

        return interaction.reply({
            content: `🔴 Vente de **${name}** (${perf.toFixed(2)}%)`,
            ephemeral: true
        });
    }

    if (action === "ignore") {
        return interaction.reply({ content: `👌 Alerte ignorée`, ephemeral: true });
    }
});

// ----------------------
// BOUCLE DE SURVEILLANCE
// ----------------------
async function checkMarkets() {
    const admin = await client.users.fetch(ADMIN_ID);

    console.log("Boucle :", new Date().toLocaleTimeString());

    for (const symbol of symbols) {
        try {
            const quote = await yahooFinance.quote(symbol);
            const price = quote?.regularMarketPrice;
            if (!price) continue;

            const name = symbolNames[symbol];

            if (!lastPrices[symbol]) {
                lastPrices[symbol] = price;
                continue;
            }

            const ref = lastPrices[symbol];
            const change = ((price - ref) / ref) * 100;
            const now = Date.now();

            // ----------------------
            // ALERTE 1% (AVEC BOUTONS)
            // ----------------------
            if (Math.abs(change) >= 1) {
                if (!lastAlertTime1[symbol] || now - lastAlertTime1[symbol] > 5 * 60 * 1000) {
                    lastAlertTime1[symbol] = now;

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`acheter_${symbol}_${price}`).setLabel("Acheter").setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`vendre_${symbol}_${price}`).setLabel("Vendre").setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId(`ignore_${symbol}_${price}`).setLabel("Ignorer").setStyle(ButtonStyle.Secondary)
                    );

                    await admin.send({
                        content: `🚨 **${name}** a bougé de **${change.toFixed(2)}%**\nPrix : ${price}`,
                        components: [row]
                    });

                    lastPrices[symbol] = price;
                    continue;
                }
            }

            // ----------------------
            // ALERTE 0.1% (SANS BOUTONS)
            // ----------------------
            if (Math.abs(change) >= 0.1) {
                if (!lastAlertTime01[symbol] || now - lastAlertTime01[symbol] > 2 * 60 * 1000) {
                    lastAlertTime01[symbol] = now;

                    await admin.send(
                        `🔔 **${name}** variation : ${change.toFixed(2)}%\nPrix : ${price}`
                    );

                    lastPrices[symbol] = price;
                    continue;
                }
            }

            // ----------------------
            // SURVEILLANCE DES POSITIONS
            // ----------------------
            if (positions[symbol]) {
                const entry = positions[symbol].entry;
                const perf = ((price - entry) / entry) * 100;

                if (perf >= 0.1) {
                    await admin.send(`🎉 **${name}** position à **+${perf.toFixed(2)}%**`);
                    delete positions[symbol];
                } else if (perf <= -0.1) {
                    await admin.send(`⚠️ **${name}** position à **${perf.toFixed(2)}%**`);
                    delete positions[symbol];
                } else if (perf <= -3) {
                    await admin.send(`🛑 STOP-LOSS : **${name}** sous -3%`);
                    delete positions[symbol];
                }
            }

        } catch (e) {
            console.log("Erreur Yahoo :", symbol, e.message);
        }

        await new Promise(res => setTimeout(res, 300));
    }
}

setInterval(checkMarkets, 60_000);

// ----------------------
// LOGIN
// ----------------------
client.login(process.env.TOKEN);

