// Package models is used to define user models
package models

type User struct {
	ID              uint   `gorm:"primaryKey;autoIncrement" json:"id"`
	Name            string `gorm:"size:100;not null"        json:"name"`
	Email           string `gorm:"unique;not null"          json:"email"`
	Password        string `gorm:"not null"                 json:"password"`
	ConfirmPassword string `gorm:"not null"                 json:"confirmPassword"`
}

type Login struct {
	Email    string
	Password string
}
