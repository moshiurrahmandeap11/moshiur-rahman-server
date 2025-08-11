const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const multer = require("multer");
const path = require("path");
const axios = require("axios");
const moshiurData = require('../../Portfolio/moshiur-rahman-server/public/moshiur.json'); 


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
    const commandsCollection = db.collection("commands");


    // Store command and response
app.post("/ai-command", async (req, res) => {
  const { command, response } = req.body;
  if (!command || !response) {
    return res.status(400).json({ success: false, message: "Command and response required" });
  }
  await commandsCollection.insertOne({ command, response, createdAt: new Date() });
  res.json({ success: true });
});
    

// Get all previous commands
app.get("/ai-history", async (req, res) => {
  const history = await commandsCollection.find({}).sort({ createdAt: 1 }).toArray();
  res.json(history);
});




// AI answer endpoint (with context) using OpenRouter
app.post("/ai-answer", async (req, res) => {
  // command এর সাথে mode টিও নিন
  const { command, mode } = req.body;
  if (!command || !mode) {
    return res.status(400).json({ success: false, message: "Command and mode required" });
  }

  // Get previous commands for context
  const history = await commandsCollection.find({}).sort({ createdAt: 1 }).toArray();
  const lastHistory = history.slice(-10); // শেষ ১০টি বার্তার কনটেক্সট

  const messages = [];
  let systemMessage = "";

  // মোড অনুযায়ী সিস্টেম মেসেজ সেট করুন
  if (mode === 'moshiur') {
    // moshiurData.json ফাইলটি এখানে require করে নিতে হবে
    // const moshiurData = require('./path/to/moshiur.json');
    systemMessage = `You are a helpful AI assistant who ONLY answers questions based on this JSON data about Moshiur Rahman:\n${JSON.stringify(moshiurData, null, 2)}\nIf asked about anything else, politely say you only answer questions about Moshiur Rahman.`;
    messages.push({ role: "system", content: systemMessage });
  } else { // General Mode
    systemMessage = "You are a friendly and helpful AI assistant named Gemini. Your goal is to have natural, flowing conversations. Be empathetic, use personality, and remember the context of the conversation to provide relevant and engaging responses. Avoid being overly formal or robotic.";
    messages.push({ role: "system", content: systemMessage });
  }

  // Properly format history messages
  lastHistory.forEach(item => {
    messages.push({ role: "user", content: item.command });
    messages.push({ role: "assistant", content: item.response });
  });

  // Add the current user command
  messages.push({ role: "user", content: command });

  // Call OpenRouter API
  try {
    const aiResponse = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-3.5-turbo", // gpt-3.5-turbo conversational কাজের জন্য ভালো
        messages
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const answer = aiResponse.data.choices[0].message.content.trim();

    // Store new command and answer
    await commandsCollection.insertOne({ command, response: answer, createdAt: new Date() });

    res.json({ answer }); // ফ্রন্টএন্ডে শুধু উত্তরটি পাঠান
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ success: false, message: "AI API error" });
  }
});





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

    // DELETE a review by ID
app.delete("/reviews/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await reviewCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 1) {
      res.send({ success: true, message: "Review deleted successfully" });
    } else {
      res.status(404).send({ success: false, message: "Review not found" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false, message: "Failed to delete review" });
  }
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


app.put("/blogs/:id", async (req, res) => {
  const { id } = req.params;
  const { title, content, author, tags, thumbnail, category } = req.body;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "Invalid blog ID" });
  }

  if (!title || !content) {
    return res.status(400).json({
      success: false,
      message: "Title and content are required",
    });
  }

  try {
    const updatedBlog = {
      title,
      content,
      author: author || "Anonymous",
      tags: Array.isArray(tags) ? tags : [],
      thumbnail: thumbnail || "",
      category: category || "",
      updatedAt: new Date(),
    };

    const result = await blogCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedBlog }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Blog not found" });
    }

    res.json({ success: true, message: "Blog updated successfully" });
  } catch (error) {
    console.error("Error updating blog:", error);
    res.status(500).json({ success: false, message: "Failed to update blog" });
  }
});


    app.delete("/blogs/:id", async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "Invalid blog ID" });
  }

  try {
    const result = await blogCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: "Blog not found" });
    }

    res.json({ success: true, message: "Blog deleted successfully" });
  } catch (error) {
    console.error("Error deleting blog:", error);
    res.status(500).json({ success: false, message: "Failed to delete blog" });
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
