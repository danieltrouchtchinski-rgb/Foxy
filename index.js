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

const lastPrices = {};        // Dernier prix de référence (pour variation cumulée)
const lastAlertTime1 = {};    // Anti-spam alertes 1%
const lastAlertTime01 = {};   // Anti-spam alertes 0.1%
const positions = {};         // Positions ouvertes

// ----------------------
// DICTIONNAIRE DES NOMS
// ----------------------
const symbolNames = {
    AAPL: "Apple",
    TSLA: "Tesla",
    NVDA: "Nvidia",
    AMZN: "Amazon",
    META: "Meta Platforms",
    MSFT: "Microsoft",
    GOOGL: "Alphabet (Google)",
    "BRK-B": "Berkshire Hathaway",
    JPM: "JPMorgan Chase",
    V: "Visa",
    MA: "Mastercard",
    KO: "Coca-Cola",
    PEP: "PepsiCo",
    XOM: "Exxon Mobil",
    CVX: "Chevron",
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
    try {
        const admin = await client.users.fetch(ADMIN_ID);
        await admin.send("✅ Bot démarré avec Yahoo Finance. Surveillance des actions en cours.");
    } catch (e) {
        console.log("Impossible d'envoyer le DM de démarrage.");
    }
});

// ----------------------
// BOUTONS
// ----------------------
client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    const [action, symbol, entry] = interaction.customId.split("_");
    const name = symbolNames[symbol] || symbol;
    const entryPrice = parseFloat(entry);

    if (action === "acheter") {
        positions[symbol] = { entry: entryPrice, time: Date.now() };
        return interaction.reply({
            content: `🟢 Position ouverte sur **${name}** à **${entryPrice}**`,
            ephemeral: true
        });
    }

    if (action === "vendre") {
        if (!positions[symbol]) {
            return interaction.reply({
                content: `❌ Aucune position ouverte sur **${name}**`,
                ephemeral: true
            });
        }

        const pos = positions[symbol];
        const perf = ((entryPrice - pos.entry) / pos.entry) * 100;
        delete positions[symbol];

        return interaction.reply({
            content: `🔴 Position fermée sur **${name}** (${perf.toFixed(2)}%)`,
            ephemeral: true
        });
    }

    if (action === "ignore") {
        return interaction.reply({
            content: `👌 Alerte ignorée pour **${name}**`,
            ephemeral: true
        });
    }
});

// ----------------------
// BOUCLE DE SURVEILLANCE
// ----------------------
async function checkMarkets() {
    let admin;
    try {
        admin = await client.users.fetch(ADMIN_ID);
    } catch {
        console.log("Impossible de récupérer l'admin.");
        return;
    }

    console.log("Boucle :", new Date().toLocaleTimeString());

    for (const symbol of symbols) {
        try {
            const quote = await yahooFinance.quote(symbol);
            const price = quote?.regularMarketPrice;
            if (!price) continue;

            const name = symbolNames[symbol] || symbol;

            // Initialisation du point de référence
            if (!lastPrices[symbol]) {
                lastPrices[symbol] = price;
                continue;
            }

            const refPrice = lastPrices[symbol];
            const change = ((price - refPrice) / refPrice) * 100;
            const now = Date.now();

            // ----------------------
            // ALERTE 1% (AVEC BOUTONS, VARIATION CUMULÉE)
            // ----------------------
            if (Math.abs(change) >= 1) {
                if (!lastAlertTime1[symbol] || now - lastAlertTime1[symbol] > 5 * 60 * 1000) {
                    lastAlertTime1[symbol] = now;

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

                    await admin.send({
                        content:
                            `🚨 **Alerte 1% — ${name} (${symbol})**\n` +
                            `Variation : ${change.toFixed(2)}%\n` +
                            `Prix actuel : ${price}`,
                        components: [row]
                    });

                    // On remet le point de référence ici (variation cumulée)
                    lastPrices[symbol] = price;
                    continue;
                }
            }

            // ----------------------
            // ALERTE 0.1% (SANS BOUTONS, VARIATION CUMULÉE)
            // ----------------------
            if (Math.abs(change) >= 0.1) {
                if (!lastAlertTime01[symbol] || now - lastAlertTime01[symbol] > 2 * 60 * 1000) {
                    lastAlertTime01[symbol] = now;

                    await admin.send(
                        `🔔 **Alerte 0.1% — ${name} (${symbol})**\n` +
                        `Variation : ${change.toFixed(2)}%\n` +
                        `Prix actuel : ${price}`
                    );

                    // On remet le point de référence ici aussi
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
                    await admin.send(`🛑 STOP-LOSS : **${name}** sous **-3%**`);
                    delete positions[symbol];
                }
            }

        } catch (e) {
            console.log("Erreur Yahoo pour", symbol, e.message);
        }

        // Petite pause pour éviter de spammer l'API
        await new Promise(res => setTimeout(res, 500));
    }
}

// ----------------------
// LANCEMENT BOUCLE
// ----------------------
setInterval(checkMarkets, 60_000);

// ----------------------
// LOGIN DISCORD
// ----------------------
client.login(process.env.TOKEN);
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

