const express = require("express");
const { ObjectId } = require("mongodb");
const router = express.Router();

module.exports = (commentCollection, commentLikeCollection) => {
  router.post("/", async (req, res) => {
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
      res.status(500).json({ success: false, message: "Failed to add comment" });
    }
  });

  router.get("/:blogId", async (req, res) => {
    const { blogId } = req.params;
    if (!ObjectId.isValid(blogId)) {
      return res.status(400).json({ success: false, message: "Invalid blog ID" });
    }
    try {
      const comments = await commentCollection
        .find({ blogId: new ObjectId(blogId) })
        .sort({ createdAt: -1 })
        .toArray();
      res.json({ success: true, data: comments });
    } catch (error) {
      res.status(500).json({ success: false, message: "Failed to fetch comments" });
    }
  });

  router.post("/like", async (req, res) => {
    const { commentId, userId } = req.body;
    if (!commentId || !userId) {
      return res.status(400).json({ success: false, message: "commentId and userId are required" });
    }
    try {
      const existingLike = await commentLikeCollection.findOne({ commentId, userId });
      if (existingLike) {
        await commentLikeCollection.deleteOne({ _id: existingLike._id });
        res.json({ success: true, liked: false, message: "Comment unliked" });
      } else {
        await commentLikeCollection.insertOne({ commentId, userId, createdAt: new Date() });
        res.json({ success: true, liked: true, message: "Comment liked" });
      }
    } catch (err) {
      res.status(500).json({ success: false, message: "Failed to like/unlike comment" });
    }
  });

  router.get("/like-count/:commentId", async (req, res) => {
    const { commentId } = req.params;
    try {
      const count = await commentLikeCollection.countDocuments({ commentId });
      res.json({ success: true, count });
    } catch (err) {
      res.status(500).json({ success: false, message: "Failed to get like count" });
    }
  });

  router.get("/liked/:commentId", async (req, res) => {
    const { commentId } = req.params;
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, message: "userId is required" });
    }
    try {
      const liked = await commentLikeCollection.findOne({ commentId, userId });
      res.json({ success: true, liked: !!liked });
    } catch (err) {
      res.status(500).json({ success: false, message: "Failed to check like status" });
    }
  });

  return router;
};