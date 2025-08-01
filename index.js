const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion } = require('mongodb');

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB URI
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
    await client.connect();
    console.log("✅ Connected to MongoDB!");

    const db = client.db("portfolio");
    const reviewCollection = db.collection("reviews");

    // GET all reviews
    app.get("/reviews", async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });

    // POST a new review
    app.post("/reviews", async (req, res) => {
      const review = req.body;
      review.createdAt = new Date();
      const result = await reviewCollection.insertOne(review);
      res.send(result);
    });

    // GET review stats (avg rating & count)
    app.get("/reviews/stats", async (req, res) => {
      const total = await reviewCollection.countDocuments();

      const stats = await reviewCollection
        .aggregate([
          {
            $group: {
              _id: null,
              avgRating: { $avg: "$rating" },
              count: { $sum: 1 },
            },
          },
        ])
        .toArray();

      const result = stats[0] || { avgRating: 0, count: 0 };
      res.send({ avg: Number(result.avgRating || 0).toFixed(1), count: result.count });
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
