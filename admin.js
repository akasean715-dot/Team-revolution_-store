import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
const MEGA_API_BASE = "https://team-revolution-store.onrender.com";
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

function uploadImageToMega(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("image", file, file.name);

    xhr.open("POST", `${MEGA_API_BASE}/api/upload-product-image`, true);
    xhr.responseType = "json";

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
      onProgress(percent);
    });

    xhr.addEventListener("load", () => {
      const data = xhr.response || {};
      if (xhr.status >= 200 && xhr.status < 300 && data.success && data.url) {
        resolve(data);
        return;
      }
      reject(new Error(data.error || `MEGA upload failed (${xhr.status})`));
    });

    xhr.addEventListener("error", () => {
      reject(new Error("COULD NOT CONNECT TO THE MEGA UPLOAD SERVER. START THE SERVER WITH npm start IN THE server FOLDER."));
    });

    xhr.addEventListener("abort", () => reject(new Error("IMAGE UPLOAD WAS CANCELLED.")));
    xhr.send(formData);
  });
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
  const saveButton = event.target.querySelector(".save");
  error.textContent = "SAVING...";

  try {
    let imageUrl = "";

    if (file) {
      if (!file.type.startsWith("image/")) throw new Error("PLEASE SELECT AN IMAGE FILE.");
      if (file.size > 10 * 1024 * 1024) throw new Error("IMAGE MUST BE 10 MB OR SMALLER.");

      saveButton.disabled = true;
      error.textContent = "UPLOADING IMAGE 0%...";
      $("#saveStatus").textContent = "UPLOADING 0%";

      const uploadResult = await uploadImageToMega(file, (percent) => {
        error.textContent = `UPLOADING IMAGE ${percent}%...`;
        $("#saveStatus").textContent = `UPLOADING ${percent}%`;
      });

      // The server returns both `imageUrl` and `url` for compatibility.
      // Accept either so an older/newer server response can never save
      // `imageUrl: undefined` into Firestore.
      imageUrl = String(uploadResult.imageUrl || uploadResult.url || "").trim();

      if (!imageUrl) {
        throw new Error("IMAGE UPLOAD FINISHED, BUT NO IMAGE URL WAS RETURNED BY THE MEGA SERVER.");
      }

      error.textContent = "IMAGE UPLOADED — SAVING PRODUCT...";
      $("#saveStatus").textContent = "IMAGE UPLOADED";
    }

    error.textContent = "SAVING PRODUCT...";
    $("#saveStatus").textContent = "SAVING PRODUCT";

    await addDoc(collection(db, "products"), {
      name: String(form.get("name") || "").trim(),
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
      createdBy: currentUser.uid,
      imageStorage: imageUrl ? "mega" : "none"
    });

    event.target.reset();
    $("#imagePreview").style.backgroundImage = "";
    $("#imagePreview").textContent = "UPLOAD PRODUCT IMAGE";
    $("#productModal").hidden = true;
    error.textContent = "PRODUCT SAVED SUCCESSFULLY.";
    $("#saveStatus").textContent = "PRODUCT SAVED";

    window.setTimeout(() => {
      error.textContent = "";
      $("#saveStatus").textContent = "";
    }, 2500);

    loadProducts();
  } catch (e) {
    console.error(e);
    error.textContent = (e?.message || "COULD NOT SAVE PRODUCT.").toUpperCase();
    $("#saveStatus").textContent = "UPLOAD FAILED";
  } finally {
    saveButton.disabled = false;
  }
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) { showLogin(); return; }
  try {
    if (await isAdmin(user)) showDashboard();
    else { await signOut(auth); showLogin("THIS ACCOUNT IS NOT MARKED AS AN ADMIN."); }
  } catch (e) {
    console.error(e);
    showLogin("CHECK YOUR FIREBASE CONFIGURATION.");
  }
});
