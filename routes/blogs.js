const express = require("express");
const { ObjectId } = require("mongodb");
const router = express.Router();

module.exports = (blogCollection) => {
  router.get("/", async (req, res) => {
    try {
      const blogs = await blogCollection.find().sort({ createdAt: -1 }).toArray();
      res.json({ success: true, data: blogs });
    } catch (error) {
      res.status(500).json({ success: false, message: "Failed to fetch blogs" });
    }
  });

  router.get("/:id", async (req, res) => {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid blog ID" });
    }
    try {
      const blog = await blogCollection.findOne({ _id: new ObjectId(id) });
      if (!blog) return res.status(404).json({ success: false, message: "Blog not found" });
      res.json({ success: true, data: blog });
    } catch (error) {
      res.status(500).json({ success: false, message: "Failed to fetch blog" });
    }
  });

  router.post("/", async (req, res) => {
    try {
      const { title, content, author, tags, thumbnail, category } = req.body;
      if (!title || !content) {
        return res.status(400).json({ success: false, message: "Title and content are required" });
      }
      const newBlog = {
        title,
        content,
        author: author || "Anonymous",
        tags: Array.isArray(tags) ? tags : [],
        thumbnail: thumbnail || "",
        category: category || "",
        createdAt: new Date(),
      };
      const result = await blogCollection.insertOne(newBlog);
      res.status(201).json({ success: true, message: "Blog created", insertedId: result.insertedId });
    } catch (error) {
      res.status(500).json({ success: false, message: "Failed to create blog" });
    }
  });

  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { title, content, author, tags, thumbnail, category } = req.body;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid blog ID" });
    }
    if (!title || !content) {
      return res.status(400).json({ success: false, message: "Title and content are required" });
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
      res.status(500).json({ success: false, message: "Failed to update blog" });
    }
  });

  router.delete("/:id", async (req, res) => {
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
      res.status(500).json({ success: false, message: "Failed to delete blog" });
    }
  });

  return router;
};