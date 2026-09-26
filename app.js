import { db, auth } from "./firebase.js";
import {
  collection, getDocs,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

const $ = (selector) => document.querySelector(selector);
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
let products = [];
let activeCategory = "all";
let cart = JSON.parse(localStorage.getItem("revolution-cart") || "[]");

function saveCart() {
  localStorage.setItem("revolution-cart", JSON.stringify(cart));
  renderCart();
}

function toast(message) {
  const node = $("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  window.setTimeout(() => node.classList.remove("show"), 2200);
}

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

    const sizes = Array.isArray(product.sizes)
      ? product.sizes
      : [];

    const sizeControl = sizes.length
      ? `<select class="size-select" data-size-for="${product.id}">
          <option value="">SIZE</option>
          ${sizes.map((size) => `<option value="${size}">${size}</option>`).join("")}
        </select>`
      : "";

    return `<article class="product-card" data-product-id="${product.id}">
      <div class="product-image ${typeClass}" ${imageStyle}>
        ${product.tag ? `<span class="tag">${product.tag}</span>` : ""}
      </div>

      <div class="product-info">
        <h3>${product.name || "REVOLUTION PRODUCT"}</h3>

        <p>${product.description || "Official Revolution MMA & Fitness merchandise."}</p>

        <div class="product-meta">
          <b class="price">${money(product.price)}</b>

          <div class="product-actions">
            ${sizeControl}
            <button class="add" data-id="${product.id}">ADD +</button>
          </div>
        </div>
      </div>
    </article>`;
  }).join("");

  // ADD TO CART
  node.querySelectorAll(".add").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      addToCart(button.dataset.id);
    });
  });

  // OPEN PRODUCT DETAIL PAGE
  node.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      // Don't open PDP when using size selector
      // or clicking ADD TO CART
      if (
        event.target.closest(".add") ||
        event.target.closest(".size-select")
      ) {
        return;
      }

      const productId = card.dataset.productId;

      if (!productId) return;

      window.location.href =
        `product.html?id=${encodeURIComponent(productId)}`;
    });
  });
}

function addToCart(id) {
  const product = products.find((item) => item.id === id);
  if (!product) return;
  const select = document.querySelector(`[data-size-for="${CSS.escape(id)}"]`);
  const size = select?.value || "";
  if (Array.isArray(product.sizes) && product.sizes.length && !size) {
    toast("SELECT A SIZE FIRST");
    return;
  }
  const key = `${id}__${size}`;
  const existing = cart.find((item) => item.key === key);
  if (existing) existing.qty += 1;
  else cart.push({ key, id, name: product.name, price: Number(product.price || 0), size, qty: 1 });
  saveCart();
  toast(`${product.name} ADDED TO BAG`);
}

function renderCart() {
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  $("#cartCount") && ($( "#cartCount").textContent = count);
  $("#subtotal") && ($( "#subtotal").textContent = money(subtotal));
  const node = $("#cartItems");
  if (!node) return;
  node.innerHTML = cart.length ? cart.map((item) => `
    <div class="cart-row">
      <div><h4>${item.name}</h4><small>${item.size ? `SIZE ${item.size} · ` : ""}${money(item.price)}</small></div>
      <div class="qty"><button data-cart-key="${item.key}" data-delta="-1">−</button><b>${item.qty}</b><button data-cart-key="${item.key}" data-delta="1">+</button></div>
    </div>`).join("") : `<p style="color:#777">YOUR BAG IS EMPTY.</p>`;

  node.querySelectorAll("[data-cart-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = cart.find((entry) => entry.key === button.dataset.cartKey);
      if (!item) return;
      item.qty += Number(button.dataset.delta);
      if (item.qty <= 0) cart = cart.filter((entry) => entry.key !== button.dataset.cartKey);
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
  $("#cartBtn")?.addEventListener("click", () => {
    $("#cartPanel")?.classList.add("open");
    $("#overlay")?.classList.add("open");
  });
  const closeCart = () => {
    $("#cartPanel")?.classList.remove("open");
    $("#overlay")?.classList.remove("open");
  };
  $("#closeCart")?.addEventListener("click", closeCart);
  $("#overlay")?.addEventListener("click", closeCart);
  $("#checkout")?.addEventListener("click", () => toast("PAYMENT CHECKOUT WILL BE CONNECTED NEXT"));
}

function setupMemberAuth() {
  const modal = $("#memberModal");
  const email = $("#memberEmail");
  const password = $("#memberPassword");
  const status = $("#memberStatus");
  $("#memberBtn")?.addEventListener("click", () => modal?.classList.add("open"));
  $(".modal-close")?.addEventListener("click", () => modal?.classList.remove("open"));

  $("#memberSignIn")?.addEventListener("click", async () => {
    if (!email?.value || !password?.value) {
      if (status) status.textContent = "ENTER EMAIL AND PASSWORD.";
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, email.value.trim(), password.value);
      if (status) status.textContent = "SIGNED IN — WELCOME BACK.";
    } catch (error) {
      if (status) status.textContent = error.code === "auth/invalid-credential"
        ? "EMAIL OR PASSWORD IS INCORRECT."
        : error.message.toUpperCase();
    }
  });

  onAuthStateChanged(auth, (user) => {
    if (!status) return;
    if (user) status.textContent = `SIGNED IN AS ${user.email}`;
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
