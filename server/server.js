import express from "express";
import multer from "multer";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "node:crypto";
import { Storage, File } from "megajs";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
const FIREBASE_PROJECT_ID = String(process.env.FIREBASE_PROJECT_ID || "the-revolution-mma-store").trim();
const FIREBASE_WEB_API_KEY = String(process.env.FIREBASE_WEB_API_KEY || "").trim();
const RAZORPAY_KEY_ID = String(process.env.RAZORPAY_KEY_ID || "").trim();
const RAZORPAY_KEY_SECRET = String(process.env.RAZORPAY_KEY_SECRET || "").trim();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

let megaStorage = null;
let productsFolder = null;
const pendingPayments = new Map();
let serviceAccount = null;

function loadServiceAccount() {
  if (serviceAccount) return serviceAccount;
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) return null;
  try {
    serviceAccount = JSON.parse(raw);
    return serviceAccount;
  } catch (error) {
    console.error("Invalid FIREBASE_SERVICE_ACCOUNT_JSON:", error.message);
    return null;
  }
}

function b64url(value) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getGoogleAccessToken() {
  const account = loadServiceAccount();
  if (!account?.client_email || !account?.private_key) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: account.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${payload}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(account.private_key, "base64url");
  const assertion = `${unsigned}.${signature}`;

  const response = await fetch(account.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(data.error_description || "Could not obtain Firebase server access token.");
  return data.access_token;
}

function firestoreUrl(path = "") {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}/databases/(default)/documents/${path}`;
}

function toPlainValue(field) {
  if (!field) return null;
  if ("stringValue" in field) return field.stringValue;
  if ("integerValue" in field) return Number(field.integerValue);
  if ("doubleValue" in field) return Number(field.doubleValue);
  if ("booleanValue" in field) return Boolean(field.booleanValue);
  if ("timestampValue" in field) return field.timestampValue;
  if ("referenceValue" in field) return field.referenceValue;
  if ("arrayValue" in field) return (field.arrayValue.values || []).map(toPlainValue);
  if ("mapValue" in field) return Object.fromEntries(Object.entries(field.mapValue.fields || {}).map(([k, v]) => [k, toPlainValue(v)]));
  return null;
}

function documentToPlain(doc) {
  return Object.fromEntries(Object.entries(doc?.fields || {}).map(([k, v]) => [k, toPlainValue(v)]));
}

function fieldValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === "number") return { doubleValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(fieldValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fieldValue(v)])) } };
}

async function firestoreGet(path, accessToken) {
  const response = await fetch(firestoreUrl(path), { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `Firestore read failed (${response.status}).`);
  return documentToPlain(data);
}

async function firestoreSet(path, values, accessToken) {
  const response = await fetch(firestoreUrl(path), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, fieldValue(v)])) })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `Firestore write failed (${response.status}).`);
  return data;
}

async function verifyFirebaseUser(idToken) {
  if (!FIREBASE_WEB_API_KEY) throw new Error("FIREBASE_WEB_API_KEY is not configured on the server.");
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken })
  });
  const data = await response.json();
  if (!response.ok || !data.users?.[0]) throw new Error("Your login session is invalid or expired. Please sign in again.");
  return data.users[0];
}

async function razorpayRequest(path, options = {}) {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) throw new Error("Razorpay API keys are not configured on the server.");
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64")}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.description || data.error?.reason || "Razorpay request failed.");
  return data;
}

async function connectMega() {
  if (megaStorage && productsFolder) return megaStorage;
  megaStorage = await new Storage({ email: process.env.MEGA_EMAIL, password: process.env.MEGA_PASSWORD }).ready;
  console.log("Connected to MEGA");
  const root = megaStorage.root;
  let revolutionFolder = root.children?.find(item => item.name === "The Revolution Store");
  if (!revolutionFolder) revolutionFolder = await root.mkdir("The Revolution Store");
  let folder = revolutionFolder.children?.find(item => item.name === "Products");
  if (!folder) folder = await revolutionFolder.mkdir("Products");
  productsFolder = folder;
  return megaStorage;
}

function getMimeType(filename = "") {
  const extension = filename.split(".").pop().toLowerCase();
  return ({ jpg:"image/jpeg", jpeg:"image/jpeg", png:"image/png", webp:"image/webp", gif:"image/gif", avif:"image/avif", svg:"image/svg+xml" })[extension] || "application/octet-stream";
}

function isAllowedMegaUrl(value) {
  try { const url = new URL(value); return url.protocol === "https:" && (url.hostname === "mega.nz" || url.hostname.endsWith(".mega.nz") || url.hostname === "mega.co.nz" || url.hostname.endsWith(".mega.co.nz")); } catch { return false; }
}

app.get("/api/health", async (req, res) => {
  res.json({ ok: true, razorpayConfigured: Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET), firebaseServerWritesConfigured: Boolean(loadServiceAccount()), message: "The Revolution payment server is running." });
});

app.post("/api/upload-product-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success:false, error:"No image uploaded." });
    if (!req.file.mimetype.startsWith("image/")) return res.status(400).json({ success:false, error:"Only image files are allowed." });
    await connectMega();
    const safeName = req.file.originalname.replace(/[^a-z0-9._-]/gi, "-");
    const filename = `${Date.now()}-${safeName}`;
    const file = await productsFolder.upload(filename, req.file.buffer).complete;
    const megaUrl = await file.link();
    const publicBase = `${req.protocol}://${req.get("host")}`;
    const imageUrl = `${publicBase}/api/product-image?url=${encodeURIComponent(megaUrl)}&name=${encodeURIComponent(filename)}`;
    res.json({ success:true, filename, megaUrl, imageUrl, url:imageUrl });
  } catch (error) { console.error("MEGA upload error:", error); res.status(500).json({ success:false, error:error.message || "MEGA upload failed." }); }
});

