const express = require("express");
const { ObjectId } = require("mongodb");
const router = express.Router();

module.exports = (loveCollection, blogCollection) => {
  router.get("/:blogId", async (req, res) => {
    const { blogId } = req.params;
    try {
      const count = await loveCollection.countDocuments({ blogId });
      res.json({ success: true, count });
    } catch (err) {
      res.status(500).json({ success: false, message: "Failed to get loves" });
    }
  });

  router.post("/", async (req, res) => {
    const { blogId, userId } = req.body;
    try {
      const blog = await blogCollection.findOne({ _id: new ObjectId(blogId) });
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
      res.status(500).send({ message: "Something went wrong" });
    }
  });

  router.get("/status/:blogId", async (req, res) => {
    const { blogId } = req.params;
    const { userId } = req.query;
    if (!blogId || !userId) {
      return res.status(400).json({ success: false, message: "Missing blogId or userId" });
    }
    try {
      const loved = await loveCollection.findOne({ blogId, userId });
      const count = await loveCollection.countDocuments({ blogId });
      res.json({ success: true, loved: !!loved, count });
    } catch (err) {
      res.status(500).json({ success: false, message: "Failed to fetch love status" });
    }
  });

  return router;
};