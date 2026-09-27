import { auth } from "./firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";


/* =========================================================
   HELPERS
========================================================= */

const $ = (selector) => document.querySelector(selector);


function show(element) {
  if (element) {
    element.hidden = false;
  }
}


function hide(element) {
  if (element) {
    element.hidden = true;
  }
}


function setStatus(element, message, type = "") {

  if (!element) return;

  element.textContent = message;

  element.className =
    `account-status ${type}`.trim();
}


/* =========================================================
   ACCOUNT SECTIONS
========================================================= */

const loginSection =
  $("#loginSection");

const registerSection =
  $("#registerSection");

const memberSection =
  $("#memberSection");

const loginStatus =
  $("#loginStatus");

const registerStatus =
  $("#registerStatus");

const memberStatus =
  $("#memberStatus");


function showLogin() {

  show(loginSection);
  hide(registerSection);
  hide(memberSection);

  setStatus(loginStatus, "");
  setStatus(registerStatus, "");
}


function showRegister() {

  hide(loginSection);
  show(registerSection);
  hide(memberSection);

  setStatus(loginStatus, "");
  setStatus(registerStatus, "");
}


function showMember(user) {

  hide(loginSection);
  hide(registerSection);
  show(memberSection);

  if (!user) return;


  const name =
    user.displayName ||
    "REVOLUTION MEMBER";


  const email =
    user.email ||
    "";


  const memberName =
    $("#memberName");

  const memberEmail =
    $("#memberEmail");


  if (memberName) {
    memberName.textContent = name;
  }


  if (memberEmail) {
    memberEmail.textContent = email;
  }


  if (memberStatus) {
    memberStatus.textContent =
      `SIGNED IN AS ${email}`;
  }

}


/* =========================================================
   LOGIN
========================================================= */

$("#loginForm")?.addEventListener(
  "submit",
  async (event) => {

    event.preventDefault();


    const email =
      $("#loginEmail")?.value.trim();


    const password =
      $("#loginPassword")?.value;


    if (!email || !password) {

      setStatus(
        loginStatus,
        "ENTER YOUR EMAIL AND PASSWORD.",
        "error"
      );

      return;
    }


    const button =
      $("#loginButton");


    if (button) {

      button.disabled = true;

      button.textContent =
        "SIGNING IN...";
    }


    setStatus(
      loginStatus,
      "SIGNING IN..."
    );


    try {

      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );


      setStatus(
        loginStatus,
        "SIGNED IN — WELCOME BACK.",
        "success"
      );


      } catch (error) {

    console.error(error);

    if (
      error.code === "auth/user-not-found" ||
      error.code === "auth/invalid-credential"
    ) {

      setMessage(
        "ACCOUNT NOT FOUND. PLEASE CREATE AN ACCOUNT FIRST.",
        "error"
      );

    } else if (error.code === "auth/wrong-password") {

      setMessage(
        "INCORRECT PASSWORD.",
        "error"
      );

    } else if (error.code === "auth/invalid-email") {

      setMessage(
        "PLEASE ENTER A VALID EMAIL ADDRESS.",
        "error"
      );

    } else {

      setMessage(
        error.message.toUpperCase(),
        "error"
      );
    }

  } finally {

      if (button) {

        button.disabled = false;

        button.textContent =
          "SIGN IN ↗";
      }

    }

  }
);


/* =========================================================
   CREATE ACCOUNT
========================================================= */

