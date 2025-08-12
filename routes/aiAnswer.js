const express = require("express");
const axios = require("axios");
const router = express.Router();

module.exports = (commandsCollection, moshiurData) => {
  router.post("/ai-answer", async (req, res) => {
    const { command, mode } = req.body;
    if (!command || !mode) {
      return res.status(400).json({ success: false, message: "Command and mode required" });
    }
    const history = await commandsCollection.find({}).sort({ createdAt: 1 }).toArray();
    const lastHistory = history.slice(-10);
    const messages = [];
    let systemMessage = "";
    if (mode === 'moshiur') {
      systemMessage = `You are a helpful AI assistant who ONLY answers questions based on this JSON data about Moshiur Rahman:\n${JSON.stringify(moshiurData, null, 2)}\nIf asked about anything else, politely say you only answer questions about Moshiur Rahman.`;
      messages.push({ role: "system", content: systemMessage });
    } else {
      systemMessage = "You are a friendly and helpful AI assistant named Gemini. Your goal is to have natural, flowing conversations. Be empathetic, use personality, and remember the context of the conversation to provide relevant and engaging responses. Avoid being overly formal or robotic.";
      messages.push({ role: "system", content: systemMessage });
    }
    lastHistory.forEach(item => {
      messages.push({ role: "user", content: item.command });
      messages.push({ role: "assistant", content: item.response });
    });
    messages.push({ role: "user", content: command });
    try {
      const aiResponse = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "openai/gpt-3.5-turbo",
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
      await commandsCollection.insertOne({ command, response: answer, createdAt: new Date() });
      res.json({ answer });
    } catch (err) {
      res.status(500).json({ success: false, message: "AI API error" });
    }
  });

  return router;
};