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

// --- STOCKAGE DES PRIX ---
const priceHistory = {}; 
// priceHistory[symbol] = { p1: x, p2: y, p5: z }

const positions = {}; // positions[symbol] = { entry }

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
        user.send("✨ Bot mis à jour !");
    });
});

// --- FINNHUB FETCH ---
async function getQuote(symbol) {
    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`;
    const res = await axios.get(url);
    return res.data.c;
}

// --- BOUTONS ---
client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    const [action, symbol, price] = interaction.customId.split("_");

    // --- ACHETER ---
    if (action === "acheter") {
        positions[symbol] = {
            entry: parseFloat(price)
        };

        return interaction.reply({
            content: `👍 Position ouverte sur **${prettyNames[symbol]}** à **${price}**`,
            ephemeral: true
        });
    }

    // --- IGNORER ---
    if (action === "ignore") {
        await interaction.message.delete().catch(() => {});
        return interaction.reply({ content: "Message ignoré.", ephemeral: true });
    }
});

// --- CHECK MARKETS ---
async function checkMarkets() {
    try {
        const adminUser = await client.users.fetch(ADMIN_ID);

        for (const symbol of symbols) {
            const name = prettyNames[symbol];
            const price = await getQuote(symbol);

            if (!price) continue;

            if (!priceHistory[symbol]) {
                priceHistory[symbol] = { p1: null, p2: null, p5: null };
            }

            const hist = priceHistory[symbol];

            // Décalage des prix
            hist.p5 = hist.p2;
            hist.p2 = hist.p1;
            hist.p1 = price;

            // On attend d'avoir 3 valeurs
            if (hist.p1 && hist.p2 && hist.p5) {
                const rising = hist.p1 > hist.p2 && hist.p2 > hist.p5;

                if (rising) {
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`acheter_${symbol}_${price}`)
                            .setLabel("Acheter")
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId(`ignore_${symbol}_0`)
                            .setLabel("Ignorer")
                            .setStyle(ButtonStyle.Secondary)
                    );

                    await adminUser.send({
                        content: `📈 **${name}** monte depuis 5 minutes ! (prix : ${price})`,
                        components: [row]
                    });
                }
            }

            await new Promise(res => setTimeout(res, 300));
        }
    } catch (err) {
        console.error("Erreur checkMarkets:", err);
    }
}

setInterval(checkMarkets, 60_000);

// --- LOGIN ---
client.login(process.env.TOKEN);
