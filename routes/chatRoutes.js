const express = require("express");
const axios = require("axios");
const { ObjectId } = require("mongodb");
const router = express.Router();

/**
 * Get dynamic HTTP-Referer from request headers
 * @param {Object} req Express request object
 * @returns {string} HTTP-Referer URL
 */
function getDynamicReferer(req) {
  // Get referer from request headers
  const referer = req.get('Referer') || req.get('Origin');
  
  // Get host from request
  const host = req.get('Host');
  const protocol = req.secure ? 'https' : 'http';
  
  // Priority order: Referer -> Origin -> Constructed URL -> Wildcard
  if (referer) {
    return referer;
  }
  
  if (host) {
    return `${protocol}://${host}`;
  }
  
  // Fallback to wildcard for maximum compatibility
  return "*";
}

/**
 * Get AI Response with Dynamic Headers
 * @param {Array} history Chat history array
 * @param {string} mode 'moshiur' | 'general'
 * @param {Object} moshiurData JSON data for moshiur
 * @param {Object} req Express request object for dynamic headers
 */
async function getAiResponse(history, mode, moshiurData, req) {
  let systemMessage = "";
  let selectedModel = "qwen/qwen3-coder:free"; 

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
    selectedModel = "qwen/qwen3-coder:free";
  }

  const messages = [
    { role: "system", content: systemMessage },
    ...history.slice(-10).map((msg) => ({
      role: msg.from === "user" ? "user" : "assistant",
      content: msg.text,
    })),
  ];

  // Dynamic headers based on request
  const dynamicReferer = getDynamicReferer(req);
  const headers = {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "HTTP-Referer": dynamicReferer,
    "X-Title": "Moshiur Portfolio Chat",
  };

  // Add additional headers if available
  if (req.get('User-Agent')) {
    headers['User-Agent'] = req.get('User-Agent');
  }

  console.log(`🌐 Using HTTP-Referer: ${dynamicReferer}`);

  try {
    const aiResponse = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: selectedModel,
        messages,
        max_tokens: 1000,
        temperature: 0.7,
      },
      { headers }
    );

    let botReply = aiResponse.data?.choices?.[0]?.message?.content?.trim() || "";

    // Enhanced fallback logic for Moshiur mode
    if (
      mode === "moshiur" &&
      (botReply.toLowerCase().includes("not available") ||
        botReply.toLowerCase().includes("cannot answer") ||
        botReply.toLowerCase().includes("not in the json") ||
        botReply.toLowerCase().includes("don't have") ||
        botReply.toLowerCase().includes("unavailable") ||
        botReply.trim().length < 10)
    ) {
      console.log("🔄 Moshiur mode failed, trying fallback...");

      const generalMessages = [
        {
          role: "system",
          content: `
You are Gemini, a professional, friendly AI assistant.
Provide helpful and accurate responses to user queries.
Only use HTML anchor tags for links, never markdown syntax.
Answer in the same language as the user's question.
          `.trim(),
        },
        ...history.slice(-10).map((msg) => ({
          role: msg.from === "user" ? "user" : "assistant",
          content: msg.text,
        })),
      ];

      try {
        const fallback = await axios.post(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            model: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
            messages: generalMessages,
            max_tokens: 1000,
            temperature: 0.7,
          },
          { headers }
        );

        const fallbackReply = fallback.data?.choices?.[0]?.message?.content?.trim();
        if (fallbackReply && fallbackReply.length > 10) {
          botReply = fallbackReply;
          console.log("✅ Fallback response successful");
        }
      } catch (fallbackError) {
        console.error("❌ Fallback API Error:", fallbackError.response?.data || fallbackError.message);
      }
    }

    return botReply || "I'm sorry, I couldn't generate a response at the moment. Please try again.";
  } catch (err) {
    console.error("❌ AI API Error:", err.response?.data || err.message);

    // Enhanced error handling
    if (err.response?.status === 429) {
      throw new Error("API rate limit exceeded. Please wait a moment and try again.");
    }
    
    if (err.response?.status === 402 || err.response?.data?.error?.message?.includes("quota")) {
      throw new Error("API quota exceeded. Please try again later or upgrade your plan.");
    }
    
    if (err.response?.status === 401) {
      throw new Error("API authentication failed. Please check your credentials.");
    }
    
    if (err.response?.status >= 500) {
      throw new Error("Server temporarily unavailable. Please try again in a few moments.");
    }

    throw new Error("AI response generation failed. Please try again.");
  }
}

