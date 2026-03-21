package models

type ChatMessage struct {
	Text      string `json:"text"`
	Timestamp string `json:"timestamp"`
	Sender    string `json:"sender"`
	// IsOutgoing bool   `json:"IsOutgoing"`
}

type ChatRequest struct {
	ChatName string        `json:"chatName"`
	Messages []ChatMessage `json:"messages"`
}
