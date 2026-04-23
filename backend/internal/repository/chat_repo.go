package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/HarshithRajesh/Vyaap/internal/config"
	"github.com/HarshithRajesh/Vyaap/internal/models"
)

type ChatRepo interface {
	PushToQueue(ctx context.Context, chat *models.ChatRequest, userID string) error
	GetInvoices(ctx context.Context, userID string) ([]map[string]interface{}, error)
}

type chatRepo struct {
	rds *config.Redis
}

func NewChatRepo(rds *config.Redis) ChatRepo {
	return &chatRepo{rds: rds}
}

type QueuedMessage struct {
	UserID   string               `json:"userId"`
	ChatName string               `json:"chatName"`
	Messages []models.ChatMessage `json:"messages"`
	QueuedAt string               `json:"queuedAt"`
}

func (c *chatRepo) PushToQueue(ctx context.Context, chat *models.ChatRequest, userID string) error {

	key := fmt.Sprintf("vyaap:queue:raw_chats:%s:%s", userID, chat.ChatName)
	queuedMsg := QueuedMessage{
		UserID:   userID,
		ChatName: chat.ChatName,
		Messages: chat.Messages,
		QueuedAt: time.Now().Format(time.RFC3339),
	}
	data, _ := json.Marshal(queuedMsg)
	if err := c.rds.Client.RPush(ctx, key, data).Err(); err != nil {
		return err
	}

	return c.rds.Client.Expire(ctx, key, 12*time.Hour).Err()
}
func (c *chatRepo) GetInvoices(ctx context.Context, userID string) ([]map[string]interface{}, error) {
	key := fmt.Sprintf("vyaap:invoices:%s", userID)

	invoices := []map[string]interface{}{}
	results, err := c.rds.Client.LRange(ctx, key, 0, -1).Result()
	if err != nil {
		return invoices, err
	}

	for _, result := range results {
		var invoice map[string]interface{}
		if err := json.Unmarshal([]byte(result), &invoice); err != nil {
			continue
		}
		invoices = append(invoices, invoice)
	}

	return invoices, nil
}
