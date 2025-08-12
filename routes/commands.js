const express = require("express");
const router = express.Router();

module.exports = (commandsCollection) => {
  router.post("/ai-command", async (req, res) => {
    const { command, response } = req.body;
    if (!command || !response) {
      return res.status(400).json({ success: false, message: "Command and response required" });
    }
    await commandsCollection.insertOne({ command, response, createdAt: new Date() });
    res.json({ success: true });
  });

  router.get("/ai-history", async (req, res) => {
    const history = await commandsCollection.find({}).sort({ createdAt: 1 }).toArray();
    res.json(history);
  });

  return router;
};