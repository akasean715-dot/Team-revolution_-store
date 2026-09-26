import {
  collection,
  getDocs,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import { db } from "./firebase.js";


/* =========================================================
   HELPERS
========================================================= */

const $ = (selector) => document.querySelector(selector);

const escapeHtml = (value) => {
  return String(value ?? "")
    .replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
};


function formatPrice(value) {

  const number = Number(
    String(value ?? "")
      .replace(/[₹,$,\s]/g, "")
  );

  if (!Number.isFinite(number)) {
    return "₹0";
  }

  return `₹${number.toLocaleString("en-IN")}`;
}


function getProductId() {

  const params = new URLSearchParams(window.location.search);

  return params.get("id");
}


function getImageList(product) {

  const images = [];

  if (Array.isArray(product.images)) {
    images.push(...product.images);
  }

  if (product.imageUrl) {
    images.push(product.imageUrl);
  }

  if (product.url) {
    images.push(product.url);
  }

  if (product.image) {
    images.push(product.image);
  }

  return [...new Set(
    images.filter(
      (image) =>
        typeof image === "string" &&
        image.trim()
    )
  )];
}


function getSizes(product) {

  let sizes = product.sizes;

  if (Array.isArray(sizes)) {
    return sizes;
  }

  if (typeof sizes === "string") {
    return sizes
      .split(",")
      .map((size) => size.trim())
      .filter(Boolean);
  }

  return [];
}


/* =========================================================
   STATE
========================================================= */

let currentProduct = null;

let productImages = [];

let currentImageIndex = 0;

let selectedSize = "";

let quantity = 1;

let relatedProducts = [];

let relatedStart = 0;


/* =========================================================
   LOAD PRODUCT
========================================================= */

async function loadProduct() {

  const productId = getProductId();

  if (!productId) {
    showError("No product was selected.");
    return;
  }

  try {

    const productRef = doc(
      db,
      "products",
      productId
    );

    const snapshot = await getDoc(productRef);

    if (!snapshot.exists()) {
      showError("Product not found.");
      return;
    }

    currentProduct = {
      id: snapshot.id,
      ...snapshot.data()
    };

    renderProduct();

    await loadRelatedProducts();

    updateBagCount();

  } catch (error) {

    console.error(
      "PDP product loading error:",
      error
    );

    showError(
      "Could not load this product."
    );
  }
}


/* =========================================================
   RENDER PRODUCT
========================================================= */

function renderProduct() {

  const product = currentProduct;

  productImages = getImageList(product);

  if (!productImages.length) {
    productImages = [
      "data:image/svg+xml;charset=UTF-8," +
      encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
          <rect width="100%" height="100%" fill="#151515"/>
          <text
            x="50%"
            y="50%"
            fill="#777"
            font-size="32"
            text-anchor="middle"
            dominant-baseline="middle"
          >
            NO IMAGE
          </text>
        </svg>
      `)
    ];
  }


  /* TITLE */

  const name =
    product.name ||
    product.title ||
    "Product";

  $("#productName").textContent = name;

  $("#breadcrumbProduct").textContent = name;

  document.title =
    `${name} | The Revolution`;


  /* PRICE */

  $("#productPrice").textContent =
    formatPrice(product.price);


  /* DESCRIPTION */

  $("#productDescription").textContent =
    product.description ||
    product.details ||
    "Built for training, movement and everyday wear.";


  /* BADGE */

  const badge =
    product.badge ||
    product.label ||
    "NEW";

  $("#productBadge").textContent =
    badge;


  /* CATEGORY */

  const category =
    product.category ||
    product.type ||
    "TEE";

  $("#detailCategory").textContent =
    String(category).toUpperCase();


  /* TYPE */

  $("#detailType").textContent =
    product.type ||
    "T-Shirt";


  /* STOCK */

  const stock =
    product.stock ??
    product.quantity ??
    "In Stock";

  $("#detailStock").textContent =
    typeof stock === "number"
      ? stock > 0
        ? "In Stock"
        : "Out of Stock"
      : stock;


  /* RATING */

  $("#ratingValue").textContent =
    `(${product.rating ?? "5.0"})`;

  $("#reviewCount").textContent =
    `${product.reviewCount ?? product.reviewsCount ?? 0} reviews`;


  /* SIZES */

  const sizes = getSizes(product);

  renderSizes(sizes);

  $("#detailSizes").textContent =
    sizes.length
      ? sizes.join(", ")
      : "One Size";


  /* GALLERY */

  renderGallery();

  showImage(0);
}


/* =========================================================
   SIZES
========================================================= */

function renderSizes(sizes) {

  const container = $("#sizeOptions");

  container.innerHTML = "";

  if (!sizes.length) {

    $("#sizeSection").style.display =
      "none";

    selectedSize = "";

    return;
  }

  $("#sizeSection").style.display =
    "";

  sizes.forEach((size, index) => {

    const button =
      document.createElement("button");

    button.type = "button";

    button.className =
      "size-button";

    button.textContent =
      size;

    button.dataset.size =
      size;

    button.addEventListener(
      "click",
      () => {

        document
          .querySelectorAll(".size-button")
          .forEach((item) => {
            item.classList.remove("active");
          });

        button.classList.add("active");

        selectedSize = size;
      }
    );

    container.appendChild(button);

    if (index === 0) {
      button.classList.add("active");
      selectedSize = size;
    }

  });
}


/* =========================================================
   GALLERY
========================================================= */

function renderGallery() {

  const container =
    $("#productThumbnails");

  container.innerHTML = "";

  productImages.forEach(
    (image, index) => {

      const button =
        document.createElement("button");

      button.type = "button";

      button.className =
        "pdp-thumb";

      button.innerHTML = `
        <img
          src="${escapeHtml(image)}"
          alt="Product image ${index + 1}"
        >
      `;

      button.addEventListener(
        "click",
        () => showImage(index)
      );

      container.appendChild(button);
    }
  );
}


function showImage(index) {

  if (!productImages.length) {
    return;
  }

  currentImageIndex =
    (index + productImages.length) %
    productImages.length;

  $("#mainProductImage").src =
    productImages[currentImageIndex];

  $("#mainProductImage").alt =
    currentProduct?.name ||
    "Product";


  document
    .querySelectorAll(".pdp-thumb")
    .forEach((thumb, index) => {

      thumb.classList.toggle(
        "active",
        index === currentImageIndex
      );

    });
}


/* =========================================================
   GALLERY CONTROLS
========================================================= */

$("#galleryPrev").addEventListener(
  "click",
  () => {
    showImage(currentImageIndex - 1);
  }
);

$("#galleryNext").addEventListener(
  "click",
  () => {
    showImage(currentImageIndex + 1);
  }
);


/* =========================================================
   FULLSCREEN
========================================================= */

$("#fullscreenButton").addEventListener(
  "click",
  async () => {

    const image =
      $("#mainProductImage");

    try {

      if (image.requestFullscreen) {
        await image.requestFullscreen();
      }

    } catch (error) {
      console.warn(
        "Fullscreen unavailable:",
        error
      );
    }

  }
);


/* =========================================================
   QUANTITY
========================================================= */

$("#quantityMinus").addEventListener(
  "click",
  () => {

    quantity =
      Math.max(1, quantity - 1);

    $("#quantityValue").textContent =
      quantity;
  }
);


$("#quantityPlus").addEventListener(
  "click",
  () => {

    quantity++;

    $("#quantityValue").textContent =
      quantity;
  }
);


/* =========================================================
   ADD TO BAG
========================================================= */

$("#addToBag").addEventListener(
  "click",
  () => {

    if (!currentProduct) {
      return;
    }

    const sizes =
      getSizes(currentProduct);

    if (
      sizes.length &&
      !selectedSize
    ) {

      showToast(
        "PLEASE SELECT A SIZE"
      );

      return;
    }


    const bag =
      getBag();


    const existing =
      bag.find(
        (item) =>
          item.id === currentProduct.id &&
          item.size === selectedSize
      );


    if (existing) {

      existing.quantity += quantity;

    } else {

      bag.push({
        id: currentProduct.id,

        name:
          currentProduct.name ||
          currentProduct.title ||
          "Product",

        price:
          Number(currentProduct.price) || 0,

        image:
          productImages[0] || "",

        size:
          selectedSize,

        quantity
      });

    }


    saveBag(bag);

    updateBagCount();

    showToast(
      "ADDED TO BAG"
    );
  }
);


/* =========================================================
   BAG
========================================================= */

function getBag() {

  try {

    return JSON.parse(
      localStorage.getItem(
        "revolution_cart"
      ) || "[]"
    );

  } catch {

    return [];
  }
}


function saveBag(bag) {

  localStorage.setItem(
    "revolution_cart",
    JSON.stringify(bag)
  );
}


function updateBagCount() {

  const bag =
    getBag();

  const count =
    bag.reduce(
      (total, item) =>
        total +
        Number(item.quantity || 0),
      0
    );

  $("#bagCount").textContent =
    count;
}


/* =========================================================
   WISHLIST
========================================================= */

$("#wishlistButton").addEventListener(
  "click",
  () => {

    const button =
      $("#wishlistButton");

    button.classList.toggle(
      "active"
    );

    button.textContent =
      button.classList.contains("active")
        ? "♥"
        : "♡";
  }
);


/* =========================================================
   RELATED PRODUCTS
========================================================= */

async function loadRelatedProducts() {

  try {

    const snapshot =
      await getDocs(
        collection(
          db,
          "products"
        )
      );

    relatedProducts =
      snapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data()
        }))
        .filter(
          (item) =>
            item.id !== currentProduct.id
        );


    renderRelatedProducts();

  } catch (error) {

    console.error(
      "Related products error:",
      error
    );

  }
}


function renderRelatedProducts() {

  const container =
    $("#relatedProducts");

  container.innerHTML = "";

  const visible =
    relatedProducts.slice(
      relatedStart,
      relatedStart + 4
    );

  visible.forEach(
    (product) => {

      const images =
        getImageList(product);

      const image =
        images[0] || "";

      const card =
        document.createElement("a");

      card.className =
        "related-card";

      card.href =
        `./product.html?id=${encodeURIComponent(product.id)}`;

      card.innerHTML = `
        <div class="related-image">

          ${
            image
              ? `
                <img
                  src="${escapeHtml(image)}"
                  alt="${escapeHtml(
                    product.name ||
                    product.title ||
                    "Product"
                  )}"
                >
              `
              : ""
          }

          <span class="related-plus">
            +
          </span>

        </div>

        <h3>
          ${escapeHtml(
            product.name ||
            product.title ||
            "Product"
          )}
        </h3>

        <p>
          ${formatPrice(product.price)}
        </p>
      `;

      container.appendChild(card);

    }
  );
}


/* =========================================================
   RELATED NAVIGATION
========================================================= */

$("#relatedNext").addEventListener(
  "click",
  () => {

    if (
      relatedStart + 4 <
      relatedProducts.length
    ) {

      relatedStart += 4;

      renderRelatedProducts();

    }

  }
);


$("#relatedPrev").addEventListener(
  "click",
  () => {

    if (relatedStart >= 4) {

      relatedStart -= 4;

      renderRelatedProducts();

    }

  }
);


/* =========================================================
   TABS
========================================================= */

document
  .querySelectorAll(".pdp-tab")
  .forEach((button) => {

    button.addEventListener(
      "click",
      () => {

        const tab =
          button.dataset.tab;


        document
          .querySelectorAll(".pdp-tab")
          .forEach((item) => {

            item.classList.remove(
              "active"
            );

          });


        document
          .querySelectorAll(".pdp-tab-content")
          .forEach((item) => {

            item.classList.remove(
              "active"
            );

          });


        button.classList.add(
          "active"
        );


        const content =
          document.querySelector(
            `#tab-${tab}`
          );

        if (content) {

          content.classList.add(
            "active"
          );

        }

      }
    );

  });


