import '../styles.css'
import React from "react"
import { createRoot } from 'react-dom/client'
import { useState, useEffect } from "react"
import PouchDB from "pouchdb"
import PouchDBFind from 'pouchdb-find'
import PouchDBIDB from 'pouchdb-adapter-indexeddb'
import { v4 as uuidv4 } from 'uuid'

// Use IndexedDB adapter
PouchDB.plugin(PouchDBIDB)
PouchDB.plugin(PouchDBFind)

interface Message {
  _id?: string
  _rev?: string
  conversationId: string
  timestamp: string
  role: "user" | "assistant"
  content: string
}

interface Conversation {
  id: string
  preview: string
  lastMessageAt: string
}

// Create the database with explicit adapter
const db = new PouchDB<Message>("messages", {
  adapter: 'indexeddb'
})

// Create index for conversationId
db.createIndex({
  index: {
    fields: ['conversationId', 'timestamp'],
    ddoc: 'conversation-index'
  }
}).catch(err => console.error('Error creating index:', err))

// First, add a new index for conversations list
db.createIndex({
  index: {
    fields: ['timestamp'],
    ddoc: 'timestamp-index'
  }
}).catch(err => console.error('Error creating timestamp index:', err))

function Popup() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [currentConversationId, setCurrentConversationId] = useState(uuidv4())
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])

  useEffect(() => {
    loadConversations()
    loadSavedMessages(currentConversationId)

    const messageListener = (message: any) => {
      if (message.type === "chat_response") {
        if (message.error) {
          saveMessage({
            conversationId: currentConversationId,
            role: "assistant",
            content: message.error,
          })
        } else if (message.response) {
          saveMessage({
            conversationId: currentConversationId,
            role: "assistant",
            content: message.response,
          })
        }
        setIsLoading(false)
        loadSavedMessages(currentConversationId)
      }
    }

    chrome.runtime.onMessage.addListener(messageListener)
    return () => chrome.runtime.onMessage.removeListener(messageListener)
  }, [currentConversationId])

  async function loadConversations() {
    try {
      const result = await db.find({
        selector: {
          timestamp: { $gt: null },
          conversationId: { $gt: null }
        },
        use_index: 'timestamp-index',
        fields: ['_id', 'conversationId', 'timestamp', 'content'],
        sort: [{ timestamp: 'desc' }]
      })

      console.log(result.docs)
      
      const conversationMap = new Map<string, { preview: string; lastMessageAt: string }>()
      
      result.docs.forEach(message => {
        if (!conversationMap.has(message.conversationId)) {
          conversationMap.set(message.conversationId, {
            preview: message.content,
            lastMessageAt: message.timestamp
          })
        }
      })

      const conversationList = Array.from(conversationMap.entries()).map(([id, data]) => ({
        id,
        preview: data.preview,
        lastMessageAt: data.lastMessageAt
      }))

      setConversations(conversationList)
    } catch (error) {
      console.error("Error loading conversations:", error)
    }
  }

  const selectConversation = (conversationId: string) => {
    setCurrentConversationId(conversationId)
    setIsDrawerOpen(false)
  }

  async function saveMessage(message: Omit<Message, "_id" | "_rev" | "timestamp">) {
    await db.post({
      ...message,
      timestamp: new Date().toISOString(),
    })
  }

  async function loadSavedMessages(conversationId: string) {
    try {
      const result = await db.find({
        selector: {
          conversationId: { $eq: conversationId }
        },
        fields: ['_id', '_rev', 'conversationId', 'timestamp', 'role', 'content'],
        sort: [{ conversationId: 'asc' }, { timestamp: 'asc' }]
      })
      
      setMessages(result.docs)
    } catch (error) {
      console.error("Error loading messages:", error)
    }
  }

  const startNewConversation = () => {
    setCurrentConversationId(uuidv4())
    setMessages([])
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!input.trim()) return

    setIsLoading(true)
    await saveMessage({
      conversationId: currentConversationId,
      role: "user",
      content: input,
    })
    setInput("")

    chrome.runtime.sendMessage({ 
      type: "chat", 
      message: input,
      conversationId: currentConversationId
    })
  }

  async function deleteConversation(conversationId: string, e: React.MouseEvent) {
    e.stopPropagation() // Prevent conversation selection when clicking delete
    try {
      // Get all messages for this conversation
      const result = await db.find({
        selector: {
          conversationId: { $eq: conversationId }
        },
        fields: ['_id', '_rev']
      })

      // Delete all messages
      await Promise.all(
        result.docs.map(doc => 
          db.remove(doc._id!, doc._rev!)
        )
      )

      // If current conversation was deleted, start a new one
      if (currentConversationId === conversationId) {
        startNewConversation()
      }

      // Refresh conversations list
      loadConversations()
    } catch (error) {
      console.error("Error deleting conversation:", error)
    }
  }

  return (
    <div className="w-[400px] h-[600px] flex flex-col bg-gray-50 relative">
      {/* Header */}
      <div className="px-4 py-3 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsDrawerOpen(!isDrawerOpen)}
              className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </button>
            <button 
              onClick={startNewConversation}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors"
            >
              New Chat
            </button>
          </div>
          <button 
            onClick={() => chrome.runtime.openOptionsPage()} 
            className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors"
          >
            Settings
          </button>
        </div>
      </div>

      {/* Drawer */}
      {isDrawerOpen && (
        <div className="absolute top-[57px] left-0 w-64 h-[calc(100%-57px)] bg-white border-r border-gray-200 shadow-lg z-10 overflow-y-auto">
          <div className="p-4 space-y-2">
            {conversations.map(conv => (
              <div
                key={conv.id}
                className={`group relative rounded-lg transition-colors ${
                  conv.id === currentConversationId
                    ? "bg-blue-50"
                    : "hover:bg-gray-50"
                }`}
              >
                <button
                  onClick={() => selectConversation(conv.id)}
                  className="w-full p-3 text-left"
                >
                  <p className={`text-sm font-medium truncate ${
                    conv.id === currentConversationId
                      ? "text-blue-600"
                      : "text-gray-700"
                  }`}>{conv.preview}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(conv.lastMessageAt).toLocaleDateString()}
                  </p>
                </button>
                <button
                  onClick={(e) => deleteConversation(conv.id, e)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full 
                    text-gray-400 hover:text-red-500 hover:bg-red-50 
                    opacity-0 group-hover:opacity-100 transition-all"
                  title="Delete conversation"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.map((message) => (
          <div
            key={message._id}
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
        <form onSubmit={handleSubmit} className="flex space-x-2 m-0">
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