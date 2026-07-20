/* =========================================================
   ACCUZZA — create-checkout.js
   Funzione serverless (Netlify Function).
   Riceve il carrello dal sito (bundle.html o pagina prodotto),
   calcola la spedizione in base al numero totale di articoli,
   e crea una Stripe Checkout Session.

   Variabile d'ambiente richiesta su Netlify:
     STRIPE_SECRET_KEY  -> la tua chiave segreta Stripe (sk_live_... o sk_test_...)

   URL della tua funzione una volta online:
     https://tuosito.netlify.app/.netlify/functions/create-checkout
   ========================================================= */

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// Stesso prezzo del sito: 20 euro a maglietta (in centesimi per Stripe)
const PRICE_PER_SHIRT = 2000;

// Stessa regola di spedizione mostrata sul sito (in centesimi)
const SHIPPING_RULES = { 1: 800, 2: 500, 3: 0 };

function shippingFor(count) {
  if (count <= 0) return 0;
  const tier = Math.min(count, 3);
  return SHIPPING_RULES[tier];
}

// Nome leggibile per ogni prodotto (deve combaciare con gli id usati nel sito)
const PRODUCT_NAMES = {
  scoglio: "Accuzza — Scoglio",
  levante: "Accuzza — Levante",
  cala: "Accuzza — Cala",
  riva: "Accuzza — Riva",
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { items, successUrl, cancelUrl } = JSON.parse(event.body);

    // items atteso: [{ id: "scoglio", size: "M", qty: 2 }, ...]
    if (!Array.isArray(items) || items.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "Carrello vuoto." }) };
    }

    const count = items.reduce((sum, item) => sum + (Number(item.qty) || 1), 0);
    const shippingAmount = shippingFor(count);

    // Un line item per ogni modello/taglia selezionati, con la relativa quantità
    const line_items = items.map((item) => ({
      price_data: {
        currency: "eur",
        product_data: {
          name: `${PRODUCT_NAMES[item.id] || item.id} — Taglia ${item.size}`,
        },
        unit_amount: PRICE_PER_SHIRT,
      },
      quantity: Number(item.qty) || 1,
    }));

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      shipping_address_collection: {
        allowed_countries: ["IT"],
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: shippingAmount, currency: "eur" },
            display_name:
              shippingAmount === 0 ? "Spedizione gratuita" : "Spedizione standard",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 4 },
              maximum: { unit: "business_day", value: 4 },
            },
          },
        },
      ],
      // Codice ordine leggibile: Stripe genera comunque un ID sessione univoco (cs_...),
      // che puoi usare come riferimento. Per un formato tipo "ACZ-0001" progressivo
      // serve un contatore esterno (es. Google Sheet via Zapier, come discusso).
      success_url: successUrl || `${event.headers.origin || ""}/grazie.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${event.headers.origin || ""}/bundle.html`,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
