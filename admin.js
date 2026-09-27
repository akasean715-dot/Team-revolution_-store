import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


/* =========================================================
   HELPERS
========================================================= */

const $ = (s) => document.querySelector(s);

const MEGA_API_BASE =
  "https://team-revolution-store.onrender.com";

let currentUser = null;


/* =========================================================
   ADMIN CHECK
========================================================= */

async function isAdmin(user) {
  return !!user && user.email === "akasean715@gmail.com";
}


/* =========================================================
   DASHBOARD
========================================================= */

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


/* =========================================================
   LOAD PRODUCTS
========================================================= */

async function loadProducts() {

  const list = $("#productList");

  list.innerHTML =
    `<div class="empty">LOADING CATALOG...</div>`;

  try {

    const snapshot =
      await getDocs(
        query(
          collection(db, "products"),
          orderBy("createdAt", "desc")
        )
      );

    const products =
      snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data()
      }));


    $("#productCount").textContent =
      products.length;


    $("#stockCount").textContent =
      products.reduce(
        (sum, p) =>
          sum + Number(p.stock || 0),
        0
      );


    $("#lowStockCount").textContent =
      products.filter(
        (p) =>
          Number(p.stock || 0) <= 5
      ).length;


    list.innerHTML =
      products.length
        ? products.map((p) => {

            const image =
              p.imageUrl ||
              (
                Array.isArray(p.images)
                  ? p.images[0]
                  : ""
              ) ||
              "";

            const sizes =
              Array.isArray(p.sizes)
                ? p.sizes.join(", ")
                : String(p.sizes || "");


            return `
              <div class="product-row">

                <div
                  class="thumb"
                  style="${
                    image
                      ? `background-image:url('${String(image).replace(/'/g, "%27")}')`
                      : ""
                  }"
                ></div>


                <div>

                  <h3>
                    ${p.name || "Untitled"}
                  </h3>

                  <small>
                    ${(p.category || "").toUpperCase()}
                    ·
                    ${sizes || "NO SIZES"}
                  </small>

                </div>


                <strong>
                  ₹${Number(
                    p.price || 0
                  ).toLocaleString("en-IN")}
                </strong>


                <span
                  class="stock ${
                    Number(p.stock || 0) <= 5
                      ? "low"
                      : ""
                  }"
                >
                  ${Number(p.stock || 0)} STOCK
                </span>


                <span class="hide-mobile">
                  ${
                    p.active === false
                      ? "HIDDEN"
                      : "ACTIVE"
                  }
                </span>


                <button
                  class="delete"
                  data-id="${p.id}"
                >
                  DELETE
                </button>

              </div>
            `;

          }).join("")

        : `
          <div class="empty">
            NO PRODUCTS YET. ADD YOUR FIRST DROP.
          </div>
        `;


    list
      .querySelectorAll(".delete")
      .forEach((button) => {

        button.addEventListener(
          "click",
          () =>
            removeProduct(
              button.dataset.id
            )
        );

      });


  } catch (error) {

    console.error(error);

    list.innerHTML = `
      <div class="empty">
        COULD NOT LOAD PRODUCTS.
        CHECK FIREBASE RULES.
      </div>
    `;

  }

}


/* =========================================================
   DELETE PRODUCT
========================================================= */

async function removeProduct(id) {

  if (
    !confirm(
      "Delete this product from the catalog?"
    )
  ) {
    return;
  }

  try {

    await deleteDoc(
      doc(db, "products", id)
    );

    loadProducts();

  } catch (error) {

    console.error(error);

    alert(
      "COULD NOT DELETE PRODUCT."
    );

  }

}


/* =========================================================
   MEGA IMAGE UPLOAD
========================================================= */

function uploadImageToMega(
  file,
  onProgress
) {

  return new Promise(
    (resolve, reject) => {

      const xhr =
        new XMLHttpRequest();

      const formData =
        new FormData();


      formData.append(
        "image",
        file,
        file.name
      );


      xhr.open(
        "POST",
        `${MEGA_API_BASE}/api/upload-product-image`,
        true
      );


      xhr.responseType =
        "json";


      xhr.upload.addEventListener(
        "progress",
        (event) => {

          if (
            !event.lengthComputable
          ) {
            return;
          }


          const percent =
            Math.min(
              100,
              Math.round(
                (
                  event.loaded /
                  event.total
                ) * 100
              )
            );


          if (onProgress) {
            onProgress(percent);
          }

        }
      );


      xhr.addEventListener(
        "load",
        () => {

          const data =
            xhr.response || {};


          if (
            xhr.status >= 200 &&
            xhr.status < 300 &&
            data.success &&
            (data.imageUrl || data.url)
          ) {

            resolve(data);

            return;
          }


          reject(
            new Error(
              data.error ||
              `MEGA upload failed (${xhr.status})`
            )
          );

        }
      );


      xhr.addEventListener(
        "error",
        () => {

          reject(
            new Error(
              "COULD NOT CONNECT TO THE MEGA UPLOAD SERVER. START THE SERVER WITH npm start IN THE server FOLDER."
            )
          );

        }
      );


      xhr.addEventListener(
        "abort",
        () => {

          reject(
            new Error(
              "IMAGE UPLOAD WAS CANCELLED."
            )
          );

        }
      );


      xhr.send(formData);

    }
  );

}


/* =========================================================
   IMAGE PREVIEWS
========================================================= */

const imageInputIds = [
  "imageFile1",
  "imageFile2",
  "imageFile3",
  "imageFile4"
];


const imagePreviewIds = [
  "imagePreview1",
  "imagePreview2",
  "imagePreview3",
  "imagePreview4"
];


imageInputIds.forEach(
  (inputId, index) => {

    const input =
      $(`#${inputId}`);

    const preview =
      $(`#${imagePreviewIds[index]}`);


    if (!input || !preview) {
      return;
    }


    input.addEventListener(
      "change",
      (event) => {

        const file =
          event.target.files?.[0];


        if (!file) {
          return;
        }


        if (
          !file.type.startsWith(
            "image/"
          )
        ) {

          preview.textContent =
            "INVALID IMAGE";

          return;
        }


        const objectUrl =
          URL.createObjectURL(
            file
          );


        preview.innerHTML = "";


        const image =
          document.createElement(
            "img"
          );


        image.src =
          objectUrl;

        image.alt =
          "Product preview";

        image.style.width =
          "100%";

        image.style.height =
          "100%";

        image.style.objectFit =
          "cover";

        image.style.display =
          "block";


        preview.appendChild(
          image
        );

      }
    );

  }
);