app.get("/api/product-image", async (req, res) => {
  try {
    const megaUrl = String(req.query.url || "");
    const filename = String(req.query.name || "product-image");
    if (!megaUrl) return res.status(400).send("Missing MEGA image URL.");
    if (!isAllowedMegaUrl(megaUrl)) return res.status(400).send("Invalid MEGA image URL.");
    const file = File.fromURL(megaUrl);
    const buffer = await file.downloadBuffer();
    if (!buffer?.length) return res.status(404).send("Image could not be downloaded from MEGA.");
    res.setHeader("Content-Type", getMimeType(filename));
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(buffer);
  } catch (error) { console.error("MEGA image delivery error:", error); res.status(500).send("Could not load product image."); }
});

app.post("/api/payment/create-order", async (req, res) => {
  try {
    const { idToken, items, customer } = req.body || {};
    if (!loadServiceAccount()) return res.status(503).json({ success:false, error:"Payment setup is incomplete: the Firebase server service account has not been configured yet." });
    if (!idToken || !Array.isArray(items) || !items.length) return res.status(400).json({ success:false, error:"Your cart is empty or your login session is missing." });
    const user = await verifyFirebaseUser(idToken);
    const googleToken = await getGoogleAccessToken();
    if (!googleToken) return res.status(503).json({
      success:false,
      error:"Payment setup is incomplete: the Firebase server service account has not been configured yet."
    });
    const validatedItems = [];
    let total = 0;

    for (const item of items) {
      const productId = String(item.id || "");
      const quantity = Math.max(1, Math.min(20, Number(item.quantity || 1)));
      if (!productId) continue;
      const product = await firestoreGet(`products/${encodeURIComponent(productId)}`, googleToken);
      if (product.active === false) throw new Error(`${product.name || "A product"} is no longer available.`);
      const price = Number(product.price || 0);
      if (!Number.isFinite(price) || price < 0) throw new Error(`Invalid price for ${product.name || "product"}.`);
      const sizes = Array.isArray(product.sizes) ? product.sizes.map(String) : [];
      const size = String(item.size || "");
      if (sizes.length && !sizes.includes(size)) throw new Error(`Please select a valid size for ${product.name || "product"}.`);
      total += price * quantity;
      validatedItems.push({ productId, name:String(product.name || "REVOLUTION PRODUCT"), price, quantity, size, image:String(product.imageUrl || product.image || "") });
    }

    if (!validatedItems.length || total <= 0) return res.status(400).json({ success:false, error:"No valid products were found in your bag." });
    if (!customer?.name || !customer?.email || !customer?.phone || !customer?.address || !customer?.city || !customer?.state || !/^\d{6}$/.test(String(customer.postalCode || ""))) return res.status(400).json({ success:false, error:"Please complete all checkout details." });

    const orderNumber = `REV-${Date.now().toString().slice(-8)}`;
    const razorOrder = await razorpayRequest("/orders", { method:"POST", body:JSON.stringify({ amount:Math.round(total * 100), currency:"INR", receipt:orderNumber, notes:{ orderNumber, userId:user.localId } }) });
    const pending = { orderNumber, userId:user.localId, userEmail:user.email || customer.email, items:validatedItems, total, customer:{...customer}, razorpayOrderId:razorOrder.id, createdAt:new Date().toISOString() };
    pendingPayments.set(razorOrder.id, pending);

    await firestoreSet(`paymentIntents/${encodeURIComponent(razorOrder.id)}`, pending, googleToken);

    res.json({ success:true, keyId:RAZORPAY_KEY_ID, orderId:razorOrder.id, amount:razorOrder.amount, currency:razorOrder.currency, orderNumber });
  } catch (error) { console.error("CREATE PAYMENT ORDER ERROR:", error); res.status(500).json({ success:false, error:error.message || "Could not prepare payment." }); }
});

