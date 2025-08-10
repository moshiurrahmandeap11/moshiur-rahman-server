const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");


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



    app.post("/visits", async (req, res) => {
  try {
    const visit = {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      visitedAt: new Date(),
    };
    await db.collection("visits").insertOne(visit);
    res.json({ success: true, message: "Visit logged" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to log visit" });
  }
});


app.get("/visitors/monthly", async (req, res) => {
  try {
    const start = new Date();
    start.setDate(1); // first day of current month
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);

    const count = await db.collection("visits").countDocuments({
      visitedAt: { $gte: start, $lt: end },
    });

    res.json({ success: true, count });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to get monthly visitors" });
  }
});




    // Get love count by blogId
    app.get("/loves/:blogId", async (req, res) => {
      const { blogId } = req.params;
      try {
        const count = await loveCollection.countDocuments({ blogId });
        res.json({ success: true, count });
      } catch (err) {
        res
          .status(500)
          .json({ success: false, message: "Failed to get loves" });
      }
    });

    app.post("/loves", async (req, res) => {
      const { blogId, userId } = req.body;

      try {
        const blog = await blogCollection.findOne({
          _id: new ObjectId(blogId),
        });
        if (!blog) return res.status(404).send({ message: "Blog not found" });

        const loves = blog.loves || [];
        const isLoved = loves.includes(userId);

        const updatedLoves = isLoved
          ? loves.filter((id) => id !== userId)
          : [...loves, userId];

        await blogCollection.updateOne(
          { _id: new ObjectId(blogId) },
          { $set: { loves: updatedLoves } }
        );

        res.send({ message: "Love updated", loves: updatedLoves });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Something went wrong" });
      }
    });

    // Check if a specific user loved a specific blog
    app.get("/loves/status/:blogId", async (req, res) => {
      const { blogId } = req.params;
      const { userId } = req.query;

      if (!blogId || !userId) {
        return res
          .status(400)
          .json({ success: false, message: "Missing blogId or userId" });
      }

      try {
        const loved = await loveCollection.findOne({ blogId, userId });
        const count = await loveCollection.countDocuments({ blogId });
        res.json({ success: true, loved: !!loved, count });
      } catch (err) {
        res
          .status(500)
          .json({ success: false, message: "Failed to fetch love status" });
      }
    });

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
      res.send({
        avg: Number(result.avgRating || 0).toFixed(1),
        count: result.count,
      });
    });

    app.get("/blogs", async (req, res) => {
      try {
        const blogs = await blogCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.json({ success: true, data: blogs });
      } catch (error) {
        console.error("Error fetching blogs:", error);
        res
          .status(500)
          .json({ success: false, message: "Failed to fetch blogs" });
      }
    });

    app.get("/blogs/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid blog ID" });
      }

      try {
        const blog = await blogCollection.findOne({ _id: new ObjectId(id) });
        if (!blog) {
          return res
            .status(404)
            .json({ success: false, message: "Blog not found" });
        }
        res.json({ success: true, data: blog });
      } catch (error) {
        console.error("Error fetching blog by ID:", error);
        res
          .status(500)
          .json({ success: false, message: "Failed to fetch blog" });
      }
    });

    app.post("/blogs", async (req, res) => {
      try {
        const { title, content, author, tags, thumbnail, category } = req.body;

        if (!title || !content) {
          return res.status(400).json({
            success: false,
            message: "Title and content are required",
          });
        }

        const newBlog = {
          title,
          content,
          author: author || "Anonymous",
          tags: Array.isArray(tags) ? tags : [],
          thumbnail: thumbnail || "", // add this
          category: category || "", // add this
          createdAt: new Date(),
        };

        const result = await blogCollection.insertOne(newBlog);
        res.status(201).json({
          success: true,
          message: "Blog created",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Error adding blog:", error);
        res
          .status(500)
          .json({ success: false, message: "Failed to create blog" });
      }
    });

    // ========== TAGS ==========
    app.get("/tags", async (req, res) => {
      try {
        const tags = await tagCollection.find().sort({ name: 1 }).toArray();
        res.json(tags);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch tags" });
      }
    });

    app.post("/tags", async (req, res) => {
      const { name } = req.body;
      if (!name)
        return res.status(400).json({ message: "Tag name is required" });

      try {
        const result = await tagCollection.insertOne({
          name,
          createdAt: new Date(),
        });
        res.status(201).json({ success: true, insertedId: result.insertedId });
      } catch (err) {
        res.status(500).json({ message: "Failed to add tag" });
      }
    });

    // ========== CATEGORIES ==========
    app.get("/categories", async (req, res) => {
      try {
        const categories = await categoryCollection
          .find()
          .sort({ name: 1 })
          .toArray();
        res.json(categories);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch categories" });
      }
    });

    app.post("/categories", async (req, res) => {
      const { name } = req.body;
      if (!name)
        return res.status(400).json({ message: "Category name is required" });

      try {
        const result = await categoryCollection.insertOne({
          name,
          createdAt: new Date(),
        });
        res.status(201).json({ success: true, insertedId: result.insertedId });
      } catch (err) {
        res.status(500).json({ message: "Failed to add category" });
      }
    });

    app.post("/comments", async (req, res) => {
      try {
        const { blogId, username, content } = req.body;

        if (!blogId || !username || !content) {
          return res.status(400).json({
            success: false,
            message: "blogId, username, and content are required",
          });
        }

        const comment = {
          blogId: new ObjectId(blogId),
          username,
          content,
          createdAt: new Date(),
        };

        const result = await commentCollection.insertOne(comment);

        res.status(201).json({
          success: true,
          message: "Comment added",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Error adding comment:", error);
        res
          .status(500)
          .json({ success: false, message: "Failed to add comment" });
      }
    });

    app.get("/comments/:blogId", async (req, res) => {
      const { blogId } = req.params;

      if (!ObjectId.isValid(blogId)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid blog ID" });
      }

      try {
        const comments = await commentCollection
          .find({ blogId: new ObjectId(blogId) })
          .sort({ createdAt: -1 })
          .toArray();

        res.json({ success: true, data: comments });
      } catch (error) {
        console.error("Error fetching comments:", error);
        res
          .status(500)
          .json({ success: false, message: "Failed to fetch comments" });
      }
    });

    app.post("/comments/like", async (req, res) => {
      const { commentId, userId } = req.body;

      if (!commentId || !userId) {
        return res
          .status(400)
          .json({
            success: false,
            message: "commentId and userId are required",
          });
      }

      try {
        const existingLike = await commentLikeCollection.findOne({
          commentId,
          userId,
        });

        if (existingLike) {
          // Unlike
          await commentLikeCollection.deleteOne({ _id: existingLike._id });
          res.json({ success: true, liked: false, message: "Comment unliked" });
        } else {
          // Like
          await commentLikeCollection.insertOne({
            commentId,
            userId,
            createdAt: new Date(),
          });
          res.json({ success: true, liked: true, message: "Comment liked" });
        }
      } catch (err) {
        res
          .status(500)
          .json({ success: false, message: "Failed to like/unlike comment" });
      }
    });

    app.get("/comments/like-count/:commentId", async (req, res) => {
      const { commentId } = req.params;

      try {
        const count = await commentLikeCollection.countDocuments({ commentId });
        res.json({ success: true, count });
      } catch (err) {
        res
          .status(500)
          .json({ success: false, message: "Failed to get like count" });
      }
    });

    app.get("/comments/liked/:commentId", async (req, res) => {
      const { commentId } = req.params;
      const { userId } = req.query;

      if (!userId) {
        return res
          .status(400)
          .json({ success: false, message: "userId is required" });
      }

      try {
        const liked = await commentLikeCollection.findOne({
          commentId,
          userId,
        });
        res.json({ success: true, liked: !!liked });
      } catch (err) {
        res
          .status(500)
          .json({ success: false, message: "Failed to check like status" });
      }
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
