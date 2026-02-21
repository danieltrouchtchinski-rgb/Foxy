const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Partials,
    REST,
    Routes
} = require("discord.js");
const axios = require("axios");

// --- CONFIG ---
const ADMIN_ID = "1238123426959462432";
const FINNHUB_KEY = process.env.FINNHUB;
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

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
// priceHistory[symbol] = { p1, p2, p5 }

// --- POSITIONS ---
const positions = {}; 
// positions[symbol] = { entry, alerted }

// --- DISCORD CLIENT ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

// --- ENREGISTREMENT DE LA COMMANDE /positions ---
async function registerCommands() {
    const commands = [
        {
            name: "positions",
            description: "Affiche toutes les actions que tu as achetées."
        }
    ];

    const rest = new REST({ version: "10" }).setToken(TOKEN);

    try {
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands }
        );
        console.log("Commande /positions enregistrée !");
    } catch (err) {
        console.error("Erreur enregistrement commandes :", err);
    }
}

// --- READY ---
client.once("ready", () => {
    console.log(`Bot connecté en tant que ${client.user.tag}`);
    registerCommands();

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
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "positions") {
            return handlePositionsCommand(interaction);
        }
    }

    if (!interaction.isButton()) return;

    const [action, symbol, price] = interaction.customId.split("_");

    // --- ACHETER ---
    if (action === "acheter") {
        positions[symbol] = {
            entry: parseFloat(price),
            alerted: false
        };

        return interaction.reply({
            content: `👍 Position ouverte sur **${prettyNames[symbol]}** à **${price}**`,
            ephemeral: true
        });
    }

    // --- VENDRE ---
    if (action === "vendre") {
        const pos = positions[symbol];
        if (!pos) {
            return interaction.reply({ content: "Aucune position trouvée.", ephemeral: true });
        }

        const current = await getQuote(symbol);
        const perf = ((current - pos.entry) / pos.entry) * 100;
        const profit = (perf / 100) * 100;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`ignore_${symbol}_0`)
                .setLabel("Ignorer")
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({
            content:
                `📊 **Bilan pour ${prettyNames[symbol]}**\n` +
                `📈 Entrée : **${pos.entry}**\n` +
                `📉 Actuel : **${current}**\n` +
                `📊 Perf : **${perf.toFixed(2)}%**\n` +
                `💰 Résultat : **${profit.toFixed(2)}€**`,
            components: [row]
        });

        delete positions[symbol];
    }

    // --- IGNORER ---
    if (action === "ignore") {
        await interaction.message.delete().catch(() => {});
        return interaction.reply({ content: "Message ignoré.", ephemeral: true });
    }
});

// --- COMMANDE /positions ---
async function handlePositionsCommand(interaction) {
    if (Object.keys(positions).length === 0) {
        return interaction.reply("📭 Tu n'as aucune position ouverte.");
    }

    let msg = "📘 **Tes positions actuelles :**\n\n";

    for (const symbol of Object.keys(positions)) {
        const pos = positions[symbol];
        const current = await getQuote(symbol);
        const perf = ((current - pos.entry) / pos.entry) * 100;
        const profit = (perf / 100) * 100;

        msg +=
            `**${prettyNames[symbol]}**\n` +
            `Entrée : ${pos.entry}\n` +
            `Actuel : ${current}\n` +
            `Perf : ${perf.toFixed(2)}%\n` +
            `Résultat : ${profit.toFixed(2)}€\n\n`;
    }

    return interaction.reply(msg);
}

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

            // Décalage
            hist.p5 = hist.p2;
            hist.p2 = hist.p1;
            hist.p1 = price;

            // --- 1) Détection tendance haussière ---
            if (hist.p1 && hist.p2 && hist.p5) {
                if (hist.p1 > hist.p2 && hist.p2 > hist.p5) {
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

            // --- 2) Surveillance des positions (±3%) ---
            if (positions[symbol]) {
                const pos = positions[symbol];
                const perf = ((price - pos.entry) / pos.entry) * 100;

                if (!pos.alerted && (perf >= 3 || perf <= -3)) {
                    const direction = perf >= 3 ? "augmenté" : "chuté";
                    const emoji = perf >= 3 ? "📈" : "📉";

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`vendre_${symbol}_0`)
                            .setLabel("Vendre")
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId(`ignore_${symbol}_0`)
                            .setLabel("Ignorer")
                            .setStyle(ButtonStyle.Secondary)
                    );

                    await adminUser.send({
                        content: `${emoji} **${name}** a **${direction} de 3%** !`,
                        components: [row]
                    });

                    pos.alerted = true;
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
client.login(TOKEN);
