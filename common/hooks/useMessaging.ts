import { useState, useEffect } from "react"
import { v4 as uuidv4 } from 'uuid'
import { Message, messagesDb } from '@/common/db'

interface Conversation {
  id: string
  preview: string
  lastMessageAt: string
}

export function useMessaging() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [currentConversationId, setCurrentConversationId] = useState(uuidv4())
  const [conversations, setConversations] = useState<Conversation[]>([])

  useEffect(() => {
    // Load latest conversation first
    loadLatestConversation()
  }, [])

  useEffect(() => {
    // Manages message handling, conversation state, and cleanup
    loadConversations()
    loadSavedMessages(currentConversationId)

    const messageListener = (message: any) => {
      if (message.type === "chat_response") {
        loadSavedMessages(currentConversationId)
        setIsLoading(false)
      } else if (message.type === "conversation_deleted") {
        if (message.success) {
          if (currentConversationId === message.conversationId) {
            startNewConversation()
          }
          loadConversations()
        }
      }
    }

    chrome.runtime.onMessage.addListener(messageListener)
    return () => chrome.runtime.onMessage.removeListener(messageListener)
  }, [currentConversationId])

  const loadLatestConversation = async () => {
    try {
      const result = await messagesDb.find({
        selector: {
          timestamp: { $gt: null },
          conversationId: { $gt: null }
        },
        fields: ['conversationId', 'timestamp'],
        sort: [{ timestamp: 'desc' }],
        limit: 1
      })

      if (result.docs.length > 0) {
        setCurrentConversationId(result.docs[0].conversationId)
      }
    } catch (error) {
      console.error('Error loading latest conversation:', error)
    }
  }

  const loadConversations = async () => {
    try {
      const result = await messagesDb.find({
        selector: {
          timestamp: { $gt: null },
          conversationId: { $gt: null }
        },
        fields: ['_id', 'conversationId', 'timestamp', 'content'],
        sort: [{ timestamp: 'desc' }]
      })
      
      const conversationMap = new Map<string, { preview: string; lastMessageAt: string }>()
      
      result.docs.forEach(message => {
        if (!conversationMap.has(message.conversationId)) {
          conversationMap.set(message.conversationId, {
            preview: message.content,
            lastMessageAt: new Date(message.timestamp).toISOString()
          })
        }
      })

      const conversations = Array.from(conversationMap.entries()).map(([id, data]) => ({
        id,
        preview: data.preview,
        lastMessageAt: data.lastMessageAt
      }))

      setConversations(conversations)
    } catch (error) {
      console.error('Error loading conversations:', error)
    }
  }

  const loadSavedMessages = async (conversationId: string) => {
    try {
      const result = await messagesDb.find({
        selector: {
          conversationId: conversationId
        },
      })
      setMessages(result.docs)
    } catch (error) {
      console.error('Error loading messages:', error)
    }
  }

  const startNewConversation = () => {
    const newConversationId = uuidv4()
    setCurrentConversationId(newConversationId)
    setMessages([])
    loadSavedMessages(newConversationId)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!input.trim()) return

    setIsLoading(true)
    setInput("")
    setMessages(prev => [...prev, {
      content: input,
      conversationId: currentConversationId,
      role: "user",
      timestamp: Date.now()
    }])

    chrome.runtime.sendMessage({ 
      type: "chat", 
      message: input,
      conversationId: currentConversationId
    })
  }

  const deleteConversation = (conversationId: string) => {
    chrome.runtime.sendMessage({
      type: "delete_conversation",
      conversationId
    })
  }

  const selectConversation = (conversationId: string) => {
    setCurrentConversationId(conversationId)
  }

  return {
    messages,
    input,
    setInput,
    isLoading,
    currentConversationId,
    conversations,
    handleSubmit,
    deleteConversation,
    selectConversation,
    startNewConversation
  }
}