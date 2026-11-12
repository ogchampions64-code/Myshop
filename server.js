const path = require("path");
const fs = require("fs");
const envPath = path.join(__dirname, ".env");
require("dotenv").config({ path: envPath });
const express = require("express");
const Stripe = require("stripe");

console.log("Fichier .env cherché ici :", envPath, "->", fs.existsSync(envPath) ? "TROUVÉ" : "INTROUVABLE");
const key = (process.env.STRIPE_SECRET_KEY || "").trim();
if (!key.startsWith("sk_")) {
  console.error("\n❌ STRIPE_SECRET_KEY manquante ou invalide (elle doit commencer par sk_test_ ou sk_live_).");
  console.error("   Vérifie que le fichier s’appelle bien .env (pas .env.txt) et relance.\n");
  process.exit(1);
}
const stripe = Stripe(key);
const app = express();
app.use(express.json());
// Sert index.html depuis public/ ; sinon depuis le dossier du serveur (si les fichiers sont à plat).
const pub = fs.existsSync(path.join(__dirname, "public", "index.html"))
  ? path.join(__dirname, "public")
  : __dirname;
app.use(express.static(pub, { index: "index.html" }));
app.get("/", (req, res) => res.sendFile(path.join(pub, "index.html")));
console.log("Dossier servi :", pub);

// Catalogue : les prix vivent côté serveur, jamais côté navigateur.
const PLANS = [
  { name: "Éclair", m: 9 },
  { name: "Pulsar", m: 29 },
  { name: "Nova", m: 79 },
];
const PERIODS = [
  { one: "jour", many: "jours", max: 30, unit: (m) => Math.max(0.5, (m / 30) * 1.6) },
  { one: "mois", many: "mois", max: 12, unit: (m) => m },
  { one: "an", many: "ans", max: 5, unit: (m) => m * 12 * 0.8 },
];

app.post("/create-checkout-session", async (req, res) => {
  try {
    const plan = PLANS[req.body.plan];
    const per = PERIODS[req.body.per];
    const qty = Number(req.body.qty);
    if (!plan || !per || !Number.isInteger(qty) || qty < 1 || qty > per.max)
      return res.status(400).json({ error: "Choix invalide" });

    const amount = Math.round(per.unit(plan.m) * qty * 100); // en centimes
    const label = `${qty} ${qty > 1 ? per.many : per.one}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: amount,
          product_data: { name: `Orbite – Forfait ${plan.name}`, description: label },
        },
      }],
      metadata: { plan: plan.name, duree: label },
      success_url: `${process.env.DOMAIN}/?paiement=ok`,
      cancel_url: `${process.env.DOMAIN}/?paiement=annule`,
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.listen(3000, () => console.log("http://localhost:3000"));
