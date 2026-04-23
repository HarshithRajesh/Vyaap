package handler

import (
	"net/http"

	"github.com/HarshithRajesh/Vyaap/internal/models"
	"github.com/HarshithRajesh/Vyaap/internal/service"
	"github.com/gin-gonic/gin"
)

type ChatHandler struct {
	chatService service.ChatService
}

func NewChatHandler(chatService service.ChatService) *ChatHandler {
	return &ChatHandler{chatService: chatService}
}

func (h *ChatHandler) Ingest(c *gin.Context) {
	var req *models.ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	if err := h.chatService.IngestChat(c.Request.Context(), req, userID.(string)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to buffer chat"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Chat successfully queued for AI processing", "userID": userID})
}
