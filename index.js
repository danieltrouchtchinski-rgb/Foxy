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

const symbols = [
    "AAPL", "TSLA", "NVDA", "AMZN", "META",
    "MSFT", "BTC-USD", "ETH-USD"
];

// Noms humains
const prettyNames = {
    "AAPL": "Apple",
    "TSLA": "Tesla",
    "NVDA": "Nvidia",
    "AMZN": "Amazon",
    "META": "Meta",
    "MSFT": "Microsoft",
    "BTC-USD": "Bitcoin",
    "ETH-USD": "Ethereum"
};

const lastPrices = {};
const lastAlertTime = {};
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
client.once("clientReady", () => {
    console.log(`Bot connecté en tant que ${client.user.tag}`);

    client.users.fetch(ADMIN_ID).then(user => {
        user.send("✨ Mise à jour réussie !");
    });
});

// --- BOUTONS ---
client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    const [action, symbol, entry] = interaction.customId.split("_");

    // --- MISER ---
    if (action === "miser") {
        positions[symbol] = {
            entry: parseFloat(entry),
            time: Date.now()
        };

        await interaction.reply({
            content: `👍 Position enregistrée sur **${prettyNames[symbol]}** à **${entry}**`,
            ephemeral: true
        });
    }

    // --- IGNORER ---
    if (action === "ignore") {
        await interaction.message.delete().catch(() => {});
        await interaction.reply({ content: "Message ignoré.", ephemeral: true });
    }
});

// --- FINNHUB FETCH ---
async function getQuote(symbol) {
    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`;
    const res = await axios.get(url);
    return res.data;
}

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

            if (!price) continue;

            // --- 1) Détection opportunités ---
            if (lastPrices[symbol]) {
                const oldPrice = lastPrices[symbol];
                const change = ((price - oldPrice) / oldPrice) * 100;

                const now = Date.now();

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
                            .setCustomId(`ignore_${symbol}_0`)
                            .setLabel("Ignorer")
                            .setStyle(ButtonStyle.Secondary)
                    );

                    await adminUser.send({
                        content: `💡 **${name}** a bougé de **${change.toFixed(2)}%** (prix : ${price}).`,
                        components: [row]
                    });

                    lastAlertTime[symbol] = now;
                }
            }

            // --- 2) Surveillance des positions ---
            if (positions[symbol]) {
                const entry = positions[symbol].entry;
                const perf = ((price - entry) / entry) * 100;

                const mise = 100;
                const profit = mise * (perf / 100);

                if (perf >= 0.1 || perf <= -0.1) {
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`ignore_${symbol}_0`)
                            .setLabel("Ignorer")
                            .setStyle(ButtonStyle.Secondary)
                    );

                    await adminUser.send({
                        content:
                            `📊 **Bilan pour ${name}**\n` +
                            `📈 Prix d'entrée : **${entry}**\n` +
                            `📉 Prix actuel : **${price}**\n` +
                            `📊 Performance : **${perf.toFixed(2)}%**\n` +
                            `💰 Résultat : **${profit.toFixed(2)}€**`,
                        components: [row]
                    });

                    delete positions[symbol];
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
