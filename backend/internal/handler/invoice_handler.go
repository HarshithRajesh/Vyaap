package handler

import (
	"net/http"

	"github.com/HarshithRajesh/Vyaap/internal/repository"
	"github.com/gin-gonic/gin"
)

type InvoiceHandler struct {
	chatrepo repository.ChatRepo
}

func NewInvoiceHandler(chatrepo repository.ChatRepo) *InvoiceHandler {
	return &InvoiceHandler{chatrepo: chatrepo}
}

// ✅ get invoices for authenticated user
func (h *InvoiceHandler) GetUserInvoices(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	invoices, err := h.chatrepo.GetInvoices(c.Request.Context(), userID.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to retrieve invoices"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"userID":   userID,
		"invoices": invoices,
		"count":    len(invoices),
	})
}