/* =========================================================
   LOGIN
========================================================= */

$("#loginForm")
  .addEventListener(
    "submit",
    async (event) => {

      event.preventDefault();


      const email =
        $("#adminEmail")
          .value
          .trim();


      const password =
        $("#adminPassword")
          .value;


      $("#loginError")
        .textContent =
        "SIGNING IN...";


      try {

        const credential =
          await signInWithEmailAndPassword(
            auth,
            email,
            password
          );


        if (
          !(await isAdmin(
            credential.user
          ))
        ) {

          await signOut(auth);


          showLogin(
            "THIS ACCOUNT IS NOT MARKED AS AN ADMIN."
          );


          return;
        }


        currentUser =
          credential.user;


        showDashboard();


      } catch (error) {

        console.error(error);


        $("#loginError")
          .textContent =
          (
            error?.message ||
            "SIGN IN FAILED."
          ).toUpperCase();

      }

    }
  );


/* =========================================================
   LOGOUT
========================================================= */

$("#logoutBtn")
  .addEventListener(
    "click",
    () => signOut(auth)
  );


/* =========================================================
   OPEN PRODUCT MODAL
========================================================= */

$("#addProductBtn")
  .addEventListener(
    "click",
    () => {

      $("#productModal").hidden =
        false;

    }
  );


/* =========================================================
   CLOSE PRODUCT MODAL
========================================================= */

$("#closeModal")
  .addEventListener(
    "click",
    () => {

      $("#productModal").hidden =
        true;

    }
  );


/* =========================================================
   PRODUCT FORM
========================================================= */

