const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Partials
} = require("discord.js");
const axios = require("axios");

// --- CONFIG ---
const ADMIN_ID = "1238123426959462432";
const FINNHUB_KEY = process.env.FINNHUB;

// --- 28 SYMBOLS ---
const symbols = [
    "AAPL", "TSLA", "NVDA", "AMZN", "META", "MSFT",
    "GOOGL", "NFLX", "AMD", "INTC", "IBM", "ORCL",
    "UBER", "LYFT", "SHOP", "PYPL", "SQ", "BA",
    "DIS", "NKE", "SBUX", "KO", "PEP", "XOM",
    "CVX", "JPM", "V", "MA"
];

// --- NOMS HUMAINS ---
const prettyNames = {
    "AAPL": "Apple",
    "TSLA": "Tesla",
    "NVDA": "Nvidia",
    "AMZN": "Amazon",
    "META": "Meta",
    "MSFT": "Microsoft",
    "GOOGL": "Google",
    "NFLX": "Netflix",
    "AMD": "AMD",
    "INTC": "Intel",
    "IBM": "IBM",
    "ORCL": "Oracle",
    "UBER": "Uber",
    "LYFT": "Lyft",
    "SHOP": "Shopify",
    "PYPL": "PayPal",
    "SQ": "Block",
    "BA": "Boeing",
    "DIS": "Disney",
    "NKE": "Nike",
    "SBUX": "Starbucks",
    "KO": "Coca-Cola",
    "PEP": "Pepsi",
    "XOM": "ExxonMobil",
    "CVX": "Chevron",
    "JPM": "JP Morgan",
    "V": "Visa",
    "MA": "Mastercard"
};

const lastPrices = {};
const lastAlertTime = {};
// positions[symbol] = { entry, time, alerted }
const positions = {};

// --- DISCORD CLIENT ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
});

// --- READY ---
client.once("ready", () => {
    console.log(`Bot connecté en tant que ${client.user.tag}`);
    client.users.fetch(ADMIN_ID).then(user => {
        user.send("✨ Mise à jour réussie !");
    }).catch(console.error);
});

// --- FINNHUB FETCH ---
async function getQuote(symbol) {
    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`;
    const res = await axios.get(url);
    return res.data;
}

// --- BOUTONS ---
client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    const parts = interaction.customId.split("_");
    const action = parts[0];
    const symbol = parts[1];
    const extra = parts[2];

    // --- MISER ---
    if (action === "Acheter") {
        const entry = parseFloat(extra);
        if (isNaN(entry)) {
            return interaction.reply({ content: "Erreur : prix invalide.", ephemeral: true });
        }

        positions[symbol] = {
            entry,
            time: Date.now(),
            alerted: false
        };

        return interaction.reply({
            content: `👍 Position enregistrée sur **${prettyNames[symbol]}** à **${entry}**`,
            ephemeral: true
        });
    }

    // --- VENDRE (prix en direct) ---
    if (action === "vendre") {
        const position = positions[symbol];
        if (!position) {
            return interaction.reply({ content: "Erreur : aucune position trouvée.", ephemeral: true });
        }

        try {
            const data = await getQuote(symbol);
            const currentPrice = data.c;

            if (!currentPrice) {
                return interaction.reply({ content: "Impossible de récupérer le prix actuel.", ephemeral: true });
            }

            const entryPrice = position.entry;
            const perf = ((currentPrice - entryPrice) / entryPrice) * 100;
            const mise = 100;
            const profit = mise * (perf / 100);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`ignore_${symbol}_0`)
                    .setLabel("ignorer")
                    .setStyle(ButtonStyle.Secondary)
            );

            await interaction.reply({
                content:
                    `📊 **Bilan pour ${prettyNames[symbol]}**\n` +
                    `📈 Prix d'entrée : **${entryPrice}**\n` +
                    `📉 Prix actuel : **${currentPrice}**\n` +
                    `📊 Performance : **${perf.toFixed(2)}%**\n` +
                    `💰 Résultat : **${profit.toFixed(2)}€**`,
                components: [row]
            });

            delete positions[symbol];
        } catch (err) {
            console.error("Erreur VENDRE:", err);
            return interaction.reply({ content: "Erreur lors de la récupération du prix.", ephemeral: true });
        }
    }

    // --- IGNORER ---
    if (action === "ignore") {
        await interaction.message.delete().catch(() => {});
        return interaction.reply({ content: "Message ignoré.", ephemeral: true });
    }
});

// --- CHECK MARKETS ---
console.log("FINNHUB KEY:", FINNHUB_KEY);

async function checkMarkets() {
    try {
        const adminUser = await client.users.fetch(ADMIN_ID);

        for (const symbol of symbols) {
            const name = prettyNames[symbol];
            const data = await getQuote(symbol);
            const price = data.c;

            console.log(name, "PRICE:", price, "OLD:", lastPrices[symbol]);

            if (!price) {
                lastPrices[symbol] = price;
                continue;
            }

            // --- 1) Détection opportunités ---
            if (lastPrices[symbol]) {
                const oldPrice = lastPrices[symbol];
                const change = ((price - oldPrice) / oldPrice) * 100;
                const now = Date.now();

                if (!lastAlertTime[symbol] || now - lastAlertTime[symbol] > 10 * 60 * 1000) {
                    if (change >= 0.1) {
                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`miser_${symbol}_${price.toFixed(2)}`)
                                .setLabel("Miser")
                                .setStyle(ButtonStyle.Success),
                            new ButtonBuilder()
                                .setCustomId(`ignore_${symbol}_0`)
                                .setLabel("Ignorer")
                                .setStyle(ButtonStyle.Secondary)
                        );

                        await adminUser.send({
                            content: `💡 **${name}** a bougé de **${change.toFixed(2)}%**.`,
                            components: [row]
                        });

                        lastAlertTime[symbol] = now;
                    }
                }
            }

            // --- 2) Surveillance des positions (ALERTE ±3%) ---
            if (positions[symbol]) {
                const position = positions[symbol];
                const entry = position.entry;
                const perf = ((price - entry) / entry) * 100;

                if (!position.alerted && (perf >= 3 || perf <= -3)) {
                    const direction = perf >= 3 ? "augmenté" : "chuté";
                    const emoji = perf >= 3 ? "📈" : "📉";

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`vendre_${symbol}_0`)
                            .setLabel("Vendre")
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId(`ignore_${symbol}_0`)
                            .setLabel("ignorer")
                            .setStyle(ButtonStyle.Secondary)
                    );

                    await adminUser.send({
                        content: `${emoji} **${name}** a **${direction} de 3%** !`,
                        components: [row]
                    });

                    position.alerted = true;
                }
            }

            lastPrices[symbol] = price;
            await new Promise(res => setTimeout(res, 300));
        }
    } catch (err) {
        console.error("Erreur dans checkMarkets:", err);
    }
}

setInterval(checkMarkets, 60_000);

// --- LOGIN ---
client.login(process.env.TOKEN);