$("#registerForm")?.addEventListener(
  "submit",
  async (event) => {

    event.preventDefault();


    const name =
      $("#registerName")?.value.trim();


    const email =
      $("#registerEmail")?.value.trim();


    const password =
      $("#registerPassword")?.value;


    const confirmPassword =
      $("#registerConfirmPassword")?.value;


    /* VALIDATION */

    if (
      !name ||
      !email ||
      !password ||
      !confirmPassword
    ) {

      setStatus(
        registerStatus,
        "PLEASE COMPLETE ALL FIELDS.",
        "error"
      );

      return;
    }


    if (password.length < 6) {

      setStatus(
        registerStatus,
        "PASSWORD MUST BE AT LEAST 6 CHARACTERS.",
        "error"
      );

      return;
    }


    if (
      password !==
      confirmPassword
    ) {

      setStatus(
        registerStatus,
        "PASSWORDS DO NOT MATCH.",
        "error"
      );

      return;
    }


    const button =
      $("#registerButton");


    if (button) {

      button.disabled = true;

      button.textContent =
        "CREATING ACCOUNT...";
    }


    setStatus(
      registerStatus,
      "CREATING YOUR ACCOUNT..."
    );


    try {

      /* CREATE FIREBASE ACCOUNT */

      const credential =
        await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );


      /* SAVE NAME TO FIREBASE PROFILE */

      await updateProfile(
        credential.user,
        {
          displayName: name
        }
      );


      console.log(
        "ACCOUNT CREATED:",
        credential.user
      );


      setStatus(
        registerStatus,
        "ACCOUNT CREATED — WELCOME TO THE REVOLUTION.",
        "success"
      );


      /*
        Firebase automatically signs the
        new member in after account creation.
      */

      showMember(
        credential.user
      );


    } catch (error) {

      console.error(
        "CREATE ACCOUNT ERROR:",
        error
      );


      switch (error.code) {

        case "auth/email-already-in-use":

          setStatus(
            registerStatus,
            "AN ACCOUNT WITH THIS EMAIL ALREADY EXISTS.",
            "error"
          );

          break;


        case "auth/invalid-email":

          setStatus(
            registerStatus,
            "PLEASE ENTER A VALID EMAIL ADDRESS.",
            "error"
          );

          break;


        case "auth/weak-password":

          setStatus(
            registerStatus,
            "PASSWORD MUST BE AT LEAST 6 CHARACTERS.",
            "error"
          );

          break;


        case "auth/network-request-failed":

          setStatus(
            registerStatus,
            "NETWORK ERROR. CHECK YOUR INTERNET CONNECTION.",
            "error"
          );

          break;


        default:

          setStatus(
            registerStatus,
            error.message ||
              "COULD NOT CREATE ACCOUNT.",
            "error"
          );

      }

    } finally {

      if (button) {

        button.disabled = false;

        button.textContent =
          "CREATE ACCOUNT ↗";
      }

    }

  }
);


/* =========================================================
   SWITCH LOGIN → REGISTER
========================================================= */

$("#showRegister")?.addEventListener(
  "click",
  (event) => {

    event.preventDefault();

    showRegister();

  }
);


/* =========================================================
   SWITCH REGISTER → LOGIN
========================================================= */

$("#showLogin")?.addEventListener(
  "click",
  (event) => {

    event.preventDefault();

    showLogin();

  }
);


/* =========================================================
   LOG OUT
========================================================= */

$("#logoutButton")?.addEventListener(
  "click",
  async () => {

    const button =
      $("#logoutButton");


    if (button) {
      button.disabled = true;
    }


    try {

      await signOut(auth);


      setStatus(
        memberStatus,
        "YOU HAVE BEEN SIGNED OUT.",
        "success"
      );


      showLogin();


    } catch (error) {

      console.error(
        "LOGOUT ERROR:",
        error
      );


      setStatus(
        memberStatus,
        "COULD NOT SIGN OUT. PLEASE TRY AGAIN.",
        "error"
      );


    } finally {

      if (button) {
        button.disabled = false;
      }

    }

  }
);

$("#myOrdersButton")?.addEventListener("click", () => {
  window.location.href = "orders.html";
});

/* =========================================================
   FIREBASE AUTH STATE
========================================================= */

onAuthStateChanged(
  auth,
  (user) => {

    if (user) {

      console.log(
        "SIGNED IN:",
        user.email
      );

      showMember(user);

    } else {

      showLogin();

    }

  }
);
