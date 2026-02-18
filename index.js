const { 
    Client, 
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle 
} = require("discord.js");

const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance();

const ADMIN_ID = "1238123426959462432"; 
const lastPrices = {};
const lastAlertTime = {};
const positions = {}; // <-- stocke les actions sur lesquelles tu as "misé"

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ]
});

// Quand le bot démarre
client.once("clientReady", () => {
    console.log(`Bot connecté en tant que ${client.user.tag}`);

    client.users.fetch(ADMIN_ID).then(user => {
        user.send("Le bot fonctionne et a été mise a jour !");
    });
});

const symbols = [
    "AAPL", "TSLA", "NVDA", "AMZN", "META",
    "MSFT", "BTC-USD", "ETH-USD"
];

// Quand tu cliques sur "Miser"
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

async function checkMarkets() {
    try {
        const adminUser = await client.users.fetch(ADMIN_ID);

        for (const symbol of symbols) {
            const data = await yahooFinance.quote(symbol);
            const price = data.regularMarketPrice;

            if (!price) continue;

            // --- 1) Détection des opportunités ---
            if (lastPrices[symbol]) {
                const oldPrice = lastPrices[symbol];
                const change = ((price - oldPrice) / oldPrice) * 100;

                const now = Date.now();

                // Cooldown 10 minutes
                if (lastAlertTime[symbol] && now - lastAlertTime[symbol] < 10 * 60 * 1000) {
                    continue;
                }

                // Opportunité intéressante : +3%
                if (change >= 3) {

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`miser_${symbol}_${price}`)
                            .setLabel("Miser")
                            .setStyle(ButtonStyle.Success)
                    );

                    await adminUser.send({
                        content: `💡 Tu devrais miser sur **${symbol}** ! Les prix ont augmenté de **${change.toFixed(2)}%** (prix actuel : ${price}).`,
                        components: [row]
                    });

                    lastAlertTime[symbol] = now;
                }
            }

            // --- 2) Surveillance des positions ---
            if (positions[symbol]) {
                const entry = positions[symbol].entry;
                const perf = ((price - entry) / entry) * 100;

                if (perf >= 1) {
                    await adminUser.send(
                        `🎉 **${symbol}** a dépassé **+1%** ! Tu peux prendre tes profits.`
                    );
                    delete positions[symbol];
                }

                if (perf <= -1) {
                    await adminUser.send(
                        `⚠️ **${symbol}** est tombé sous **-1%** ! Tu devrais envisager de couper ta position.`
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

