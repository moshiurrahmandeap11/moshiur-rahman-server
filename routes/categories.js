const express = require("express");
const router = express.Router();

module.exports = (categoryCollection) => {
  router.get("/", async (req, res) => {
    try {
      const categories = await categoryCollection.find().sort({ name: 1 }).toArray();
      res.json(categories);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  router.post("/", async (req, res) => {
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

  return router;
};