package main

import (
	"log"

	"github.com/HarshithRajesh/Vyaap/internal/config"
	"github.com/HarshithRajesh/Vyaap/internal/handler"
	"github.com/HarshithRajesh/Vyaap/internal/middleware"
	"github.com/HarshithRajesh/Vyaap/internal/repository"
	"github.com/HarshithRajesh/Vyaap/internal/service"
	"github.com/gin-gonic/gin"
)

func main() {
	gin.SetMode(gin.DebugMode)

	rds := config.NewRedis()

	db, _ := config.ConnectDB()
	userRepo := repository.NewUserRepository(db)
	userService := service.NewUserService(userRepo, rds)
	userHandler := handler.NewUserHandler(userService, rds)

	router := gin.Default()

	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"ping": "backend is alive"})
	})
	r := gin.Default()

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"ping": "backend is alive"})
	})

	r.POST("/signup", userHandler.SignUp)
	r.POST("/login", userHandler.Login)

	protected := r.Group("/")
	protected.Use(middleware.AuthMiddleware(rds))
	{
		protected.GET("/logout", userHandler.Logout)
	}

	err := r.Run()
	if err != nil {
		log.Fatal(err)
	}
}
