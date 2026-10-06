import {
  collection,
  getDocs,
  addDoc,
  query,
  where,
  doc,
  getDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import { db, auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";


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

let currentUser = null;

let productImages = [];

let currentImageIndex = 0;

let selectedSize = "";

let quantity = 1;

let relatedProducts = [];

let relatedStart = 0;

let selectedReviewRating = 0;


/* REVIEWS */

function renderReviewStars(rating) {
  const value = Math.max(0, Math.min(5, Number(rating) || 0));
  return Array.from({ length: 5 }, (_, index) => index < Math.round(value) ? "★" : "☆").join("");
}

function formatReviewDate(value) {
  try {
    const date = value?.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch { return ""; }
}

function updateReviewPicker() {
  document.querySelectorAll(".review-star").forEach((button) => {
    const rating = Number(button.dataset.rating);
    button.textContent = rating <= selectedReviewRating ? "★" : "☆";
    button.classList.toggle("selected", rating <= selectedReviewRating);
  });
}

function updateReviewAuthUI() {
  const signedIn = Boolean(currentUser);
  const message = $("#reviewSigninMessage");
  const submit = $("#submitReview");
  const textarea = $("#reviewComment");
  const picker = $("#reviewStarPicker");
  if (message) message.hidden = signedIn;
  if (submit) submit.disabled = !signedIn;
  if (textarea) textarea.disabled = !signedIn;
  if (picker) picker.classList.toggle("disabled", !signedIn);
}

async function loadReviews() {
  const productId = getProductId();
  const list = $("#reviewsList");
  const summary = $("#reviewsSummary");
  if (!productId || !list) return;

  try {
    const snapshot = await getDocs(query(collection(db, "reviews"), where("productId", "==", productId)));
    const reviews = snapshot.docs.map((reviewDoc) => ({ id: reviewDoc.id, ...reviewDoc.data() })).sort((a, b) => {
      const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
      const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
      return bTime - aTime;
    });

    if (!reviews.length) {
      if (summary) summary.hidden = true;
      list.innerHTML = `<p id="reviewsMessage">No reviews yet. Be the first to review this product.</p>`;
      return;
    }

    const average = reviews.reduce((total, review) => total + Number(review.rating || 0), 0) / reviews.length;
    if (summary) {
      summary.hidden = false;
      $("#reviewsAverage").textContent = average.toFixed(1);
      $("#reviewsAverageStars").textContent = renderReviewStars(average);
      $("#reviewsSummaryCount").textContent = `${reviews.length} ${reviews.length === 1 ? "review" : "reviews"}`;
    }

    list.innerHTML = reviews.map((review) => {
      const canDelete = Boolean(
        currentUser &&
        review.userId &&
        currentUser.uid === review.userId
      );

      return `
        <article class="review-card">
          <div class="review-card-top">
            <strong>${escapeHtml(review.userName || "Customer")}</strong>
            <span class="review-card-stars" aria-label="${Number(review.rating || 0)} out of 5 stars">${renderReviewStars(review.rating)}</span>
          </div>
          <p>${escapeHtml(review.comment || "")}</p>
          <div class="review-card-bottom">
            <time>${escapeHtml(formatReviewDate(review.createdAt))}</time>
            ${canDelete ? `
              <button
                type="button"
                class="review-delete"
                data-review-id="${escapeHtml(review.id)}"
                aria-label="Delete your review"
              >
                DELETE REVIEW
              </button>
            ` : ""}
          </div>
        </article>
      `;
    }).join("");
  } catch (error) {
    console.error("Review loading error:", error);
    if (summary) summary.hidden = true;
    list.innerHTML = `<p id="reviewsMessage">Reviews could not be loaded right now.</p>`;
  }
}

function showDeleteReviewModal() {
  return new Promise((resolve) => {
    let modal = document.getElementById("reviewDeleteModal");

    if (!modal) {
      modal = document.createElement("div");
      modal.id = "reviewDeleteModal";
      modal.className = "review-delete-modal";
      modal.innerHTML = `
        <div class="review-delete-backdrop" data-review-delete-cancel></div>

        <div
          class="review-delete-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reviewDeleteTitle"
        >
          <button
            type="button"
            class="review-delete-close"
            data-review-delete-cancel
            aria-label="Close"
          >×</button>

          <div class="review-delete-icon" aria-hidden="true">!</div>

          <h3 id="reviewDeleteTitle">DELETE REVIEW?</h3>

          <p>
            Are you sure you want to delete your review?
            <span>This action cannot be undone.</span>
          </p>

          <div class="review-delete-actions">
            <button type="button" class="review-delete-cancel" data-review-delete-cancel>
              CANCEL
            </button>
            <button type="button" class="review-delete-confirm" data-review-delete-confirm>
              DELETE REVIEW
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
    }

    modal.hidden = false;
    document.body.classList.add("review-delete-modal-open");

    const confirmButton = modal.querySelector("[data-review-delete-confirm]");
    const cancelButtons = modal.querySelectorAll("[data-review-delete-cancel]");

    const finish = (confirmed) => {
      modal.hidden = true;
      document.body.classList.remove("review-delete-modal-open");

      confirmButton?.removeEventListener("click", onConfirm);
      cancelButtons.forEach((item) => item.removeEventListener("click", onCancel));
      document.removeEventListener("keydown", onKeyDown);

      resolve(confirmed);
    };

    const onConfirm = () => finish(true);
    const onCancel = () => finish(false);
    const onKeyDown = (event) => {
      if (event.key === "Escape") finish(false);
    };

    confirmButton?.addEventListener("click", onConfirm);
    cancelButtons.forEach((item) => item.addEventListener("click", onCancel));
    document.addEventListener("keydown", onKeyDown);

    requestAnimationFrame(() => modal.classList.add("is-visible"));
  });
}

async function deleteReview(reviewId, button) {
  const status = $("#reviewFormStatus");

  if (!currentUser || !reviewId) {
    if (status) status.textContent = "Please sign in before deleting a review.";
    return;
  }

  const confirmed = await showDeleteReviewModal();
  if (!confirmed) return;

  try {
    if (button) {
      button.disabled = true;
      button.textContent = "DELETING...";
    }

    await deleteDoc(doc(db, "reviews", reviewId));

    if (status) status.textContent = "Review deleted successfully.";
    await loadReviews();
  } catch (error) {
    console.error("Review deletion error:", error);
    if (status) status.textContent = "Could not delete your review. Please try again.";

    if (button) {
      button.disabled = false;
      button.textContent = "DELETE REVIEW";
    }
  }
}

$("#reviewsList")?.addEventListener("click", (event) => {
  const button = event.target.closest(".review-delete");
  if (!button) return;

  deleteReview(button.dataset.reviewId, button);
});


async function submitReview() {
  const productId = getProductId();
  const commentInput = $("#reviewComment");
  const status = $("#reviewFormStatus");
  const submitButton = $("#submitReview");

  if (!currentUser) {
    if (status) status.textContent = "Please sign in before submitting a review.";
    return;
  }
  const comment = commentInput?.value.trim() || "";
  if (!selectedReviewRating) {
    if (status) status.textContent = "Please choose a star rating.";
    return;
  }
  if (comment.length < 3) {
    if (status) status.textContent = "Please write at least a few words.";
    return;
  }

  try {
    if (submitButton) { submitButton.disabled = true; submitButton.textContent = "SUBMITTING..."; }
    await addDoc(collection(db, "reviews"), {
      productId,
      userId: currentUser.uid,
      userName: currentUser.displayName || currentUser.email?.split("@")[0] || "Customer",
      userEmail: currentUser.email || "",
      rating: selectedReviewRating,
      comment,
      createdAt: serverTimestamp()
    });
    commentInput.value = "";
    selectedReviewRating = 0;
    updateReviewPicker();
    if (status) status.textContent = "Review submitted successfully.";
    await loadReviews();
  } catch (error) {
    console.error("Review submission error:", error);
    if (status) status.textContent = "Could not submit your review. Please try again.";
  } finally {
    if (submitButton) { submitButton.disabled = !currentUser; submitButton.textContent = "SUBMIT REVIEW"; }
  }
}

document.querySelectorAll(".review-star").forEach((button) => {
  button.addEventListener("click", () => {
    if (!currentUser) return;
    selectedReviewRating = Number(button.dataset.rating);
    updateReviewPicker();
    const status = $("#reviewFormStatus");
    if (status) status.textContent = "";
  });
});

$("#submitReview")?.addEventListener("click", submitReview);


/* =========================================================
   AUTH STATE
========================================================= */

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  updateReviewAuthUI();
  await loadReviews();
});


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

    updateReviewAuthUI();
    await loadReviews();

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

    const shared = JSON.parse(
      localStorage.getItem("revolution_cart") || "null"
    );

    if (Array.isArray(shared)) {
      return shared.map((item) => ({
        id: item.id || "",
        name: item.name || item.title || "Product",
        price: Number(item.price || 0),
        image: item.image || item.imageUrl || "",
        size: item.size || "",
        quantity: Math.max(1, Number(item.quantity ?? item.qty ?? 1))
      }));
    }

    const legacy = JSON.parse(
      localStorage.getItem("revolution-cart") || "[]"
    );

    const normalized = Array.isArray(legacy)
      ? legacy.map((item) => ({
          id: item.id || "",
          name: item.name || item.title || "Product",
          price: Number(item.price || 0),
          image: item.image || item.imageUrl || "",
          size: item.size || "",
          quantity: Math.max(1, Number(item.quantity ?? item.qty ?? 1))
        }))
      : [];

    if (normalized.length) {
      localStorage.setItem("revolution_cart", JSON.stringify(normalized));
      localStorage.removeItem("revolution-cart");
    }

    return normalized;

  } catch {

    return [];
  }
}


function saveBag(bag) {

  const normalized = bag.map((item) => ({
    id: item.id || "",
    name: item.name || item.title || "Product",
    price: Number(item.price || 0),
    image: item.image || item.imageUrl || "",
    size: item.size || "",
    quantity: Math.max(1, Number(item.quantity ?? item.qty ?? 1))
  }));

  localStorage.setItem(
    "revolution_cart",
    JSON.stringify(normalized)
  );

  localStorage.removeItem("revolution-cart");
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
   BAG DRAWER
========================================================= */

const bagButton = $("#pdpBagButton");
const bagDrawer = $("#bagDrawer");
const bagOverlay = $("#bagOverlay");
const closeBagButton = $("#closeBagButton");
const bagItems = $("#bagItems");
const bagSubtotal = $("#bagSubtotal");
const emptyBag = $("#emptyBag");
const continueShopping = $("#continueShopping");


function openBag() {
  if (!bagDrawer || !bagOverlay) return;

  renderBagDrawer();

  bagDrawer.classList.add("open");
  bagOverlay.classList.add("open");

  bagDrawer.setAttribute("aria-hidden", "false");

  document.body.style.overflow = "hidden";
}


function closeBag() {
  if (!bagDrawer || !bagOverlay) return;

  bagDrawer.classList.remove("open");
  bagOverlay.classList.remove("open");

  bagDrawer.setAttribute("aria-hidden", "true");

  document.body.style.overflow = "";
}


/* BAG BUTTON */

bagButton?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();

  openBag();
});


/* CLOSE BUTTON */

closeBagButton?.addEventListener("click", (event) => {
  event.preventDefault();
  closeBag();
});


/* DARK OVERLAY */

bagOverlay?.addEventListener("click", () => {
  closeBag();
});


/* ESC KEY */

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeBag();
  }
});


/* CONTINUE SHOPPING */

continueShopping?.addEventListener("click", () => {
  closeBag();
});


/* CHECKOUT */

$("#bagCheckout")?.addEventListener("click", () => {

  const bag = getBag();

  if (!bag.length) {
    showToast("YOUR BAG IS EMPTY");
    return;
  }

  if (!currentUser) {
    showToast("PLEASE SIGN IN BEFORE CHECKOUT");

    window.setTimeout(() => {
      window.location.href = "account.html";
    }, 900);

    return;
  }

  window.location.href = "payment.html";
});


/* =========================================================
   RENDER BAG DRAWER
========================================================= */

function renderBagDrawer() {

  if (!bagItems) return;

  const bag = getBag();

  if (!bag.length) {

    bagItems.innerHTML = `
      <div id="emptyBag" class="empty-bag">
        <span class="empty-bag-icon">♧</span>

        <h3>YOUR BAG IS EMPTY</h3>

        <p>
          ADD SOMETHING FROM THE REVOLUTION STORE.
        </p>

        <button
          id="continueShopping"
          type="button"
          class="continue-shopping"
        >
          CONTINUE SHOPPING
        </button>
      </div>
    `;

    if (bagSubtotal) {
      bagSubtotal.textContent = "₹0";
    }

    document
      .querySelector("#continueShopping")
      ?.addEventListener("click", closeBag);

    return;
  }


  const subtotal = bag.reduce(
    (total, item) => {
      return total +
        (Number(item.price) || 0) *
        (Number(item.quantity) || 0);
    },
    0
  );


  if (bagSubtotal) {
    bagSubtotal.textContent = formatPrice(subtotal);
  }


  bagItems.innerHTML = bag.map((item, index) => {

    const quantity =
      Number(item.quantity) || 1;

    const price =
      Number(item.price) || 0;

    return `
      <div class="bag-item">

        <div class="bag-item-image">

          ${
            item.image
              ? `
                <img
                  src="${escapeHtml(item.image)}"
                  alt="${escapeHtml(item.name || "Product")}"
                >
              `
              : ""
          }

        </div>


        <div class="bag-item-info">

          <h3 class="bag-item-name">
            ${escapeHtml(item.name || "Product")}
          </h3>

          <div class="bag-item-price">
            ${formatPrice(price)}
          </div>

          ${
            item.size
              ? `
                <div class="bag-item-size">
                  SIZE ${escapeHtml(item.size)}
                </div>
              `
              : ""
          }


          <div class="bag-quantity">

            <button
              type="button"
              data-bag-action="minus"
              data-bag-index="${index}"
            >
              −
            </button>

            <span class="bag-quantity-value">
              ${quantity}
            </span>

            <button
              type="button"
              data-bag-action="plus"
              data-bag-index="${index}"
            >
              +
            </button>

          </div>

        </div>


        <button
          type="button"
          class="bag-item-remove"
          data-bag-action="remove"
          data-bag-index="${index}"
          aria-label="Remove item"
        >
          ×
        </button>

      </div>
    `;

  }).join("");


  /* QUANTITY / REMOVE */

  bagItems
    .querySelectorAll("[data-bag-action]")
    .forEach((button) => {

      button.addEventListener("click", () => {

        const index =
          Number(button.dataset.bagIndex);

        const action =
          button.dataset.bagAction;

        const currentBag =
          getBag();

        const item =
          currentBag[index];

        if (!item) return;


        if (action === "plus") {

          item.quantity =
            Number(item.quantity || 0) + 1;

        }


        if (action === "minus") {

          item.quantity =
            Number(item.quantity || 0) - 1;

          if (item.quantity <= 0) {
            currentBag.splice(index, 1);
          }

        }


        if (action === "remove") {

          currentBag.splice(index, 1);

        }


        saveBag(currentBag);

        updateBagCount();

        renderBagDrawer();

      });

    });

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
   SEARCH
========================================================= */

const searchButton = $("#pdpSearchButton");
const searchOverlay = $("#pdpSearchOverlay");
const searchClose = $("#pdpSearchClose");
const searchInput = $("#pdpSearchInput");
const searchSubmit = $("#pdpSearchSubmit");
const searchResults = $("#pdpSearchResults");


function openSearch() {

  if (!searchOverlay) return;

  searchOverlay.classList.add("open");

  setTimeout(() => {
    searchInput?.focus();
  }, 100);

}


function closeSearch() {

  if (!searchOverlay) return;

  searchOverlay.classList.remove("open");

}


searchButton?.addEventListener(
  "click",
  openSearch
);


searchClose?.addEventListener(
  "click",
  closeSearch
);


/* CLOSE WHEN CLICKING OUTSIDE THE SEARCH PANEL */

searchOverlay?.addEventListener(
  "click",
  (event) => {

    if (
      event.target === searchOverlay
    ) {
      closeSearch();
    }

  }
);


/* ESC KEY */

document.addEventListener(
  "keydown",
  (event) => {

    if (
      event.key === "Escape" &&
      searchOverlay?.classList.contains("open")
    ) {
      closeSearch();
    }

  }
);


/* =========================================================
   SEARCH PRODUCTS
========================================================= */

async function performProductSearch() {

  const searchTerm =
    searchInput?.value
      .trim()
      .toLowerCase();

  if (!searchResults) return;


  if (!searchTerm) {

    searchResults.innerHTML = `
      <div class="search-empty">
        TYPE A PRODUCT NAME TO SEARCH.
      </div>
    `;

    return;
  }


  searchResults.innerHTML = `
    <div class="search-loading">
      SEARCHING...
    </div>
  `;


  try {

    const snapshot =
      await getDocs(
        collection(
          db,
          "products"
        )
      );


    const products =
      snapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data()
        }))
        .filter(
          (product) =>
            product.active !== false
        );


    const matches =
      products.filter(
        (product) => {

          const name =
            String(
              product.name ||
              product.title ||
              ""
            ).toLowerCase();

          const description =
            String(
              product.description ||
              ""
            ).toLowerCase();

          const category =
            String(
              product.category ||
              ""
            ).toLowerCase();

          const type =
            String(
              product.type ||
              ""
            ).toLowerCase();


          return (
            name.includes(searchTerm) ||
            description.includes(searchTerm) ||
            category.includes(searchTerm) ||
            type.includes(searchTerm)
          );

        }
      );


    if (!matches.length) {

      searchResults.innerHTML = `
        <div class="search-empty">
          NO PRODUCTS FOUND FOR
          "<strong>${escapeHtml(searchInput.value.trim())}</strong>"
        </div>
      `;

      return;
    }


    searchResults.innerHTML =
      matches.map(
        (product) => {

          const images =
            getImageList(product);

          const image =
            images[0] || "";


          return `
            <a
              class="search-result"
              href="./product.html?id=${encodeURIComponent(product.id)}"
            >

              <div class="search-result-image">

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

              </div>


              <div class="search-result-info">

                <span class="search-result-category">
                  ${escapeHtml(
                    String(
                      product.category ||
                      product.type ||
                      "PRODUCT"
                    ).toUpperCase()
                  )}
                </span>

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

              </div>

            </a>
          `;

        }
      ).join("");


  } catch (error) {

    console.error(
      "Product search error:",
      error
    );

    searchResults.innerHTML = `
      <div class="search-empty">
        COULD NOT SEARCH PRODUCTS.
      </div>
    `;

  }

}


/* SEARCH BUTTON */

searchSubmit?.addEventListener(
  "click",
  performProductSearch
);


/* SEARCH AS YOU TYPE */

searchInput?.addEventListener(
  "input",
  () => {

    window.clearTimeout(
      searchInput.searchTimer
    );

    searchInput.searchTimer =
      window.setTimeout(
        performProductSearch,
        250
      );

  }
);


/* ENTER KEY */

searchInput?.addEventListener(
  "keydown",
  (event) => {

    if (
      event.key === "Enter"
    ) {

      event.preventDefault();

      performProductSearch();

    }

  }
);

/* =========================================================
   ACCOUNT BUTTON
========================================================= */

document
  .getElementById("pdpAccountButton")
  ?.addEventListener("click", () => {
    window.location.href = "account.html";
  });
/* =========================================================
   START
========================================================= */

loadProduct();