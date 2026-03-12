// Package middleware for JWT authentication
package middleware

import (
	"context"
	"errors"
	"net/http"
	"os"
	"time"

	"github.com/HarshithRajesh/Vyaap/internal/config"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type Tokens struct {
	Access   string
	Refresh  string
	JTIAcc   string
	JTIRef   string
	ExpAcc   time.Time
	ExpRef   time.Time
	UserID   string
	Issuer   string
	Audience string
}

func IssueTokens(userID string) (*Tokens, error) {
	now := time.Now().UTC()
	t := &Tokens{
		UserID:   userID,
		JTIAcc:   uuid.NewString(),
		JTIRef:   uuid.NewString(),
		ExpAcc:   now.Add(15 * time.Minute),
		ExpRef:   now.Add(24 * 7 * time.Hour),
		Issuer:   "Vyaap-app",
		Audience: "Vyaap-client",
	}
	acc := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.RegisteredClaims{
		Subject:   userID,
		ID:        t.JTIAcc,
		Issuer:    t.Issuer,
		Audience:  jwt.ClaimStrings{t.Audience},
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(t.ExpAcc),
	})

	ref := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.RegisteredClaims{
		Subject:   userID,
		ID:        t.JTIRef,
		Issuer:    t.Issuer,
		Audience:  jwt.ClaimStrings{t.Audience},
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(t.ExpRef),
	})

	var err error

	t.Access, err = acc.SignedString([]byte(os.Getenv("ACCESS_TOKEN")))
	if err != nil {
		return nil, err
	}
	t.Refresh, err = ref.SignedString([]byte(os.Getenv("REFRESH_TOKEN")))
	if err != nil {
		return nil, err
	}
	return t, nil
}

func Persist(ctx context.Context, r *config.Redis, t *Tokens) error {
	if err := r.SetJTI(ctx, "access:"+t.JTIAcc, t.UserID, t.ExpAcc); err != nil {
		return err
	}
	if err := r.SetJTI(ctx, "refresh:"+t.JTIRef, t.UserID, t.ExpRef); err != nil {
		return err
	}
	return nil
}

func SetAuthCookies(c *gin.Context, t *Tokens) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("access_token", t.Access, int(time.Until(t.ExpAcc).Seconds()), "/", "", true, true)
	c.SetCookie("refresh_token", t.Refresh, int(time.Until(t.ExpRef).Seconds()), "/", "", true, true)
}

func ClearAuthCookies(c *gin.Context) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("access_token", "", -1, "/", "", true, true)
	c.SetCookie("refresh_token", "", -1, "/", "", true, true)
}

func ParseAccess(tokenStr string) (*jwt.RegisteredClaims, error) {
	secret := os.Getenv("ACCESS_TOKEN")
	return parseWithSecret(tokenStr, secret)
}

func ParseRefresh(tokenStr string) (*jwt.RegisteredClaims, error) {
	secret := os.Getenv("REFRESH_TOKEN")
	return parseWithSecret(tokenStr, secret)
}

func parseWithSecret(tokenStr, secret string) (*jwt.RegisteredClaims, error) {
	if secret == "" {
		return nil, errors.New("jwt secret not configured")
	}

	parser := jwt.NewParser(jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))

	token, err := parser.ParseWithClaims(tokenStr, &jwt.RegisteredClaims{}, func(t *jwt.Token) (interface{}, error) {
		// Extra safety: ensure HMAC family
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*jwt.RegisteredClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}

	if claims.ExpiresAt != nil && time.Now().After(claims.ExpiresAt.Time) {
		return nil, errors.New("token expired")
	}

	return claims, nil
}
