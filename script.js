/* =========================================================
   ACCUZZA — script.js
   Logica condivisa: reveal on scroll, selezione taglie,
   pagina bundle con calcolo spedizione live.
   ========================================================= */

/* ---------- dati prodotto (unica fonte di verità) ----------
   Modifica qui prezzi / pagine se cambiano in futuro.
   payLink: sostituire con il vero Stripe Payment Link del prodotto.
--------------------------------------------------------------*/
const ACCUZZA_PRODUCTS = [
  { id: "scoglio", name: "Scoglio", price: 20, page: "product-1.html", payLink: "https://buy.stripe.com/REPLACE_SCOGLIO" },
  { id: "levante", name: "Levante", price: 20, page: "product-2.html", payLink: "https://buy.stripe.com/REPLACE_LEVANTE" },
  { id: "cala",    name: "Cala",    price: 20, page: "product-3.html", payLink: "https://buy.stripe.com/REPLACE_CALA" },
  { id: "riva",    name: "Riva",    price: 20, page: "product-4.html", payLink: "https://buy.stripe.com/REPLACE_RIVA" }
];

/* Regola spedizione: numero articoli -> costo spedizione (euro) */
const SHIPPING_RULES = { 1: 8, 2: 5, 3: 0, 4: 0 };
function shippingFor(count){
  if (count <= 0) return 0;
  return SHIPPING_RULES[Math.min(count, 4)];
}

/* ---------------- reveal on scroll ---------------- */
function initReveal(){
  const items = document.querySelectorAll(".reveal");
  if (!items.length) return;
  if (!("IntersectionObserver" in window)){
    items.forEach(el => el.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting){
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  items.forEach(el => io.observe(el));
}

/* ---------------- selezione taglia (pagine prodotto) ---------------- */
function initSizeSelector(){
  const row = document.querySelector("[data-size-row]");
  if (!row) return;
  const buttons = row.querySelectorAll(".size-btn");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      buttons.forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      const hidden = document.querySelector("[data-selected-size]");
      if (hidden) hidden.value = btn.dataset.size;
    });
  });
}

/* Al click su "Acquista ora" nella pagina prodotto:
   qui si collegherebbe il vero link Stripe Payment Link,
   passando la taglia scelta come parametro se necessario. */
function initBuyNow(){
  const buyBtn = document.querySelector("[data-buy-now]");
  if (!buyBtn) return;
  buyBtn.addEventListener("click", (e) => {
    const size = document.querySelector("[data-selected-size]")?.value;
    if (!size){
      e.preventDefault();
      const warn = document.querySelector("[data-size-warning]");
      if (warn) warn.style.display = "block";
      document.querySelector("[data-size-row]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    // In produzione: buyBtn.href = `${payLink}?client_reference_id=${size}`;
  });
}

/* ---------------- pagina bundle ---------------- */
function initBundlePage(){
  const list = document.querySelector("[data-bundle-list]");
  if (!list) return;

  const rows = list.querySelectorAll("[data-bundle-row]");
  const summaryItemsEl = document.querySelector("[data-summary-items]");
  const summaryShippingEl = document.querySelector("[data-summary-shipping]");
  const summaryTotalEl = document.querySelector("[data-summary-total]");
  const summaryNoteEl = document.querySelector("[data-summary-note]");
  const summaryEmptyEl = document.querySelector("[data-summary-empty]");
  const checkoutBtn = document.querySelector("[data-checkout-btn]");
  const tiers = document.querySelectorAll("[data-ship-tier]");

  function euro(n){ return "€" + n.toFixed(0); }

  function update(){
    let selected = [];
    rows.forEach(row => {
      const checkbox = row.querySelector(".bundle-check");
      row.classList.toggle("checked", checkbox.checked);
      if (checkbox.checked){
        const id = row.dataset.bundleRow;
        const size = row.querySelector("select").value;
        const product = ACCUZZA_PRODUCTS.find(p => p.id === id);
        selected.push({ ...product, size });
      }
    });

    const count = selected.length;
    const itemsTotal = selected.reduce((sum, p) => sum + p.price, 0);
    const shipping = shippingFor(count);
    const total = itemsTotal + shipping;

    tiers.forEach(t => t.classList.toggle("active", Number(t.dataset.shipTier) === Math.min(count, 4)));

    if (count === 0){
      summaryEmptyEl.style.display = "block";
      summaryItemsEl.closest("[data-summary-body]").style.display = "none";
      checkoutBtn.setAttribute("disabled", "disabled");
      return;
    }

    summaryEmptyEl.style.display = "none";
    summaryItemsEl.closest("[data-summary-body]").style.display = "block";
    summaryItemsEl.textContent = `${count} ${count === 1 ? "maglietta" : "magliette"} — ${euro(itemsTotal)}`;
    summaryShippingEl.textContent = shipping === 0 ? "Gratis" : euro(shipping);
    summaryTotalEl.textContent = euro(total);
    summaryNoteEl.textContent = count < 3
      ? `Aggiungi ${3 - count} ${3 - count === 1 ? "articolo" : "articoli"} in più e la spedizione diventa gratuita.`
      : "Hai raggiunto la spedizione gratuita.";
    checkoutBtn.removeAttribute("disabled");

    // In produzione: qui si costruisce la sessione Stripe Checkout
    // passando `selected` (id prodotto + taglia + prezzo) al backend,
    // che risponde con l'URL della Checkout Session da usare come href.
    checkoutBtn.dataset.order = JSON.stringify({ items: selected, shipping, total });
  }

  rows.forEach(row => {
    row.querySelector(".bundle-check").addEventListener("change", update);
    row.querySelector("select").addEventListener("change", update);
  });

  checkoutBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    if (checkoutBtn.hasAttribute("disabled")) return;

    const order = JSON.parse(checkoutBtn.dataset.order);
    const items = order.items.map(p => ({ id: p.id, size: p.size }));

    checkoutBtn.textContent = "Attendere...";
    checkoutBtn.setAttribute("disabled", "disabled");

    try {
      const res = await fetch("/.netlify/functions/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items })
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url; // Stripe Checkout
      } else {
        alert("Errore nella creazione del pagamento. Riprova.");
        checkoutBtn.textContent = "Vai al pagamento";
        checkoutBtn.removeAttribute("disabled");
      }
    } catch (err) {
      alert("Errore di connessione. Riprova.");
      checkoutBtn.textContent = "Vai al pagamento";
      checkoutBtn.removeAttribute("disabled");
    }
  });

  // Preseleziona un prodotto se si arriva da una pagina prodotto (?add=scoglio)
  const params = new URLSearchParams(window.location.search);
  const preselect = params.get("add");
  if (preselect){
    const row = list.querySelector(`[data-bundle-row="${preselect}"]`);
    if (row){
      row.querySelector(".bundle-check").checked = true;
    }
  }

  update();
}

document.addEventListener("DOMContentLoaded", () => {
  initReveal();
  initSizeSelector();
  initBuyNow();
  initBundlePage();
});
