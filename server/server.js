import express from "express";
import multer from "multer";
import cors from "cors";
import dotenv from "dotenv";
import { Storage, File } from "megajs";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

// For local development this falls back to the request host.
// When the server is deployed, set PUBLIC_BASE_URL to the public
// HTTPS URL of this server so Firestore stores a URL the online store
// can actually reach.
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");

app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

let megaStorage = null;
let productsFolder = null;

async function connectMega() {
  if (megaStorage && productsFolder) {
    return megaStorage;
  }

  megaStorage = await new Storage({
    email: process.env.MEGA_EMAIL,
    password: process.env.MEGA_PASSWORD
  }).ready;

  console.log("Connected to MEGA");

  const root = megaStorage.root;

  let revolutionFolder = root.children?.find(
    (item) => item.name === "The Revolution Store"
  );

  if (!revolutionFolder) {
    revolutionFolder = await root.mkdir("The Revolution Store");
  }

  let folder = revolutionFolder.children?.find(
    (item) => item.name === "Products"
  );

  if (!folder) {
    folder = await revolutionFolder.mkdir("Products");
  }

  productsFolder = folder;

  return megaStorage;
}

function getMimeType(filename = "") {
  const extension = filename
    .split(".")
    .pop()
    .toLowerCase();

  const types = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    svg: "image/svg+xml"
  };

  return types[extension] || "application/octet-stream";
}

function isAllowedMegaUrl(value) {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      (
        url.hostname === "mega.nz" ||
        url.hostname.endsWith(".mega.nz") ||
        url.hostname === "mega.co.nz" ||
        url.hostname.endsWith(".mega.co.nz")
      )
    );
  } catch {
    return false;
  }
}

app.get("/api/health", async (req, res) => {
  try {
    await connectMega();

    res.json({
      ok: true,
      message: "MEGA connection working"
    });
  } catch (error) {
    console.error("MEGA health error:", error);

    res.status(500).json({
      ok: false,
      message: "MEGA connection failed"
    });
  }
});

/*
 * Upload product image to:
 *
 * Cloud drive
 * └── The Revolution Store
 *     └── Products
 */
app.post(
  "/api/upload-product-image",
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "No image uploaded."
        });
      }

      if (!req.file.mimetype.startsWith("image/")) {
        return res.status(400).json({
          success: false,
          error: "Only image files are allowed."
        });
      }

      await connectMega();

      const safeName = req.file.originalname
        .replace(/[^a-z0-9._-]/gi, "-");

      const filename = `${Date.now()}-${safeName}`;

      const file = await productsFolder
        .upload(filename, req.file.buffer)
        .complete;

      /*
       * This is the MEGA public/share URL.
       * It is NOT used directly by the storefront.
       */
      const megaUrl = await file.link();

      /*
       * The browser-facing URL goes through this server.
       * The server downloads/decrypts the MEGA file and
       * sends the actual image bytes to the browser.
       */
      const publicBase =
        `${req.protocol}://${req.get("host")}`;

      const imageUrl =
        `${publicBase}/api/product-image?url=${encodeURIComponent(megaUrl)}&name=${encodeURIComponent(filename)}`;

      res.json({
        success: true,
        filename,
        megaUrl,
        imageUrl,
        url: imageUrl
      });

    } catch (error) {
      console.error("MEGA upload error:", error);

      res.status(500).json({
        success: false,
        error: error.message || "MEGA upload failed."
      });
    }
  }
);

/*
 * Browser-facing MEGA image endpoint.
 *
 * The storefront uses this URL as the imageUrl stored in Firestore.
 *
 * Example:
 * /api/product-image?url=<MEGA_PUBLIC_LINK>&name=product.jpg
 */
app.get("/api/product-image", async (req, res) => {
  try {
    const megaUrl = String(req.query.url || "");
    const filename = String(req.query.name || "product-image");

    if (!megaUrl) {
      return res.status(400).send("Missing MEGA image URL.");
    }

    if (!isAllowedMegaUrl(megaUrl)) {
      return res.status(400).send("Invalid MEGA image URL.");
    }

    /*
     * megajs can create a file object from a public MEGA URL
     * and download the decrypted file contents.
     */
    const file = File.fromURL(megaUrl);

    const buffer = await file.downloadBuffer();

    if (!buffer || !buffer.length) {
      return res.status(404).send("Image could not be downloaded from MEGA.");
    }

    res.setHeader("Content-Type", getMimeType(filename));
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "public, max-age=86400");

    res.send(buffer);

  } catch (error) {
    console.error("MEGA image delivery error:", error);

    res.status(500).send("Could not load product image.");
  }
});

app.listen(PORT, () => {
  console.log(
    `MEGA upload server running on http://localhost:${PORT}`
  );
});