/* =========================================================
   TOAST
========================================================= */

let toastTimer = null;

function showToast(message) {

  const toast =
    $("#pdpToast");

  toast.textContent =
    message;

  toast.classList.add(
    "show"
  );

  clearTimeout(
    toastTimer
  );

  toastTimer =
    setTimeout(() => {

      toast.classList.remove(
        "show"
      );

    }, 2200);
}


/* =========================================================
   ERROR
========================================================= */

function showError(message) {

  document.body.innerHTML = `
    <div
      style="
        min-height:100vh;
        display:grid;
        place-items:center;
        background:#090909;
        color:white;
        font-family:Inter,Arial,sans-serif;
        text-align:center;
        padding:30px;
      "
    >

      <div>

        <h1
          style="
            font-family:'Barlow Condensed';
            font-size:60px;
            margin:0 0 15px;
          "
        >
          PRODUCT ERROR
        </h1>

        <p
          style="
            color:#999;
            margin-bottom:25px;
          "
        >
          ${escapeHtml(message)}
        </p>

        <a
          href="./index.html"
          style="
            display:inline-block;
            padding:14px 22px;
            background:white;
            color:black;
            font-weight:800;
          "
        >
          BACK TO SHOP
        </a>

      </div>

    </div>
  `;
}


/* =========================================================
   START
========================================================= */

loadProduct();