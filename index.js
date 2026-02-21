const {
    Client,
    GatewayIntentBits,
    Partials,
    REST,
    Routes,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");
const axios = require("axios");

// ENV
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const ADMIN_ID = process.env.ADMIN_ID;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

// SYMBOLS
const symbols = [
    "AAPL", "TSLA", "NVDA", "AMZN", "META", "MSFT",
    "GOOGL", "NFLX", "AMD", "INTC", "IBM", "ORCL"
];

// Noms humains
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
    "ORCL": "Oracle"
};

// Nom → symbole
const nameToSymbol = {};
for (const s of Object.keys(prettyNames)) {
    nameToSymbol[prettyNames[s].toLowerCase()] = s;
}

// Historique prix
const priceHistory = {}; // { p1, p2, p5 }

// Positions
const positions = {}; // { entry, alerted }

// Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

// Enregistrement commandes
async function registerCommands() {
    const commands = [
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
        },
        {
            name: "positions",
            description: "Affiche toutes les actions achetées."
        }
    ];

    const rest = new REST({ version: "10" }).setToken(TOKEN);

    await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commands }
    );

    console.log("Commandes enregistrées !");
}

// Fonction RapidAPI
async function getQuote(symbol) {
    try {
        const res = await axios.get(
            `https://yahoo-finance15.p.rapidapi.com/api/v1/markets/quote?ticker=${symbol}&type=STOCKS`,
            {
                headers: {
                    "x-rapidapi-key": RAPIDAPI_KEY,
                    "x-rapidapi-host": "yahoo-finance15.p.rapidapi.com"
                }
            }
        );

        return res.data?.body?.regularMarketPrice || null;

    } catch (err) {
        console.log("Erreur RapidAPI:", err.response?.status, err.response?.data);
        return null;
    }
}

// Ready
client.once("ready", () => {
    console.log(`Bot connecté en tant que ${client.user.tag}`);
    registerCommands();
});

// Interactions
client.on("interactionCreate", async interaction => {

    // Slash commands
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
    }

    // Boutons
    if (!interaction.isButton()) return;

    const [action, symbol, price] = interaction.customId.split("_");

    // Acheter
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

    // Vendre
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

    // Ignorer
    if (action === "ignore") {
        await interaction.message.delete().catch(() => {});
        return interaction.reply({ content: "Message ignoré.", ephemeral: true });
    }
});

// Analyse marché (désactivée pour éviter 429)
async function checkMarkets() {
    try {
        const adminUser = await client.users.fetch(ADMIN_ID);

        for (const symbol of symbols) {
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

            // Tendance haussière
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
                        content: `📈 **${prettyNames[symbol]}** monte depuis 5 minutes ! (prix : ${price})`,
                        components: [row]
                    });
                }
            }

            // Alertes ±3%
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
                        content: `${emoji} **${prettyNames[symbol]}** a **${direction} de 3%** !`,
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

// ❌ Désactivé pour éviter 429 pendant les tests
// setInterval(checkMarkets, 60_000);

// Login
client.login(TOKEN);