app.post("/api/payment/verify", async (req, res) => {
  try {
    const { idToken, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!idToken || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return res.status(400).json({ success:false, error:"Missing payment verification details." });
    const user = await verifyFirebaseUser(idToken);
    const expected = crypto.createHmac("sha256", RAZORPAY_KEY_SECRET).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
    const receivedSignature = Buffer.from(String(razorpay_signature));
    const expectedSignature = Buffer.from(expected);
    if (receivedSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(expectedSignature, receivedSignature)) return res.status(400).json({ success:false, error:"Payment signature verification failed." });

    const payment = await razorpayRequest(`/payments/${encodeURIComponent(razorpay_payment_id)}`);
    if (payment.status !== "captured") return res.status(400).json({ success:false, error:`Payment is not captured yet. Current status: ${payment.status}. Please wait a moment and try again.` });
    if (payment.order_id !== razorpay_order_id) return res.status(400).json({ success:false, error:"Payment order mismatch." });

    let pending = pendingPayments.get(razorpay_order_id) || null;
    const googleToken = await getGoogleAccessToken();
    if (!pending && googleToken) pending = await firestoreGet(`paymentIntents/${encodeURIComponent(razorpay_order_id)}`, googleToken);
    if (!pending) return res.status(400).json({ success:false, error:"The checkout session expired. Please contact the store before paying again." });
    if (pending.userId !== user.localId) return res.status(403).json({ success:false, error:"This payment does not belong to the signed-in account." });

    const verifiedOrder = { userId:pending.userId, userEmail:pending.userEmail, orderNumber:pending.orderNumber, items:pending.items, total:Number(pending.total), status:"PAID", paymentStatus:"PAID", razorpayOrderId:razorpay_order_id, razorpayPaymentId:razorpay_payment_id, customer:pending.customer, createdAt:new Date() };
    const orderId = crypto.randomUUID();
    if (!googleToken) throw new Error("Firebase server credentials are not configured. Payment was verified, but the store cannot safely finalize the order yet. Add FIREBASE_SERVICE_ACCOUNT_JSON and retry the verification flow.");
    await firestoreSet(`orders/${orderId}`, verifiedOrder, googleToken);
    await firestoreSet(`paymentIntents/${encodeURIComponent(razorpay_order_id)}`, {...pending, status:"PAID", paymentId:razorpay_payment_id, verifiedAt:new Date().toISOString()}, googleToken);
    pendingPayments.delete(razorpay_order_id);
    res.json({ success:true, orderId, orderNumber:pending.orderNumber, paymentId:razorpay_payment_id, total:Number(pending.total) });
  } catch (error) { console.error("VERIFY PAYMENT ERROR:", error); res.status(500).json({ success:false, error:error.message || "Payment verification failed." }); }
});

app.listen(PORT, "0.0.0.0", () => console.log(`The Revolution server running on port ${PORT}`));