/**
 * Generate a short chat title using free model with dynamic headers
 */
async function generateChatTitle(userPrompt, req) {
  try {
    const dynamicReferer = getDynamicReferer(req);
    const headers = {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": dynamicReferer,
      "X-Title": "Moshiur Portfolio Chat",
    };

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "meta-llama/llama-3.1-8b-instruct:free",
        messages: [
          {
            role: "system",
            content: "Generate a very short title (3-5 words) for the conversation based on the user's message. Respond in the same language as the user's message.",
          },
          {
            role: "user",
            content: `Create a title for: "${userPrompt}"`,
          },
        ],
        max_tokens: 20,
        temperature: 0.5,
      },
      { headers }
    );

    const title = response.data?.choices?.[0]?.message?.content?.trim().replace(/["'.]/g, "") || "Untitled Chat";
    return title.length > 50 ? title.substring(0, 47) + "..." : title;
  } catch (error) {
    console.error("Title generation failed:", error.message);
    
    // Generate title based on user prompt if API fails
    const words = userPrompt.split(' ').slice(0, 3).join(' ');
    return words || `Chat ${new Date().toLocaleDateString()}`;
  }
}

/**
 * Middleware to log request details
 */
function logRequestDetails(req, res, next) {
  const referer = req.get('Referer') || 'No Referer';
  const origin = req.get('Origin') || 'No Origin';
  const host = req.get('Host') || 'No Host';
  const userAgent = req.get('User-Agent') || 'No User-Agent';
  
  console.log(`📋 Request Details:
    🌐 Host: ${host}
    📍 Origin: ${origin}
    🔗 Referer: ${referer}
    🖥️  User-Agent: ${userAgent.substring(0, 100)}...
    ⏰ Timestamp: ${new Date().toISOString()}
  `);
  
  next();
}