const lastPrices = {};        // Dernier prix de référence (pour variation cumulée)
const lastAlertTime1 = {};    // Anti-spam alertes 1%
const lastAlertTime01 = {};   // Anti-spam alertes 0.1%
const positions = {};         // Positions ouvertes

// ----------------------
// DICTIONNAIRE DES NOMS
// ----------------------
const symbolNames = {
    AAPL: "Apple",
    TSLA: "Tesla",
    NVDA: "Nvidia",
    AMZN: "Amazon",
    META: "Meta Platforms",
    MSFT: "Microsoft",
    GOOGL: "Alphabet (Google)",
    "BRK-B": "Berkshire Hathaway",
    JPM: "JPMorgan Chase",
    V: "Visa",
    MA: "Mastercard",
    KO: "Coca-Cola",
    PEP: "PepsiCo",
    XOM: "Exxon Mobil",
    CVX: "Chevron",
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
    try {
        const admin = await client.users.fetch(ADMIN_ID);
        await admin.send("✅ Bot démarré avec Yahoo Finance. Surveillance des actions en cours.");
    } catch (e) {
        console.log("Impossible d'envoyer le DM de démarrage.");
    }
});

// ----------------------
// BOUTONS
// ----------------------
client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    const [action, symbol, entry] = interaction.customId.split("_");
    const name = symbolNames[symbol] || symbol;
    const entryPrice = parseFloat(entry);

    if (action === "acheter") {
        positions[symbol] = { entry: entryPrice, time: Date.now() };
        return interaction.reply({
            content: `🟢 Position ouverte sur **${name}** à **${entryPrice}**`,
            ephemeral: true
        });
    }

    if (action === "vendre") {
        if (!positions[symbol]) {
            return interaction.reply({
                content: `❌ Aucune position ouverte sur **${name}**`,
                ephemeral: true
            });
        }

        const pos = positions[symbol];
        const perf = ((entryPrice - pos.entry) / pos.entry) * 100;
        delete positions[symbol];

        return interaction.reply({
            content: `🔴 Position fermée sur **${name}** (${perf.toFixed(2)}%)`,
            ephemeral: true
        });
    }

    if (action === "ignore") {
        return interaction.reply({
            content: `👌 Alerte ignorée pour **${name}**`,
            ephemeral: true
        });
    }
});

// ----------------------
// BOUCLE DE SURVEILLANCE
// ----------------------
async function checkMarkets() {
    let admin;
    try {
        admin = await client.users.fetch(ADMIN_ID);
    } catch {
        console.log("Impossible de récupérer l'admin.");
        return;
    }

    console.log("Boucle :", new Date().toLocaleTimeString());

    for (const symbol of symbols) {
        try {
            const quote = await yahooFinance.quote(symbol);
            const price = quote?.regularMarketPrice;
            if (!price) continue;

            const name = symbolNames[symbol] || symbol;

            // Initialisation du point de référence
            if (!lastPrices[symbol]) {
                lastPrices[symbol] = price;
                continue;
            }

            const refPrice = lastPrices[symbol];
            const change = ((price - refPrice) / refPrice) * 100;
            const now = Date.now();

            // ----------------------
            // ALERTE 1% (AVEC BOUTONS, VARIATION CUMULÉE)
            // ----------------------
            if (Math.abs(change) >= 1) {
                if (!lastAlertTime1[symbol] || now - lastAlertTime1[symbol] > 5 * 60 * 1000) {
                    lastAlertTime1[symbol] = now;

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

                    await admin.send({
                        content:
                            `🚨 **Alerte 1% — ${name} (${symbol})**\n` +
                            `Variation : ${change.toFixed(2)}%\n` +
                            `Prix actuel : ${price}`,
                        components: [row]
                    });

                    // On remet le point de référence ici (variation cumulée)
                    lastPrices[symbol] = price;
                    continue;
                }
            }

            // ----------------------
            // ALERTE 0.1% (SANS BOUTONS, VARIATION CUMULÉE)
            // ----------------------
            if (Math.abs(change) >= 0.1) {
                if (!lastAlertTime01[symbol] || now - lastAlertTime01[symbol] > 2 * 60 * 1000) {
                    lastAlertTime01[symbol] = now;

                    await admin.send(
                        `🔔 **Alerte 0.1% — ${name} (${symbol})**\n` +
                        `Variation : ${change.toFixed(2)}%\n` +
                        `Prix actuel : ${price}`
                    );

                    // On remet le point de référence ici aussi
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
                    await admin.send(`🛑 STOP-LOSS : **${name}** sous **-3%**`);
                    delete positions[symbol];
                }
            }

        } catch (e) {
            console.log("Erreur Yahoo pour", symbol, e.message);
        }

        // Petite pause pour éviter de spammer l'API
        await new Promise(res => setTimeout(res, 500));
    }
}

// ----------------------
// LANCEMENT BOUCLE
// ----------------------
setInterval(checkMarkets, 60_000);

// ----------------------
// LOGIN DISCORD
// ----------------------
client.login(process.env.TOKEN);
