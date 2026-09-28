import { db, auth } from "./firebase.js";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

const $ = (selector) => document.querySelector(selector);
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const CART_KEY = "revolution_cart";
const LEGACY_CART_KEY = "revolution-cart";

let products = [];
let activeCategory = "all";
let cart = loadSharedCart();
let currentUser = null;

function normalizeCart(items) {
  if (!Array.isArray(items)) return [];

  return items.map((item) => ({
    id: item.id || "",
    name: item.name || item.title || "REVOLUTION PRODUCT",
    price: Number(item.price || 0),
    image: item.image || item.imageUrl || "",
    size: item.size || "",
    quantity: Math.max(1, Number(item.quantity ?? item.qty ?? 1))
  })).filter((item) => item.id || item.name);
}

function loadSharedCart() {
  try {
    const shared = JSON.parse(localStorage.getItem(CART_KEY) || "null");
    if (Array.isArray(shared)) return normalizeCart(shared);

    const legacy = JSON.parse(localStorage.getItem(LEGACY_CART_KEY) || "[]");
    const normalized = normalizeCart(legacy);

    if (normalized.length) {
      localStorage.setItem(CART_KEY, JSON.stringify(normalized));
      localStorage.removeItem(LEGACY_CART_KEY);
    }

    return normalized;
  } catch (error) {
    console.error("CART LOAD ERROR:", error);
    return [];
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(normalizeCart(cart)));
  localStorage.removeItem(LEGACY_CART_KEY);
  cart = normalizeCart(cart);
  renderCart();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function toast(message) {
  const node = $("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  window.setTimeout(() => node.classList.remove("show"), 2200);
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
});

function renderFilters() {
  const node = $("#filters");
  if (!node) return;

  const categories = [
    ["all", "ALL"], ["tees", "TEES"], ["shorts", "SHORTS"],
    ["hoodies", "HOODIES"], ["gear", "GEAR"]
  ];

  node.innerHTML = categories.map(([value, label]) =>
    `<button class="filter ${activeCategory === value ? "active" : ""}" data-category="${value}">${label}</button>`
  ).join("");

  node.querySelectorAll(".filter").forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.category;
      renderFilters();
      renderProducts();
    });
  });
}

function renderProducts() {
  const node = $("#products");
  if (!node) return;

  const visible = activeCategory === "all"
    ? products
    : products.filter((product) => product.category === activeCategory);

  if (!visible.length) {
    node.innerHTML = `<div class="empty-products">
      PRODUCTS COMING SOON.<br>
      <small>The shop will populate automatically when products are added in the admin dashboard.</small>
    </div>`;
    return;
  }

  node.innerHTML = visible.map((product) => {
    const imageStyle = product.imageUrl
      ? `style="background-image:url('${String(product.imageUrl).replace(/'/g, "%27")}');background-size:cover;background-position:center"`
      : "";

    const typeClass = product.type || product.category || "tee";
    const sizes = Array.isArray(product.sizes) ? product.sizes : [];

    const sizeControl = sizes.length
      ? `<select class="size-select" data-size-for="${escapeHtml(product.id)}">
          <option value="">SIZE</option>
          ${sizes.map((size) => `<option value="${escapeHtml(size)}">${escapeHtml(size)}</option>`).join("")}
        </select>`
      : "";

    return `<article class="product-card" data-product-id="${escapeHtml(product.id)}">
      <div class="product-image ${escapeHtml(typeClass)}" ${imageStyle}>
        ${product.tag ? `<span class="tag">${escapeHtml(product.tag)}</span>` : ""}
      </div>

      <div class="product-info">
        <h3>${escapeHtml(product.name || "REVOLUTION PRODUCT")}</h3>
        <p>${escapeHtml(product.description || "Official Revolution MMA & Fitness merchandise.")}</p>

        <div class="product-meta">
          <b class="price">${money(product.price)}</b>

          <div class="product-actions">
            ${sizeControl}
            <button class="add-to-bag" data-id="${escapeHtml(product.id)}" type="button">
              <span>ADD TO BAG</span><b>↗</b>
            </button>
          </div>
        </div>
      </div>
    </article>`;
  }).join("");

  node.querySelectorAll(".add-to-bag").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      addToCart(button.dataset.id);
    });
  });

  node.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest(".add-to-bag") || event.target.closest(".size-select")) return;

      const productId = card.dataset.productId;
      if (productId) {
        window.location.href = `product.html?id=${encodeURIComponent(productId)}`;
      }
    });
  });
}

function addToCart(id) {
  const product = products.find((item) => item.id === id);
  if (!product) return;

  const select = document.querySelector(`[data-size-for="${CSS.escape(id)}"]`);
  const size = select?.value || "";
  const sizes = Array.isArray(product.sizes) ? product.sizes : [];

  if (sizes.length && !size) {
    toast("SELECT A SIZE FIRST");
    return;
  }

  const existing = cart.find(
    (item) => item.id === id && item.size === size
  );

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({
      id,
      name: product.name || "REVOLUTION PRODUCT",
      price: Number(product.price || 0),
      image: product.imageUrl || product.image || "",
      size,
      quantity: 1
    });
  }

  saveCart();
  openBag();
  toast(`${product.name || "PRODUCT"} ADDED TO BAG`);
}

function renderCart() {
  cart = normalizeCart(cart);

  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  $("#cartCount") && ($("#cartCount").textContent = count);

  const bagCount = $("#bagCount");
  if (bagCount) bagCount.textContent = count;

  renderBagDrawer();
}

