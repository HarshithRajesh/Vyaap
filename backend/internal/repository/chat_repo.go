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
	PushToQueue(ctx context.Context, chat *models.ChatRequest) error
}

type chatRepo struct {
	rds *config.Redis
}

func NewChatRepo(rds *config.Redis) ChatRepo {
	return &chatRepo{rds: rds}
}

func (c *chatRepo) PushToQueue(ctx context.Context, chat *models.ChatRequest) error {
	key := fmt.Sprintf("vyaap:queue:raw_chats:%s", chat.ChatName)

	for _, msg := range chat.Messages {
		data, _ := json.Marshal(msg)
		if err := c.rds.Client.RPush(ctx, key, data).Err(); err != nil {
			return err
		}
	}

	return c.rds.Client.Expire(ctx, key, 12*time.Hour).Err()
}
