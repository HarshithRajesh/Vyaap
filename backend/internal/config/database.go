package config

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"github.com/redis/go-redis/v9"
)

type Redis struct {
	Client *redis.Client
}

func init() {
	err := godotenv.Load()
	if err != nil {
		fmt.Errorf("No .env file is found")
	}
}

func ConnectDB() (*gorm.DB, error) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		return nil, fmt.Errorf("Database url is empty")
	}
	db, err := gorm.Open(postgres.New(postgres.Config{
		DSN:                  dsn,
		PreferSimpleProtocol: true, // This is the CRITICAL line for Supabase
	}), &gorm.Config{
		PrepareStmt: false, // Also keep this false as a backup
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to the database %v", err)
	}
	fmt.Println("Database connect to GORM!!!")

	// if err := db.AutoMigrate(&models.User{}); err != nil {
	// 	log.Fatalf("Failed to migrate database: %v", err)
	// }
	return db, nil
}

func NewRedis() *Redis {
	addr := os.Getenv("REDDIS_ADDR")
	if addr == "" {
		addr = "localhost:6379"
	}

	rdb := redis.NewClient(&redis.Options{Addr: addr})
	return &Redis{Client: rdb}
}

func (r *Redis) SetJTI(ctx context.Context, key, userID string, exp time.Time) error {
	return r.Client.Set(ctx, key, userID, time.Until(exp)).Err()
}

func (r *Redis) DelJTI(ctx context.Context, key string) error {
	return r.Client.Del(ctx, key).Err()
}

func (r *Redis) GetUserByJTI(ctx context.Context, key string) (string, error) {
	return r.Client.Get(ctx, key).Result()
}
