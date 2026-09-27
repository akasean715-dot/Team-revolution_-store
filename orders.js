import { db, auth } from "./firebase.js";

import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";


/* =========================================================
   HELPERS
========================================================= */

const $ = (selector) =>
  document.querySelector(selector);

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN")}`;


/* =========================================================
   ELEMENTS
========================================================= */

const ordersList =
  $("#ordersList");

const ordersStatus =
  $("#ordersStatus");


/* =========================================================
   STATUS
========================================================= */

function setStatus(message, type = "") {

  if (!ordersStatus) return;

  ordersStatus.textContent =
    message;

  ordersStatus.className =
    `orders-status ${type}`.trim();
}


/* =========================================================
   LOAD ORDERS
========================================================= */

async function loadOrders(user) {

  if (!user) {
    setStatus(
      "PLEASE SIGN IN TO VIEW YOUR ORDERS.",
      "error"
    );

    if (ordersList) {
      ordersList.innerHTML = "";
    }

    return;
  }


  setStatus("LOADING YOUR ORDERS...");


  try {

    /*
      IMPORTANT:
      We only query by userId.

      We do NOT use orderBy() here,
      so Firestore does not require
      a composite index.
    */

    const ordersQuery =
      query(
        collection(db, "orders"),
        where("userId", "==", user.uid)
      );


    const snapshot =
      await getDocs(ordersQuery);


    let orders =
      snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));


    /* =====================================================
       SORT NEWEST FIRST
    ===================================================== */

    orders.sort((a, b) => {

      const aTime =
        a.createdAt?.toMillis?.() || 0;

      const bTime =
        b.createdAt?.toMillis?.() || 0;

      return bTime - aTime;

    });


    /* =====================================================
       EMPTY
    ===================================================== */

    if (!orders.length) {

      setStatus(
        "YOU HAVE NOT PLACED ANY ORDERS YET."
      );

      if (ordersList) {

        ordersList.innerHTML = `
          <div class="orders-empty">

            <div class="orders-empty-number">
              00
            </div>

            <h3>
              NO ORDERS YET.
            </h3>

            <p>
              YOUR REVOLUTION GEAR ORDERS
              WILL APPEAR HERE.
            </p>

            <a
              href="index.html#shop"
              class="orders-shop-button"
            >
              SHOP THE REVOLUTION ↗
            </a>

          </div>
        `;

      }

      return;
    }


    setStatus(
      `${orders.length} ORDER${orders.length === 1 ? "" : "S"}`
    );


    /* =====================================================
       RENDER
    ===================================================== */

    if (!ordersList) return;


    ordersList.innerHTML =
      orders.map((order) => {

        const date =
          order.createdAt?.toDate
            ? order.createdAt.toDate().toLocaleDateString(
                "en-IN",
                {
                  day: "2-digit",
                  month: "short",
                  year: "numeric"
                }
              )
            : "DATE PENDING";


        const items =
          Array.isArray(order.items)
            ? order.items
            : [];


        const itemCount =
          items.reduce(
            (total, item) =>
              total +
              Number(item.quantity || 0),
            0
          );


        return `

          <article class="order-card">

            <div class="order-card-top">

              <div>

                <span class="order-label">
                  ORDER
                </span>

                <h3>
                  ${escapeHtml(
                    order.orderNumber ||
                    order.id
                  )}
                </h3>

              </div>


              <span class="order-status">
                ${escapeHtml(
                  order.status ||
                  "PROCESSING"
                )}
              </span>

            </div>


            <div class="order-card-info">

              <div>
                <span>DATE</span>
                <strong>${date}</strong>
              </div>


              <div>
                <span>ITEMS</span>
                <strong>${itemCount}</strong>
              </div>


              <div>
                <span>TOTAL</span>
                <strong>
                  ${money(order.total)}
                </strong>
              </div>

            </div>


            <div class="order-items">

              ${items.map((item) => `

                <div class="order-item">

                  <div>

                    <strong>
                      ${escapeHtml(
                        item.name ||
                        "REVOLUTION PRODUCT"
                      )}
                    </strong>

                    ${
                      item.size
                        ? `
                          <small>
                            SIZE ${escapeHtml(item.size)}
                          </small>
                        `
                        : ""
                    }

                  </div>


                  <span>
                    ×${Number(item.quantity || 1)}
                  </span>

                </div>

              `).join("")}

            </div>

          </article>

        `;

      }).join("");


  } catch (error) {

    console.error(
      "LOAD ORDERS ERROR:",
      error
    );


    setStatus(
      "COULD NOT LOAD YOUR ORDERS.",
      "error"
    );


    if (ordersList) {

      ordersList.innerHTML = `
        <div class="orders-error">
          PLEASE TRY AGAIN LATER.
        </div>
      `;

    }

  }

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


/* =========================================================
   AUTH STATE
========================================================= */

onAuthStateChanged(
  auth,
  (user) => {

    if (user) {

      console.log(
        "ORDERS USER:",
        user.email
      );

      loadOrders(user);

    } else {

      window.location.href =
        "account.html";

    }

  }
);