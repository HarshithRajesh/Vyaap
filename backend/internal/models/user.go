// Package models is used to define user models
package models

type User struct {
	ID              uint   `gorm:"primaryKey;autoIncrement"`
	Name            string `gorm:"size:100;not null"`
	Email           string `gorm:"unique;not null"`
	Password        string `gorm:"not null"`
	ConfirmPassword string `gorm:"not null"`
}

type Login struct {
	Email    string
	Password string
}
