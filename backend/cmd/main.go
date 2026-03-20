package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

type MessagePayload struct {
	ChatName string        `json:"chatName"`
	Messages []interface{} `json:"messages"`
}

func main() {
	gin.SetMode(gin.DebugMode)

	// rds := config.NewRedis()
	//
	// db, _ := config.ConnectDB()
	// userRepo := repository.NewUserRepository(db)
	// userService := service.NewUserService(userRepo, rds)
	// userHandler := handler.NewUserHandler(userService, rds)
	//
	router := gin.Default()
	router.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})
	router.POST("/ingest", func(c *gin.Context) {
		var payload MessagePayload
		if err := c.ShouldBindJSON(&payload); err != nil {
			fmt.Println("❌ JSON Binding Error:", err)
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}

		fmt.Printf("\n✅ [Vyaap Core] Received from: %s\n", payload.ChatName)
		fmt.Printf("📝 Messages (%d): %v\n", len(payload.Messages), payload.Messages)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "Go Core Received the data!",
		})
	})

	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"ping": "backend is alive"})
	})
	// r := gin.Default()
	//
	// r.GET("/health", func(c *gin.Context) {
	// 	c.JSON(200, gin.H{"ping": "backend is alive"})
	// })
	//
	// r.POST("/signup", userHandler.SignUp)
	// r.POST("/login", userHandler.Login)
	//
	// protected := r.Group("/")
	// protected.Use(middleware.AuthMiddleware(rds))
	// {
	// 	protected.GET("/logout", userHandler.Logout)
	// }

	err := router.Run()
	if err != nil {
		log.Fatal(err)
	}
}
