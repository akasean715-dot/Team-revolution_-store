/* Revolution Store: unregister stale service workers */
if ("serviceWorker" in navigator) { navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {}); }

import { auth, db, storage } from "./firebase.js";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";

const $ = (s) => document.querySelector(s);
let currentUser = null;

async function isAdmin(user) {
  return !!user && user.email === "akasean715@gmail.com";
}

function showDashboard() {
  $("#loginView").hidden = true;
  $("#dashboard").hidden = false;
  $("#logoutBtn").hidden = false;
  loadProducts();
}

function showLogin(message = "") {
  $("#loginView").hidden = false;
  $("#dashboard").hidden = true;
  $("#logoutBtn").hidden = true;
  $("#loginError").textContent = message;
}

async function loadProducts() {
  const list = $("#productList");
  list.innerHTML = `<div class="empty">LOADING CATALOG...</div>`;
  try {
    const snapshot = await getDocs(query(collection(db, "products"), orderBy("createdAt", "desc")));
    const products = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    $("#productCount").textContent = products.length;
    $("#stockCount").textContent = products.reduce((sum, p) => sum + Number(p.stock || 0), 0);
    $("#lowStockCount").textContent = products.filter((p) => Number(p.stock || 0) <= 5).length;
    list.innerHTML = products.length ? products.map((p) => `<div class="product-row">
      <div class="thumb" style="${p.imageUrl ? `background-image:url('${String(p.imageUrl).replace(/'/g,"%27")}')` : ""}"></div>
      <div><h3>${p.name || "Untitled"}</h3><small>${(p.category || "").toUpperCase()} · ${(p.sizes || []).join(", ") || "NO SIZES"}</small></div>
      <strong>₹${Number(p.price || 0).toLocaleString("en-IN")}</strong>
      <span class="stock ${Number(p.stock || 0) <= 5 ? "low" : ""}">${Number(p.stock || 0)} STOCK</span>
      <span class="hide-mobile">${p.active === false ? "HIDDEN" : "ACTIVE"}</span>
      <button class="delete" data-id="${p.id}">DELETE</button>
    </div>`).join("") : `<div class="empty">NO PRODUCTS YET. ADD YOUR FIRST DROP.</div>`;
    list.querySelectorAll(".delete").forEach((button) => button.addEventListener("click", () => removeProduct(button.dataset.id)));
  } catch (error) {
    console.error(error);
    list.innerHTML = `<div class="empty">COULD NOT LOAD PRODUCTS. CHECK FIREBASE RULES.</div>`;
  }
}

async function removeProduct(id) {
  if (!confirm("Delete this product from the catalog?")) return;
  await deleteDoc(doc(db, "products", id));
  loadProducts();
}

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("#adminEmail").value.trim();
  const password = $("#adminPassword").value;
  $("#loginError").textContent = "SIGNING IN...";
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    if (!(await isAdmin(credential.user))) {
      await signOut(auth);
      showLogin("THIS ACCOUNT IS NOT MARKED AS AN ADMIN. ADD admins/{YOUR_UID} IN FIRESTORE.");
      return;
    }
    currentUser = credential.user;
    showDashboard();
  } catch (error) {
    $("#loginError").textContent = error.message.toUpperCase();
  }
});

$("#logoutBtn").addEventListener("click", () => signOut(auth));
$("#addProductBtn").addEventListener("click", () => { $("#productModal").hidden = false; });
$("#closeModal").addEventListener("click", () => { $("#productModal").hidden = true; });

$("#imageFile").addEventListener("change", (event) => {
  const file = event.target.files[0];
  const preview = $("#imagePreview");
  if (!file) return;
  preview.textContent = "";
  preview.style.backgroundImage = `url('${URL.createObjectURL(file)}')`;
});

$("#productForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) return;
  const form = new FormData(event.target);
  const error = $("#formError");
  const file = $("#imageFile").files[0];
  error.textContent = "SAVING...";
  try {
    let imageUrl = "";
    if (file) {
      const safeName = file.name.replace(/[^a-z0-9._-]/gi, "-");
      const imageRef = ref(storage, `products/${currentUser.uid}/${Date.now()}-${safeName}`);
      await uploadBytes(imageRef, file, { contentType: file.type });
      imageUrl = await getDownloadURL(imageRef);
    }
    await addDoc(collection(db, "products"), {
      name: String(form.get("name")).trim(),
      description: String(form.get("description") || "").trim(),
      price: Number(form.get("price")),
      stock: Number(form.get("stock")),
      category: form.get("category"),
      type: form.get("type"),
      sizes: String(form.get("sizes") || "").split(",").map((s) => s.trim()).filter(Boolean),
      tag: String(form.get("tag") || "").trim(),
      imageUrl,
      active: true,
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid
    });
    event.target.reset();
    $("#imagePreview").style.backgroundImage = "";
    $("#imagePreview").textContent = "UPLOAD PRODUCT IMAGE";
    $("#productModal").hidden = true;
    error.textContent = "";
    loadProducts();
  } catch (e) {
    console.error(e);
    error.textContent = e.message.toUpperCase();
  }
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) { showLogin(); return; }
  try {
    if (await isAdmin(user)) showDashboard();
    else { await signOut(auth); showLogin("THIS ACCOUNT IS NOT MARKED AS AN ADMIN."); }
  } catch (e) { showLogin("CHECK YOUR FIREBASE CONFIGURATION."); }
});
