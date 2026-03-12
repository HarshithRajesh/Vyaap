// Package service for authentication
package service

import (
	"context"
	"errors"
	"strconv"

	"github.com/HarshithRajesh/Vyaap/internal/config"
	"github.com/HarshithRajesh/Vyaap/internal/domain"
	"github.com/HarshithRajesh/Vyaap/internal/middleware"
	"github.com/HarshithRajesh/Vyaap/internal/models"
	"github.com/HarshithRajesh/Vyaap/internal/repository"
)

type UserService interface {
	SignUp(user *models.User) error
	Login(ctx context.Context, user *models.Login) (*middleware.Tokens, error)
}

type userService struct {
	repo repository.UserRepository
	rds  *config.Redis
}

func NewUserService(repo repository.UserRepository, rds *config.Redis) UserService {
	return &userService{
		repo: repo,
		rds:  rds,
	}
}

func (s *userService) SignUp(user *models.User) error {
	if user.ConfirmPassword != user.Password {
		return errors.New("password is not matching")
	}
	existinguser, err := s.repo.GetUser(user.Email)
	if err != nil {
		return err
	}
	if existinguser != nil {
		return errors.New("user exists")
	}
	user.Password, err = domain.HashPassword(user.Password)
	if err != nil {
		return err
	}
	err = s.repo.CreateUser(user)
	if err != nil {
		return err
	}
	return nil
}

func (s *userService) Login(ctx context.Context, user *models.Login) (*middleware.Tokens, error) {
	var existinguser *models.User
	existinguser, err := s.repo.GetUser(user.Email)
	if err != nil {
		return nil, err
	}
	if existinguser == nil {
		return nil, errors.New("user doesnt exist")
	}
	if !domain.CheckPasswordHash(user.Password, existinguser.Password) {
		return nil, err
	}
	userID := strconv.FormatUint(uint64(existinguser.ID), 10)
	token, err := middleware.IssueTokens(userID)
	if err != nil {
		return nil, err
	}
	if err := middleware.Persist(ctx, s.rds, token); err != nil {
		return nil, err
	}
	return token, nil
}