function openBag() {
  const drawer = $("#bagDrawer");
  const overlay = $("#bagOverlay");
  if (!drawer || !overlay) return;

  renderBagDrawer();
  drawer.classList.add("open");
  overlay.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeBag() {
  const drawer = $("#bagDrawer");
  const overlay = $("#bagOverlay");
  if (!drawer || !overlay) return;

  drawer.classList.remove("open");
  overlay.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function renderBagDrawer() {
  const node = $("#bagItems");
  const subtotalNode = $("#bagSubtotal");
  if (!node) return;

  cart = normalizeCart(cart);

  if (!cart.length) {
    node.innerHTML = `
      <div id="emptyBag" class="empty-bag">
        <span class="empty-bag-icon">♧</span>
        <h3>YOUR BAG IS EMPTY</h3>
        <p>ADD SOMETHING FROM THE REVOLUTION STORE.</p>
        <button id="continueShopping" type="button" class="continue-shopping">
          CONTINUE SHOPPING
        </button>
      </div>`;

    if (subtotalNode) subtotalNode.textContent = "₹0";
    $("#continueShopping")?.addEventListener("click", closeBag);
    return;
  }

  const subtotal = cart.reduce(
    (total, item) => total + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );

  if (subtotalNode) subtotalNode.textContent = money(subtotal);

  node.innerHTML = cart.map((item, index) => `
    <div class="bag-item">
      <div class="bag-item-image">
        ${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">` : ""}
      </div>

      <div class="bag-item-info">
        <h3 class="bag-item-name">${escapeHtml(item.name)}</h3>
        <div class="bag-item-price">${money(item.price)}</div>
        ${item.size ? `<div class="bag-item-size">SIZE ${escapeHtml(item.size)}</div>` : ""}

        <div class="bag-quantity">
          <button type="button" data-bag-action="minus" data-bag-index="${index}">−</button>
          <span class="bag-quantity-value">${item.quantity}</span>
          <button type="button" data-bag-action="plus" data-bag-index="${index}">+</button>
        </div>
      </div>

      <button type="button" class="bag-item-remove" data-bag-action="remove" data-bag-index="${index}" aria-label="Remove item">×</button>
    </div>
  `).join("");

  node.querySelectorAll("[data-bag-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.bagIndex);
      const action = button.dataset.bagAction;
      const item = cart[index];
      if (!item) return;

      if (action === "plus") item.quantity += 1;
      if (action === "minus") item.quantity -= 1;
      if (action === "remove" || item.quantity <= 0) cart.splice(index, 1);

      saveCart();
    });
  });
}

async function loadProducts() {
  const node = $("#products");

  try {
    const snapshot = await getDocs(collection(db, "products"));
    products = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((product) => product.active !== false)
      .sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() ?? 0;
        const bTime = b.createdAt?.toMillis?.() ?? 0;
        return bTime - aTime;
      });
  } catch (error) {
    console.error(error);
    products = [];
    if (node) node.innerHTML = `<div class="empty-products">CONNECT FIREBASE TO LOAD THE STORE.</div>`;
  }

  renderFilters();
  renderProducts();
  renderCart();
}

function setupCart() {
  $("#cartBtn")?.addEventListener("click", openBag);
  $("#closeBagButton")?.addEventListener("click", closeBag);
  $("#bagOverlay")?.addEventListener("click", closeBag);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeBag();
  });

  $("#bagCheckout")?.addEventListener("click", async () => {
    if (!cart.length) {
      toast("YOUR BAG IS EMPTY");
      return;
    }

    if (!currentUser) {
      toast("PLEASE SIGN IN BEFORE CHECKOUT");
      window.setTimeout(() => { window.location.href = "account.html"; }, 900);
      return;
    }

    const checkoutButton = $("#bagCheckout");
    if (checkoutButton) {
      checkoutButton.disabled = true;
      checkoutButton.innerHTML = `CREATING ORDER... <span>↗</span>`;
    }

    try {
      const total = cart.reduce(
        (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
        0
      );

      const orderItems = cart.map((item) => ({
        productId: item.id,
        name: item.name,
        price: Number(item.price || 0),
        quantity: Number(item.quantity || 1),
        size: item.size || ""
      }));

      const orderNumber = `REV-${Date.now().toString().slice(-8)}`;

      await addDoc(collection(db, "orders"), {
        userId: currentUser.uid,
        userEmail: currentUser.email || "",
        orderNumber,
        items: orderItems,
        total,
        status: "PROCESSING",
        createdAt: serverTimestamp()
      });

      cart = [];
      localStorage.removeItem(CART_KEY);
      localStorage.removeItem(LEGACY_CART_KEY);
      renderCart();
      closeBag();
      toast("ORDER PLACED SUCCESSFULLY");

      window.setTimeout(() => { window.location.href = "orders.html"; }, 1200);
    } catch (error) {
      console.error("CREATE ORDER ERROR:", error);
      toast("COULD NOT CREATE ORDER. PLEASE TRY AGAIN.");
    } finally {
      if (checkoutButton) {
        checkoutButton.disabled = false;
        checkoutButton.innerHTML = `CHECKOUT <span>↗</span>`;
      }
    }
  });
}

function setupMemberAuth() {
  $("#memberBtn")?.addEventListener("click", () => {
    window.location.href = "account.html";
  });
}

function setupNewsletter() {
  $("#newsletter")?.addEventListener("submit", (event) => {
    event.preventDefault();
    toast("YOU'RE ON THE REVOLUTION LIST");
    event.target.reset();
  });
}

function setupMenu() {
  $("#menuBtn")?.addEventListener("click", () => {
    const nav = $("#nav");
    if (!nav) return;
    nav.classList.toggle("mobile-open");
  });
}

setupCart();
setupMemberAuth();
setupNewsletter();
setupMenu();
loadProducts();
