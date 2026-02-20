const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Partials
} = require("discord.js");

const Finnhub = require("finnhub");

// --- CONFIG ---
const ADMIN_ID = "1238123426959462432";
const symbols = [
    "AAPL", "TSLA", "NVDA", "AMZN", "META",
    "MSFT", "BTC-USD", "ETH-USD"
];

const lastPrices = {};
const lastAlertTime = {};
const positions = {};

// --- FINNHUB INIT ---
const api_key = Finnhub.ApiClient.instance.authentications["api_key"];
api_key.apiKey = process.env.FINNHUB;

const finnhubClient = new Finnhub.DefaultApi();

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
        user.send("Le bot fonctionne avec FINNHUB !");
    });
});

// --- BOUTON MISER ---
client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    const [action, symbol, entry] = interaction.customId.split("_");

    if (action === "miser") {
        positions[symbol] = {
            entry: parseFloat(entry),
            time: Date.now()
        };

        await interaction.reply({
            content: `👍 Position enregistrée sur **${symbol}** à **${entry}**`,
            ephemeral: true
        });
    }
});

// --- CHECK MARKETS ---
async function checkMarkets() {
    try {
        const adminUser = await client.users.fetch(ADMIN_ID);

        for (const symbol of symbols) {
            const data = await new Promise((resolve, reject) => {
                finnhubClient.quote(symbol, (err, d) => {
                    if (err) reject(err);
                    else resolve(d);
                });
            });

            const price = data.c; // prix actuel

            if (!price) continue;

            // --- 1) Détection opportunités ---
            if (lastPrices[symbol]) {
                const oldPrice = lastPrices[symbol];
                const change = ((price - oldPrice) / oldPrice) * 100;

                const now = Date.now();

                // Cooldown 10 minutes
                if (lastAlertTime[symbol] && now - lastAlertTime[symbol] < 10 * 60 * 1000) {
                    continue;
                }

                if (change >= 3) {
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`miser_${symbol}_${price}`)
                            .setLabel("Miser")
                            .setStyle(ButtonStyle.Success)
                    );

                    await adminUser.send({
                        content: `💡 **${symbol}** a bondi de **${change.toFixed(2)}%** (prix : ${price}).`,
                        components: [row]
                    });

                    lastAlertTime[symbol] = now;
                }
            }

            // --- 2) Surveillance des positions ---
            if (positions[symbol]) {
                const entry = positions[symbol].entry;
                const perf = ((price - entry) / entry) * 100;

                if (perf >= 3) {
                    await adminUser.send(
                        `🎉 **${symbol}** a dépassé **+3%** ! Tu peux prendre tes profits.`
                    );
                    delete positions[symbol];
                }

                if (perf <= -3) {
                    await adminUser.send(
                        `⚠️ **${symbol}** est tombé sous **-3%** ! Tu devrais couper ta position.`
                    );
                    delete positions[symbol];
                }
            }

            lastPrices[symbol] = price;

            await new Promise(res => setTimeout(res, 300)); // éviter le spam API
        }
    } catch (err) {
        console.error("Erreur dans checkMarkets:", err);
    }
}

setInterval(checkMarkets, 60_000);

// --- LOGIN ---
client.login(process.env.TOKEN);