module.exports = (chatCollection, moshiurData) => {
  // Apply request logging middleware
  router.use(logRequestDetails);

  // GET all chats with enhanced filtering
  router.get("/chats", async (req, res) => {
    try {
      const { limit = 50, skip = 0, search } = req.query;
      
      let query = {};
      if (search) {
        query = {
          $or: [
            { title: { $regex: search, $options: 'i' } },
            { 'messages.text': { $regex: search, $options: 'i' } }
          ]
        };
      }

      const chats = await chatCollection
        .find(query, { 
          projection: { 
            _id: 1, 
            title: 1, 
            createdAt: 1,
            mode: 1,
            updatedAt: 1
          } 
        })
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .toArray();

      const totalCount = await chatCollection.countDocuments(query);
      
      res.json({
        chats,
        pagination: {
          total: totalCount,
          limit: parseInt(limit),
          skip: parseInt(skip),
          hasMore: (parseInt(skip) + parseInt(limit)) < totalCount
        }
      });
    } catch (error) {
      console.error("Fetch chats error:", error);
      res.status(500).json({ message: "Failed to fetch chat sessions" });
    }
  });

  // Create a new chat with enhanced validation
  router.post("/chats", async (req, res) => {
    const { message, mode } = req.body;
    
    if (!message || !mode) {
      return res.status(400).json({ message: "Message and mode are required" });
    }

    if (message.length > 1000) {
      return res.status(400).json({
        message: "Message too long. Please keep it under 1000 characters.",
      });
    }

    if (!['moshiur', 'general'].includes(mode)) {
      return res.status(400).json({
        message: "Invalid mode. Must be 'moshiur' or 'general'.",
      });
    }

    try {
      console.log(`🚀 Creating new chat in ${mode} mode`);
      
      const userMsg = { 
        from: "user", 
        text: message,
        timestamp: new Date()
      };
      
      const botReply = await getAiResponse([userMsg], mode, moshiurData, req);
      const chatTitle = await generateChatTitle(message, req);

      const newChat = {
        title: chatTitle,
        messages: [
          userMsg, 
          { 
            from: "bot", 
            text: botReply,
            timestamp: new Date()
          }
        ],
        mode: mode,
        createdAt: new Date(),
        updatedAt: new Date(),
        domain: getDynamicReferer(req), // Store the originating domain
      };

      const result = await chatCollection.insertOne(newChat);
      console.log(`✅ Chat created successfully with ID: ${result.insertedId}`);
      
      res.status(201).json({ ...newChat, _id: result.insertedId });
    } catch (err) {
      console.error("❌ Create chat error:", err);

      if (err.message.includes("quota") || err.message.includes("rate limit")) {
        return res.status(429).json({ message: err.message });
      }

      res.status(500).json({ message: "Failed to create chat. Please try again." });
    }
  });

  // Get chat by ID with enhanced error handling
  router.get("/chats/:id", async (req, res) => {
    const { id } = req.params;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Chat ID format" });
    }
    
    try {
      const chat = await chatCollection.findOne({ _id: new ObjectId(id) });
      
      if (!chat) {
        return res.status(404).json({ message: "Chat not found" });
      }
      
      // Update last accessed time
      await chatCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { lastAccessed: new Date() } }
      );
      
      res.json(chat);
    } catch (error) {
      console.error("Get chat error:", error);
      res.status(500).json({ message: "Failed to fetch chat" });
    }
  });

  // Add message to chat with enhanced features
  router.post("/chats/:id/messages", async (req, res) => {
    const { id } = req.params;
    const { message, mode } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Chat ID format" });
    }
    
    if (!message || !mode) {
      return res.status(400).json({ message: "Message and mode are required" });
    }

    if (message.length > 1000) {
      return res.status(400).json({
        message: "Message too long. Please keep it under 1000 characters.",
      });
    }

    try {
      const chat = await chatCollection.findOne({ _id: new ObjectId(id) });
      
      if (!chat) {
        return res.status(404).json({ message: "Chat not found" });
      }

      console.log(`💬 Adding message to chat ${id} in ${mode} mode`);

      const userMsg = { 
        from: "user", 
        text: message,
        timestamp: new Date()
      };
      
      const botReply = await getAiResponse([...chat.messages, userMsg], mode, moshiurData, req);

      const botMsg = {
        from: "bot",
        text: botReply,
        timestamp: new Date()
      };

      await chatCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $push: {
            messages: { $each: [userMsg, botMsg] },
          },
          $set: {
            updatedAt: new Date(),
            lastMode: mode, // Track the last used mode
          },
        }
      );

      console.log(`✅ Message added successfully to chat ${id}`);
      res.json({ answer: botReply });
    } catch (err) {
      console.error("❌ Add message error:", err);

      if (err.message.includes("quota") || err.message.includes("rate limit")) {
        return res.status(429).json({ message: err.message });
      }

      res.status(500).json({ message: "Failed to add message. Please try again." });
    }
  });

  // Delete chat with confirmation
  router.delete("/chats/:id", async (req, res) => {
    const { id } = req.params;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Chat ID format" });
    }

    try {
      const result = await chatCollection.deleteOne({ _id: new ObjectId(id) });
      
      if (result.deletedCount === 0) {
        return res.status(404).json({ message: "Chat not found" });
      }
      
      console.log(`🗑️ Chat ${id} deleted successfully`);
      res.json({ message: "Chat deleted successfully", deletedId: id });
    } catch (error) {
      console.error("Delete chat error:", error);
      res.status(500).json({ message: "Failed to delete chat" });
    }
  });

  // Bulk delete chats
  router.delete("/chats", async (req, res) => {
    const { chatIds } = req.body;
    
    if (!chatIds || !Array.isArray(chatIds) || chatIds.length === 0) {
      return res.status(400).json({ message: "Chat IDs array is required" });
    }

    // Validate all IDs
    const invalidIds = chatIds.filter(id => !ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({ 
        message: "Invalid Chat ID format", 
        invalidIds 
      });
    }

    try {
      const result = await chatCollection.deleteMany({ 
        _id: { $in: chatIds.map(id => new ObjectId(id)) } 
      });
      
      console.log(`🗑️ Bulk deleted ${result.deletedCount} chats`);
      res.json({ 
        message: `${result.deletedCount} chats deleted successfully`,
        deletedCount: result.deletedCount 
      });
    } catch (error) {
      console.error("Bulk delete chats error:", error);
      res.status(500).json({ message: "Failed to delete chats" });
    }
  });

  // Health check endpoint
  router.get("/health", (req, res) => {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      referer: getDynamicReferer(req),
      models: {
        primary: "qwen/qwen3-coder:free",
        fallback: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
        title: "meta-llama/llama-3.1-8b-instruct:free"
      }
    });
  });

  return router;
};