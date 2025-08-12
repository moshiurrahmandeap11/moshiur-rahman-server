const express = require("express");
const router = express.Router();

module.exports = (tagCollection) => {
  router.get("/", async (req, res) => {
    try {
      const tags = await tagCollection.find().sort({ name: 1 }).toArray();
      res.json(tags);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch tags" });
    }
  });

  router.post("/", async (req, res) => {
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

  return router;
};