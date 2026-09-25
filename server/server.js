import express from "express";
import multer from "multer";
import cors from "cors";
import dotenv from "dotenv";
import { Storage } from "megajs";

dotenv.config();

const app = express();

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
  if (megaStorage) return megaStorage;

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

app.get("/api/health", async (req, res) => {
  try {
    await connectMega();

    res.json({
      ok: true,
      message: "MEGA connection working"
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      message: "MEGA connection failed"
    });
  }
});

app.post("/api/upload-product-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No image uploaded"
      });
    }

    await connectMega();

    const safeName = req.file.originalname
      .replace(/[^a-z0-9._-]/gi, "-");

    const filename = `${Date.now()}-${safeName}`;

    const file = await productsFolder
      .upload(filename, req.file.buffer)
      .complete;

    const link = await file.link();

    res.json({
      success: true,
      filename,
      url: link
    });

  } catch (error) {
    console.error("MEGA upload error:", error);

    res.status(500).json({
      error: error.message || "MEGA upload failed"
    });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(
    `MEGA upload server running on http://localhost:${process.env.PORT || 3000}`
  );
});