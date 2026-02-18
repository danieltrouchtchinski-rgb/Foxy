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
const positions = {}; 

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
        user.send("Le bot fonctionne et a été mis à jour !");
    });
});

// ----------------------
// SYMBOLS À SURVEILLER
// ----------------------
const symbols = [
    "AAPL", "TSLA", "NVDA", "AMZN", "META",
    "MSFT", "BTC-USD", "ETH-USD",

    "GOOGL", "BRK-B", "JPM", "V", "MA",
    "KO", "PEP", "XOM", "CVX", "AMD",
    "INTC", "NFLX", "DIS", "UBER", "PYPL",
    "ADBE", "CRM", "ORCL", "BA", "F"
];

// ----------------------
// BOUTON "MISER"
// ----------------------
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
                data = await yahooFinance.quote(symbol);
            } catch (err) {
                console.log("Erreur Yahoo pour", symbol);
                continue;
            }

            const price = data?.regularMarketPrice;
            if (!price) continue;

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

                // Opportunité
                if (change >= 0.1) {
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`miser_${symbol}_${price}`)
                            .setLabel("Miser")
                            .setStyle(ButtonStyle.Success)
                    );

                    await adminUser.send({
                        content: `💡 **${symbol}** a pris **+${change.toFixed(2)}%** en 1 minute ! (prix : ${price})`,
                        components: [row]
                    });

                    lastAlertTime[symbol] = now;
                }

                // ----------------------
                // 2) CHUTE BRUTALE -3%
                // ----------------------
                if (change <= -3) {
                    await adminUser.send(
                        `🚨 **${symbol}** a chuté de **${change.toFixed(2)}%** en 1 minute !`
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
                        `🎉 **${symbol}** est à **+${perf.toFixed(2)}%** ! Prends tes profits.`
                    );
                    delete positions[symbol];
                }

                // Stop-loss -0.1%
                if (perf <= -0.1) {
                    await adminUser.send(
                        `⚠️ **${symbol}** est à **${perf.toFixed(2)}%** ! Stop-loss conseillé.`
                    );
                    delete positions[symbol];
                }

                // Stop-loss sécurité -3%
                if (perf <= -3) {
                    await adminUser.send(
                        `🛑 STOP-LOSS AUTOMATIQUE : **${symbol}** est tombé sous **-3%** !`
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

