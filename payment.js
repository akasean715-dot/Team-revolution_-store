import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

const CART_KEY="revolution_cart",LEGACY_CART_KEY="revolution-cart";
// If your API is hosted on another domain, replace the empty string below with that HTTPS API URL.
const PAYMENT_API_BASE_URL=(location.hostname==="localhost"||location.hostname==="127.0.0.1")?"http://localhost:3000":"";
const $=s=>document.querySelector(s),money=v=>`₹${Number(v||0).toLocaleString("en-IN")}`;
let cart=[];let currentUser=null;
function loadCart(){try{const raw=JSON.parse(localStorage.getItem(CART_KEY)||localStorage.getItem(LEGACY_CART_KEY)||"[]");return Array.isArray(raw)?raw.map(i=>({id:i.id||"",name:i.name||i.title||"REVOLUTION PRODUCT",price:Number(i.price||0),image:i.image||i.imageUrl||"",size:i.size||"",quantity:Math.max(1,Number(i.quantity||1))})).filter(i=>i.id||i.name):[]}catch{return[]}}
function showError(message){const n=$("#checkoutError");n.textContent=message;n.hidden=false;window.scrollTo({top:0,behavior:"smooth"})}
function renderSummary(){const node=$("#summaryItems");const subtotal=cart.reduce((s,i)=>s+i.price*i.quantity,0);$("#summarySubtotal").textContent=money(subtotal);$("#summaryTotal").textContent=money(subtotal);node.innerHTML=cart.map(i=>`<div class="summary-item"><div class="summary-image">${i.image?`<img src="${escapeHtml(i.image)}" alt="">`:``}</div><div><h3>${escapeHtml(i.name)}</h3><p>${i.size?`SIZE ${escapeHtml(i.size)} · `:``}QTY ${i.quantity}</p><strong>${money(i.price*i.quantity)}</strong></div></div>`).join("")}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]))}
function validate(){let ok=true;document.querySelectorAll(".field input[required]").forEach(i=>{const valid=i.value.trim()&&(!i.type.includes("email")||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.value.trim()));i.classList.toggle("invalid",!valid);if(!valid)ok=false});const phone=$("#customerPhone");if(phone&&!/^\+?[0-9\s-]{10,15}$/.test(phone.value.trim())){phone.classList.add("invalid");ok=false}const pin=$("#postalCode");if(pin&&!/^\d{6}$/.test(pin.value.trim())){pin.classList.add("invalid");ok=false}if(!ok)showError("PLEASE CHECK THE HIGHLIGHTED DETAILS.");return ok}
let authReadyResolve;
let authReadyReject;
const authReady=new Promise((resolve,reject)=>{authReadyResolve=resolve;authReadyReject=reject});

function withTimeout(promise,ms,message){
  return Promise.race([
    promise,
    new Promise((_,reject)=>setTimeout(()=>reject(new Error(message)),ms))
  ]);
}

async function getIdToken(){
  if(!currentUser){
    await withTimeout(authReady,10000,"Authentication is taking too long. Please refresh the page and sign in again.");
  }
  if(!currentUser)throw new Error("Please sign in before checkout.");
  return withTimeout(currentUser.getIdToken(true),10000,"Could not refresh your sign-in session. Please refresh the page and try again.");
}

async function fetchWithTimeout(url,options={},ms=15000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),ms);
  try{
    return await fetch(url,{...options,signal:controller.signal});
  }catch(error){
    if(error?.name==="AbortError")throw new Error("The payment server took too long to respond. Make sure the server is running on port 3000.");
    throw new Error("Could not reach the payment server. Make sure the server is running on port 3000.");
  }finally{clearTimeout(timer)}
}
function openRazorpay(data,customer){return new Promise((resolve,reject)=>{if(!window.Razorpay)return reject(new Error("Razorpay Checkout could not load. Please refresh and try again."));const options={key:data.keyId,amount:data.amount,currency:data.currency,order_id:data.orderId,name:"The Revolution MMA & Fitness",description:"Revolution Store Order",prefill:{name:customer.name,email:customer.email,contact:customer.phone},theme:{color:"#090909"},modal:{ondismiss:()=>reject(new Error("PAYMENT_CANCELLED"))},handler:async response=>{try{const token=await getIdToken();const verify=await fetchWithTimeout(`${data.apiBase}/api/payment/verify`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken:token,razorpay_order_id:response.razorpay_order_id,razorpay_payment_id:response.razorpay_payment_id,razorpay_signature:response.razorpay_signature,customer})});const result=await verify.json();if(!verify.ok||!result.success)throw new Error(result.error||"Payment verification failed.");resolve(result)}catch(e){reject(e)}}};new window.Razorpay(options).open()})}
async function checkout(event){event.preventDefault();if(!cart.length){showError("YOUR BAG IS EMPTY.");return}if(!validate())return;const loading=$("#loadingOverlay"),button=$("#payButton");loading.hidden=false;button.disabled=true;try{const token=await getIdToken();const customer={name:$("#customerName").value.trim(),email:$("#customerEmail").value.trim(),phone:$("#customerPhone").value.trim(),address:$("#address").value.trim(),city:$("#city").value.trim(),state:$("#state").value.trim(),postalCode:$("#postalCode").value.trim()};const apiBase=PAYMENT_API_BASE_URL;const response=await fetchWithTimeout(`${apiBase}/api/payment/create-order`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken:token,items:cart,customer})});const data=await response.json();if(!response.ok||!data.success)throw new Error(data.error||"Could not prepare payment.");loading.hidden=true;const result=await openRazorpay({...data,apiBase},customer);localStorage.removeItem(CART_KEY);localStorage.removeItem(LEGACY_CART_KEY);location.href=`success.html?order=${encodeURIComponent(result.orderNumber)}&payment=${encodeURIComponent(result.paymentId)}&total=${encodeURIComponent(result.total)}`;}catch(error){loading.hidden=true;button.disabled=false;if(error.message!=="PAYMENT_CANCELLED")showError(error.message||"PAYMENT FAILED. PLEASE TRY AGAIN.")}}
cart=loadCart();if(!cart.length){showError("YOUR BAG IS EMPTY. RETURN TO THE SHOP TO ADD PRODUCTS.");$("#paymentForm").style.display="none"}renderSummary();onAuthStateChanged(auth,user=>{currentUser=user;authReadyResolve(user);if(!user){showError("PLEASE SIGN IN BEFORE CHECKOUT.");$("#paymentForm").style.display="none"}});$("#paymentForm").addEventListener("submit",checkout);
