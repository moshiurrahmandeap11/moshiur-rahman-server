const express = require("express");
const axios = require("axios");
const { ObjectId } = require("mongodb");
const router = express.Router();

// Helper function to get AI response
async function getAiResponse(history, mode, moshiurData) {
  const messages = [];
  let systemMessage = "";

  if (mode === 'moshiur') {
    systemMessage = `You are a helpful AI assistant for Moshiur Rahman's portfolio. ONLY answer questions based on this JSON data:\n${JSON.stringify(moshiurData, null, 2)}\nIf asked anything else, politely say you can only answer questions about Moshiur Rahman.`;
  } else {
    systemMessage = "You are Gemini, a friendly and helpful AI assistant. Be natural, empathetic, and remember the conversation's context.";
  }
  messages.push({ role: "system", content: systemMessage });

  // Format the last 10 messages for context
  history.slice(-10).forEach(item => {
    messages.push({ role: item.from === 'user' ? 'user' : 'assistant', content: item.text });
  });

  const aiResponse = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    { model: "openai/gpt-3.5-turbo", messages },
    { headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}` } }
  );
  return aiResponse.data.choices[0].message.content.trim();
}

// Helper function to generate a title for the chat
async function generateChatTitle(userPrompt) {
    const prompt = `Create a very short, concise title (3-5 words max) for a conversation starting with this user prompt: "${userPrompt}". Just give the title, nothing else.`;
    try {
        const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                model: "openai/gpt-3.5-turbo-instruct", // Good for short, direct tasks
                prompt: prompt,
                max_tokens: 15,
            },
            { headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}` } }
        );
        return response.data.choices[0].text.trim().replace(/["'.]/g, '');
    } catch (error) {
        console.error("Title generation failed, using default.");
        return "Untitled Chat";
    }
}


module.exports = (chatCollection, moshiurData) => {
  // GET /api/chats - Fetch all chat sessions for the history menu
  router.get("/chats", async (req, res) => {
    try {
      const chats = await chatCollection
        .find({}, { projection: { _id: 1, title: 1, createdAt: 1 } })
        .sort({ createdAt: -1 })
        .toArray();
      res.json(chats);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch chat sessions" });
    }
  });

  // POST /api/chats - Start a new chat session
  router.post("/chats", async (req, res) => {
    const { message, mode } = req.body;
    if (!message || !mode) {
      return res.status(400).json({ message: "Message and mode are required" });
    }

    const userMessage = { from: "user", text: message };

    try {
      const botReplyText = await getAiResponse([userMessage], mode, moshiurData);
      const botMessage = { from: "bot", text: botReplyText };
      const chatTitle = await generateChatTitle(message);

      const newChat = {
        title: chatTitle,
        messages: [userMessage, botMessage],
        createdAt: new Date(),
      };

      const result = await chatCollection.insertOne(newChat);
      res.status(201).json({ ...newChat, _id: result.insertedId });
    } catch (err) {
      console.error("AI API Error in new chat:", err.response?.data || err.message);
      res.status(500).json({ message: "Failed to create new chat" });
    }
  });

  // GET /api/chats/:id - Load all messages for a specific chat
  router.get("/chats/:id", async (req, res) => {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Chat ID" });
    }
    try {
      const chat = await chatCollection.findOne({ _id: new ObjectId(id) });
      if (!chat) return res.status(404).json({ message: "Chat not found" });
      res.json(chat);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch chat details" });
    }
  });

  // POST /api/chats/:id/messages - Add a new message to an existing chat
  router.post("/chats/:id/messages", async (req, res) => {
    const { id } = req.params;
    const { message, mode } = req.body;

    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid Chat ID" });
    if (!message || !mode) return res.status(400).json({ message: "Message and mode are required" });

    try {
      const chat = await chatCollection.findOne({ _id: new ObjectId(id) });
      if (!chat) return res.status(404).json({ message: "Chat not found" });

      const userMessage = { from: "user", text: message };
      const botReplyText = await getAiResponse([...chat.messages, userMessage], mode, moshiurData);
      const botMessage = { from: "bot", text: botReplyText };

      await chatCollection.updateOne(
        { _id: new ObjectId(id) },
        { $push: { messages: { $each: [userMessage, botMessage] } } }
      );

      res.json({ answer: botReplyText });
    } catch (err) {
      console.error("AI API Error in existing chat:", err.response?.data || err.message);
      res.status(500).json({ message: "Failed to add message" });
    }
  });

  return router;
};