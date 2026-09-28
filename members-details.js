import { auth } from "./firebase.js";

import {
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  signOut,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";


/* =========================================================
   HELPERS
========================================================= */

const $ = (selector) =>
  document.querySelector(selector);


function setStatus(message, type = "") {

  const status =
    $("#memberDetailsStatus");

  if (!status) return;

  status.textContent = message;

  status.className =
    `account-status ${type}`.trim();
}


/* =========================================================
   ELEMENTS
========================================================= */

const nameInput =
  $("#memberDetailsName");

const emailInput =
  $("#memberDetailsEmailInput");

const emailDisplay =
  $("#memberDetailsEmail");

const saveButton =
  $("#saveDetailsButton");

const changePasswordButton =
  $("#changePasswordButton");

const logoutButton =
  $("#memberDetailsLogout");


let currentUser = null;


/* =========================================================
   LOAD MEMBER INFORMATION
========================================================= */

function loadMemberDetails(user) {

  if (!user) return;

  currentUser = user;


  const name =
    user.displayName ||
    "";


  const email =
    user.email ||
    "";


  if (nameInput) {

    nameInput.value =
      name;

  }


  if (emailInput) {

    emailInput.value =
      email;

  }


  if (emailDisplay) {

    emailDisplay.textContent =
      email;

  }

}


/* =========================================================
   SAVE MEMBER DETAILS
========================================================= */

$("#memberDetailsForm")?.addEventListener(
  "submit",
  async (event) => {

    event.preventDefault();


    if (!currentUser) {

      setStatus(
        "PLEASE SIGN IN FIRST.",
        "error"
      );

      return;
    }


    const name =
      nameInput?.value.trim();


    if (!name) {

      setStatus(
        "PLEASE ENTER YOUR FULL NAME.",
        "error"
      );

      nameInput?.focus();

      return;
    }


    if (name.length < 2) {

      setStatus(
        "PLEASE ENTER A VALID NAME.",
        "error"
      );

      nameInput?.focus();

      return;
    }


    if (saveButton) {

      saveButton.disabled = true;

      saveButton.textContent =
        "SAVING...";

    }


    setStatus(
      "UPDATING YOUR DETAILS..."
    );


    try {

      await updateProfile(
        currentUser,
        {
          displayName: name
        }
      );


      /*
        Update the local Firebase user
        reference so the page immediately
        reflects the new name.
      */

      currentUser =
        auth.currentUser;


      setStatus(
        "YOUR DETAILS HAVE BEEN UPDATED.",
        "success"
      );


      console.log(
        "MEMBER DETAILS UPDATED:",
        currentUser.displayName
      );


    } catch (error) {

      console.error(
        "UPDATE DETAILS ERROR:",
        error
      );


      setStatus(
        getFirebaseErrorMessage(error),
        "error"
      );

    } finally {

      if (saveButton) {

        saveButton.disabled = false;

        saveButton.textContent =
          "SAVE DETAILS ↗";

      }

    }

  }
);


/* =========================================================
   CHANGE PASSWORD
========================================================= */

changePasswordButton?.addEventListener(
  "click",
  async () => {

    if (!currentUser) {

      setStatus(
        "PLEASE SIGN IN FIRST.",
        "error"
      );

      return;
    }


    /*
      Create a password field dynamically
      so we don't have to change the HTML.
    */

    const newPassword =
      window.prompt(
        "ENTER YOUR NEW PASSWORD\n\nMinimum 6 characters:"
      );


    if (newPassword === null) {
      return;
    }


    const password =
      newPassword.trim();


    if (password.length < 6) {

      setStatus(
        "PASSWORD MUST BE AT LEAST 6 CHARACTERS.",
        "error"
      );

      return;
    }


    const confirmPassword =
      window.prompt(
        "CONFIRM YOUR NEW PASSWORD:"
      );


    if (confirmPassword === null) {
      return;
    }


    if (password !== confirmPassword.trim()) {

      setStatus(
        "PASSWORDS DO NOT MATCH.",
        "error"
      );

      return;
    }


    changePasswordButton.disabled = true;

    changePasswordButton.textContent =
      "UPDATING...";


    setStatus(
      "UPDATING YOUR PASSWORD..."
    );


    try {

      await updatePassword(
        currentUser,
        password
      );


      setStatus(
        "PASSWORD UPDATED SUCCESSFULLY.",
        "success"
      );


    } catch (error) {

      console.error(
        "CHANGE PASSWORD ERROR:",
        error
      );


      /*
        Firebase may require a recent login
        before allowing a password change.
      */

      if (
        error.code ===
        "auth/requires-recent-login"
      ) {

        setStatus(
          "PLEASE SIGN IN AGAIN BEFORE CHANGING YOUR PASSWORD.",
          "error"
        );

      } else {

        setStatus(
          getFirebaseErrorMessage(error),
          "error"
        );

      }

    } finally {

      changePasswordButton.disabled = false;

      changePasswordButton.textContent =
        "CHANGE PASSWORD ↗";

    }

  }
);


/* =========================================================
   SIGN OUT
========================================================= */

logoutButton?.addEventListener(
  "click",
  async () => {

    if (logoutButton) {

      logoutButton.disabled = true;

      logoutButton.textContent =
        "SIGNING OUT...";

    }


    try {

      await signOut(auth);


      window.location.href =
        "account.html";


    } catch (error) {

      console.error(
        "SIGN OUT ERROR:",
        error
      );


      setStatus(
        "COULD NOT SIGN OUT. PLEASE TRY AGAIN.",
        "error"
      );


      if (logoutButton) {

        logoutButton.disabled = false;

        logoutButton.textContent =
          "SIGN OUT";

      }

    }

  }
);


/* =========================================================
   AUTH STATE
========================================================= */

onAuthStateChanged(
  auth,
  (user) => {

    if (!user) {

      /*
        Nobody is allowed to see
        another member's details.
      */

      window.location.href =
        "account.html";

      return;
    }


    console.log(
      "MEMBER DETAILS USER:",
      user.email
    );


    loadMemberDetails(user);

  }
);


/* =========================================================
   FIREBASE ERROR MESSAGES
========================================================= */

function getFirebaseErrorMessage(error) {

  switch (error.code) {

    case "auth/requires-recent-login":

      return (
        "PLEASE SIGN IN AGAIN BEFORE MAKING THIS CHANGE."
      );


    case "auth/weak-password":

      return (
        "PASSWORD MUST BE AT LEAST 6 CHARACTERS."
      );


    case "auth/network-request-failed":

      return (
        "NETWORK ERROR. CHECK YOUR INTERNET CONNECTION."
      );


    case "auth/too-many-requests":

      return (
        "TOO MANY ATTEMPTS. PLEASE TRY AGAIN LATER."
      );


    default:

      return (
        error.message ||
        "COULD NOT UPDATE YOUR ACCOUNT."
      );

  }

}
