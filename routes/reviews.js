const express = require("express");
const { ObjectId } = require("mongodb");
const router = express.Router();

module.exports = (reviewCollection) => {
  router.get("/", async (req, res) => {
    const result = await reviewCollection.find().toArray();
    res.send(result);
  });

  router.post("/", async (req, res) => {
    const review = req.body;
    review.createdAt = new Date();
    const result = await reviewCollection.insertOne(review);
    res.send(result);
  });

  router.get("/stats", async (req, res) => {
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

  router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const result = await reviewCollection.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount === 1) {
        res.send({ success: true, message: "Review deleted successfully" });
      } else {
        res.status(404).send({ success: false, message: "Review not found" });
      }
    } catch (err) {
      res.status(500).send({ success: false, message: "Failed to delete review" });
    }
  });

  return router;
};