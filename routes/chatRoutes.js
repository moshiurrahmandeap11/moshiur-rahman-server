const express = require("express");
const axios = require("axios");
const { ObjectId } = require("mongodb");
const router = express.Router();

/**
 * Get AI Response
 * @param {Array} history Chat history array
 * @param {string} mode 'moshiur' | 'general'
 * @param {Object} moshiurData JSON data for moshiur
 */
async function getAiResponse(history, mode, moshiurData) {
  let systemMessage = "";
  let selectedModel = "openai/gpt-4o-mini";

  if (mode === "moshiur") {
    systemMessage = `
You are a professional AI assistant for Moshiur Rahman's portfolio.
You ONLY answer from the provided JSON data. 
Do not invent or assume any information outside the JSON.
If the requested info does not exist in the JSON, politely say it's not available
and suggest the user try general mode.
If a link exists in JSON, return it exactly as:
<a href="https://example.com" target="_blank" rel="noopener noreferrer" style="color: orange !important;">Example Link</a>

Never use markdown link syntax.

JSON Data:
${JSON.stringify(moshiurData, null, 2)}
    `.trim();
  } else {
    systemMessage = `
You are Gemini, a professional, friendly AI assistant.
Use internet search if needed to provide the most accurate and real-time information.
If you provide links, use HTML anchor tags only, never markdown link syntax.
    `.trim();
    selectedModel = "z-ai/glm-4.5-air:free";
  }

  const messages = [
    { role: "system", content: systemMessage },
    ...history.slice(-10).map(msg => ({
      role: msg.from === "user" ? "user" : "assistant",
      content: msg.text
    }))
  ];

  try {
    const aiResponse = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      { model: selectedModel, messages },
      { headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } }
    );

    let botReply = aiResponse.data?.choices?.[0]?.message?.content?.trim() || "";

    // If Moshiur mode can't answer, fallback to general mode
    if (
      mode === "moshiur" &&
      (
        botReply.toLowerCase().includes("not available") ||
        botReply.toLowerCase().includes("cannot answer")
      )
    ) {
      const generalMessages = [
        { role: "system", content: `
You are Gemini, a professional, friendly AI assistant.
Use internet search if needed to provide accurate, real-time answers.
Only use HTML anchor tags for links, never markdown syntax.
        `.trim() },
        ...history.slice(-10).map(msg => ({
          role: msg.from === "user" ? "user" : "assistant",
          content: msg.text
        }))
      ];

      const fallback = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        { model: "openai/gpt-4o-mini:online", messages: generalMessages },
        { headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } }
      );

      botReply = fallback.data?.choices?.[0]?.message?.content?.trim() || botReply;
    }

    return botReply;
  } catch (err) {
    console.error("AI API Error:", err.response?.data || err.message);
    throw new Error("AI response generation failed");
  }
}

/**
 * Generate a short chat title
 */
async function generateChatTitle(userPrompt) {
  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-3.5-turbo-instruct",
        prompt: `Create a concise (3-5 words) title for this conversation: "${userPrompt}"`,
        max_tokens: 15
      },
      { headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } }
    );
    return response.data?.choices?.[0]?.text?.trim().replace(/["'.]/g, '') || "Untitled Chat";
  } catch (error) {
    console.error("Title generation failed:", error.message);
    return "Untitled Chat";
  }
}

module.exports = (chatCollection, moshiurData) => {
  // GET all chats
  router.get("/chats", async (req, res) => {
    try {
      const chats = await chatCollection
        .find({}, { projection: { _id: 1, title: 1, createdAt: 1 } })
        .sort({ createdAt: -1 })
        .toArray();
      res.json(chats);
    } catch {
      res.status(500).json({ message: "Failed to fetch chat sessions" });
    }
  });

  // Create a new chat
  router.post("/chats", async (req, res) => {
    const { message, mode } = req.body;
    if (!message || !mode) {
      return res.status(400).json({ message: "Message and mode are required" });
    }

    try {
      const userMsg = { from: "user", text: message };
      const botReply = await getAiResponse([userMsg], mode, moshiurData);
      const chatTitle = await generateChatTitle(message);

      const newChat = {
        title: chatTitle,
        messages: [userMsg, { from: "bot", text: botReply }],
        createdAt: new Date()
      };

      const result = await chatCollection.insertOne(newChat);
      res.status(201).json({ ...newChat, _id: result.insertedId });
    } catch (err) {
      res.status(500).json({ message: "Failed to create chat" });
    }
  });

  // Get chat by ID
  router.get("/chats/:id", async (req, res) => {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Chat ID" });
    }
    try {
      const chat = await chatCollection.findOne({ _id: new ObjectId(id) });
      if (!chat) return res.status(404).json({ message: "Chat not found" });
      res.json(chat);
    } catch {
      res.status(500).json({ message: "Failed to fetch chat" });
    }
  });

  // Add message to chat
  router.post("/chats/:id/messages", async (req, res) => {
    const { id } = req.params;
    const { message, mode } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Chat ID" });
    }
    if (!message || !mode) {
      return res.status(400).json({ message: "Message and mode are required" });
    }

    try {
      const chat = await chatCollection.findOne({ _id: new ObjectId(id) });
      if (!chat) return res.status(404).json({ message: "Chat not found" });

      const userMsg = { from: "user", text: message };
      const botReply = await getAiResponse([...chat.messages, userMsg], mode, moshiurData);

      await chatCollection.updateOne(
        { _id: new ObjectId(id) },
        { $push: { messages: { $each: [userMsg, { from: "bot", text: botReply }] } } }
      );

      res.json({ answer: botReply });
    } catch {
      res.status(500).json({ message: "Failed to add message" });
    }
  });

  return router;
};
