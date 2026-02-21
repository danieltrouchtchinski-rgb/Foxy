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
const ADMIN_ID = process.env.ADMIN_ID;
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

// --- SYMBOLS ---
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

// --- NOM → SYMBOLE (pour /prix) ---
const nameToSymbol = {};
for (const s of Object.keys(prettyNames)) {
    nameToSymbol[prettyNames[s].toLowerCase()] = s;
}

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

// --- ENREGISTREMENT COMMANDES ---
async function registerCommands() {
    const commands = [
        {
            name: "positions",
            description: "Affiche toutes les actions que tu as achetées."
        },
        {
            name: "prix",
            description: "Affiche le prix actuel d'une action.",
            options: [
                {
                    name: "action",
                    description: "Ex: apple, tesla, amazon...",
                    type: 3,
                    required: true
                }
            ]
        }
    ];

    const rest = new REST({ version: "10" }).setToken(TOKEN);

    try {
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands }
        );
        console.log("Commandes enregistrées !");
    } catch (err) {
        console.error("Erreur enregistrement commandes :", err);
    }
}

// --- READY ---
client.once("ready", () => {
    console.log(`Bot connecté en tant que ${client.user.tag}`);
    registerCommands();

    client.users.fetch(ADMIN_ID).then(user => {
        user.send("✨ Bot opérationnel avec RapidAPI !");
    }).catch(() => {});
});

// --- RAPIDAPI YAHOO FINANCE ---
async function getQuote(symbol) {
    try {
        const res = await axios.get(
            `https://yahoo-finance15.p.rapidapi.com/api/yahoo/qu/quote/${symbol}`,
            {
                headers: {
                    "X-RapidAPI-Key": RAPIDAPI_KEY,
                    "X-RapidAPI-Host": "yahoo-finance15.p.rapidapi.com"
                }
            }
        );

        return res.data?.price?.regularMarketPrice || null;

    } catch (err) {
        console.log("Erreur RapidAPI:", err.response?.status, err.response?.data);
        return null;
    }
}

// --- INTERACTIONS ---
client.on("interactionCreate", async interaction => {

    // --- SLASH COMMANDS ---
    if (interaction.isChatInputCommand()) {

        // /prix
        if (interaction.commandName === "prix") {
            const actionName = interaction.options.getString("action").toLowerCase();
            const symbol = nameToSymbol[actionName];

            if (!symbol) {
                return interaction.reply(`❌ Action inconnue : **${actionName}**`);
            }

            const price = await getQuote(symbol);
            if (!price) {
                return interaction.reply(`❌ Impossible de récupérer le prix de **${actionName}**`);
            }

            return interaction.reply(
                `💹 Le prix actuel de **${prettyNames[symbol]}** (${symbol}) est : **${price}$**`
            );
        }

        // /positions
        if (interaction.commandName === "positions") {
            return handlePositionsCommand(interaction);
        }
    }

    // --- BOUTONS ---
    if (!interaction.isButton()) return;

    const [action, symbol, price] = interaction.customId.split("_");

    // ACHETER
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

    // VENDRE
    if (action === "vendre") {
        const pos = positions[symbol];
        if (!pos) {
            return interaction.reply({ content: "Aucune position trouvée.", ephemeral: true });
        }

        const current = await getQuote(symbol);
        if (!current) {
            return interaction.reply({ content: "Impossible de récupérer le prix actuel.", ephemeral: true });
        }

        const perf = ((current - pos.entry) / pos.entry) * 100;
        const profit = (perf / 100) * 100;

        await interaction.reply(
            `📊 **Bilan pour ${prettyNames[symbol]}**\n` +
            `Entrée : **${pos.entry}**\n` +
            `Actuel : **${current}**\n` +
            `Perf : **${perf.toFixed(2)}%**\n` +
            `💰 Résultat (mise 100€) : **${profit.toFixed(2)}€**`
        );

        delete positions[symbol];
    }

    // IGNORER
    if (action === "ignore") {
        await interaction.message.delete().catch(() => {});
        return interaction.reply({ content: "Message ignoré.", ephemeral: true });
    }
});

// --- /positions ---
async function handlePositionsCommand(interaction) {
    if (Object.keys(positions).length === 0) {
        return interaction.reply("📭 Tu n'as aucune position ouverte.");
    }

    let msg = "📘 **Tes positions actuelles :**\n\n";

    for (const symbol of Object.keys(positions)) {
        const pos = positions[symbol];
        const current = await getQuote(symbol);

        if (!current) {
            msg += `**${prettyNames[symbol]}** → prix indisponible.\n\n`;
            continue;
        }

        const perf = ((current - pos.entry) / pos.entry) * 100;
        const profit = (perf / 100) * 100;

        msg +=
            `**${prettyNames[symbol]}** (${symbol})\n` +
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

            // TENDANCE HAUSSIÈRE
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

            // ALERTES ±3%
            if (positions[symbol]) {
                const pos = positions[symbol];
                const perf = ((price - pos.entry) / pos.entry) * 100;

                if (!pos.alerted && (perf >= 3 || perf <= -3)) {
                    const emoji = perf >= 3 ? "📈" : "📉";
                    const direction = perf >= 3 ? "augmenté" : "chuté";

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
