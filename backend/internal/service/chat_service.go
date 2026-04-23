package service

import (
	"context"

	"github.com/HarshithRajesh/Vyaap/internal/models"
	"github.com/HarshithRajesh/Vyaap/internal/repository"
)

type ChatService interface {
	IngestChat(ctx context.Context, chat *models.ChatRequest, userID string) error
}

type chatService struct {
	repo repository.ChatRepo
}

func NewChatService(repo repository.ChatRepo) ChatService {
	return &chatService{repo: repo}
}

func (s *chatService) IngestChat(ctx context.Context, chat *models.ChatRequest, userID string) error {
	return s.repo.PushToQueue(ctx, chat, userID)
}
