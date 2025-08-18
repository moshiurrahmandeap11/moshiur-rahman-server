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
  let selectedModel = "meta-llama/llama-3.1-8b-instruct:free"; // Free model for both modes

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
Provide helpful and accurate responses to user queries.
If you provide links, use HTML anchor tags only, never markdown link syntax.
    `.trim();
    // Use the same free model for consistency
    selectedModel = "meta-llama/llama-3.1-8b-instruct:free";
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
      { 
        model: selectedModel, 
        messages,
        max_tokens: 1000, // Add token limit to control costs
        temperature: 0.7
      },
      { 
        headers: { 
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "HTTP-Referer": "http://localhost:3000", // Add your domain
          "X-Title": "Moshiur Portfolio Chat" // Add app title
        } 
      }
    );

    let botReply = aiResponse.data?.choices?.[0]?.message?.content?.trim() || "";

    // If Moshiur mode can't answer, fallback to general mode
    if (
      mode === "moshiur" &&
      (
        botReply.toLowerCase().includes("not available") ||
        botReply.toLowerCase().includes("cannot answer") ||
        botReply.toLowerCase().includes("not in the json") ||
        botReply.trim().length < 10
      )
    ) {
      console.log("Moshiur mode failed, trying fallback...");
      
      const generalMessages = [
        { role: "system", content: `
You are Gemini, a professional, friendly AI assistant.
Provide helpful and accurate responses to user queries.
Only use HTML anchor tags for links, never markdown syntax.
        `.trim() },
        ...history.slice(-10).map(msg => ({
          role: msg.from === "user" ? "user" : "assistant",
          content: msg.text
        }))
      ];

      try {
        const fallback = await axios.post(
          "https://openrouter.ai/api/v1/chat/completions",
          { 
            model: "meta-llama/llama-3.1-8b-instruct:free", // Use free model for fallback too
            messages: generalMessages,
            max_tokens: 1000,
            temperature: 0.7
          },
          { 
            headers: { 
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
              "HTTP-Referer": "http://localhost:3000",
              "X-Title": "Moshiur Portfolio Chat"
            } 
          }
        );

        const fallbackReply = fallback.data?.choices?.[0]?.message?.content?.trim();
        if (fallbackReply && fallbackReply.length > 10) {
          botReply = fallbackReply;
        }
      } catch (fallbackError) {
        console.error("Fallback API Error:", fallbackError.response?.data || fallbackError.message);
        // Keep original reply if fallback fails
      }
    }

    return botReply || "I'm sorry, I couldn't generate a response at the moment. Please try again.";
  } catch (err) {
    console.error("AI API Error:", err.response?.data || err.message);
    
    // Check if it's a credit/quota error
    if (err.response?.status === 429 || err.response?.data?.error?.message?.includes('quota')) {
      throw new Error("API quota exceeded. Please try again later or upgrade your plan.");
    }
    
    throw new Error("AI response generation failed. Please try again.");
  }
}

/**
 * Generate a short chat title using free model
 */
async function generateChatTitle(userPrompt) {
  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "meta-llama/llama-3.1-8b-instruct:free", // Use free model
        messages: [
          {
            role: "system",
            content: "Generate a very short title (3-5 words) for the conversation based on the user's message."
          },
          {
            role: "user", 
            content: `Create a title for: "${userPrompt}"`
          }
        ],
        max_tokens: 20,
        temperature: 0.5
      },
      { 
        headers: { 
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Moshiur Portfolio Chat"
        } 
      }
    );
    
    const title = response.data?.choices?.[0]?.message?.content?.trim().replace(/["'.]/g, '') || "Untitled Chat";
    return title.length > 50 ? title.substring(0, 47) + "..." : title;
  } catch (error) {
    console.error("Title generation failed:", error.message);
    return `Chat ${new Date().toLocaleDateString()}`;
  }
}

module.exports = (chatCollection, moshiurData) => {
  // GET all chats
  router.get("/chats", async (req, res) => {
    try {
      const chats = await chatCollection
        .find({}, { projection: { _id: 1, title: 1, createdAt: 1 } })
        .sort({ createdAt: -1 })
        .limit(50) // Limit results to prevent large responses
        .toArray();
      res.json(chats);
    } catch (error) {
      console.error("Fetch chats error:", error);
      res.status(500).json({ message: "Failed to fetch chat sessions" });
    }
  });

  // Create a new chat
  router.post("/chats", async (req, res) => {
    const { message, mode } = req.body;
    if (!message || !mode) {
      return res.status(400).json({ message: "Message and mode are required" });
    }

    // Validate message length
    if (message.length > 1000) {
      return res.status(400).json({ message: "Message too long. Please keep it under 1000 characters." });
    }

    try {
      const userMsg = { from: "user", text: message };
      const botReply = await getAiResponse([userMsg], mode, moshiurData);
      const chatTitle = await generateChatTitle(message);

      const newChat = {
        title: chatTitle,
        messages: [userMsg, { from: "bot", text: botReply }],
        mode: mode, // Store the mode for reference
        createdAt: new Date()
      };

      const result = await chatCollection.insertOne(newChat);
      res.status(201).json({ ...newChat, _id: result.insertedId });
    } catch (err) {
      console.error("Create chat error:", err);
      
      if (err.message.includes('quota')) {
        return res.status(429).json({ message: err.message });
      }
      
      res.status(500).json({ message: "Failed to create chat. Please try again." });
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
    } catch (error) {
      console.error("Get chat error:", error);
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

    // Validate message length
    if (message.length > 1000) {
      return res.status(400).json({ message: "Message too long. Please keep it under 1000 characters." });
    }

    try {
      const chat = await chatCollection.findOne({ _id: new ObjectId(id) });
      if (!chat) return res.status(404).json({ message: "Chat not found" });

      const userMsg = { from: "user", text: message };
      const botReply = await getAiResponse([...chat.messages, userMsg], mode, moshiurData);

      await chatCollection.updateOne(
        { _id: new ObjectId(id) },
        { 
          $push: { 
            messages: { 
              $each: [userMsg, { from: "bot", text: botReply }] 
            } 
          },
          $set: { 
            updatedAt: new Date() 
          }
        }
      );

      res.json({ answer: botReply });
    } catch (err) {
      console.error("Add message error:", err);
      
      if (err.message.includes('quota')) {
        return res.status(429).json({ message: err.message });
      }
      
      res.status(500).json({ message: "Failed to add message. Please try again." });
    }
  });

  // Delete chat
  router.delete("/chats/:id", async (req, res) => {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Chat ID" });
    }
    
    try {
      const result = await chatCollection.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount === 0) {
        return res.status(404).json({ message: "Chat not found" });
      }
      res.json({ message: "Chat deleted successfully" });
    } catch (error) {
      console.error("Delete chat error:", error);
      res.status(500).json({ message: "Failed to delete chat" });
    }
  });

  return router;
};