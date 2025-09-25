router.post("/api/chat", async (req, res) => {
  try {
    const { message, conversationId, includeContext = true } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Create conversation if it doesn't exist
    let conversation;
    if (conversationId) {
      conversation = await storage.getConversation(conversationId);
    }
    
    if (!conversation) {
      conversation = await storage.createConversation({
        title: message.substring(0, 50) + (message.length > 50 ? "..." : ""),
      });
    }

    // Save user message
    await storage.createMessage({
      conversationId: conversation.id,
      content: message,
      role: "user",
    });

    // Get conversation history
    const history = await storage.getMessagesByConversation(conversation.id);
    
    // Get file context if requested
    let fileContext = "";
    if (includeContext) {
      const files = await storage.getAllFiles();
      const relevantFiles = files.filter((f: UploadedFile) => f.extractedText && f.extractedText.length > 0);
      
      console.log(`DEBUG: Found ${files.length} total files, ${relevantFiles.length} with extracted text`);
      
      if (relevantFiles.length > 0) {
        fileContext = relevantFiles
          .map((f: UploadedFile) => `=== ${f.originalName} ===\n${f.extractedText}`)
          .join('\n\n');
        console.log(`DEBUG: File context length: ${fileContext.length} characters`);
      }
    }

    // Generate AI response using the OpenAI service
    const { generateChatResponse } = await import("./services/openai");
    const aiResponse = await generateChatResponse(message, history, fileContext);
    
    // Save assistant message
    const assistantMessage = await storage.createMessage({
      conversationId: conversation.id,
      content: aiResponse,
      role: "assistant",
    });

    res.json({
      response: aiResponse,
      conversationId: conversation.id,
      messageId: assistantMessage.id,
    });
  } catch (error) {
    console.error("Chat error details:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : "No stack",
      conversationId: req.body.conversationId,
      userMessage: req.body.message,
      fileContextLength: fileContext.length
    });
    res.status(500).json({ error: "Failed to process chat message" });
  }
});
