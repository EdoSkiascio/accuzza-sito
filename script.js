/* =========================================================
   ACCUZZA — script.js
   Logica condivisa: reveal on scroll, selezione taglia/quantità,
   pagina bundle con calcolo spedizione live, checkout Stripe reale.
   ========================================================= */

/* ---------- dati prodotto (unica fonte di verità) ---------- */
const ACCUZZA_PRODUCTS = [
  { id: "scoglio", name: "Scoglio", price: 20, page: "product-1.html" },
  { id: "levante", name: "Levante", price: 20, page: "product-2.html" },
  { id: "cala",    name: "Cala",    price: 20, page: "product-3.html" },
  { id: "riva",    name: "Riva",    price: 20, page: "product-4.html" }
];

/* Regola spedizione: numero totale di magliette -> costo spedizione (euro) */
const SHIPPING_RULES = { 1: 8, 2: 5, 3: 0 };
function shippingFor(count){
  if (count <= 0) return 0;
  const tier = Math.min(count, 3);
  return SHIPPING_RULES[tier];
}
function shipTierFor(count){
  if (count <= 0) return 0;
  return Math.min(count, 3);
}

/* ---------------- persistenza carrello (localStorage) ---------------- *
   Chiave: accuzza_cart
   Formato: { scoglio: { checked, size, qty }, levante: {...}, ... }
   Usato per mantenere lo stato del carrello quando si naviga tra
   pagina prodotto e pagina bundle (avanti e indietro).
------------------------------------------------------------------------ */
const CART_STORAGE_KEY = "accuzza_cart";

const CartStore = {
  read(){
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === "object") ? parsed : {};
    } catch (err) {
      return {};
    }
  },
  write(cart){
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch (err) {
      // localStorage non disponibile (es. modalità privata): il sito
      // continua a funzionare, semplicemente senza persistenza.
    }
  },
  // Aggiorna (merge) la riga di un singolo prodotto e salva.
  setItem(productId, data){
    const cart = CartStore.read();
    cart[productId] = { ...(cart[productId] || {}), ...data };
    CartStore.write(cart);
    return cart;
  }
};

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

