const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const multer = require("multer");
const path = require("path");
const axios = require("axios");
const moshiurData = require('./moshiur.json');

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB URI & client setup
const uri = `mongodb+srv://${process.env.USER_DB}:${process.env.USER_PASS}@mdb.26vlivz.mongodb.net/?retryWrites=true&w=majority&appName=MDB`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();
    console.log("✅ Connected to MongoDB!");

    const db = client.db("portfolio");
    const reviewCollection = db.collection("reviews");
    const blogCollection = db.collection("blogs");
    const tagCollection = db.collection("tags");
    const categoryCollection = db.collection("categories");
    const commentCollection = db.collection("comments");
    const loveCollection = db.collection("loves");
    const commentLikeCollection = db.collection("commentLikes");
        const chatCollection = db.collection("chats");

    // Import routes
    app.use("/blogs", require("./routes/blogs")(blogCollection));
    app.use("/reviews", require("./routes/reviews")(reviewCollection));
    app.use("/tags", require("./routes/tags")(tagCollection));
    app.use("/categories", require("./routes/categories")(categoryCollection));
    app.use("/comments", require("./routes/comments")(commentCollection, commentLikeCollection));
    app.use("/loves", require("./routes/loves")(loveCollection, blogCollection));
    app.use("/api/", require("./routes/chatRoutes")(chatCollection, moshiurData));

    // Multer & Froala upload route (as before)
    const storage = multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, "uploads/");
      },
      filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
      },
    });
    const upload = multer({ storage });
    app.use("/uploads", express.static("uploads"));
    app.post("/froala-upload", upload.single("file"), (req, res) => {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      res.json({
        link: `http://localhost:${port}/uploads/${req.file.filename}`,
      });
    });

    // Root route
    app.get("/", (req, res) => {
      res.send("🔥 Moshiur Rahman Portfolio Server is Live");
    });
  } catch (err) {
    console.error("❌ Error connecting to MongoDB:", err);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});