$("#productForm")
  .addEventListener(
    "submit",
    async (event) => {

      event.preventDefault();


      if (!currentUser) {
        return;
      }


      const form =
        new FormData(
          event.target
        );


      const error =
        $("#formError");


      const saveButton =
        event.target.querySelector(
          ".save"
        );


      /*
       * Collect all four image files.
       *
       * imageFile1 = FRONT
       * imageFile2 = BACK
       * imageFile3 = SIDE
       * imageFile4 = DETAIL
       */

      const imageFiles =
        imageInputIds
          .map(
            (id) =>
              $(`#${id}`)?.files?.[0]
          )
          .filter(Boolean);


      error.textContent =
        "SAVING...";


      saveButton.disabled =
        true;


      try {

        /*
         * Make sure every selected file
         * is a valid image and <= 10 MB.
         */

        for (
          const file of imageFiles
        ) {

          if (
            !file.type.startsWith(
              "image/"
            )
          ) {

            throw new Error(
              "PLEASE SELECT IMAGE FILES ONLY."
            );

          }


          if (
            file.size >
            10 * 1024 * 1024
          ) {

            throw new Error(
              `IMAGE "${file.name}" MUST BE 10 MB OR SMALLER.`
            );

          }

        }


        /*
         * Upload images one by one.
         *
         * This avoids sending all four
         * files in one giant request.
         */

        const imageUrls = [];


        if (imageFiles.length) {

          error.textContent =
            `UPLOADING 1 OF ${imageFiles.length}...`;

          $("#saveStatus")
            .textContent =
            `UPLOADING 1/${imageFiles.length}`;


          for (
            let i = 0;
            i < imageFiles.length;
            i++
          ) {

            const file =
              imageFiles[i];


            error.textContent =
              `UPLOADING IMAGE ${i + 1} OF ${imageFiles.length} — 0%...`;


            $("#saveStatus")
              .textContent =
              `UPLOADING ${i + 1}/${imageFiles.length}`;


            const uploadResult =
              await uploadImageToMega(
                file,
                (percent) => {

                  error.textContent =
                    `UPLOADING IMAGE ${i + 1} OF ${imageFiles.length} — ${percent}%...`;

                  $("#saveStatus")
                    .textContent =
                    `IMAGE ${i + 1}/${imageFiles.length} — ${percent}%`;

                }
              );


            const imageUrl =
              String(
                uploadResult.imageUrl ||
                uploadResult.url ||
                ""
              ).trim();


            if (!imageUrl) {

              throw new Error(
                `IMAGE ${i + 1} UPLOADED BUT NO IMAGE URL WAS RETURNED.`
              );

            }


            imageUrls.push(
              imageUrl
            );

          }

        }


        /*
         * The first image remains imageUrl.
         *
         * This keeps all your existing
         * product cards compatible.
         */

        const imageUrl =
          imageUrls[0] || "";


        error.textContent =
          "SAVING PRODUCT...";


        $("#saveStatus")
          .textContent =
          "SAVING PRODUCT";


        /*
         * SAVE PRODUCT TO FIRESTORE
         */

        await addDoc(
          collection(
            db,
            "products"
          ),
          {

            name:
              String(
                form.get("name") ||
                ""
              ).trim(),


            description:
              String(
                form.get("description") ||
                ""
              ).trim(),


            price:
              Number(
                form.get("price")
              ),


            stock:
              Number(
                form.get("stock")
              ),


            category:
              form.get(
                "category"
              ),


            type:
              form.get(
                "type"
              ),


            sizes:
              String(
                form.get("sizes") ||
                ""
              )
                .split(",")
                .map(
                  (s) =>
                    s.trim()
                )
                .filter(Boolean),


            tag:
              String(
                form.get("tag") ||
                ""
              ).trim(),


            /*
             * OLD / COMPATIBILITY FIELD
             *
             * Your existing app.js uses this.
             */

            imageUrl,


            /*
             * NEW GALLERY FIELD
             *
             * product.js already knows how
             * to read this array.
             */

            images:
              imageUrls,


            active:
              true,


            createdAt:
              serverTimestamp(),


            createdBy:
              currentUser.uid,


            imageStorage:
              imageUrls.length
                ? "mega"
                : "none"

          }
        );


        /*
         * RESET FORM
         */

        event.target.reset();


        imagePreviewIds.forEach(
          (previewId) => {

            const preview =
              $(`#${previewId}`);


            if (!preview) {
              return;
            }


            preview.innerHTML =
              "<span>UPLOAD IMAGE</span>";

          }
        );


        /*
         * Restore individual labels.
         */

        const labels = [
          "UPLOAD FRONT IMAGE",
          "UPLOAD BACK IMAGE",
          "UPLOAD SIDE IMAGE",
          "UPLOAD DETAIL IMAGE"
        ];


        imagePreviewIds.forEach(
          (previewId, index) => {

            const preview =
              $(`#${previewId}`);


            if (preview) {

              preview.innerHTML =
                `<span>${labels[index]}</span>`;

            }

          }
        );


        $("#productModal")
          .hidden =
          true;


        error.textContent =
          "PRODUCT SAVED SUCCESSFULLY.";


        $("#saveStatus")
          .textContent =
          "PRODUCT SAVED";


        /*
         * Refresh catalog.
         */

        loadProducts();


        window.setTimeout(
          () => {

            error.textContent =
              "";

            $("#saveStatus")
              .textContent =
              "";

          },
          2500
        );


      } catch (e) {

        console.error(e);


        error.textContent =
          (
            e?.message ||
            "COULD NOT SAVE PRODUCT."
          ).toUpperCase();


        $("#saveStatus")
          .textContent =
          "UPLOAD FAILED";


      } finally {

        saveButton.disabled =
          false;

      }

    }
  );


/* =========================================================
   AUTH STATE
========================================================= */

onAuthStateChanged(
  auth,
  async (user) => {

    currentUser =
      user;


    if (!user) {

      showLogin();

      return;
    }


    try {

      if (
        await isAdmin(user)
      ) {

        showDashboard();

      } else {

        await signOut(auth);


        showLogin(
          "THIS ACCOUNT IS NOT MARKED AS AN ADMIN."
        );

      }

    } catch (e) {

      console.error(e);


      showLogin(
        "CHECK YOUR FIREBASE CONFIGURATION."
      );

    }

  }
);