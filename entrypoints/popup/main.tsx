import '../styles.css'
// import './style.css'
import React from "react"
import { createRoot } from 'react-dom/client'
import { useState, useEffect } from "react"
import PouchDB from "pouchdb-browser"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
}

interface Conversation {
  _id?: string
  _rev?: string
  timestamp: string
  user: string
  ai: string
}

const db = new PouchDB<Conversation>("conversations")

function Popup() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    loadSavedMessages()

    // Set up listener for messages from the background script
    const messageListener = (message: any) => {
      if (message.type === "chat_response") {
        if (message.error) {
          const errorMessage: Message = { id: Date.now().toString(), role: "assistant", content: message.error }
          setMessages((prev) => [...prev, errorMessage])
        } else if (message.response) {
          const aiMessage: Message = { id: Date.now().toString(), role: "assistant", content: message.response }
          setMessages((prev) => [...prev, aiMessage])
        }
        setIsLoading(false)
        loadSavedMessages() // Reload saved messages to reflect the new conversation
      }
    }

    chrome.runtime.onMessage.addListener(messageListener)

    // Cleanup listener on component unmount
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener)
    }
  }, [])

  async function loadSavedMessages() {
    const result = await db.allDocs<Conversation>({ include_docs: true, descending: true, limit: 10 })
    const loadedMessages: Message[] = result.rows.flatMap((row) => {
      const doc = row.doc!
      return [
        { id: `user-${doc._id}`, role: "user", content: doc.user },
        { id: `ai-${doc._id}`, role: "assistant", content: doc.ai },
      ]
    })
    setMessages(loadedMessages.reverse())
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!input.trim()) return

    setIsLoading(true)
    const userMessage: Message = { id: Date.now().toString(), role: "user", content: input }
    setMessages((prev) => [...prev, userMessage])
    setInput("")

    // Send message to background script
    chrome.runtime.sendMessage({ type: "chat", message: input })
  }

  return (
    <div className="w-[400px] h-[600px] flex flex-col bg-gray-50">
      {/* Header */}
      <div className="px-4 py-3 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-end">
          <button 
            onClick={() => chrome.runtime.openOptionsPage()} 
            className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors"
          >
            Settings
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} w-full`}
          >
            <div
              className={`
                max-w-[80%] px-4 py-2 rounded-2xl
                ${message.role === "user" 
                  ? "bg-blue-500 text-white" 
                  : "bg-white border border-gray-200"
                }
                shadow-sm
              `}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start w-full">
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-2 shadow-sm">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "0.4s" }}></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-gray-200">
        <form onSubmit={handleSubmit} className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className={`
              p-2 rounded-full transition-colors
              ${isLoading || !input.trim()
                ? "bg-gray-100 text-gray-400"
                : "bg-blue-500 text-white hover:bg-blue-600"
              }
            `}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  )
}

const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  root.render(<Popup />)
}