/* ---------------- stepper quantità (- / input / +) ---------------- *
   Funziona per qualunque numero di stepper presenti nella pagina
   (una nella pagina prodotto, quattro nel bundle).
------------------------------------------------------------------- */
function initQtySteppers(){
  document.querySelectorAll("[data-qty-decrement], [data-qty-increment]").forEach(btn => {
    btn.addEventListener("click", () => {
      const wrapper = btn.closest(".qty-stepper");
      if (!wrapper) return;
      const input = wrapper.querySelector(".qty-input");
      let val = parseInt(input.value, 10);
      if (isNaN(val) || val < 1) val = 1;
      val = btn.hasAttribute("data-qty-decrement") ? Math.max(1, val - 1) : val + 1;
      input.value = val;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });

  document.querySelectorAll(".qty-input").forEach(input => {
    // Durante la digitazione: consente solo cifre, ma non forza subito il minimo
    // (così si può cancellare e riscrivere liberamente da tastiera).
    input.addEventListener("input", () => {
      input.value = input.value.replace(/[^0-9]/g, "");
    });
    // Quando si esce dal campo, si normalizza a un valore valido (minimo 1).
    input.addEventListener("blur", () => {
      let val = parseInt(input.value, 10);
      if (isNaN(val) || val < 1) val = 1;
      input.value = val;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
}

/* ---------------- checkout Stripe condiviso ---------------- *
   Chiama la Netlify Function che crea la Checkout Session,
   poi reindirizza il cliente alla vera pagina di pagamento Stripe.
   items: [{ id, size, qty }]
------------------------------------------------------------- */
async function startCheckoutSession(items, triggerBtn){
  const originalText = triggerBtn ? triggerBtn.textContent : null;
  if (triggerBtn){
    triggerBtn.textContent = "Attendere...";
    triggerBtn.setAttribute("disabled", "disabled");
  }
  try {
    const res = await fetch("/.netlify/functions/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items,
        successUrl: `${window.location.origin}/grazie.html?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: window.location.href
      })
    });
    const data = await res.json();
    if (data.url){
      window.location.href = data.url; // Stripe Checkout
      return;
    }
    alert("Errore nella creazione del pagamento. Riprova.");
  } catch (err) {
    alert("Errore di connessione. Riprova.");
  }
  if (triggerBtn){
    triggerBtn.textContent = originalText;
    triggerBtn.removeAttribute("disabled");
  }
}

/* ---------------- validazione taglia condivisa ---------------- */
function requireSizeSelected(){
  const size = document.querySelector("[data-selected-size]")?.value;
  if (!size){
    const warn = document.querySelector("[data-size-warning]");
    if (warn) warn.style.display = "block";
    document.querySelector("[data-size-row]")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return null;
  }
  return size;
}

/* ---------------- "Acquista ora" nella pagina prodotto ---------------- */
function initBuyNow(){
  const buyBtn = document.querySelector("[data-buy-now]");
  if (!buyBtn) return;

  buyBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const size = requireSizeSelected();
    if (!size) return;
    const productId = buyBtn.dataset.productId;
    const qty = Number(document.querySelector("[data-selected-qty]")?.value || 1);
    startCheckoutSession([{ id: productId, size, qty }], buyBtn);
  });
}

/* ---------------- "Aggiungi al carrello" nella pagina prodotto ---------------- */
function initAddToCart(){
  const btn = document.querySelector("[data-add-cart]");
  if (!btn) return;

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const size = requireSizeSelected();
    if (!size) return;
    const productId = btn.dataset.productId;
    const qty = Number(document.querySelector("[data-selected-qty]")?.value || 1);
    CartStore.setItem(productId, { checked: true, size, qty });
    window.location.href = `bundle.html?add=${productId}&size=${size}&qty=${qty}`;
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
    const cart = {};
    rows.forEach(row => {
      const checkbox = row.querySelector(".bundle-check");
      row.classList.toggle("checked", checkbox.checked);
      const id = row.dataset.bundleRow;
      const size = row.querySelector(".bundle-size-select").value;
      const qty = Math.max(1, parseInt(row.querySelector(".bundle-qty").value, 10) || 1);

      // Salva sempre lo stato della riga (anche se non selezionata),
      // così taglia/quantità restano impostate quando l'utente torna qui.
      cart[id] = { checked: checkbox.checked, size, qty };

      if (checkbox.checked){
        const product = ACCUZZA_PRODUCTS.find(p => p.id === id);
        selected.push({ ...product, size, qty });
      }
    });
    CartStore.write(cart);

    const count = selected.reduce((sum, p) => sum + p.qty, 0);
    const itemsTotal = selected.reduce((sum, p) => sum + p.price * p.qty, 0);
    const shipping = shippingFor(count);
    const total = itemsTotal + shipping;

    const activeTier = shipTierFor(count);
    tiers.forEach(t => t.classList.toggle("active", Number(t.dataset.shipTier) === activeTier));

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

    checkoutBtn.dataset.order = JSON.stringify({
      items: selected.map(p => ({ id: p.id, size: p.size, qty: p.qty }))
    });
  }

  rows.forEach(row => {
    const checkbox = row.querySelector(".bundle-check");
    const sizeSelect = row.querySelector(".bundle-size-select");
    const qtyInput = row.querySelector(".bundle-qty");

    checkbox.addEventListener("change", update);

    // Se l'utente cambia taglia o quantità di una riga non ancora
    // selezionata, la riga si auto-flagga (checkbox check automatico).
    sizeSelect.addEventListener("change", () => {
      if (!checkbox.checked) checkbox.checked = true;
      update();
    });
    qtyInput.addEventListener("change", () => {
      if (!checkbox.checked) checkbox.checked = true;
      update();
    });
  });

  checkoutBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    if (checkoutBtn.hasAttribute("disabled")) return;
    const order = JSON.parse(checkoutBtn.dataset.order);
    startCheckoutSession(order.items, checkoutBtn);
  });

  // 1) Ripristina lo stato salvato in precedenza (localStorage), se presente.
  const savedCart = CartStore.read();
  rows.forEach(row => {
    const id = row.dataset.bundleRow;
    const saved = savedCart[id];
    if (!saved) return;
    const sizeSelect = row.querySelector(".bundle-size-select");
    const qtyInput = row.querySelector(".bundle-qty");
    if (saved.size && [...sizeSelect.options].some(o => o.value === saved.size)){
      sizeSelect.value = saved.size;
    }
    if (saved.qty){
      qtyInput.value = Math.max(1, parseInt(saved.qty, 10) || 1);
    }
    if (saved.checked){
      row.querySelector(".bundle-check").checked = true;
    }
  });

  // 2) Applica eventuale preselezione arrivata da una pagina prodotto
  //    (?add=scoglio&size=M&qty=2) — ha priorità sul dato salvato,
  //    perché riflette l'azione più recente dell'utente.
  const params = new URLSearchParams(window.location.search);
  const preselect = params.get("add");
  const preselectSize = params.get("size");
  const preselectQty = params.get("qty");
  if (preselect){
    const row = list.querySelector(`[data-bundle-row="${preselect}"]`);
    if (row){
      row.querySelector(".bundle-check").checked = true;
      if (preselectSize){
        const sizeSelect = row.querySelector(".bundle-size-select");
        if ([...sizeSelect.options].some(o => o.value === preselectSize)){
          sizeSelect.value = preselectSize;
        }
      }
      if (preselectQty){
        const qtyInput = row.querySelector(".bundle-qty");
        const qtyVal = Math.max(1, parseInt(preselectQty, 10) || 1);
        qtyInput.value = qtyVal;
      }
    }
    // Pulisce l'URL per evitare che tornando indietro/avanti si
    // ri-applichi la stessa preselezione sopra ai dati più recenti.
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, "", cleanUrl);
  }

  update();
}

document.addEventListener("DOMContentLoaded", () => {
  initReveal();
  initSizeSelector();
  initQtySteppers();
  initBuyNow();
  initAddToCart();
  initBundlePage();
});
